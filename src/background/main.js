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
