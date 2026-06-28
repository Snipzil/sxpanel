-- Shift Board — server-side game snapshot (addon-starter-template)
-- Loaded automatically via build glob: addons/**/resource/sv_*.lua
-- Docs: https://github.com/sxPanel/sxPanel-Docs/tree/main/v0.4.0-Beta

if not TX_SERVER_MODE then
    return
end

local SNAPSHOT_EVENT_REQUEST = 'addon-starter-template:svRequestSnapshot'
local SNAPSHOT_EVENT_CLIENT = 'addon-starter-template:clSnapshot'

--- Staff currently connected with an authenticated admin session (TX_ADMINS).
local function buildStaffOnline()
    local staff = {}
    if type(TX_ADMINS) ~= 'table' then
        return staff
    end

    for netid, admin in pairs(TX_ADMINS) do
        if type(admin) == 'table' and type(admin.username) == 'string' then
            staff[#staff + 1] = {
                netid = tonumber(netid),
                name = admin.username,
                tag = admin.tag,
            }
        end
    end

    table.sort(staff, function(a, b)
        return (a.name or '') < (b.name or '')
    end)

    return staff
end

--- Build a small JSON-safe table from live server natives.
local function buildSnapshot()
    local players = GetPlayers()
    return {
        playerCount = #players,
        maxClients = GetConvarInt('sv_maxclients', 32),
        serverUptimeMs = GetGameTimer(),
        gameName = GAME_NAME or 'unknown',
        onesync = GetConvar('onesync', 'off'),
        sampledAt = os.date('!%Y-%m-%dT%H:%M:%SZ'),
        staffOnline = buildStaffOnline(),
    }
end

--- Admin client asked for a fresh snapshot (see resource/cl_shift.lua).
RegisterNetEvent(SNAPSHOT_EVENT_REQUEST, function()
    local src = source
    if not src or src <= 0 then
        return
    end

    if type(TX_ADMINS) == 'table' and TX_ADMINS[tostring(src)] == nil then
        return
    end

    TriggerClientEvent(SNAPSHOT_EVENT_CLIENT, src, buildSnapshot())
end)

TxPrint('Shift Board server Lua loaded (snapshot on request)')
