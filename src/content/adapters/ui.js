(function installUiLegacyAdapters() {
    const wrapWhenReady = () => {
        if (typeof updateAnswerDisplay !== "function" || typeof updateTypeBadge !== "function" || typeof flashBlock !== "function") {
            setTimeout(wrapWhenReady, 0);
            return;
        }
        if (updateAnswerDisplay.__edxWrapped) return;

        const __legacyUpdateAnswerDisplay = updateAnswerDisplay;
        updateAnswerDisplay = function () {
            const result = __legacyUpdateAnswerDisplay.apply(this, arguments);
            __edxSyncLegacyState();
            return result;
        };
        updateAnswerDisplay.__edxWrapped = true;

        const __legacyUpdateTypeBadge = updateTypeBadge;
        updateTypeBadge = function (type) {
            const result = __legacyUpdateTypeBadge.apply(this, arguments);
            __EDX_STORE__.patch({ questionType: type || "unknown" });
            return result;
        };

        const __legacyFlashBlock = flashBlock;
        flashBlock = function (reason) {
            __EDX_LOGGER__.warn("ui", "flashBlock", { reason: reason || "" });
            __EDX_STORE__.patch({ lastError: reason || "Blocked by legacy flow" });
            return __legacyFlashBlock.apply(this, arguments);
        };
    };

    wrapWhenReady();
})();
