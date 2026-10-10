const __EDX_ARCH__ = window.__EDX_ARCH__ || {
    version: "4.0.0-compat",
    buildMode: "src-build-legacy-adapter",
    bootedAt: new Date().toISOString(),
    compatibility: {
        legacyContent: true,
        legacyInject: true,
        legacyHandlers: true
    }
};

window.__EDX_ARCH__ = __EDX_ARCH__;

function __edxSafeCall(fn, fallback = null) {
    try {
        return typeof fn === "function" ? fn() : fallback;
    } catch (_) {
        return fallback;
    }
}
