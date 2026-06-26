-- Shift Board — client bridge: server snapshot → in-game NUI (addon-starter-template)
-- Requires menu enabled. Pairs with nui/index.js (listens for addonStarterShiftSnapshot).

if not TX_MENU_ENABLED then
    return
end

local SNAPSHOT_EVENT_REQUEST = 'addon-starter-template:svRequestSnapshot'
local NUI_ACTION = 'addonStarterShiftSnapshot'

local function requestSnapshot()
    TriggerServerEvent(SNAPSHOT_EVENT_REQUEST)
end

RegisterNetEvent('addon-starter-template:clSnapshot', function(snapshot)
    if type(snapshot) ~= 'table' then
        return
    end
    SendMenuMessage(NUI_ACTION, snapshot)
end)

-- Refresh while the admin menu is open (TX_MENU_VISIBLE is set by menu client code).
CreateThread(function()
    while true do
        if TX_MENU_VISIBLE then
            requestSnapshot()
        end
        Wait(5000)
    end
end)

-- One shot when this script starts (menu may already be open after resource restart).
CreateThread(function()
    Wait(1500)
    if TX_MENU_VISIBLE then
        requestSnapshot()
    end
end)
