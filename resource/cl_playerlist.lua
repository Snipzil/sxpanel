-- Prevent running if menu is disabled
if not TX_MENU_ENABLED then
    return
end

-- =============================================
--  Client PlayerList handler
-- =============================================

-- Optimizations
local tonumber = tonumber
local tostring = tostring
local floor = math.floor

-- Variables & Consts
TX_LOCAL_PLAYERLIST = {} -- available globally in tx
local requirePlayerNames = false
local vTypeMap = {
    ['0'] = 'walking',
    ['1'] = 'driving', --automobile
    ['2'] = 'biking',
    ['3'] = 'boating',
    ['4'] = 'flying', --heli
    ['5'] = 'flying', --plane
    ['6'] = 'boating', --submarine
    ['7'] = 'driving', --trailer
    ['8'] = 'driving', --train
}

--- Normalizes player/server IDs to string keys (Lua treats t[1] and t["1"] as different).
local function TxLocalPlayerListKey(id)
    return tostring(id)
end

--- Prefer the entry with a resolved name and the freshest health/distance data.
local function shouldReplaceLocalPlayerEntry(candidate, incumbent)
    if incumbent == nil then
        return true
    end

    local candName = candidate.name or 'unknown'
    local incName = incumbent.name or 'unknown'
    if incName == 'unknown' and candName ~= 'unknown' then
        return true
    end
    if candName == 'unknown' and incName ~= 'unknown' then
        return false
    end

    if (incumbent.health == nil or incumbent.health == 0) and candidate.health ~= nil and candidate.health ~= 0 then
        return true
    end
    if (incumbent.dist == nil or incumbent.dist < 0) and candidate.dist ~= nil and candidate.dist >= 0 then
        return true
    end

    return false
end

--- Merges duplicate slots keyed as both number and string into one canonical entry.
local function normalizeLocalPlayerlist()
    local normalized = {}

    for pidKey, playerData in pairs(TX_LOCAL_PLAYERLIST) do
        if type(playerData) ~= 'table' then
            goto continue
        end

        local id = tonumber(pidKey)
        if not id or id <= 0 then
            goto continue
        end

        local key = TxLocalPlayerListKey(id)
        local existing = normalized[key]
        if existing == nil then
            normalized[key] = playerData
        elseif shouldReplaceLocalPlayerEntry(playerData, existing) then
            normalized[key] = playerData
        end

        ::continue::
    end

    TX_LOCAL_PLAYERLIST = normalized
end

-- Transforms the playerlist and sends to react
-- The playerlist is converted to an object array to save refactor time
function SendReactPlayerlist()
    normalizeLocalPlayerlist()

    local upload = {}
    local seenIds = {}
    for pids, playerData in pairs(TX_LOCAL_PLAYERLIST) do
        local id = tonumber(pids)
        if id and id > 0 and not seenIds[id] then
            seenIds[id] = true
            upload[#upload + 1] = {
                id = id,
                name = playerData.name or 'unknown',
                health = playerData.health,
                dist = playerData.dist,
                vType = playerData.vType,
                admin = playerData.admin,
                tags = playerData.tags or {},
            }
        end
    end
    -- print("========== function sendReactPlayerlist()")
    -- print(json.encode(upload))
    -- print("------------------------------------")
    SendMenuMessage('setPlayerList', upload)
end

-- Triggered when the admin authenticates
-- Replaces current playerlist
RegisterNetEvent('txcl:plist:setInitial', function(payload)
    -- print("========== EVENT setInitialPlayerlist")
    -- print(json.encode(payload)) -- [[id, name]]
    -- print("------------------------------------")
    TX_LOCAL_PLAYERLIST = {}
    for _, playerData in pairs(payload) do
        local pids = TxLocalPlayerListKey(playerData[1])
        TX_LOCAL_PLAYERLIST[pids] = {
            name = playerData[2],
            health = 0,
            dist = -1,
            vType = 'unknown',
            admin = false,
            tags = {},
        }
    end
    -- print("------------------------------------")
    -- print(json.encode(TX_LOCAL_PLAYERLIST, {indent = true}))
    -- print("------------------------------------")
    SendReactPlayerlist()
end)

RegisterNetEvent('txcl:plist:updatePlayerTags', function(netId, tags)
    local pidStr = TxLocalPlayerListKey(netId)
    if type(tags) ~= 'table' then return end
    local entry = TX_LOCAL_PLAYERLIST[pidStr]
    -- Tags often arrive before txcl:plist:updatePlayer; upsert instead of dropping.
    if entry == nil then
        TX_LOCAL_PLAYERLIST[pidStr] = {
            name = 'unknown',
            health = 0,
            dist = -1,
            vType = 'unknown',
            admin = false,
            tags = tags,
        }
    else
        entry.tags = tags
    end
    SendReactPlayerlist()
end)

-- Triggered on the return of "getDetailedPlayerlist"
--  > run through inbound playerlist updating existing data
--  > try to get the dist from all players (onesync only)
RegisterNetEvent('txcl:plist:setDetailed', function(players, admins, playerTags)
    -- print("========== EVENT setDetailedPlayerlist")
    -- print(json.encode(players)) -- [[id, health, vType, xCoord, yCoord, name]]
    -- print("------------------------------------")
    local myID = GetPlayerServerId(PlayerId())
    local myPed = PlayerPedId()
    local myCoords = GetEntityCoords(myPed)

    for _, playerData in pairs(players) do
        local pid = playerData[1]
        local pidStr = TxLocalPlayerListKey(playerData[1])
        local localPlayer = TX_LOCAL_PLAYERLIST[pidStr]
        -- Set inbound data
        if localPlayer == nil then
            DebugPrint('Playerlist: received detailed info for player ' .. pidStr .. ' not present in local playerlist')
            requirePlayerNames = true
            TX_LOCAL_PLAYERLIST[pidStr] = {
                name = 'unknown',
                health = playerData[2],
                vType = vTypeMap[tostring(playerData[3])] or 'unknown',
                admin = false,
                tags = {},
            }
        else
            TX_LOCAL_PLAYERLIST[pidStr].health = playerData[2]
            TX_LOCAL_PLAYERLIST[pidStr].vType = vTypeMap[tostring(playerData[3])] or 'unknown'
            -- Set the player name if available - used when the playerJoining (txcl:plist:updatePlayer) was missed
            if playerData[6] then
                TX_LOCAL_PLAYERLIST[pidStr].name = playerData[6]
            end
        end

        --Mark as updated
        TX_LOCAL_PLAYERLIST[pidStr].inLastUpdate = true

        -- Getting distance + health for RedM
        -- NOTE: RedM doesn't save ped health data on server, so need to get locally
        if pid == myID then
            TX_LOCAL_PLAYERLIST[pidStr].dist = 0
            if IS_REDM then
                TX_LOCAL_PLAYERLIST[pidStr].health = GetPedHealthPercent(myPed)
            end
        else
            --calc distance (onesync only, 2d only)
            if playerData[4] == nil or playerData[5] == nil then
                TX_LOCAL_PLAYERLIST[pidStr].dist = -1
            else
                local remoteCoords = vector3(playerData[4], playerData[5], myCoords.z)
                TX_LOCAL_PLAYERLIST[pidStr].dist = floor(#(myCoords - remoteCoords))
            end

            --get health locally
            if IS_REDM then
                local remotePlayer = GetPlayerFromServerId(pid)
                if remotePlayer == -1 then
                    TX_LOCAL_PLAYERLIST[pidStr].health = -1
                else
                    local remotePed = GetPlayerPed(remotePlayer)
                    TX_LOCAL_PLAYERLIST[pidStr].health = GetPedHealthPercent(remotePed)
                end
            end
        end
    end

    --Check if player disconnected and the playerDropped (txcl:plist:updatePlayer) was missed
    for playerID, playerData in pairs(TX_LOCAL_PLAYERLIST) do
        if playerData.inLastUpdate == true then
            playerData.inLastUpdate = false
        else
            DebugPrint(
                'Playerlist: did not receive detailed info for player ' .. playerID .. ' present in local playerlist'
            )
            TX_LOCAL_PLAYERLIST[playerID] = nil
        end
    end

    -- Reset admin flags before applying the latest admin snapshot
    for _, playerData in pairs(TX_LOCAL_PLAYERLIST) do
        playerData.admin = false
    end

    -- Mark admins
    for _, adminID in pairs(admins) do
        local id = TxLocalPlayerListKey(adminID)
        if TX_LOCAL_PLAYERLIST[id] ~= nil then
            TX_LOCAL_PLAYERLIST[id].admin = true
        end
    end

    -- Apply tags (server keys may be number or string; local list always uses strings)
    if playerTags then
        for playerID, tags in pairs(playerTags) do
            if type(tags) == 'table' then
                local key = TxLocalPlayerListKey(playerID)
                local entry = TX_LOCAL_PLAYERLIST[key]
                if entry == nil then
                    TX_LOCAL_PLAYERLIST[key] = {
                        name = 'unknown',
                        health = 0,
                        dist = -1,
                        vType = 'unknown',
                        admin = false,
                        tags = tags,
                    }
                else
                    entry.tags = tags
                end
            end
        end
    end

    -- print("------------------------------------")
    -- print(json.encode(TX_LOCAL_PLAYERLIST, {indent = true}))
    -- print("------------------------------------")
    SendReactPlayerlist()
end)

-- Triggered on player join/leave
-- add/remove specific id to playerlist
RegisterNetEvent('txcl:plist:updatePlayer', function(id, data)
    local pids = TxLocalPlayerListKey(id)
    if data == false then
        DebugPrint('^2txcl:plist:updatePlayer: ^3' .. id .. '^2 disconnected')
        TX_LOCAL_PLAYERLIST[pids] = nil
    else
        DebugPrint('^2txcl:plist:updatePlayer: ^3' .. id .. '^2 connected')
        local existing = TX_LOCAL_PLAYERLIST[pids]
        TX_LOCAL_PLAYERLIST[pids] = {
            name = data,
            health = existing and existing.health or 0,
            dist = existing and existing.dist or -1,
            vType = existing and existing.vType or 'unknown',
            admin = existing and existing.admin or false,
            tags = existing and existing.tags or {},
        }
    end
    SendReactPlayerlist()
end)

-- Triggered when the "player" tab opens in the menu, and every 5s after that
RegisterSecureNuiCallback('signalPlayersPageOpen', function(_, cb)
    TriggerServerEvent('txsv:req:plist:getDetailed', requirePlayerNames)
    requirePlayerNames = false
    cb({})
end)

-- DEBUG only
-- RegisterCommand('tnew', function()
--     TriggerServerEvent('txsv:req:plist:getDetailed')
-- end)
-- RegisterCommand('tprint', function()
--     print("------------------------------------")
--     print(json.encode(TX_LOCAL_PLAYERLIST, {indent = true}))
--     print("------------------------------------")
-- end)
