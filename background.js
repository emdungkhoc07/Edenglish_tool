// GENERATED FILE - DO NOT EDIT DIRECTLY
// Source bundle: background.js
// Build stamp: 2026-04-20T13:55:56.582Z
(function () {
'use strict';

    // -- background/main.js --
    const __EDX_BG__ = {
        version: "4.0.0-compat",
        bootedAt: new Date().toISOString(),
        logs: [],
        auth: {
            hasContext: false,
            requestUrl: "",
            capturedAt: 0
        }
    };

    function __edxBgLog(level, scope, message, meta) {
        const entry = {
            ts: Date.now(),
            iso: new Date().toISOString(),
            level,
            scope,
            message,
            meta: meta || null
        };
        __EDX_BG__.logs.push(entry);
        if (__EDX_BG__.logs.length > 120) {
            __EDX_BG__.logs.splice(0, __EDX_BG__.logs.length - 120);
        }
        const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
        console[method](`[EDX background:${scope}] ${message}`, meta || "");
        return entry;
    }

    // -- background/vault.js --
    const STORAGE_KEYS = ["aRequest", "autho"];
    const STORAGE_SCHEMA_VERSION = 3;

    const CryptoUtils = {
        async generateKey() {
            return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
        },
        async encrypt(data, key) {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encoded = new TextEncoder().encode(data);
            const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
            return { iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
        },
        async decrypt(encryptedObj, key) {
            const iv = new Uint8Array(encryptedObj.iv);
            const data = new Uint8Array(encryptedObj.data);
            const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
            return new TextDecoder().decode(decrypted);
        }
    };

    class EphemeralSessionVault {
        constructor() {
            this.key = null;
            this.data = new Map();
        }

        async ensureKey() {
            if (!this.key) this.key = await CryptoUtils.generateKey();
        }

        async set(name, value) {
            await this.ensureKey();
            const encrypted = await CryptoUtils.encrypt(JSON.stringify(value), this.key);
            this.data.set(name, encrypted);
        }

        async get(name) {
            if (!this.key) return null;
            const encrypted = this.data.get(name);
            if (!encrypted) return null;
            try {
                return JSON.parse(await CryptoUtils.decrypt(encrypted, this.key));
            } catch (_) {
                return null;
            }
        }

        async delete(name) {
            this.data.delete(name);
        }

        clear() {
            this.data.clear();
            this.key = null;
        }
    }

    const sessionVault = new EphemeralSessionVault();

    function sessionStorageGet(keys) {
        return new Promise((resolve) => {
            try {
                chrome.storage.session.get(keys, (result) => resolve(result || {}));
            } catch (_) {
                resolve({});
            }
        });
    }

    function sessionStorageSet(payload) {
        return new Promise((resolve) => {
            try {
                chrome.storage.session.set(payload, () => resolve());
            } catch (_) {
                resolve();
            }
        });
    }

    function sessionStorageRemove(keys) {
        return new Promise((resolve) => {
            try {
                chrome.storage.session.remove(keys, () => resolve());
            } catch (_) {
                resolve();
            }
        });
    }

    chrome.storage.local.get(["_edx_storage_version"], (result) => {
        if (result?._edx_storage_version === STORAGE_SCHEMA_VERSION) return;
        chrome.storage.local.set({ _edx_storage_version: STORAGE_SCHEMA_VERSION });
    });

    // -- background/auth.js --
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

    // -- background/messages.js --
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

})();
