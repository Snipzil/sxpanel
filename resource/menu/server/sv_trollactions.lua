-- Prevent running in monitor mode
if not TX_SERVER_MODE then
    return
end
-- Prevent running if menu is disabled
if not TX_MENU_ENABLED then
    return
end

--- Resolves and validates a troll action target id, returns nil if invalid/offline
---@param id string|number|nil
---@return number|nil
local function resolveTrollTarget(id)
    if type(id) ~= 'string' and type(id) ~= 'number' then
        return nil
    end
    id = tonumber(id)
    if not id or not DoesPlayerExist(tostring(id)) then
        return nil
    end
    return id
end

RegisterNetEvent('txsv:req:troll:setDrunk', function(id)
    local src = source
    id = resolveTrollTarget(id)
    if not id then
        return
    end
    local allow = PlayerHasTxPermission(src, 'players.troll')
    if allow then
        TriggerClientEvent('txcl:setDrunk', id)
    end
    TriggerEvent('txsv:logger:menuEvent', src, 'drunkEffect', allow, id)
end)

RegisterNetEvent('txsv:req:troll:setOnFire', function(id)
    local src = source
    id = resolveTrollTarget(id)
    if not id then
        return
    end
    local allow = PlayerHasTxPermission(src, 'players.troll')
    if allow then
        TriggerClientEvent('txcl:setOnFire', id)
    end
    TriggerEvent('txsv:logger:menuEvent', src, 'setOnFire', allow, id)
end)

RegisterNetEvent('txsv:req:troll:wildAttack', function(id)
    local src = source
    id = resolveTrollTarget(id)
    if not id then
        return
    end
    local allow = PlayerHasTxPermission(src, 'players.troll')
    if allow then
        TriggerClientEvent('txcl:wildAttack', id)
    end
    TriggerEvent('txsv:logger:menuEvent', src, 'wildAttack', allow, id)
end)
