-- =============================================
--  Screenshot capture (replaces screenshot-basic)
-- =============================================

--- NUI debug callback — lets the inline capture engine report status to server console
RegisterRawNuiCallback('captureDebug', function(req, cb)
    cb({ status = 200, body = '{}' })
    local body = json.decode(req.body)
    if body and type(body.msg) == 'string' then
        TxPrint('[NUI] ' .. body.msg)
    end
end)

--- Receives screenshot request from the server, triggers NUI capture
RegisterNetEvent('txcl:screenshot:request', function(requestId)
    if type(requestId) ~= 'string' then
        return
    end

    SendNUIMessage({
        action = 'takeScreenshot',
        data = {
            requestId = requestId,
            encoding = 'jpg',
            quality = 0.5,
        },
    })
end)

--- Receives the screenshot result from the NUI and sends it to the server
RegisterRawNuiCallback('screenshotResult', function(req, cb)
    cb({ status = 200, body = '{}' })
    local body = json.decode(req.body)
    if not body or type(body.requestId) ~= 'string' then

        return
    end

    if body.error then
        TriggerServerEvent('txsv:screenshot:result', body.requestId, nil, body.error)
    elseif body.data then
        TriggerLatentServerEvent('txsv:screenshot:result', 1000000, body.requestId, body.data, nil)
    else
        TriggerServerEvent('txsv:screenshot:result', body.requestId, nil, 'No data received from NUI')
    end
end)
