// ========================= SPA NAVIGATION GUARD =========================
// Detect URL changes (SPA navigation without full page reload) and re-init
let __spaLastHref = location.href;
setInterval(() => {
    if (location.href !== __spaLastHref) {
        __spaLastHref = location.href;
        _log('[EDX] SPA navigation detected:', location.href);
        __bootAttempts = 0;
        __fetching = false;
        // Preserve the last fetched URL across SPA navigation so stale answer
        // payloads from the previous lesson can be detected and ignored.
        __ans = [];
        __allAns = [];
        __dndCategories = null;
        __dndDone = false;
        __dndInProgress = false;
        __qType = '?';
        try { updateAnswerDisplay('Đang chuyển trang...'); } catch (_) {}
        try { updateTypeBadge('unknown'); } catch (_) {}
        if (__spaTimer) clearTimeout(__spaTimer);
        __spaTimer = setTimeout(() => {
            bootAutoFill();
        }, 1500 + Math.random() * 1000);
    }
}, 1000);

})();


