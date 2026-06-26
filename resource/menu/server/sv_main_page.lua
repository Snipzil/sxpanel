-- Prevent running in monitor mode
if not TX_SERVER_MODE then
    return
end
-- Prevent running if menu is disabled
if not TX_MENU_ENABLED then
    return
end

-- =============================================
--  This file is for server side handlers related to
--  actions defined on Menu's "Main Page"
-- =============================================

RegisterNetEvent('txsv:req:tpToWaypoint', function()
    local src = source
    local allow = PlayerHasTxPermission(src, 'players.teleport')
    if allow then
        TriggerClientEvent('txcl:tpToWaypoint', src)
        Wait(250)
        local coords = GetEntityCoords(GetPlayerPed(src))
        TriggerEvent(
            'txsv:logger:menuEvent',
            src,
            'teleportWaypoint',
            true,
            { x = coords[1], y = coords[2], z = coords[3] }
        )
    else
        TriggerEvent('txsv:logger:menuEvent', src, 'teleportWaypoint', false)
    end
end)

RegisterNetEvent('txsv:req:sendAnnouncement', function(message)
    local src = source
    if type(message) ~= 'string' then
        return
    end
    local allow = PlayerHasTxPermission(src, 'announcement')
    TriggerEvent('txsv:logger:menuEvent', src, 'announcement', allow, message)
    if allow then
        PrintStructuredTrace(json.encode({
            type = 'txAdminCommandBridge',
            command = 'announcement',
            author = TxAdminActionAuthor(TX_ADMINS[tostring(src)]),
            message = message,
        }))
    end
end)

RegisterNetEvent('txsv:req:clearArea', function(radius)
    local src = source
    local allow = PlayerHasTxPermission(src, 'menu.clear_area')
    TriggerEvent('txsv:logger:menuEvent', src, 'clearArea', allow, radius)
    if allow then
        TriggerClientEvent('txcl:clearArea', src, radius)
    end
end)

RegisterNetEvent('txsv:req:healEveryone', function()
    local src = source
    local allow = PlayerHasTxPermission(src, 'players.heal')
    TriggerEvent('txsv:logger:menuEvent', src, 'healAll', true)
    if allow then
        TriggerClientEvent('txcl:heal', -1)
        -- For use with third party resources that handle players
        -- 'revive state' standalone from health (esx-ambulancejob, qb-ambulancejob, etc)
        TriggerEvent('txAdmin:events:playerHealed', {
            target = -1,
            author = TxAdminActionAuthor(TX_ADMINS[tostring(src)]),
        })
    end
end)

RegisterNetEvent('txsv:req:healMyself', function()
    local src = source
    local allow = PlayerHasTxPermission(src, 'players.heal')
    TriggerEvent('txsv:logger:menuEvent', src, 'healSelf', allow)
    if allow then
        TriggerClientEvent('txcl:heal', src)
        -- For use with third party resources that handle players
        -- 'revive state' standalone from health (esx-ambulancejob, qb-ambulancejob, etc)
        TriggerEvent('txAdmin:events:playerHealed', {
            target = src,
            author = TxAdminActionAuthor(TX_ADMINS[tostring(src)]),
        })
    end
end)

RegisterNetEvent('txsv:req:healRadius', function(radius)
    local src = source
    if type(radius) ~= 'number' then
        return
    end
    if radius < 1 or radius > 500 then
        return
    end
    local allow = PlayerHasTxPermission(src, 'players.heal')
    TriggerEvent('txsv:logger:menuEvent', src, 'healRadius', allow, radius)
    if allow then
        local srcPed = GetPlayerPed(src)
        if not srcPed or srcPed == 0 then
            return
        end
        local srcCoords = GetEntityCoords(srcPed)
        local players = GetPlayers()
        local healed = 0
        for _, playerId in ipairs(players) do
            local targetPed = GetPlayerPed(playerId)
            if targetPed and targetPed ~= 0 then
                local targetCoords = GetEntityCoords(targetPed)
                local dist = #(
                    vector3(srcCoords[1], srcCoords[2], srcCoords[3])
                    - vector3(targetCoords[1], targetCoords[2], targetCoords[3])
                )
                if dist <= radius then
                    TriggerClientEvent('txcl:heal', tonumber(playerId))
                    TriggerEvent('txAdmin:events:playerHealed', {
                        target = tonumber(playerId),
                        author = TxAdminActionAuthor(TX_ADMINS[tostring(src)]),
                    })
                    healed = healed + 1
                end
            end
        end
    end
end)

RegisterNetEvent('txsv:req:healPlayer', function(id)
    local src = source
    if type(id) ~= 'string' and type(id) ~= 'number' then
        return
    end
    id = tonumber(id)
    local allow = PlayerHasTxPermission(src, 'players.heal')
    if allow then
        local ped = GetPlayerPed(id)
        if ped then
            TriggerClientEvent('txcl:heal', id)
            -- For use with third party resources that handle players
            -- 'revive state' standalone from health (esx-ambulancejob, qb-ambulancejob, etc)
            TriggerEvent('txAdmin:events:playerHealed', {
                target = id,
                author = TxAdminActionAuthor(TX_ADMINS[tostring(src)]),
            })
        end
    end
    TriggerEvent('txsv:logger:menuEvent', src, 'healPlayer', allow, id)
end)

RegisterNetEvent('txsv:req:showPlayerIDs', function(enabled)
    local src = source
    local allow = PlayerHasTxPermission(src, 'menu.viewids')
    TriggerEvent('txsv:logger:menuEvent', src, 'showPlayerIDs', allow, enabled)
    if allow then
        TriggerClientEvent('txcl:showPlayerIDs', src, enabled)
    end
end)

RegisterNetEvent('txsv:req:showMapBlips', function(enabled)
    local src = source
    local allow = PlayerHasTxPermission(src, 'menu.mapblips')
    TriggerEvent('txsv:logger:menuEvent', src, 'showMapBlips', allow, enabled)
    if allow then
        TriggerClientEvent('txcl:showMapBlips', src, enabled)
    end
end)

---@param x number|nil
---@param y number|nil
---@param z number|nil
RegisterNetEvent('txsv:req:tpToCoords', function(x, y, z)
    local src = source
    if type(x) ~= 'number' or type(y) ~= 'number' or type(z) ~= 'number' then
        return
    end

    local allow = PlayerHasTxPermission(src, 'players.teleport')
    TriggerEvent('txsv:logger:menuEvent', src, 'teleportCoords', allow, { x = x, y = y, z = z })
    if allow then
        TriggerClientEvent('txcl:tpToCoords', src, x, y, z)
    end
end)
