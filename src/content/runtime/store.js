function __edxClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function __edxMerge(target, patch) {
    const base = Array.isArray(target) ? target.slice() : { ...(target || {}) };
    Object.keys(patch || {}).forEach((key) => {
        const next = patch[key];
        if (next && typeof next === "object" && !Array.isArray(next) && typeof base[key] === "object" && base[key] && !Array.isArray(base[key])) {
            base[key] = __edxMerge(base[key], next);
            return;
        }
        base[key] = next;
    });
    return base;
}

const __EDX_RUNTIME_DEFAULTS__ = {
    mode: "off",
    pageType: "unknown",
    questionType: "unknown",
    lastAction: "Booting extension",
    lastStatus: "",
    lastAnswerSource: "unknown",
    lastError: null,
    runner: {
        fetching: false,
        navigating: false,
        diagActive: false
    },
    auth: {
        hasContext: false,
        requestUrl: "",
        capturedAt: 0
    },
    bridge: {
        ready: !!window.edxBridge
    },
    pageIdentity: {
        itemId: null,
        itemCode: "",
        itemType: "",
        pageIndex: null,
        pageSignature: "",
        hostStepIndex: null,
        hostTaskIndex: null,
        requestUrl: "",
        pageType: "unknown",
        questionType: "unknown",
        key: ""
    },
    transition: {
        activeId: 0,
        trigger: "",
        status: "idle",
        startedAt: 0,
        lastCompletedAt: 0,
        reason: "",
        pageIdentityKey: ""
    },
    trace: {
        activeId: 0,
        count: 0,
        lastTransitionId: 0,
        lastTrigger: "",
        lastStatus: "idle"
    },
    host: {
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
    },
    ui: {
        panelReady: false,
        pinned: true,
        debugDrawerOpen: false
    },
    currentAnswerSession: {
        answerCount: 0,
        allOptionCount: 0,
        source: "unknown"
    }
};

const __EDX_STORE__ = (() => {
    let state = __edxClone(__EDX_RUNTIME_DEFAULTS__);
    const listeners = new Set();

    function notify() {
        const snapshot = __edxClone(state);
        listeners.forEach((listener) => {
            try { listener(snapshot); } catch (_) {}
        });
    }

    return {
        getState() {
            return __edxClone(state);
        },
        patch(patch) {
            state = __edxMerge(state, patch || {});
            notify();
            return __edxClone(state);
        },
        replace(nextState) {
            state = __edxMerge(__edxClone(__EDX_RUNTIME_DEFAULTS__), nextState || {});
            notify();
            return __edxClone(state);
        },
        subscribe(listener) {
            if (typeof listener !== "function") return () => {};
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
})();

__EDX_ARCH__.store = __EDX_STORE__;
