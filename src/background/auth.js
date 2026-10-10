function normalizeRequestUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);

        if (url.pathname.includes("/api/practiceManager/GetItem")) {
            const parts = url.pathname.split("/");
            for (let i = parts.length - 1; i >= 0; i -= 1) {
                if (parts[i] && /^\d+$/.test(parts[i])) {
                    parts[i] = "5";
                    break;
                }
            }
            url.pathname = parts.join("/");
            return url.toString();
        }

        if (url.pathname.includes("/api/Assessments/GetItem")) {
            const parts = url.pathname.split("/");
            let nonEmptyCount = 0;
            for (let i = parts.length - 1; i >= 0; i -= 1) {
                if (!parts[i]) continue;
                nonEmptyCount += 1;
                if (nonEmptyCount === 2) {
                    parts[i] = "22";
                    break;
                }
            }
            return `${url.origin}${parts.join("/")}${url.search}`;
        }

        return null;
    } catch (_) {
        return null;
    }
}

async function persistAuthContext(details, autho) {
    const aRequest = normalizeRequestUrl(details.url);
    if (!aRequest || !autho) return null;
    const context = {
        aRequest,
        autho,
        capturedAt: Date.now(),
        sourceUrl: details.url
    };
    await sessionVault.set("answerContext", context);
    await sessionStorageSet({ edx_answer_context: context });
    __EDX_BG__.auth = {
        hasContext: true,
        requestUrl: aRequest,
        capturedAt: context.capturedAt
    };
    __edxBgLog("info", "auth", "Captured answer context", {
        requestUrl: aRequest
    });
    return context;
}

async function getAuthContext() {
    let context = await sessionVault.get("answerContext");
    if (!context) {
        const stored = await sessionStorageGet("edx_answer_context");
        context = stored?.edx_answer_context || null;
        if (context) {
            await sessionVault.set("answerContext", context);
        }
    }
    if (!context) {
        __EDX_BG__.auth = {
            hasContext: false,
            requestUrl: "",
            capturedAt: 0
        };
    } else {
        __EDX_BG__.auth = {
            hasContext: true,
            requestUrl: context.aRequest || "",
            capturedAt: context.capturedAt || 0
        };
    }
    return context;
}

async function clearAuthContext() {
    await sessionVault.delete("answerContext");
    await sessionStorageRemove("edx_answer_context");
    __EDX_BG__.auth = {
        hasContext: false,
        requestUrl: "",
        capturedAt: 0
    };
}
