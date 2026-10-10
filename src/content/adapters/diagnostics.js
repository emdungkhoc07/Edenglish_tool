const __legacyRunDiagnostic = typeof runDiagnostic === "function" ? runDiagnostic : null;
if (__legacyRunDiagnostic) {
    runDiagnostic = function () {
        const result = __legacyRunDiagnostic.apply(this, arguments);
        __edxSyncLegacyState({ runner: { diagActive: !!__diagActive } });
        return result;
    };
}
