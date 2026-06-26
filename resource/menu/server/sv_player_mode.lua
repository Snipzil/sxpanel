-- Prevent running in monitor mode
if not TX_SERVER_MODE then
    return
end
-- Prevent running if menu is disabled
if not TX_MENU_ENABLED then
    return
end

local IS_PTFX_ENABLED = GetConvarBool('txAdmin-playerModePtfx', true)

RegisterNetEvent('txsv:req:changePlayerMode', function(mode, nearbyPlayers)
    local src = source
    if mode ~= 'godmode' and mode ~= 'noclip' and mode ~= 'superjump' and mode ~= 'none' then
        DebugPrint('Invalid player mode requested by ' .. GetPlayerName(src) .. ' (mode: ' .. (mode or 'nil'))
        return
    end

    local permMap = {
        godmode = 'players.godmode',
        noclip = 'players.noclip',
        superjump = 'players.superjump',
        none = 'players.noclip', -- turning off requires at least one mode perm
    }
    local allow = PlayerHasTxPermission(src, permMap[mode] or 'players.noclip')
    TriggerEvent('txsv:logger:menuEvent', src, 'playerModeChanged', allow, mode)
    if allow then
        Player(src).state:set('txAdminPlayerMode', mode, true)
        TriggerClientEvent('txcl:setPlayerMode', src, mode, IS_PTFX_ENABLED)

        if IS_PTFX_ENABLED then
            for _, v in ipairs(nearbyPlayers) do
                TriggerClientEvent('txcl:showPtfx', v, src)
            end
        end
    end
end)
