// ========================= HOST SIGNALS =========================
const __EDX_HOST_STATE__ = {
    ready: false,
    lastSource: "",
    lastTopic: "",
    lastAction: "",
    lastEventAt: 0,
    lastSubmitAt: 0,
    lastStartTestAt: 0,
    lastStepLoadedAt: 0,
    lastTaskLoadedAt: 0,
    lastItemDoneAt: 0,
    currentStepIndex: null,
    currentTaskIndex: null,
    inTest: null,
    hasLeftSideResource: null
};

function __edxApplyHostState(patch) {
    Object.assign(__EDX_HOST_STATE__, patch || {});
    __EDX_STORE__?.patch?.({ host: { ...__EDX_HOST_STATE__ } });
}

function __edxHandleHostSignal(detail) {
    if (!detail || typeof detail !== "object") return;
    const action = String(detail.action || detail.name || "").trim();
    const now = Date.now();
    const patch = {
        ready: true,
        lastSource: detail.source || "",
        lastTopic: detail.topic || "",
        lastAction: action,
        lastEventAt: now
    };

    if (typeof detail.currentStepIndex === "number") patch.currentStepIndex = detail.currentStepIndex;
    if (typeof detail.currentTaskIndex === "number") patch.currentTaskIndex = detail.currentTaskIndex;
    if (typeof detail.inTest === "boolean") patch.inTest = detail.inTest;
    if (typeof detail.hasLeftSideResource === "boolean") patch.hasLeftSideResource = detail.hasLeftSideResource;

    if (action === "submitTest" || action === "submitTestSuccess" || action === "testReviewMessage") {
        patch.lastSubmitAt = now;
    }
    if (action === "startTest") {
        patch.lastStartTestAt = now;
    }
    if (action === "stepLoaded" || action === "stepsLoaded") {
        patch.lastStepLoadedAt = now;
    }
    if (action === "taskLoaded" || action === "itemLoaded" || action === "dummyItemLoaded" || action === "emptyItemLoaded") {
        patch.lastTaskLoadedAt = now;
    }
    if (action === "itemDone") {
        patch.lastItemDoneAt = now;
    }

    __edxApplyHostState(patch);
    _trace("host.signal", {
        source: patch.lastSource,
        topic: patch.lastTopic,
        action: patch.lastAction,
        step: patch.currentStepIndex,
        task: patch.currentTaskIndex,
        inTest: patch.inTest
    });
}

function isHostTransitionSettling(windowMs = 900) {
    const state = __EDX_HOST_STATE__;
    const recent = Math.max(
        state.lastEventAt || 0,
        state.lastSubmitAt || 0,
        state.lastStartTestAt || 0,
        state.lastStepLoadedAt || 0,
        state.lastTaskLoadedAt || 0
    );
    return !!recent && (Date.now() - recent) < windowMs;
}

function isHostPostSubmitPhase(windowMs = 3500) {
    const recentSubmit = __EDX_HOST_STATE__.lastSubmitAt || 0;
    if (!recentSubmit) return false;
    return (Date.now() - recentSubmit) < windowMs;
}

(function initHostSignals() {
    const onSignal = (e) => {
        if (!isValidBridgeEvent(e)) return;
        __edxHandleHostSignal(e.detail || {});
    };
    __addBridgeListener(document, "__edx_host_signal", onSignal);

    if (typeof window.edxBridge?.requestHostState === "function") {
        setTimeout(async () => {
            try {
                const snapshot = await window.edxBridge.requestHostState(1200);
                if (snapshot) __edxHandleHostSignal(snapshot);
            } catch (_) {}
        }, 100);
    }
})();
