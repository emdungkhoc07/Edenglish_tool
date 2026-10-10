const __EDX_LOG_LIMIT__ = 150;
const __EDX_LOG_ENTRIES__ = [];
const __EDX_CONSOLE_LIMIT__ = 120;
const __EDX_CONSOLE_ENTRIES__ = [];

function __edxShouldCaptureConsole(args, level) {
    try {
        const text = (args || []).map((item) => {
            if (typeof item === "string") return item;
            try { return JSON.stringify(item); } catch (_) { return String(item); }
        }).join(" ");
        if (/(\[EDX|\[edx|\[TTp|content\.js|inject\.js|background\.js|bridge|TypeError|ReferenceError|Unhandled|auto-next|DnD)/i.test(text)) {
            return true;
        }
    } catch (_) {}
    return level === "error" || level === "warn";
}

function __edxWriteConsoleEntry(level, args) {
    if (!__edxShouldCaptureConsole(args, level)) return null;
    const entry = {
        ts: Date.now(),
        iso: new Date().toISOString(),
        level,
        args: (args || []).map((item) => {
            if (typeof item === "string") return item;
            try { return JSON.stringify(item); } catch (_) { return String(item); }
        })
    };
    __EDX_CONSOLE_ENTRIES__.push(entry);
    if (__EDX_CONSOLE_ENTRIES__.length > __EDX_CONSOLE_LIMIT__) {
        __EDX_CONSOLE_ENTRIES__.splice(0, __EDX_CONSOLE_ENTRIES__.length - __EDX_CONSOLE_LIMIT__);
    }
    return entry;
}

if (!window.__EDX_CONSOLE_PATCHED__) {
    window.__EDX_CONSOLE_PATCHED__ = true;
    ["log", "info", "warn", "error"].forEach((method) => {
        const original = console[method];
        if (typeof original !== "function") return;
        console[method] = function (...args) {
            try { __edxWriteConsoleEntry(method, args); } catch (_) {}
            return original.apply(this, args);
        };
    });
}

function __edxShouldMirrorConsole(level) {
    try {
        if (localStorage.getItem("edx_debug") === "1") return true;
        if (level === "error" || level === "warn") return true;
    } catch (_) {}
    return level === "error" || level === "warn";
}

function __edxWriteLog(level, scope, message, meta) {
    const entry = {
        ts: Date.now(),
        iso: new Date().toISOString(),
        level,
        scope,
        message,
        meta: meta || null
    };
    __EDX_LOG_ENTRIES__.push(entry);
    if (__EDX_LOG_ENTRIES__.length > __EDX_LOG_LIMIT__) {
        __EDX_LOG_ENTRIES__.splice(0, __EDX_LOG_ENTRIES__.length - __EDX_LOG_LIMIT__);
    }
    if (__edxShouldMirrorConsole(level)) {
        const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
        console[method](`[EDX:${scope}] ${message}`, meta || "");
    }
    return entry;
}

const __EDX_LOGGER__ = {
    entries: __EDX_LOG_ENTRIES__,
    consoleEntries: __EDX_CONSOLE_ENTRIES__,
    debug(scope, message, meta) { return __edxWriteLog("debug", scope, message, meta); },
    info(scope, message, meta) { return __edxWriteLog("info", scope, message, meta); },
    warn(scope, message, meta) { return __edxWriteLog("warn", scope, message, meta); },
    error(scope, message, meta) { return __edxWriteLog("error", scope, message, meta); },
    getEntries() { return __EDX_LOG_ENTRIES__.slice(); },
    getConsoleEntries() { return __EDX_CONSOLE_ENTRIES__.slice(); }
};

__EDX_ARCH__.logger = __EDX_LOGGER__;
