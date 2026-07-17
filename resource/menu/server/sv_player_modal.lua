-- Prevent running in monitor mode
if not TX_SERVER_MODE then
    return
end
-- Prevent running if menu is disabled
if not TX_MENU_ENABLED then
    return
end

-- =============================================
--  This file is for general server side handlers
--  related to actions defined within Menu's
--  "Player Modal"
-- =============================================

RegisterNetEvent('txsv:req:tpToPlayer', function(tgtId)
    local src = source

    if type(tgtId) ~= 'number' then
        return
    end

    -- Skip if targeting yourself; server-side ped coords may resolve to 0,0,0
    if tgtId == src then
        return
    end

    local allow = PlayerHasTxPermission(src, 'players.teleport')
    local data = { x = nil, y = nil, z = nil, target = tgtId }

    -- More OneSync dependent code
    if allow then
        -- ensure the player ped exists before touching routing buckets
        -- NOTE: GetPlayerPed returns 0 (truthy in Lua) for invalid/offline players
        local ped = GetPlayerPed(tgtId)
        if ped and ped > 0 then
            -- Check for routing bucket diff
            local tgtBucket = GetPlayerRoutingBucket(tgtId)
            local srcBucket = GetPlayerRoutingBucket(src)

            -- This isn't stored anywhere for reversion,
            -- as TP to player is typically a one sided operation
            if tgtBucket ~= srcBucket then
                SetPlayerRoutingBucket(src, tgtBucket)
            end

            local coords = GetEntityCoords(ped)
            data.x = coords[1]
            data.y = coords[2]
            data.z = coords[3]
            TriggerClientEvent('txcl:tpToCoords', src, data.x, data.y, data.z)
        end
    end

    TriggerEvent('txsv:logger:menuEvent', src, 'teleportPlayer', allow, data)
end)

RegisterNetEvent('txsv:req:bringPlayer', function(id)
    local src = source
    if type(id) ~= 'number' then
        return
    end
    local allow = PlayerHasTxPermission(src, 'players.teleport')
    if allow then
        -- ensure both peds exist (GetPlayerPed returns 0, truthy in Lua, when invalid)
        local ped = GetPlayerPed(id)
        local srcPed = GetPlayerPed(src)
        if ped and ped > 0 and srcPed and srcPed > 0 then
            local coords = GetEntityCoords(srcPed)
            TriggerClientEvent('txcl:tpToCoords', id, coords[1], coords[2], coords[3])
        end
    end
    TriggerEvent('txsv:logger:menuEvent', src, 'summonPlayer', allow, id)
end)
