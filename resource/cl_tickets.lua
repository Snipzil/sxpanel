-- =============================================
-- cl_tickets.lua — Client-side ticket system
-- =============================================

--- Truncate a string to at most maxChars UTF-8 codepoints without
--- splitting multi-byte characters. Falls back to byte-based :sub
--- if the string contains invalid UTF-8.
local function utf8SafeTruncate(str, maxChars)
    local len = utf8.len(str)
    if not len then return str:sub(1, maxChars) end -- invalid UTF-8 fallback
    if len <= maxChars then return str end
    local nextByte = utf8.offset(str, maxChars + 1)
    if not nextByte then return str end
    return str:sub(1, nextByte - 1)
end

-- =============================================
-- MARK: Ticket UI NUI communication
-- =============================================

local isTicketOpen = false
local ticketOpenTimeoutId = nil
local TICKET_OPEN_TIMEOUT_MS = 25000

local function clearTicketOpenTimeout()
    if ticketOpenTimeoutId then
        ClearTimeout(ticketOpenTimeoutId)
        ticketOpenTimeoutId = nil
    end
end

local function resetTicketOpenState()
    clearTicketOpenTimeout()
    isTicketOpen = false
end

local TICKET_COMMAND = 'ticket'
local REPORT_COMMAND = 'report'
local ticketCommandsRegistered = false

local function runTicketCommand()
    if isTicketOpen then
        return
    end
    isTicketOpen = true

    -- Show the panel immediately; server will push data
    SetNuiFocus(true, true)
    SendMenuMessage('openTicketUI', { players = {}, tickets = {}, categories = {}, priorityEnabled = false })

    -- Request full data from server
    TriggerServerEvent('txsv:ticketOpen')

    -- Recovery: if the server never responds, allow re-opening after a timeout.
    clearTicketOpenTimeout()
    ticketOpenTimeoutId = SetTimeout(TICKET_OPEN_TIMEOUT_MS, function()
        ticketOpenTimeoutId = nil
        isTicketOpen = false
    end)
end

--- FiveM has no script API to unregister commands; stub handlers when reports are disabled.
local function registerDisabledTicketCommands()
    RegisterCommand(TICKET_COMMAND, function() end, false)
    RegisterCommand(REPORT_COMMAND, function() end, false)
end

local function registerTicketCommands()
    RegisterCommand(TICKET_COMMAND, runTicketCommand, false)
    RegisterCommand(REPORT_COMMAND, function()
        ExecuteCommand(TICKET_COMMAND)
    end, false)
    ticketCommandsRegistered = true
end

local function updateTicketChatSuggestions(enabled)
    if enabled then
        TriggerEvent(
            'chat:addSuggestion',
            '/' .. TICKET_COMMAND,
            translator.t('nui_menu.chat.ticket_description')
        )
        TriggerEvent(
            'chat:addSuggestion',
            '/' .. REPORT_COMMAND,
            translator.t('nui_menu.chat.report_description')
        )
    else
        TriggerEvent('chat:removeSuggestion', '/' .. TICKET_COMMAND)
        TriggerEvent('chat:removeSuggestion', '/' .. REPORT_COMMAND)
    end
end

local function syncTicketChatCommands()
    local enabled = GetConvarBool('txAdmin-reportsEnabled')
    if enabled then
        registerTicketCommands()
        updateTicketChatSuggestions(true)
    else
        if ticketCommandsRegistered then
            registerDisabledTicketCommands()
        end
        updateTicketChatSuggestions(false)
    end
end

-- txAdmin starts before the chat resource; wait before add/remove suggestions (see cl_base.lua).
CreateThread(function()
    Wait(1000)
    syncTicketChatCommands()
end)

AddStateBagChangeHandler('txAdminServerCtx', 'global', function()
    syncTicketChatCommands()
end)

--- Close ticket UI callback
RegisterSecureNuiCallback('ticketClose', function(data, cb)
    resetTicketOpenState()
    SetNuiFocus(false, false)
    cb({})
end)

--- Submit new ticket callback
RegisterSecureNuiCallback('ticketSubmit', function(data, cb)
    if type(data) ~= 'table'
        or type(data.category) ~= 'string' or #data.category == 0
        or type(data.description) ~= 'string'
    then
        cb({ success = false, error = 'nui_reports.errors.invalid_ticket_data' })
        return
    end
    local description = data.description:gsub('^%s+', ''):gsub('%s+$', '')
    if #description == 0 then
        cb({ success = false, error = 'nui_reports.errors.description_required' })
        return
    end
    local payload = {
        category = data.category,
        description = utf8SafeTruncate(description, 2048),
    }
    if type(data.priority) == 'string' then
        payload.priority = data.priority
    end
    if type(data.targetIds) == 'table' then
        local targetIds = {}
        for _, tid in ipairs(data.targetIds) do
            if type(tid) == 'number' then
                table.insert(targetIds, tid)
            end
        end
        payload.targetIds = targetIds
    end
    TriggerServerEvent('txsv:ticketCreate', payload)
    cb({})
end)

--- Fetch my tickets callback
RegisterSecureNuiCallback('ticketFetchMine', function(data, cb)
    TriggerServerEvent('txsv:ticketGetMine')
    cb({})
end)

--- Send a message on a ticket callback
RegisterSecureNuiCallback('ticketSendMessage', function(data, cb)
    if type(data) ~= 'table'
        or type(data.ticketId) ~= 'string' or #data.ticketId == 0
        or type(data.content) ~= 'string'
    then
        cb({ success = false, error = 'nui_reports.errors.invalid_message_data' })
        return
    end
    local content = data.content:gsub('^%s+', ''):gsub('%s+$', '')
    local imageUrls = {}
    if type(data.imageUrls) == 'table' then
        for i, url in ipairs(data.imageUrls) do
            if i > 3 then break end
            if type(url) == 'string' and #url > 0 and #url <= 2048 and url:match('^https://') then
                table.insert(imageUrls, url)
            end
        end
    end
    if #content == 0 and #imageUrls == 0 then
        cb({ success = false, error = 'nui_reports.errors.message_required' })
        return
    end
    TriggerServerEvent('txsv:ticketPlayerMessage', {
        ticketId = data.ticketId,
        content = utf8SafeTruncate(content, 2048),
        imageUrls = imageUrls,
    })
    cb({})
end)

--- Fetch messages for a specific ticket callback
RegisterSecureNuiCallback('ticketFetchMessages', function(data, cb)
    if type(data) ~= 'table' or type(data.ticketId) ~= 'string' or #data.ticketId == 0 then
        cb({ success = false, error = 'nui_reports.errors.invalid_ticket_id' })
        return
    end
    TriggerServerEvent('txsv:ticketFetchMessages', data.ticketId)
    cb({})
end)

--- Submit feedback callback
RegisterSecureNuiCallback('ticketFeedback', function(data, cb)
    if type(data) ~= 'table'
        or type(data.ticketId) ~= 'string' or #data.ticketId == 0
        or type(data.rating) ~= 'number' or data.rating ~= data.rating -- NaN check
    then
        cb({ success = false, error = 'nui_reports.errors.invalid_input' })
        return
    end
    local rating = math.floor(math.max(1, math.min(5, data.rating)))
    local comment
    if type(data.comment) == 'string' then
        comment = utf8SafeTruncate(data.comment:gsub('^%s+', ''):gsub('%s+$', ''), 512)
        if #comment == 0 then comment = nil end
    end
    TriggerServerEvent('txsv:ticketFeedback', {
        ticketId = data.ticketId,
        rating = rating,
        comment = comment,
    })
    cb({ success = true })
end)

--- Tab opened in admin NUI — fetch players + categories
RegisterSecureNuiCallback('ticketTabOpen', function(data, cb)
    TriggerServerEvent('txsv:ticketTabOpen')
    cb({})
end)

-- =============================================
-- MARK: Server → Client events (player)
-- =============================================

--- Receive ticket open data (players + my tickets + categories)
RegisterNetEvent('txcl:ticketOpenData', function(data)
    clearTicketOpenTimeout()
    SendMenuMessage('openTicketUI', {
        players = data.players or {},
        categories = data.categories or {},
        priorityEnabled = data.priorityEnabled or false,
    })
    SendMenuMessage('ticketMyList', {
        tickets = data.tickets or {},
    })
end)

--- Receive ticket creation result
RegisterNetEvent('txcl:ticketResult', function(data)
    SendMenuMessage('ticketCreateResult', data)
end)

--- Receive player's ticket list (standalone refresh)
RegisterNetEvent('txcl:ticketMyList', function(data)
    SendMenuMessage('ticketMyList', data)
end)

--- Receive the full message list for a ticket
RegisterNetEvent('txcl:ticketMessages', function(data)
    SendMenuMessage('ticketMessages', data)
end)

--- Receive a new message pushed in real-time
RegisterNetEvent('txcl:ticketNewMessage', function(data)
    SendMenuMessage('ticketNewMessage', data)
end)

--- Receive message send result
RegisterNetEvent('txcl:ticketMessageResult', function(data)
    SendMenuMessage('ticketMessageResult', data)
end)

--- Receive admin notification about new ticket
RegisterNetEvent('txcl:ticketNotification', function(data)
    SendMenuMessage('ticketNotification', data)
end)

-- =============================================
-- MARK: Server → Client events (admin NUI)
-- =============================================

--- Receive admin ticket list
RegisterNetEvent('txcl:ticketAdminListData', function(data)
    SendMenuMessage('ticketAdminListData', data)
end)

--- Receive admin ticket detail
RegisterNetEvent('txcl:ticketAdminDetailData', function(data)
    SendMenuMessage('ticketAdminDetailData', data)
end)

--- Receive admin message result
RegisterNetEvent('txcl:ticketAdminMessageResult', function(data)
    SendMenuMessage('ticketAdminMessageResult', data)
end)

--- Receive admin status change result
RegisterNetEvent('txcl:ticketAdminStatusResult', function(data)
    SendMenuMessage('ticketAdminStatusResult', data)
end)

--- Receive ticket tab data
RegisterNetEvent('txcl:ticketTabData', function(data)
    SendMenuMessage('ticketTabData', data)
end)

-- =============================================
-- MARK: Admin NUI callbacks
-- =============================================

--- Admin: fetch all tickets
RegisterSecureNuiCallback('ticketAdminList', function(data, cb)
    TriggerServerEvent('txsv:ticketAdminList')
    cb({})
end)

--- Admin: fetch ticket detail
RegisterSecureNuiCallback('ticketAdminDetail', function(data, cb)
    if type(data) ~= 'table' or type(data.ticketId) ~= 'string' or #data.ticketId == 0 then
        cb({ success = false, error = 'nui_reports.errors.invalid_ticket_id' })
        return
    end
    TriggerServerEvent('txsv:ticketAdminDetail', data.ticketId)
    cb({})
end)

--- Admin: send message to a ticket
RegisterSecureNuiCallback('ticketAdminMessage', function(data, cb)
    if type(data) ~= 'table' or type(data.ticketId) ~= 'string' or #data.ticketId == 0 then
        cb({ success = false, error = 'nui_reports.errors.invalid_ticket_id' })
        return
    end
    if type(data.content) ~= 'string' or #data.content == 0 then
        cb({ success = false, error = 'nui_reports.errors.invalid_content' })
        return
    end
    local content = data.content:gsub('^%s+', ''):gsub('%s+$', '')
    if #content == 0 then
        cb({ success = false, error = 'nui_reports.errors.invalid_content' })
        return
    end
    TriggerServerEvent('txsv:ticketAdminMessage', {
        ticketId = data.ticketId,
        content = utf8SafeTruncate(content, 2048),
    })
    cb({})
end)

--- Admin: change ticket status
RegisterSecureNuiCallback('ticketAdminStatus', function(data, cb)
    if type(data) ~= 'table' or type(data.ticketId) ~= 'string' or #data.ticketId == 0 then
        cb({ success = false, error = 'nui_reports.errors.invalid_ticket_id' })
        return
    end
    if type(data.status) ~= 'string' or #data.status == 0 then
        cb({ success = false, error = 'nui_reports.errors.invalid_status' })
        return
    end
    TriggerServerEvent('txsv:ticketAdminStatus', {
        ticketId = data.ticketId,
        status = data.status,
    })
    cb({})
end)
