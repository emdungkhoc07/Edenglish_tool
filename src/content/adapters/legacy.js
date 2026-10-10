__EDX_ARCH__.legacy = {
    updateAnswerDisplay,
    updateTypeBadge,
    flashBlock,
    getAns,
    requestAnsContext,
    clearAnsContext,
    bootAutoFill,
    runDiagnostic: typeof runDiagnostic === "function" ? runDiagnostic : null
};

setInterval(() => {
    __edxSyncLegacyState();
}, 1200);
