function __edxInferPageType() {
    return __edxSafeCall(() => {
        if (typeof resolveSectionPageType === "function") return resolveSectionPageType();
        if (typeof detectPageType === "function") return detectPageType();
        return "unknown";
    }, "unknown");
}

function __edxSyncLegacyState(extraPatch = {}) {
    const statusText = typeof ansBody?.textContent === "string" ? ansBody.textContent.trim() : "";
    const patch = __edxMerge({
        mode: typeof __autoNext === "string" ? __autoNext : "off",
        pageType: __edxInferPageType(),
        questionType: typeof __qType === "string" && __qType ? __qType : "unknown",
        lastStatus: statusText,
        lastAction: statusText || __EDX_STORE__.getState().lastAction,
        runner: {
            fetching: !!__fetching,
            navigating: !!__navigating,
            diagActive: !!__diagActive
        },
        ui: {
            panelReady: !!panel,
            pinned: !!__pinned
        },
        currentAnswerSession: {
            answerCount: Array.isArray(__ans) ? __ans.length : 0,
            allOptionCount: Array.isArray(__allAns) ? __allAns.length : 0,
            source: __EDX_STORE__.getState().lastAnswerSource || "unknown"
        }
    }, extraPatch);
    __EDX_STORE__.patch(patch);
    return patch;
}
