function __edxSendRuntimeMessage(payload, timeoutMs = 1500) {
    return new Promise((resolve) => {
        if (!chrome?.runtime?.sendMessage) {
            resolve(null);
            return;
        }

        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(value ?? null);
        };

        const timer = setTimeout(() => finish(null), timeoutMs);
        try {
            chrome.runtime.sendMessage(payload, (response) => {
                if (chrome.runtime?.lastError) {
                    finish(null);
                    return;
                }
                finish(response);
            });
        } catch (_) {
            finish(null);
        }
    });
}

const __EDX_BACKGROUND_API__ = {
    async getAuthContext() {
        const response = await __edxSendRuntimeMessage({ action: "auth:getContext" }, 1200);
        if (!response?.ok || !response?.context) return null;
        return response.context;
    },
    async clearAuthContext() {
        const response = await __edxSendRuntimeMessage({ action: "auth:clear" }, 1200);
        return !!response?.ok;
    },
    async getDiagnosticsSnapshot() {
        const response = await __edxSendRuntimeMessage({ action: "diag:getSnapshot" }, 1200);
        return response?.ok ? response.snapshot || null : null;
    },
    async log(level, scope, message, meta) {
        return __edxSendRuntimeMessage({
            action: "diag:log",
            level,
            scope,
            message,
            meta: meta || null
        }, 1000);
    }
};

window.__EDX_BACKGROUND_API__ = __EDX_BACKGROUND_API__;
__EDX_ARCH__.backgroundApi = __EDX_BACKGROUND_API__;
