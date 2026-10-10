const __legacyBuildAnswersFromScope = typeof buildAnswersFromScope === "function" ? buildAnswersFromScope : null;
if (__legacyBuildAnswersFromScope) {
    buildAnswersFromScope = function () {
        const result = __legacyBuildAnswersFromScope.apply(this, arguments);
        if (result?.ans?.length) {
            __EDX_STORE__.patch({
                lastAnswerSource: result._source || "scope",
                currentAnswerSession: {
                    answerCount: result.ans.length,
                    allOptionCount: Array.isArray(result.allAns) ? result.allAns.length : 0,
                    source: result._source || "scope"
                }
            });
        }
        return result;
    };
}

const __legacyParseAnswerPayload = typeof parseAnswerPayload === "function" ? parseAnswerPayload : null;
if (__legacyParseAnswerPayload) {
    parseAnswerPayload = function () {
        const result = __legacyParseAnswerPayload.apply(this, arguments);
        if (result?.ans?.length || result?.allAns?.length) {
            const source = result._source || "api";
            __EDX_STORE__.patch({
                lastAnswerSource: source,
                currentAnswerSession: {
                    answerCount: Array.isArray(result.ans) ? result.ans.length : 0,
                    allOptionCount: Array.isArray(result.allAns) ? result.allAns.length : 0,
                    source
                }
            });
        }
        return result;
    };
}

const __legacyRequestAnsContext = typeof requestAnsContext === "function" ? requestAnsContext : null;
if (__legacyRequestAnsContext) {
    requestAnsContext = function () {
        return __EDX_BACKGROUND_API__.getAuthContext()
            .then((context) => {
                if (context?.aRequest && context?.autho) {
                    const result = {
                        aRequest: context.aRequest,
                        autho: context.autho,
                        encAutho: context.autho
                    };
                    __EDX_STORE__.patch({
                        auth: {
                            hasContext: true,
                            requestUrl: result.aRequest,
                            capturedAt: context.capturedAt || Date.now()
                        }
                    });
                    return result;
                }
                return __legacyRequestAnsContext.apply(this, arguments);
            })
            .then((result) => {
                __EDX_STORE__.patch({
                    auth: {
                        hasContext: !!(result?.aRequest && result?.autho),
                        requestUrl: result?.aRequest || "",
                        capturedAt: result?.aRequest && result?.autho ? Date.now() : 0
                    }
                });
                return result;
            });
    };
}

const __legacyClearAnsContext = typeof clearAnsContext === "function" ? clearAnsContext : null;
if (__legacyClearAnsContext) {
    clearAnsContext = function () {
        __EDX_BACKGROUND_API__.clearAuthContext().catch(() => {});
        __EDX_STORE__.patch({
            auth: {
                hasContext: false,
                requestUrl: "",
                capturedAt: 0
            }
        });
        return __legacyClearAnsContext.apply(this, arguments);
    };
}

const __legacyGetAns = typeof getAns === "function" ? getAns : null;
if (__legacyGetAns) {
    getAns = async function () {
        __EDX_LOGGER__.info("answers", "fetch:start", {
            pageType: __edxInferPageType(),
            questionType: typeof __qType === "string" ? __qType : "unknown"
        });
        __EDX_STORE__.patch({ runner: { fetching: true } });
        try {
            const result = await __legacyGetAns.apply(this, arguments);
            __edxSyncLegacyState({ runner: { fetching: false } });
            __EDX_LOGGER__.info("answers", "fetch:done", {
                ok: !!result,
                answerCount: Array.isArray(__ans) ? __ans.length : 0,
                source: __EDX_STORE__.getState().lastAnswerSource
            });
            return result;
        } catch (error) {
            __EDX_STORE__.patch({
                runner: { fetching: false },
                lastError: error?.message || "Unknown getAns error"
            });
            __EDX_LOGGER__.error("answers", "fetch:error", { message: error?.message || String(error) });
            throw error;
        }
    };
}
