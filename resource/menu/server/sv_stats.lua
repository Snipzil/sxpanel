-- Prevent running in monitor mode
if not TX_SERVER_MODE then
    return
end
-- Prevent running if menu is disabled
if not TX_MENU_ENABLED then
    return
end

-- =============================================
--  Basic live stats for the NUI Stats tab
-- =============================================

local TX_STATS_BOOT_TS = os.time()

local function hasFullAccess(perms)
    if type(perms) ~= 'table' then
        return false
    end
    for _, perm in pairs(perms) do
        if perm == 'all_permissions' then
            return true
        end
    end
    return false
end

local function buildOnlineAdmins()
    local admins = {}
    for adminID, adminData in pairs(TX_ADMINS) do
        local numericId = tonumber(adminID)
        if numericId and type(adminData) == 'table' then
            admins[#admins + 1] = {
                id = numericId,
                username = adminData.username,
                fullAccess = hasFullAccess(adminData.perms),
            }
        end
    end
    return admins
end

RegisterNetEvent('txsv:req:getStats', function()
    local src = source
    if TX_ADMINS[tostring(src)] == nil then
        DebugPrint('Ignoring unauthenticated getStats() by ' .. src)
        return
    end

    local numResources = GetNumResources()
    local startedResources = 0
    for i = 0, numResources - 1 do
        local resName = GetResourceByFindIndex(i)
        if resName and GetResourceState(resName) == 'started' then
            startedResources = startedResources + 1
        end
    end

    TriggerClientEvent('txcl:setStats', src, {
        playerCount = #GetPlayers(),
        resourceCount = startedResources,
        uptimeSeconds = os.time() - TX_STATS_BOOT_TS,
        admins = buildOnlineAdmins(),
        youId = src,
    })
end)
