// GENERATED FILE - DO NOT EDIT DIRECTLY
// Source bundle: runtime-bridge.js
// Build stamp: 2026-04-20T13:55:56.582Z

// -- runtime/bridge.js --
// js/runtime/bridge.js
(function() {
    'use strict';
    
    const __obfEvent = typeof window._E === "function" ? window._E.bind(window) : (v => v);
    
    const __bridgeToken = (() => {
        try {
            return window.__EDX_BRIDGE_TOKEN || sessionStorage.getItem('__edx_bt') || '';
        } catch (_) {
            return window.__EDX_BRIDGE_TOKEN || '';
        }
    })();
    
    const withBridgeDetail = (type, params) => {
        if (!__bridgeToken || typeof type !== "string" || !type.startsWith("__edx_")) return params;
        const nextParams = params ? { ...params } : {};
        const detail = (params?.detail && typeof params.detail === "object") ? { ...params.detail } : {};
        detail.__edxToken = __bridgeToken;
        nextParams.detail = detail;
        return nextParams;
    };
    
    const isValidBridgeEvent = (e) => !__bridgeToken || e?.detail?.__edxToken === __bridgeToken;
    const makeBridgeRequestId = (prefix = "req") => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const __bridgeEventName = (type) => (typeof type === "string" ? __obfEvent(type) : type);
    
    const __dispatchBridgeEvent = (target, type, params) => target.dispatchEvent(new CustomEvent(__bridgeEventName(type), withBridgeDetail(type, params)));
    const __addBridgeListener = (target, type, listener, options) => target.addEventListener(__bridgeEventName(type), listener, options);
    const __removeBridgeListener = (target, type, listener, options) => target.removeEventListener(__bridgeEventName(type), listener, options);

    function requestCapturedPayloads(timeoutMs = 2000) {
        return new Promise((resolve) => {
            const requestId = makeBridgeRequestId('captures');
            let settled = false;
            const finish = (data) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                __removeBridgeListener(document, '__edx_captures_response', handler);
                resolve(data);
            };
            const handler = (e) => {
                if (!isValidBridgeEvent(e)) return;
                try {
                    if (e?.detail?.requestId !== requestId) return;
                    const raw = typeof e.detail?.captures === 'string' ? e.detail.captures : '[]';
                    if (raw.length > 2500000) { finish([]); return; }
                    finish(JSON.parse(raw));
                } catch (_) { finish([]); }
            };
            const timer = setTimeout(() => finish([]), timeoutMs);
            __addBridgeListener(document, '__edx_captures_response', handler);
            __dispatchBridgeEvent(document, '__edx_get_captures', { detail: { requestId } });
        });
    }

    function requestScopeMining(timeoutMs = 3000) {
        return new Promise((resolve) => {
            const requestId = makeBridgeRequestId('scope');
            let settled = false;
            const finish = (data) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                __removeBridgeListener(document, '__edx_scope_result', handler);
                resolve(data);
            };
            const handler = (e) => {
                if (!isValidBridgeEvent(e)) return;
                try {
                    if (e?.detail?.requestId !== requestId) return;
                    const raw = typeof e.detail?.result === 'string' ? e.detail.result : '{}';
                    if (raw.length > 1500000) { finish(null); return; }
                    finish(JSON.parse(raw));
                } catch (_) { finish(null); }
            };
            const timer = setTimeout(() => finish(null), timeoutMs);
            __addBridgeListener(document, '__edx_scope_result', handler);
            __dispatchBridgeEvent(document, '__edx_mine_scope', { detail: { requestId } });
        });
    }

    function requestHostState(timeoutMs = 1200) {
        return new Promise((resolve) => {
            const requestId = makeBridgeRequestId('host');
            let settled = false;
            const finish = (data) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                __removeBridgeListener(document, '__edx_host_state_response', handler);
                resolve(data || null);
            };
            const handler = (e) => {
                if (!isValidBridgeEvent(e)) return;
                try {
                    if (e?.detail?.requestId !== requestId) return;
                    const raw = typeof e.detail?.state === 'string' ? e.detail.state : '{}';
                    if (raw.length > 500000) { finish(null); return; }
                    finish(JSON.parse(raw));
                } catch (_) { finish(null); }
            };
            const timer = setTimeout(() => finish(null), timeoutMs);
            __addBridgeListener(document, '__edx_host_state_response', handler);
            __dispatchBridgeEvent(document, '__edx_get_host_state', { detail: { requestId } });
        });
    }

    function pageSyncDrop(itemEl, targetEl, sourceEl) {
        return new Promise((resolve) => {
            const tag = '__edx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            itemEl.setAttribute('data-edx-item', tag);
            targetEl.setAttribute('data-edx-target', tag);
            if (sourceEl) sourceEl.setAttribute('data-edx-source', tag);

            const handler = (e) => {
                if (!isValidBridgeEvent(e)) return;
                __removeBridgeListener(document, '__edx_sync_result', handler);
                itemEl.removeAttribute('data-edx-item');
                targetEl.removeAttribute('data-edx-target');
                if (sourceEl) sourceEl.removeAttribute('data-edx-source');
                resolve(e.detail?.success || false);
            };
            __addBridgeListener(document, '__edx_sync_result', handler);

            __dispatchBridgeEvent(document, '__edx_sync_drop', {
                detail: {
                    itemSelector: `[data-edx-item="${tag}"]`,
                    targetSelector: `[data-edx-target="${tag}"]`,
                    sourceSelector: sourceEl ? `[data-edx-source="${tag}"]` : null
                }
            });

            setTimeout(() => {
                __removeBridgeListener(document, '__edx_sync_result', handler);
                itemEl.removeAttribute('data-edx-item');
                targetEl.removeAttribute('data-edx-target');
                if (sourceEl) sourceEl.removeAttribute('data-edx-source');
                resolve(false);
            }, 1000);
        });
    }

    function pageCheckAnswers(timeoutMs = 1800) {
        return new Promise((resolve) => {
            const requestId = makeBridgeRequestId('check_answers');
            let settled = false;
            const finish = (ok, meta) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                __removeBridgeListener(document, '__edx_check_answers_result', handler);
                resolve({ ok: !!ok, ...(meta || {}) });
            };
            const handler = (e) => {
                if (!isValidBridgeEvent(e)) return;
                if (e?.detail?.requestId !== requestId) return;
                finish(e.detail?.ok, e.detail || {});
            };
            const timer = setTimeout(() => finish(false, { timeout: true }), timeoutMs);
            __addBridgeListener(document, '__edx_check_answers_result', handler);
            __dispatchBridgeEvent(document, '__edx_check_answers', { detail: { requestId } });
        });
    }

    window.edxBridge = {
        __obfEvent,
        __bridgeToken,
        withBridgeDetail,
        isValidBridgeEvent,
        makeBridgeRequestId,
        __bridgeEventName,
        __dispatchBridgeEvent,
        __addBridgeListener,
        __removeBridgeListener,
        requestCapturedPayloads,
        requestScopeMining,
        requestHostState,
        pageSyncDrop,
        pageCheckAnswers
    };
})();
