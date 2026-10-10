async function handleActionMessage(request) {
    switch (request?.action) {
        case "auth:getContext": {
            const context = await getAuthContext();
            return {
                ok: true,
                context: context ? {
                    aRequest: context.aRequest,
                    autho: context.autho,
                    capturedAt: context.capturedAt
                } : null
            };
        }
        case "auth:clear":
            await clearAuthContext();
            return { ok: true };
        case "diag:getSnapshot":
            return {
                ok: true,
                snapshot: {
                    version: __EDX_BG__.version,
                    bootedAt: __EDX_BG__.bootedAt,
                    storage: {
                        authBackend: "vault+session"
                    },
                    auth: {
                        hasContext: __EDX_BG__.auth.hasContext,
                        requestUrl: __EDX_BG__.auth.requestUrl,
                        capturedAt: __EDX_BG__.auth.capturedAt
                    },
                    logs: __EDX_BG__.logs.slice(-25)
                }
            };
        case "diag:log":
            __edxBgLog(request?.level || "info", request?.scope || "content", request?.message || "diag:log", request?.meta || null);
            return { ok: true };
        default:
            return null;
    }
}

async function handleLegacyMessage(request) {
    if (request?.type === "decryptAuth") {
        return { autho: typeof request.encObj === "string" ? request.encObj : null };
    }
    if (request?.type === "clearAnsContext") {
        await clearAuthContext();
        return { ok: true };
    }
    if (request?.type === "ansUrl") {
        const context = await getAuthContext();
        return {
            aRequest: context?.aRequest || null,
            autho: context?.autho || null,
            encAutho: context?.autho || null
        };
    }
    return null;
}

chrome.runtime.onInstalled.addListener(() => {
    __edxBgLog("info", "runtime", "Extension installed");
});

chrome.runtime.onSuspend.addListener(() => {
    sessionVault.clear();
    __edxBgLog("info", "runtime", "Session vault cleared on suspend");
});

chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        if (!details?.requestHeaders?.length) return;
        const authHeader = details.requestHeaders.find((header) => header.name?.toLowerCase() === "authorization");
        if (!authHeader?.value) return;
        persistAuthContext(details, authHeader.value).catch(() => {});
    },
    { urls: ["https://*.engdis.com/api/*"] },
    ["requestHeaders", "extraHeaders"]
);

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    Promise.resolve()
        .then(async () => {
            const actionResponse = await handleActionMessage(request);
            if (actionResponse) return actionResponse;
            const legacyResponse = await handleLegacyMessage(request);
            if (legacyResponse) return legacyResponse;
            return { ok: false, error: "Unknown message" };
        })
        .then((result) => sendResponse(result))
        .catch((error) => {
            __edxBgLog("error", "runtime", error?.message || "Unhandled background error");
            sendResponse({ ok: false, error: error?.message || "Unhandled background error" });
        });
    return true;
});
