-- Prevent running if menu is disabled
if not TX_MENU_ENABLED then
    return
end

-- =============================================
--  Troll action logic from the player modal is located here (callbacks, events)
-- =============================================

local EFFECT_TIME_MS = GetConvarInt('txAdmin-menuDrunkDuration', 30) * 1000
local DRUNK_ANIM_SET = 'move_m@drunk@verydrunk'

local DRUNK_DRIVING_EFFECTS = {
    1, -- brake
    7, --turn left + accelerate
    8, -- turn right + accelerate
    23, -- accelerate
    4, -- turn left 90 + braking
    5, -- turn right 90 + braking
}

local function getRandomDrunkCarTask()
    return DRUNK_DRIVING_EFFECTS[math.random(#DRUNK_DRIVING_EFFECTS)]
end

-- NOTE: We might want to check if a player already has an effect
local function drunkThreadFivem()
    local playerPed = PlayerPedId()
    local isDrunk = true

    DebugPrint('Starting drunk effect')
    RequestAnimSet(DRUNK_ANIM_SET)
    while not HasAnimSetLoaded(DRUNK_ANIM_SET) do
        Wait(5)
    end

    SetPedMovementClipset(playerPed, DRUNK_ANIM_SET, 0.0)
    ShakeGameplayCam('DRUNK_SHAKE', 3.0)
    SetPedIsDrunk(playerPed, true)
    SetTransitionTimecycleModifier('spectator5', 10.00)

    CreateThread(function()
        while isDrunk do
            local vehPedIsIn = GetVehiclePedIsIn(playerPed, false)
            local isPedInVehicleAndDriving = (vehPedIsIn ~= 0) and (GetPedInVehicleSeat(vehPedIsIn, -1) == playerPed)

            if isPedInVehicleAndDriving then
                local randomTask = getRandomDrunkCarTask()
                DebugPrint('Dispatching random car tasks: ' .. randomTask)
                TaskVehicleTempAction(playerPed, vehPedIsIn, randomTask, 500)
            end

            Wait(5000)
        end
    end)

    Wait(EFFECT_TIME_MS)
    DebugPrint('Cleaning up drunk effect')
    isDrunk = false
    SetTransitionTimecycleModifier('default', 10.00)
    StopGameplayCamShaking(true)
    ResetPedMovementClipset(playerPed, 0.0)
    RemoveAnimSet(DRUNK_ANIM_SET)
end

local REDM_DRUNK_FX = 'PlayerDrunkAberdeen'
local function drunkThreadRedm()
    DebugPrint('Starting drunk effect')
    AnimpostfxPlay(REDM_DRUNK_FX)
    Citizen.InvokeNative(0x406CCF555B04FAD3, PlayerPedId(), 1, 1.0) --SetPedDrunkness
    Wait(EFFECT_TIME_MS)
    DebugPrint('Cleaning up drunk effect')
    AnimpostfxStop(REDM_DRUNK_FX)
    Citizen.InvokeNative(0x406CCF555B04FAD3, PlayerPedId(), 1, 0.0) --SetPedDrunkness
end

--[[ Wild Attack command ]]
local attackAnimals
if IS_FIVEM then
    attackAnimals = {
        GetHashKey('a_c_chimp'),
        GetHashKey('a_c_rottweiler'),
        GetHashKey('a_c_coyote'),
    }
else
    attackAnimals = {
        GetHashKey('a_c_wolf_small'),
        GetHashKey('a_c_bearblack_01'),
        GetHashKey('a_c_dogrufus_01'),
    }
end
local animalGroupHash = GetHashKey('Animal')
local playerGroupHash = GetHashKey('PLAYER')
local spawnedAnimals = {}

local function startWildAttack()
    -- Consts
    local playerPed = PlayerPedId()
    local animalHash = attackAnimals[math.random(#attackAnimals)]
    local spawnCoords = GetOffsetFromEntityInWorldCoords(playerPed, 100, -15.0, 0)
    local playerHeading = GetEntityHeading(playerPed)
    local groundFound, groundZ =
        GetGroundZAndNormalFor_3dCoord(spawnCoords.x, spawnCoords.y, spawnCoords.z)
    if not groundFound then
        -- Fallback: ground query failed (e.g., spawn point over water/void), use the spawn coord Z
        groundZ = spawnCoords.z
    end

    -- Requesting model
    RequestModel(animalHash)
    while not HasModelLoaded(animalHash) do
        Wait(15)
    end

    -- Creating Animal
    local animalPed
    if IS_FIVEM then
        animalPed =
            ---@diagnostic disable-next-line: param-type-mismatch
            CreatePed(1, animalHash, spawnCoords.x, spawnCoords.y, groundZ, playerHeading, true, false)
    else
        animalPed =
            ---@diagnostic disable-next-line: missing-parameter, param-type-mismatch
            CreatePed(animalHash, spawnCoords.x, spawnCoords.y, groundZ, playerHeading, true, false)
    end

    -- CreatePed can fail (invalid coords, entity limits, etc)
    if not animalPed or animalPed <= 0 or not DoesEntityExist(animalPed) then
        DebugPrint('^1Failed to create wild attack animal ped')
        SetModelAsNoLongerNeeded(animalHash)
        return
    end
    spawnedAnimals[#spawnedAnimals + 1] = animalPed

    if IS_REDM then
        Citizen.InvokeNative(0x77FF8D35EEC6BBC4, animalPed, 1, 0) --EquipMetaPedOutfitPreset
    end

    -- setting player as enemy
    ---@diagnostic disable-next-line: param-type-mismatch
    SetPedFleeAttributes(animalPed, 0, 0)
    SetPedRelationshipGroupHash(animalPed, animalGroupHash)
    TaskSetBlockingOfNonTemporaryEvents(animalPed, true)
    ---@diagnostic disable-next-line: param-type-mismatch
    TaskCombatHatedTargetsAroundPed(animalPed, 30.0, 0)
    ClearPedTasks(animalPed)
    ---@diagnostic disable-next-line: param-type-mismatch
    TaskPutPedDirectlyIntoMelee(animalPed, playerPed, 0.0, -1.0, 0.0, 0)
    SetRelationshipBetweenGroups(5, animalGroupHash, playerGroupHash)
    SetRelationshipBetweenGroups(5, playerGroupHash, animalGroupHash)
    SetModelAsNoLongerNeeded(animalHash)
end
-- RegisterCommand('atk', startWildAttack)

-- Delete any spawned animals so they don't become orphaned network objects
AddEventHandler('onResourceStop', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then
        return
    end
    for _, animalPed in ipairs(spawnedAnimals) do
        if DoesEntityExist(animalPed) then
            DeleteEntity(animalPed)
        end
    end
    spawnedAnimals = {}
end)

--[[ Net Events ]]
RegisterNetEvent('txcl:setDrunk', function()
    if IS_FIVEM then
        drunkThreadFivem()
    else
        drunkThreadRedm()
    end
end)

RegisterNetEvent('txcl:setOnFire', function()
    DebugPrint('Setting player on fire')
    local playerPed = PlayerPedId()
    StartEntityFire(playerPed)
end)

RegisterNetEvent('txcl:wildAttack', function()
    startWildAttack()
end)

--[[ NUI Callbacks ]]
RegisterSecureNuiCallback('drunkEffectPlayer', function(data, cb)
    TriggerServerEvent('txsv:req:troll:setDrunk', tonumber(data.id))
    cb({})
end)

RegisterSecureNuiCallback('setOnFire', function(data, cb)
    TriggerServerEvent('txsv:req:troll:setOnFire', tonumber(data.id))
    cb({})
end)

RegisterSecureNuiCallback('wildAttack', function(data, cb)
    TriggerServerEvent('txsv:req:troll:wildAttack', tonumber(data.id))
    cb({})
end)
