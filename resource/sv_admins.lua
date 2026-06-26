-- Prevent running in monitor mode
if not TX_SERVER_MODE then
    return
end

if TX_LUACOMHOST == 'invalid' or TX_LUACOMTOKEN == 'invalid' then
    TxPrint('^1API Host or Pipe Token ConVars not found. Do not start this resource if not using txAdmin.')
    return
end
if TX_LUACOMTOKEN == 'removed' then
    TxPrint('^1Please do not restart the monitor resource.')
    return
end

-- =============================================
--    Lua Admin Manager
-- =============================================

-- Variables & Consts
local failedAuths = {}
local attemptCooldown = 15000

-- Handle auth failures
local function handleAuthFail(src, reason)
    local srcString = tostring(src)
    TX_ADMINS[srcString] = nil
    failedAuths[srcString] = GetGameTimer()
    reason = reason or 'unknown'
    DebugPrint('Auth rejected #' .. srcString .. ' (' .. reason .. ')')
    TriggerClientEvent('txcl:setAdmin', src, false, false, reason)
    TriggerEvent('txAdmin:events:adminAuth', {
        netid = src,
        isAdmin = false,
    })
end

-- Handle menu auth requests
RegisterNetEvent('txsv:checkIfAdmin', function()
    local src = source
    local srcString = tostring(source)
    DebugPrint('Handling authentication request from player #' .. srcString)

    -- Rate Limiter
    if type(failedAuths[srcString]) == 'number' and failedAuths[srcString] + attemptCooldown > GetGameTimer() then
        return handleAuthFail(source, 'too many auth attempts')
    end

    -- Prepping http request
    local url = 'http://' .. TX_LUACOMHOST .. '/auth/self'
    local headers = {
        ['Content-Type'] = 'application/json',
        ['X-TxAdmin-Token'] = TX_LUACOMTOKEN,
        ['X-TxAdmin-Identifiers'] = table.concat(GetPlayerIdentifiers(src), ','),
    }

    -- Making http request
    PerformHttpRequest(url, function(httpCode, data, resultHeaders)
        -- Validating response
        local resp = json.decode(data)
        if not resp then
            return handleAuthFail(src, 'invalid response')
        end
        if resp.logout ~= nil and resp.logout then
            return handleAuthFail(src, resp.reason or 'unknown reject reason')
        end
        if type(resp.name) ~= 'string' then
            return handleAuthFail(src, 'invalid response')
        end
        if type(resp.permissions) ~= 'table' then
            resp.permissions = {}
        end

        -- Setting up admin
        local adminTag = '[#' .. src .. '] ' .. resp.name
        local skipStaffTag = type(resp.passwordRevision) == 'number' and resp.passwordRevision < 0
        DebugPrint(
            ('^2Authenticated admin ^5%s^2 with permissions: %s'):format(src, adminTag, json.encode(resp.permissions))
        )
        TX_ADMINS[srcString] = {
            tag = adminTag,
            username = resp.name,
            perms = resp.permissions,
            bucket = 0,
            skipStaffTag = skipStaffTag,
            bridgeAsSystem = skipStaffTag,
        }
        if type(StorePlayerTags) == 'function' then
            local cached = TX_PLAYER_TAG_CACHE and TX_PLAYER_TAG_CACHE[srcString] or {}
            if skipStaffTag and type(WithoutStaffTag) == 'function' then
                StorePlayerTags(src, WithoutStaffTag(cached))
            elseif type(EnsureStaffInTags) == 'function' then
                StorePlayerTags(src, EnsureStaffInTags(cached))
            else
                StorePlayerTags(src, cached)
            end
        end
        SendInitialPlayerlist(src)
        if GlobalState.txAdminServerCtx ~= nil then
            TriggerClientEvent('txcl:setServerCtx', src, GlobalState.txAdminServerCtx)
        end
        TriggerClientEvent('txcl:setAdmin', src, resp.name, resp.permissions)
        TriggerEvent('txAdmin:events:adminAuth', {
            netid = src,
            isAdmin = true,
            username = resp.name,
        })
    end, 'GET', '', headers)
end)

-- Remove admin from table when disconnected
AddEventHandler('playerDropped', function()
    TX_ADMINS[tostring(source)] = nil
end)

-- Handle updated admin list
AddEventHandler('txAdmin:events:adminsUpdated', function(onlineAdminIDs)
    DebugPrint('^3Admins list updated. Online admins: ' .. json.encode(onlineAdminIDs))

    -- Collect old and new admin IDs as key to prevent duplicate
    local refreshAdminIds = {}
    for id, _ in pairs(TX_ADMINS) do
        refreshAdminIds[id] = true
    end
    for _, id in pairs(onlineAdminIDs) do
        refreshAdminIds[tostring(id)] = true
    end
    DebugPrint('^3Forcing clients to re-auth')

    -- Resetting all admin permissions and rate limiter
    TX_ADMINS = {}
    failedAuths = {}

    -- Informing clients that they need to reauth
    for id, _ in pairs(refreshAdminIds) do
        TriggerClientEvent('txcl:reAuth', tonumber(id))
    end

    -- Broadcasting the invalidation of all admins
    TriggerEvent('txAdmin:events:adminAuth', {
        netid = -1,
        isAdmin = false,
    })
end)
