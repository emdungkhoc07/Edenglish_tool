// ========================= EVENT OBFUSCATION BRIDGE =========================
(function () {
    'use strict';
    if (window.__EDX_PAGE_OBF_HOOKED__) return;
    window.__EDX_PAGE_OBF_HOOKED__ = true;

    const __EDX_HASH = sessionStorage.getItem('__edx_eh') || '';
    const __EDX_BRIDGE_TOKEN = sessionStorage.getItem('__edx_bt') || '';
    const NativeCustomEvent = window.CustomEvent;
    const obfEvent = (type) => {
        if (!__EDX_HASH || typeof type !== 'string') return type;
        return type.startsWith('__edx_') ? `_${__EDX_HASH}_${type}` : type;
    };

    window.__edxBridgeDetail = (detail) => {
        const next = (detail && typeof detail === 'object') ? { ...detail } : {};
        if (__EDX_BRIDGE_TOKEN) next.__edxToken = __EDX_BRIDGE_TOKEN;
        return next;
    };
    window.__edxValidBridgeEvent = (e) => !__EDX_BRIDGE_TOKEN || e?.detail?.__edxToken === __EDX_BRIDGE_TOKEN;
    window.__edxBridgeEventName = obfEvent;
    window.__edxCreateBridgeEvent = (type, params) => {
        const nextParams = (() => {
            if (!__EDX_BRIDGE_TOKEN || typeof type !== 'string' || !type.startsWith('__edx_')) return params;
            const cloned = params ? { ...params } : {};
            const detail = (params?.detail && typeof params.detail === 'object') ? { ...params.detail } : {};
            detail.__edxToken = __EDX_BRIDGE_TOKEN;
            cloned.detail = detail;
            return cloned;
        })();
        return new NativeCustomEvent(obfEvent(type), nextParams);
    };
})();

