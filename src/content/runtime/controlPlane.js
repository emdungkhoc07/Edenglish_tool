function __edxParseGetItemUrl(url) {
    const result = {
        requestUrl: url || "",
        itemId: null,
        itemCode: "",
        itemType: "",
        pageIndex: null
    };
    if (!url) return result;

    try {
        const parsed = new URL(url, location.origin);
        const parts = parsed.pathname.split("/").filter(Boolean);
        const getItemIndex = parts.findIndex((part) => /^GetItem$/i.test(part));
        if (getItemIndex >= 0) {
            result.itemType = parts[getItemIndex - 1] || "";
            result.itemId = parts[getItemIndex + 1] || null;
            result.itemCode = parts[getItemIndex + 2] || "";
            const numericTail = parts.slice(getItemIndex + 3).filter((part) => /^\d+$/.test(part));
            if (numericTail.length) {
                const maybePage = parseInt(numericTail[numericTail.length - 1], 10);
                result.pageIndex = Number.isFinite(maybePage) ? maybePage : null;
            }
        }
        result.requestUrl = parsed.toString();
    } catch (_) {}

    return result;
}

function __edxCurrentHostState() {
    try {
        return __EDX_STORE__.getState().host || {};
    } catch (_) {
        return {};
    }
}

function __edxCurrentRuntimeState() {
    try {
        return __EDX_STORE__.getState();
    } catch (_) {
        return {};
    }
}

function __edxSafePageSignature() {
    return __edxSafeCall(() => typeof getPageSignature === "function" ? getPageSignature() : "", "");
}

function __edxSafePageIndex() {
    const page = __edxSafeCall(() => typeof getCurrentAssessmentPage === "function" ? getCurrentAssessmentPage() : null, null);
    return Number.isInteger(page) ? page : null;
}

function __edxPageIdentityKey(identity) {
    const safe = identity || {};
    return [
        safe.itemId || "",
        safe.itemCode || "",
        safe.itemType || "",
        safe.pageIndex ?? "",
        safe.pageSignature || "",
        safe.hostStepIndex ?? "",
        safe.hostTaskIndex ?? ""
    ].join("::");
}

function __edxSamePageIdentity(left, right) {
    if (!left || !right) return false;

    if (left.pageSignature && right.pageSignature && left.pageSignature === right.pageSignature) {
        return true;
    }

    const strongLeft = left.itemId || left.itemCode || left.pageIndex !== null;
    const strongRight = right.itemId || right.itemCode || right.pageIndex !== null;
    if (strongLeft && strongRight) {
        if (left.itemId && right.itemId && left.itemId !== right.itemId) return false;
        if (left.itemCode && right.itemCode && left.itemCode !== right.itemCode) return false;
        if (left.pageIndex !== null && right.pageIndex !== null && left.pageIndex !== right.pageIndex) return false;
        return true;
    }

    if (left.hostStepIndex !== null && right.hostStepIndex !== null && left.hostStepIndex !== right.hostStepIndex) {
        return false;
    }
    if (left.hostTaskIndex !== null && right.hostTaskIndex !== null && left.hostTaskIndex !== right.hostTaskIndex) {
        return false;
    }

    return !!(left.hostStepIndex !== null || left.hostTaskIndex !== null);
}

function __edxBuildPageIdentity(overrides) {
    const runtime = __edxCurrentRuntimeState();
    const host = __edxCurrentHostState();
    const parsedUrl = __edxParseGetItemUrl(
        overrides?.ansUrl ||
        overrides?.requestUrl ||
        runtime?.auth?.requestUrl ||
        ""
    );

    const pageIdentity = {
        itemId: overrides?.itemId ?? parsedUrl.itemId ?? runtime?.pageIdentity?.itemId ?? null,
        itemCode: overrides?.itemCode ?? parsedUrl.itemCode ?? runtime?.pageIdentity?.itemCode ?? "",
        itemType: overrides?.itemType ?? parsedUrl.itemType ?? runtime?.pageIdentity?.itemType ?? "",
        pageIndex: overrides?.pageIndex ?? parsedUrl.pageIndex ?? __edxSafePageIndex(),
        pageSignature: overrides?.pageSignature ?? __edxSafePageSignature(),
        hostStepIndex: overrides?.hostStepIndex ?? host.currentStepIndex ?? null,
        hostTaskIndex: overrides?.hostTaskIndex ?? host.currentTaskIndex ?? null,
        requestUrl: overrides?.requestUrl ?? parsedUrl.requestUrl ?? "",
        pageType: overrides?.pageType ?? runtime?.pageType ?? "unknown",
        questionType: overrides?.questionType ?? runtime?.questionType ?? "unknown"
    };

    pageIdentity.key = __edxPageIdentityKey(pageIdentity);
    return pageIdentity;
}

const __EDX_CONTROL_PLANE__ = (() => {
    const TRACE_LIMIT = 40;
    const traces = [];
    let activeTrace = null;
    let sequence = 0;

    function syncRuntimeSnapshot(patch) {
        try {
            __EDX_STORE__.patch(patch);
        } catch (_) {}
    }

    function pushTrace(trace) {
        traces.push(trace);
        if (traces.length > TRACE_LIMIT) {
            traces.splice(0, traces.length - TRACE_LIMIT);
        }
        syncRuntimeSnapshot({
            trace: {
                activeId: activeTrace?.transitionId || 0,
                count: traces.length,
                lastTransitionId: trace?.transitionId || 0,
                lastTrigger: trace?.trigger || "",
                lastStatus: trace?.status || "running"
            }
        });
    }

    function beginTransition(trigger, meta) {
        const before = __edxBuildPageIdentity(meta?.pageIdentity || {});
        const current = activeTrace;
        if (
            current &&
            current.status === "running" &&
            current.trigger === trigger &&
            __edxSamePageIdentity(current.pageIdentityBefore, before)
        ) {
            current.lastTouchedAt = Date.now();
            current.events.push({
                ts: current.lastTouchedAt,
                stage: "dedupe",
                meta: meta || null
            });
            syncRuntimeSnapshot({
                pageIdentity: before,
                transition: {
                    activeId: current.transitionId,
                    trigger: current.trigger,
                    status: current.status,
                    startedAt: current.startedAt,
                    lastCompletedAt: __edxCurrentRuntimeState()?.transition?.lastCompletedAt || 0,
                    reason: meta?.reason || "",
                    pageIdentityKey: before.key || ""
                }
            });
            return { ...current };
        }

        if (current && current.status === "running") {
            finishTransition("superseded", {
                reason: `superseded by ${trigger}`,
                pageIdentityAfter: before
            });
        }

        const trace = {
            transitionId: ++sequence,
            trigger: trigger || "unknown",
            startedAt: Date.now(),
            finishedAt: 0,
            durationMs: 0,
            status: "running",
            reason: meta?.reason || "",
            pageIdentityBefore: before,
            pageIdentityAfter: null,
            hostState: __edxCurrentHostState(),
            ansUrl: meta?.ansUrl || before.requestUrl || "",
            qType: meta?.questionType || before.questionType || "unknown",
            pageType: meta?.pageType || before.pageType || "unknown",
            handlerResult: null,
            autoNextDecision: null,
            error: null,
            events: [],
            lastTouchedAt: Date.now()
        };

        activeTrace = trace;
        pushTrace(trace);
        syncRuntimeSnapshot({
            pageIdentity: before,
            transition: {
                activeId: trace.transitionId,
                trigger: trace.trigger,
                status: trace.status,
                startedAt: trace.startedAt,
                lastCompletedAt: __edxCurrentRuntimeState()?.transition?.lastCompletedAt || 0,
                reason: trace.reason,
                pageIdentityKey: before.key || ""
            }
        });
        return { ...trace };
    }

    function note(stage, meta) {
        if (!activeTrace) return null;
        const now = Date.now();
        activeTrace.lastTouchedAt = now;
        activeTrace.events.push({
            ts: now,
            stage: stage || "note",
            meta: meta || null
        });
        if (meta?.ansUrl) activeTrace.ansUrl = meta.ansUrl;
        if (meta?.pageType) activeTrace.pageType = meta.pageType;
        if (meta?.questionType) activeTrace.qType = meta.questionType;
        return { ...activeTrace };
    }

    function syncPageIdentity(overrides) {
        const identity = __edxBuildPageIdentity(overrides || {});
        syncRuntimeSnapshot({ pageIdentity: identity });
        if (activeTrace) {
            activeTrace.pageIdentityAfter = identity;
            if (identity.requestUrl) activeTrace.ansUrl = identity.requestUrl;
            if (identity.pageType) activeTrace.pageType = identity.pageType;
            if (identity.questionType) activeTrace.qType = identity.questionType;
        }
        return identity;
    }

    function normalizeHandlerResult(input, fallback) {
        if (input && typeof input === "object" && "applied" in input) {
            return {
                applied: !!input.applied,
                verified: !!input.verified,
                reason: input.reason || "",
                pageIdentity: input.pageIdentity || __edxBuildPageIdentity(),
                qType: input.qType || fallback?.qType || __edxCurrentRuntimeState()?.questionType || "unknown"
            };
        }

        const ok = !!input;
        return {
            applied: ok,
            verified: ok,
            reason: ok ? "legacy-handler-success" : (fallback?.reason || "legacy-handler-failed"),
            pageIdentity: fallback?.pageIdentity || __edxBuildPageIdentity(),
            qType: fallback?.qType || __edxCurrentRuntimeState()?.questionType || "unknown"
        };
    }

    function recordHandlerResult(result) {
        const normalized = normalizeHandlerResult(result);
        if (activeTrace) {
            activeTrace.handlerResult = normalized;
            activeTrace.qType = normalized.qType || activeTrace.qType;
        }
        syncRuntimeSnapshot({
            pageIdentity: normalized.pageIdentity,
            lastAction: normalized.applied ? "Handler applied" : "Handler blocked"
        });
        return normalized;
    }

    function recordAutoNext(decision, meta) {
        if (activeTrace) {
            activeTrace.autoNextDecision = {
                decision,
                ...(meta || {}),
                at: Date.now()
            };
        }
        syncRuntimeSnapshot({
            lastAction: meta?.message || `auto-next:${decision}`
        });
    }

    function finishTransition(status, meta) {
        if (!activeTrace) return null;
        const now = Date.now();
        const after = meta?.pageIdentityAfter || __edxBuildPageIdentity(meta?.pageIdentity || {});
        activeTrace.finishedAt = now;
        activeTrace.durationMs = Math.max(0, now - activeTrace.startedAt);
        activeTrace.status = status || "done";
        activeTrace.reason = meta?.reason || activeTrace.reason || "";
        activeTrace.pageIdentityAfter = after;
        activeTrace.hostState = __edxCurrentHostState();
        activeTrace.pageType = meta?.pageType || after.pageType || activeTrace.pageType;
        activeTrace.qType = meta?.questionType || after.questionType || activeTrace.qType;
        activeTrace.error = meta?.error || null;
        syncRuntimeSnapshot({
            pageIdentity: after,
            transition: {
                activeId: 0,
                trigger: activeTrace.trigger,
                status: activeTrace.status,
                startedAt: activeTrace.startedAt,
                lastCompletedAt: now,
                reason: activeTrace.reason,
                pageIdentityKey: after.key || ""
            },
            trace: {
                activeId: 0,
                count: traces.length,
                lastTransitionId: activeTrace.transitionId,
                lastTrigger: activeTrace.trigger,
                lastStatus: activeTrace.status
            }
        });
        const finished = { ...activeTrace };
        activeTrace = null;
        return finished;
    }

    return {
        capturePageIdentity(overrides) {
            return __edxBuildPageIdentity(overrides || {});
        },
        samePageIdentity: __edxSamePageIdentity,
        beginTransition,
        note,
        syncPageIdentity,
        normalizeHandlerResult,
        recordHandlerResult,
        recordAutoNext,
        finish: finishTransition,
        getActiveTransition() {
            return activeTrace ? { ...activeTrace } : null;
        },
        getTracePack() {
            return traces.map((trace) => ({ ...trace }));
        },
        exportTracePack() {
            return JSON.stringify(traces, null, 2);
        }
    };
})();

window.__EDX_CONTROL_PLANE__ = __EDX_CONTROL_PLANE__;
__EDX_ARCH__.controlPlane = __EDX_CONTROL_PLANE__;
