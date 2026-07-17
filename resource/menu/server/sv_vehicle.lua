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

RegisterNetEvent('txsv:req:vehicle:fix', function()
    local src = source
    local allow = PlayerHasTxPermission(src, 'menu.vehicle.fix')
    TriggerEvent('txsv:logger:menuEvent', src, 'vehicleRepair', allow)
    if allow then
        TriggerClientEvent('txcl:vehicle:fix', src)
    end
end)

RegisterNetEvent('txsv:req:vehicle:boost', function()
    local src = source
    local allow = PlayerHasTxPermission(src, 'menu.vehicle.boost')
    TriggerEvent('txsv:logger:menuEvent', src, 'vehicleBoost', allow)
    if allow then
        TriggerClientEvent('txcl:vehicle:boost', src)
    end
end)

---Since we can't spawn it on the server, we just respond to the client and let it handle the spawn
---@param model string
RegisterNetEvent('txsv:req:vehicle:spawn:redm', function(model)
    if not IS_REDM then
        return
    end
    local src = source
    if type(model) ~= 'string' then
        return
    end
    local allow = PlayerHasTxPermission(src, 'menu.vehicle.spawn')
    TriggerEvent('txsv:logger:menuEvent', src, 'spawnVehicle', allow, model)
    if allow then
        TriggerClientEvent('txcl:vehicle:spawn:redm', src, model)
    end
end)

--- Spawn a vehicle on the server at the request of a client (fivem)
---@param model string
---@param modelType string
RegisterNetEvent('txsv:req:vehicle:spawn:fivem', function(model, modelType)
    if not IS_FIVEM then
        return
    end
    local src = source
    if type(model) ~= 'string' then
        return
    end
    if type(modelType) ~= 'string' then
        return
    end

    --check permission
    local allow = PlayerHasTxPermission(src, 'menu.vehicle.spawn')
    TriggerEvent('txsv:logger:menuEvent', src, 'spawnVehicle', allow, model)
    if not allow then
        return
    end

    --resolve source ped
    local ped = GetPlayerPed(src)
    local coords = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    local sourceBucket = GetPlayerRoutingBucket(src)

    --collect data from old current vehicle (if any)
    local seatsToPlace = {}
    local oldVeh = GetVehiclePedIsIn(ped, false)
    local oldVehVelocity
    if oldVeh and oldVeh > 0 then
        oldVehVelocity = GetEntityVelocity(oldVeh)

        --for each seat
        for i = 6, -1, -1 do
            local pedInSeat = GetPedInVehicleSeat(oldVeh, i)
            if pedInSeat > 0 then
                seatsToPlace[i] = pedInSeat
            end
        end
        DeleteEntity(oldVeh)
    else
        seatsToPlace[-1] = ped
    end

    --spawn new vehicle
    local newVeh = CreateVehicleServerSetter(model, modelType, coords.x, coords.y, coords.z, heading)
    local attemptsCounter = 0
    local attemptsLimit = 400 -- 400*5 = 2s
    while not DoesEntityExist(newVeh) do
        Wait(5)
        attemptsCounter = attemptsCounter + 1
        if attemptsCounter > attemptsLimit then
            return DebugPrint('Failed to spawn vehicle entity')
        end
    end
    SetEntityRoutingBucket(newVeh, sourceBucket)
    if oldVehVelocity ~= nil then
        ---@diagnostic disable-next-line: missing-parameter, param-type-mismatch
        SetEntityVelocity(newVeh, oldVehVelocity)
    end

    local vehNetId = NetworkGetNetworkIdFromEntity(newVeh)
    DebugPrint(
        string.format(
            'spawn vehicle (src=^3%d^0, model=^4%s^0, modelType=^4%s^0, vehNetId=^3%s^0)',
            src,
            model,
            modelType,
            vehNetId
        )
    )

    --Moving peds to new vehicle and deleting old one
    --creating a ped/netid map
    local players = GetPlayers()
    local pedNetIdMap = {}
    for _, id in pairs(players) do
        local pedId = GetPlayerPed(id)
        pedNetIdMap[pedId] = id
    end
    --sending seatInVehicle event to each client
    for seatIndex, seatPed in pairs(seatsToPlace) do
        local targetSrc = pedNetIdMap[seatPed]
        if type(targetSrc) == 'string' then
            DebugPrint(('setting netid %s (ped %d) into seat index %d'):format(targetSrc, seatPed, seatIndex))
            TriggerClientEvent('txcl:seatInVehicle', targetSrc, vehNetId, seatIndex, oldVehVelocity)
        end
    end
end)

--- Deletes the vehicle the player is currently in
--- @param vehNetId number
RegisterNetEvent('txsv:req:vehicle:delete', function(vehNetId)
    local src = source
    if type(vehNetId) ~= 'number' then
        return
    end
    local allow = PlayerHasTxPermission(src, 'menu.vehicle.delete')
    TriggerEvent('txsv:logger:menuEvent', src, 'deleteVehicle', allow)
    if allow then
        local vehicle = NetworkGetEntityFromNetworkId(vehNetId)
        if not vehicle or vehicle <= 0 or not DoesEntityExist(vehicle) then
            return
        end
        -- The client only requests deletion of the vehicle/mount the admin is in,
        -- so reject net ids pointing at unrelated entities (e.g. other players' peds)
        local srcPed = GetPlayerPed(src)
        if not srcPed or srcPed <= 0 then
            return
        end
        if GetVehiclePedIsIn(srcPed, false) ~= vehicle then
            local entType = GetEntityType(vehicle)
            local dist = #(GetEntityCoords(srcPed) - GetEntityCoords(vehicle))
            if entType == 2 then --vehicle
                if dist > 15.0 then
                    return
                end
            elseif entType == 1 then --ped (RedM mounts), must be right under the admin
                if IsPedAPlayer(vehicle) or dist > 5.0 then
                    return
                end
            else
                return
            end
        end
        DeleteEntity(vehicle)
    end
end)
