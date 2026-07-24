-- Prevent running if menu is disabled
if not TX_MENU_ENABLED then
    return
end

-- =============================================
--  Bridges the NUI Stats tab to the server-side snapshot
-- =============================================

RegisterSecureNuiCallback('getStats', function(_, cb)
    TriggerServerEvent('txsv:req:getStats')
    cb({})
end)

RegisterNetEvent('txcl:setStats', function(stats)
    SendMenuMessage('setStats', stats)
end)

--- In-game clock only exists client-side, so this answers directly
--- instead of round-tripping through the server like getStats does.
RegisterSecureNuiCallback('getWorldTime', function(_, cb)
    cb({
        hours = GetClockHours(),
        minutes = GetClockMinutes(),
    })
end)
