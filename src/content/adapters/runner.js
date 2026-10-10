const __legacyBootAutoFill = typeof bootAutoFill === "function" ? bootAutoFill : null;
if (__legacyBootAutoFill) {
    bootAutoFill = function () {
        __EDX_LOGGER__.info("runner", "bootAutoFill", {
            mode: typeof __autoNext === "string" ? __autoNext : "unknown"
        });
        const result = __legacyBootAutoFill.apply(this, arguments);
        __edxSyncLegacyState();
        return result;
    };
}
