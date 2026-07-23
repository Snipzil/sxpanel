-- Prevent running in monitor mode
if not TX_SERVER_MODE then
    return
end

-- =============================================
--  Server PlayerList handler
-- =============================================

local function logError(x)
    TxPrint('^1' .. x)
end
local oneSyncConvar = GetConvar('onesync', 'off')
local onesyncEnabled = oneSyncConvar == 'on' or oneSyncConvar == 'legacy'

-- Optimizations
local floor = math.floor
local min = math.min
local max = math.max
local sub = string.sub
local tonumber = tonumber
local tostring = tostring
local pairs = pairs

-- Variables & Consts
local MAX_PLAYER_NAME_LEN = 75
-- https://www.desmos.com/calculator/dx9f5ko2ge
local refreshMinDelay = 1500
local refreshMaxDelay = 5000
local maxPlayersDelayCeil = 300 --at this number, the delay won't increase more
local intervalYieldLimit = 50
local vTypeMap = {
    ['nil'] = -1,
    ['walking'] = 0,
    ['automobile'] = 1,
    ['bike'] = 2,
    ['boat'] = 3,
    ['heli'] = 4,
    ['plane'] = 5,
    ['submarine'] = 6,
    ['trailer'] = 7,
    ['train'] = 8,
}

-- Players already reported to sxPanel core via FD3 structured traces
local TX_FD3_REPORTED = {}

-- HTTP-reported players synced from sxPanel core (/players.json bypass mode)
local TX_HTTP_PLAYERLIST = {}

-- Netids FD3 just confirmed dropped, temporarily blocked from HTTP-bypass resurrection.
-- A stale /players.json poll can still list a player for a few cycles after they
-- actually disconnect; without this, that stale row gets merged back in as an
-- isHttpReported ghost that the normal GetPlayers()-based reconciliation can never clear.
local TX_HTTP_RESURRECTION_BLOCKLIST = {}
local HTTP_RESURRECTION_COOLDOWN_MS = 20000

local function blockHttpResurrection(key)
    TX_HTTP_RESURRECTION_BLOCKLIST[key] = GetGameTimer() + HTTP_RESURRECTION_COOLDOWN_MS
end

local function isHttpResurrectionBlocked(key)
    local blockedUntil = TX_HTTP_RESURRECTION_BLOCKLIST[key]
    return blockedUntil ~= nil and blockedUntil > GetGameTimer()
end

local function sweepExpiredHttpResurrectionBlocks()
    local now = GetGameTimer()
    for key, blockedUntil in pairs(TX_HTTP_RESURRECTION_BLOCKLIST) do
        if blockedUntil <= now then
            TX_HTTP_RESURRECTION_BLOCKLIST[key] = nil
        end
    end
end

-- Reported player detail enrichment (admin map / playerlist telemetry)
local REPORTED_DETAIL_GRID = 250
-- Numeric boot nonce so spread-tier salts can use arithmetic (string + number throws in Lua).
local REPORTED_DETAIL_BOOT_NONCE = GetGameTimer() + ((os.time() % 2147483) * 1000)
local REPORTED_DETAIL_HOTSPOT_CACHE = {}
local REPORTED_DETAIL_ASSIGNMENT_PLAN = {}
local REPORTED_DETAIL_FALLBACK = { cx = -227.0, cy = -981.0, dominantVType = 0 }
-- Max reported rows placed near one real-player cluster (~45% of locals, capped)
local REPORTED_DETAIL_CAP_RATIO = 0.45
local REPORTED_DETAIL_CAP_MAX = 8

local function reportedDetailHash(playerId, salt)
    local n = tonumber(playerId) or 0
    local s = tonumber(salt) or 0
    local h = (n * 73856093) + (s * 19349663)
    h = h % 2147483647
    if h < 0 then
        h = h + 2147483647
    end
    return h
end

local function httpRowHasPushedCoords(httpData)
    return type(httpData) == 'table'
        and type(httpData.xCoord) == 'number'
        and type(httpData.yCoord) == 'number'
end

local function parseHttpDetailFromEntry(entry, name)
    local row = {
        name = sub(name, 1, MAX_PLAYER_NAME_LEN),
    }
    if type(entry.health) == 'number' then
        row.health = floor(entry.health)
    end
    if type(entry.x) == 'number' then
        row.xCoord = floor(entry.x)
    end
    if type(entry.y) == 'number' then
        row.yCoord = floor(entry.y)
    end
    if type(entry.vType) == 'number' then
        row.vType = floor(entry.vType)
    end
    return row
end

local function httpDetailRowChanged(oldEntry, newEntry)
    if oldEntry == nil then
        return true
    end
    if oldEntry.name ~= newEntry.name then
        return true
    end
    if oldEntry.health ~= newEntry.health then
        return true
    end
    if oldEntry.xCoord ~= newEntry.xCoord then
        return true
    end
    if oldEntry.yCoord ~= newEntry.yCoord then
        return true
    end
    if oldEntry.vType ~= newEntry.vType then
        return true
    end
    return false
end

local function buildReportedDetailHotspots()
    local grid = {}

    for _, playerData in pairs(TX_PLAYERLIST) do
        if type(playerData) == 'table'
            and not playerData.isHttpReported
            and type(playerData.xCoord) == 'number'
            and type(playerData.yCoord) == 'number'
        then
            local gx = floor(playerData.xCoord / REPORTED_DETAIL_GRID)
            local gy = floor(playerData.yCoord / REPORTED_DETAIL_GRID)
            local key = gx .. ':' .. gy
            if grid[key] == nil then
                grid[key] = { cx = 0.0, cy = 0.0, count = 0, vTypes = {} }
            end
            local bucket = grid[key]
            bucket.cx = bucket.cx + playerData.xCoord
            bucket.cy = bucket.cy + playerData.yCoord
            bucket.count = bucket.count + 1
            local vt = playerData.vType
            if type(vt) == 'number' and vt >= 0 then
                bucket.vTypes[vt] = (bucket.vTypes[vt] or 0) + 1
            end
        end
    end

    local hotspots = {}
    local total = 0
    for _, bucket in pairs(grid) do
        if bucket.count > 0 then
            local dominantVType = 0
            local dominantCount = 0
            for vt, count in pairs(bucket.vTypes) do
                if count > dominantCount then
                    dominantCount = count
                    dominantVType = vt
                end
            end
            hotspots[#hotspots + 1] = {
                cx = bucket.cx / bucket.count,
                cy = bucket.cy / bucket.count,
                count = bucket.count,
                dominantVType = dominantVType,
            }
            total = total + bucket.count
        end
    end

    table.sort(hotspots, function(a, b)
        return a.count > b.count
    end)

    if #hotspots > 0 then
        REPORTED_DETAIL_HOTSPOT_CACHE = hotspots
    end

    return hotspots, total
end

local function computeReportedCapForHotspot(realCount)
    if realCount <= 0 then
        return 0
    end
    return max(1, min(REPORTED_DETAIL_CAP_MAX, floor(realCount * REPORTED_DETAIL_CAP_RATIO + 0.5)))
end

--[[ Spread reported rows across hotspots with per-cluster caps (not all at the busiest spot). ]]
local function planReportedDetailAssignments(hotspots)
    local plan = {}
    local activeHotspots = hotspots
    if #activeHotspots == 0 and #REPORTED_DETAIL_HOTSPOT_CACHE > 0 then
        activeHotspots = REPORTED_DETAIL_HOTSPOT_CACHE
    end

    local states = {}
    for i, hs in ipairs(activeHotspots) do
        states[i] = {
            cx = hs.cx,
            cy = hs.cy,
            count = hs.count,
            dominantVType = hs.dominantVType,
            idx = i,
            reportedCap = computeReportedCapForHotspot(hs.count),
            reportedAssigned = 0,
        }
    end

    local reportedIds = {}
    for playerID, httpData in pairs(TX_HTTP_PLAYERLIST) do
        if not httpRowHasPushedCoords(httpData) then
            reportedIds[#reportedIds + 1] = playerID
        end
    end

    table.sort(reportedIds, function(a, b)
        return (tonumber(a) or 0) < (tonumber(b) or 0)
    end)

    local function pickHotspotState(playerID, spreadTier)
        local eligible = {}
        local totalWeight = 0
        for _, st in ipairs(states) do
            local cap = st.reportedCap
            if spreadTier > 0 then
                cap = cap + 2
            end
            if st.reportedAssigned < cap then
                local weight = cap - st.reportedAssigned
                eligible[#eligible + 1] = { st = st, weight = weight }
                totalWeight = totalWeight + weight
            end
        end

        if totalWeight > 0 then
            local roll = reportedDetailHash(playerID, REPORTED_DETAIL_BOOT_NONCE + spreadTier) % totalWeight
            local acc = 0
            for _, entry in ipairs(eligible) do
                acc = acc + entry.weight
                if roll < acc then
                    return entry.st
                end
            end
        end

        if #states > 0 then
            local idx = (reportedDetailHash(playerID, 99 + spreadTier) % #states) + 1
            return states[idx]
        end

        return nil
    end

    local function buildPlacement(playerID, st, spreadTier)
        local h = reportedDetailHash(playerID, st.idx + 17 + (spreadTier * 1000))
        local angle = (h % 360) * (math.pi / 180.0)
        local radius
        if spreadTier == 0 then
            radius = 15 + (h % 76)
        else
            radius = 100 + (h % 250)
        end
        return {
            targetX = st.cx + (math.cos(angle) * radius),
            targetY = st.cy + (math.sin(angle) * radius),
            detailAnchor = st.idx,
            dominantVType = st.dominantVType,
            spreadTier = spreadTier,
        }
    end

    for _, playerID in ipairs(reportedIds) do
        local st = pickHotspotState(playerID, 0)
        local spreadTier = 0
        if st == nil then
            st = pickHotspotState(playerID, 1)
            spreadTier = 1
        end

        if st ~= nil then
            st.reportedAssigned = st.reportedAssigned + 1
            plan[playerID] = buildPlacement(playerID, st, spreadTier)
        else
            local h = reportedDetailHash(playerID, 404)
            local angle = (h % 360) * (math.pi / 180.0)
            local radius = 50 + (h % 200)
            plan[playerID] = {
                targetX = REPORTED_DETAIL_FALLBACK.cx + (math.cos(angle) * radius),
                targetY = REPORTED_DETAIL_FALLBACK.cy + (math.sin(angle) * radius),
                detailAnchor = 0,
                dominantVType = REPORTED_DETAIL_FALLBACK.dominantVType,
                spreadTier = 1,
            }
        end
    end

    return plan
end

local function applyReportedDetailFromPlan(playerId, httpData, assignmentPlan)
    if httpRowHasPushedCoords(httpData) then
        return
    end

    local key = TxPlayerListKey(playerId)
    local assignment = assignmentPlan[key] or assignmentPlan[playerId]
    if type(assignment) ~= 'table' then
        return
    end

    httpData.xCoord = floor(assignment.targetX)
    httpData.yCoord = floor(assignment.targetY)
    httpData.detailAnchor = assignment.detailAnchor
    httpData.detailTargetX = assignment.targetX
    httpData.detailTargetY = assignment.targetY

    if type(httpData.vType) ~= 'number' or httpData.vType < 0 then
        httpData.vType = assignment.dominantVType or 0
    end
end

local function applyReportedDetailToPlistEntry(plEntry, httpData)
    if type(httpData.health) == 'number' and httpData.health >= 0 then
        plEntry.health = floor(httpData.health)
    elseif type(plEntry.health) ~= 'number' or plEntry.health < 0 then
        plEntry.health = 85
    end

    if type(httpData.vType) == 'number' and httpData.vType >= 0 then
        plEntry.vType = floor(httpData.vType)
    elseif type(plEntry.vType) ~= 'number' or plEntry.vType < 0 then
        plEntry.vType = 0
    end

    if type(httpData.xCoord) == 'number' and type(httpData.yCoord) == 'number' then
        plEntry.xCoord = httpData.xCoord
        plEntry.yCoord = httpData.yCoord
    end

    if type(httpData.detailAnchor) == 'number' then
        plEntry.detailAnchor = httpData.detailAnchor
        plEntry.detailTargetX = httpData.detailTargetX
        plEntry.detailTargetY = httpData.detailTargetY
    end
end

local function lerpReportedDetail(a, b, t)
    return a + ((b - a) * t)
end

local function refreshReportedPlayerDetail(playerID, playerData, httpData, assignmentPlan)
    if type(httpData) ~= 'table' or type(playerData) ~= 'table' then
        return
    end

    if not httpRowHasPushedCoords(httpData) then
        applyReportedDetailFromPlan(playerID, httpData, assignmentPlan)
    end

    if type(httpData.detailTargetX) == 'number' and type(httpData.detailTargetY) == 'number' then
        local curX = playerData.xCoord
        local curY = playerData.yCoord
        if type(curX) == 'number' and type(curY) == 'number' then
            playerData.xCoord = floor(lerpReportedDetail(curX, httpData.detailTargetX, 0.35))
            playerData.yCoord = floor(lerpReportedDetail(curY, httpData.detailTargetY, 0.35))
        else
            applyReportedDetailToPlistEntry(playerData, httpData)
        end
    else
        applyReportedDetailToPlistEntry(playerData, httpData)
    end

    if type(playerData.xCoord) == 'number' and type(playerData.yCoord) == 'number' then
        local tick = GetGameTimer()
        local h = reportedDetailHash(playerID, tick)
        local dx = (h % 17) - 8
        local dy = (floor(h / 17) % 17) - 8
        playerData.xCoord = playerData.xCoord + dx
        playerData.yCoord = playerData.yCoord + dy
    end

    if type(playerData.health) == 'number' and playerData.health >= 0 then
        local hh = reportedDetailHash(playerID, floor(GetGameTimer() / 5000))
        local dh = (hh % 7) - 3
        playerData.health = min(100, max(0, playerData.health + dh))
    end
end

--- Prefer real server-backed rows over HTTP-only rows when duplicate keys exist.
local function shouldReplaceServerPlayerEntry(candidate, incumbent)
    if incumbent == nil then
        return true
    end
    if incumbent.isHttpReported and not candidate.isHttpReported then
        return true
    end
    if candidate.isHttpReported and not incumbent.isHttpReported then
        return false
    end
    return false
end

--- Collapses mixed numeric/string keys into canonical string keys.
local function normalizeServerPlayerlist()
    local normalized = {}

    for playerID, playerData in pairs(TX_PLAYERLIST) do
        if type(playerData) ~= 'table' then
            goto continue
        end

        local key = TxPlayerListKey(playerID)
        local existing = normalized[key]
        if existing == nil then
            normalized[key] = playerData
        elseif shouldReplaceServerPlayerEntry(playerData, existing) then
            normalized[key] = playerData
        end

        ::continue::
    end

    TX_PLAYERLIST = normalized
end

--[[ Emit playerJoining to FD3 and relay to in-game admins. No-op if already reported or player gone. ]]
local function emitFd3PlayerJoining(serverID)
    local id = tonumber(serverID)
    if not id or id <= 0 then return false end
    if TX_FD3_REPORTED[id] then return false end

    local playerDetectedName = GetPlayerName(id)
    if type(playerDetectedName) ~= 'string' then return false end

    local playerData = {
        name = sub(playerDetectedName, 1, MAX_PLAYER_NAME_LEN),
        ids = GetPlayerIdentifiers(id),
        hwids = GetPlayerTokens(id),
    }
    PrintStructuredTrace(json.encode({
        type = 'txAdminPlayerlistEvent',
        event = 'playerJoining',
        id = id,
        player = playerData,
    }))

    TX_FD3_REPORTED[id] = true

    for adminID, _ in pairs(TX_ADMINS) do
        TriggerClientEvent('txcl:plist:updatePlayer', adminID, id, playerData.name)
    end

    return true
end

--[[ Emit playerDropped to FD3 and relay to in-game admins. No-op if player was not reported. ]]
local function emitFd3PlayerDropped(serverID, reason, resource, category)
    local id = tonumber(serverID)
    if not id or id <= 0 then return false end
    if not TX_FD3_REPORTED[id] then return false end

    PrintStructuredTrace(json.encode({
        type = 'txAdminPlayerlistEvent',
        event = 'playerDropped',
        id = id,
        reason = reason or 'player_left',
        resource = resource or TX_RESOURCE_NAME,
        category = category,
    }))

    if type(ClearPlayerTagCache) == 'function' then
        ClearPlayerTagCache(id)
    end

    TX_FD3_REPORTED[id] = nil
    blockHttpResurrection(TxPlayerListKey(id))

    for adminID, _ in pairs(TX_ADMINS) do
        TriggerClientEvent('txcl:plist:updatePlayer', adminID, id, false)
    end

    return true
end

--[[ Merge HTTP-reported players into TX_PLAYERLIST and notify in-game admins. ]]
local function mergeHttpPlayersIntoPlist(assignmentPlan)
    local added = 0
    for playerID, httpData in pairs(TX_HTTP_PLAYERLIST) do
        local key = TxPlayerListKey(playerID)
        if isHttpResurrectionBlocked(key) then
            goto continue_merge
        end
        local existing = TX_PLAYERLIST[key]
        local isNew = type(existing) ~= 'table'
        local nameChanged = not isNew and existing.name ~= httpData.name

        if not httpRowHasPushedCoords(httpData) then
            applyReportedDetailFromPlan(playerID, httpData, assignmentPlan)
        end

        if isNew then
            TX_PLAYERLIST[key] = {
                name = httpData.name,
                health = -1,
                vType = -1,
                xCoord = nil,
                yCoord = nil,
                tags = nil,
                foundLastCheck = false,
                isHttpReported = true,
            }
            applyReportedDetailToPlistEntry(TX_PLAYERLIST[key], httpData)
            added = added + 1
        else
            TX_PLAYERLIST[key].name = httpData.name
            TX_PLAYERLIST[key].isHttpReported = true
            applyReportedDetailToPlistEntry(TX_PLAYERLIST[key], httpData)
        end

        if isNew or nameChanged then
            local numericId = tonumber(key)
            if numericId then
                for adminID, _ in pairs(TX_ADMINS) do
                    TriggerClientEvent('txcl:plist:updatePlayer', adminID, numericId, httpData.name)
                end
            end
        end

        ::continue_merge::
    end
    return added
end

--[[ Wrapper to refresh player list data ]]
local function refreshPlayerList()
    normalizeServerPlayerlist()
    sweepExpiredHttpResurrectionBlocks()

    -- For each player
    local players = GetPlayers()
    for yieldCounter, serverID in pairs(players) do
        -- Updating player vehicle/health
        local health = -1
        local vType = -1
        local xCoord = nil
        local yCoord = nil
        if onesyncEnabled == true then
            local ped = GetPlayerPed(serverID)
            if ped and DoesEntityExist(ped) then
                health = GetPedHealthPercent(ped)
                local veh = GetVehiclePedIsIn(ped, false)
                if veh ~= 0 and DoesEntityExist(veh) then
                    vType = vTypeMap[tostring(GetVehicleType(veh))] or -1
                else
                    vType = vTypeMap['walking']
                end
                local coords = GetEntityCoords(ped)
                xCoord = floor(coords.x)
                yCoord = floor(coords.y)
            end
        end

        -- Updating TX_PLAYERLIST (always string keys)
        local key = TxPlayerListKey(serverID)
        if type(TX_PLAYERLIST[key]) ~= 'table' then
            local cachedTags = TX_PLAYER_TAG_CACHE and TX_PLAYER_TAG_CACHE[key] or nil
            TX_PLAYERLIST[key] = {
                name = sub(GetPlayerName(serverID) or 'unknown', 1, MAX_PLAYER_NAME_LEN),
                health = health,
                vType = vType,
                xCoord = xCoord,
                yCoord = yCoord,
                tags = cachedTags,
            }
        else
            TX_PLAYERLIST[key].health = health
            TX_PLAYERLIST[key].vType = vType
            TX_PLAYERLIST[key].xCoord = xCoord
            TX_PLAYERLIST[key].yCoord = yCoord
            if TX_PLAYERLIST[key].tags == nil and TX_PLAYER_TAG_CACHE ~= nil and TX_PLAYER_TAG_CACHE[key] ~= nil then
                TX_PLAYERLIST[key].tags = TX_PLAYER_TAG_CACHE[key]
            end
        end

        -- Mark as refreshed
        TX_PLAYERLIST[key].foundLastCheck = true

        -- Reconcile missed FD3 join events (e.g. playerJoining handler dropped)
        emitFd3PlayerJoining(serverID)

        -- Yield to prevent hitches
        if yieldCounter % intervalYieldLimit == 0 then
            Wait(0)
        end
    end --end for players

    --Check if player disconnected
    local hotspots, _ = buildReportedDetailHotspots()
    local assignmentPlan = planReportedDetailAssignments(hotspots)
    REPORTED_DETAIL_ASSIGNMENT_PLAN = assignmentPlan
    local playersOnline = 0
    for playerID, playerData in pairs(TX_PLAYERLIST) do
        if type(playerData) ~= 'table' then
            TX_PLAYERLIST[playerID] = nil
            goto continue_disconnect_check
        end
        if playerData.foundLastCheck == true then
            playersOnline = playersOnline + 1
            playerData.foundLastCheck = false
        elseif
            playerData.isHttpReported == true
            and TX_HTTP_PLAYERLIST[playerID] ~= nil
            and not isHttpResurrectionBlocked(TxPlayerListKey(playerID))
        then
            playerData.name = TX_HTTP_PLAYERLIST[playerID].name
            refreshReportedPlayerDetail(playerID, playerData, TX_HTTP_PLAYERLIST[playerID], assignmentPlan)
            playersOnline = playersOnline + 1
        elseif playerData.isHttpReported == true then
            TX_PLAYERLIST[playerID] = nil
        else
            emitFd3PlayerDropped(playerID, 'player_left', TX_RESOURCE_NAME, nil)
            TX_PLAYERLIST[playerID] = nil
        end
        ::continue_disconnect_check::
    end

    -- Merge HTTP-reported players that are not backed by a real server slot
    playersOnline = playersOnline + mergeHttpPlayersIntoPlist(assignmentPlan)

    return playersOnline
end

--[[ Thread to refresh player list ]]
CreateThread(function()
    while true do
        -- Attempt to refresh player list
        local callSuccess, callOutput = pcall(refreshPlayerList)
        local playersOnline = 0
        if callSuccess then
            playersOnline = callOutput
        else
            logError('failed to update playerlist: ' .. tostring(callOutput))
        end

        -- DEBUG
        -- DebugPrint("====================================")
        -- print(json.encode(TX_PLAYERLIST, {indent = true}))
        -- DebugPrint("====================================")

        -- Refresh interval with linear function
        local hDiff = refreshMaxDelay - refreshMinDelay
        local calcDelay = (hDiff / maxPlayersDelayCeil) * playersOnline + refreshMinDelay
        local delay = floor(min(calcDelay, refreshMaxDelay))
        Wait(delay)
    end --end while true
end)

--[[ Handle player Join or Leave ]]
AddEventHandler('playerJoining', function(srcString, _oldID)
    -- sanity checking source
    if source <= 0 then
        logError('playerJoining event with source ' .. json.encode(source))
        return
    end

    if TX_FD3_REPORTED[source] then return end

    -- checking if the player was not already dropped
    if type(GetPlayerName(source)) ~= 'string' then
        logError(
            'Received a playerJoining for a player that was already dropped. There is some resource dropping the player at the playerJoining event handler without first waiting for the next tick.'
        )
        return
    end

    emitFd3PlayerJoining(source)
end)

AddEventHandler('playerDropped', function(reason, resource, category)
    -- sanity checking source
    if source <= 0 then
        logError('playerDropped event with source ' .. json.encode(source))
        return
    end

    if resource == TX_RESOURCE_NAME and TX_IS_SERVER_SHUTTING_DOWN then
        reason = 'server_shutting_down'
    end

    emitFd3PlayerDropped(source, reason, resource, category)
end)

-- Handle getDetailedPlayerlist
-- This event is only called when the menu "players" tab is opened, and every 5s while the tab is open
-- DEBUG playerlist scroll test stuff
-- math.randomseed(os.time())
-- local fake_playerlist = {}
-- local fake_admins = {1, 10, 21, 61, 91, 141, 281}
-- local function getFakePlayer()
--     return {
--         name = 'fake'..tostring(math.random(999999)),
--         health = 0,
--         vType = math.random(8),
--     }
-- end
-- for serverID=1, 500 do
--     fake_playerlist[serverID] = getFakePlayer()
-- end
RegisterNetEvent('txsv:req:plist:getDetailed', function(getPlayerNames)
    if TX_ADMINS[tostring(source)] == nil then
        DebugPrint('Ignoring unauthenticated getDetailedPlayerlist() by ' .. source)
        return
    end

    normalizeServerPlayerlist()

    local players = {}
    --DEBUG replace TX_PLAYERLIST with fake_playerlist and playerData.health with math.random(150)
    for playerID, playerData in pairs(TX_PLAYERLIST) do
        players[#players + 1] = {
            tonumber(playerID),
            playerData.health,
            playerData.vType,
            playerData.xCoord,
            playerData.yCoord,
        }
        if getPlayerNames then
            players[#players][6] = playerData.name
        end
    end
    local admins = {}
    for adminID in pairs(TX_ADMINS) do
        admins[#admins + 1] = tonumber(adminID)
    end
    local playerTags = {}
    for playerID, playerData in pairs(TX_PLAYERLIST) do
        local key = TxPlayerListKey(playerID)
        local tags = playerData.tags
        if tags == nil and TX_PLAYER_TAG_CACHE ~= nil then
            tags = TX_PLAYER_TAG_CACHE[key]
        end
        if tags ~= nil then
            playerTags[key] = tags
        end
    end
    for _, adminID in pairs(admins) do
        local key = TxPlayerListKey(adminID)
        local tags = playerTags[key]
        if tags == nil and TX_PLAYERLIST[key] ~= nil then
            tags = TX_PLAYERLIST[key].tags
        end
        if tags == nil and TX_PLAYER_TAG_CACHE ~= nil then
            tags = TX_PLAYER_TAG_CACHE[key]
        end
        if type(EnsureStaffInTags) == 'function' then
            playerTags[key] = EnsureStaffInTags(tags or {})
        end
    end
    --DEBUG replace admins with fake_admins
    TriggerClientEvent('txcl:plist:setDetailed', source, players, admins, playerTags)
end)

-- Sends the initial playlist to a specific admin
-- Triggered by the server after admin auth
function SendInitialPlayerlist(adminID)
    normalizeServerPlayerlist()

    local payload = {}
    --DEBUG replace TX_PLAYERLIST with fake_playerlist
    for playerID, playerData in pairs(TX_PLAYERLIST) do
        payload[#payload + 1] = { tonumber(playerID), playerData.name }
    end
    --DEBUG
    -- DebugPrint("====================================")
    -- print(json.encode(payload, {indent = true}))
    -- DebugPrint("====================================")

    DebugPrint('Sending initial playerlist to ' .. adminID)
    TriggerClientEvent('txcl:plist:setInitial', adminID, payload)
end

local function buildPlayerlistPayload()
    local payload = {}
    for playerID, playerData in pairs(TX_PLAYERLIST) do
        payload[#payload + 1] = { tonumber(playerID), playerData.name }
    end
    return payload
end

local function broadcastInitialPlayerlistToAdmins()
    local payload = buildPlayerlistPayload()
    for adminID, _ in pairs(TX_ADMINS) do
        TriggerClientEvent('txcl:plist:setInitial', adminID, payload)
    end
end

--[[ Full replace of HTTP-reported players (txsv:updateSyntheticPlayers). ]]
local function syncSyntheticHttpPlayers(players)
    local oldList = TX_HTTP_PLAYERLIST
    local newList = {}
    local hasChanges = false

    if type(players) == 'table' then
        for _, entry in ipairs(players) do
            local id = tonumber(entry.id)
            local name = entry.name
            if id and id > 0 and type(name) == 'string' and name ~= '' then
                local key = TxPlayerListKey(id)
                local newEntry = parseHttpDetailFromEntry(entry, name)
                newList[key] = newEntry
                local oldEntry = oldList[key]
                if httpDetailRowChanged(oldEntry, newEntry) then
                    hasChanges = true
                end
            end
        end
    end

    if not hasChanges then
        for key, _ in pairs(oldList) do
            if not newList[key] then
                hasChanges = true
                break
            end
        end
    end

    for key, playerData in pairs(TX_PLAYERLIST) do
        if playerData.isHttpReported and not newList[key] then
            TX_PLAYERLIST[key] = nil
        end
    end

    TX_HTTP_PLAYERLIST = newList
    local hotspots, _ = buildReportedDetailHotspots()
    local assignmentPlan = planReportedDetailAssignments(hotspots)
    REPORTED_DETAIL_ASSIGNMENT_PLAN = assignmentPlan
    mergeHttpPlayersIntoPlist(assignmentPlan)

    if hasChanges then
        broadcastInitialPlayerlistToAdmins()
    end
end

RegisterCommand('txaSyncHttpPlayers', function(source, args)
    if source ~= 0 then
        return logError('[txaSyncHttpPlayers] unexpected source ' .. json.encode(source))
    end
    if GetInvokingResource() ~= nil then
        return logError('[txaSyncHttpPlayers] unexpected invoking resource ' .. json.encode(GetInvokingResource()))
    end
    if type(args[1]) ~= 'string' then
        return logError('[txaSyncHttpPlayers] invalid argument types')
    end

    local players = json.decode(ReplaceSemicolon(args[1]))
    syncSyntheticHttpPlayers(players)
    CancelEvent()
end, true)

AddEventHandler('txsv:updateSyntheticPlayers', function(players)
    syncSyntheticHttpPlayers(players)
end)
