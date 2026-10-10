(function () {
    const arch = window.__EDX_INJECT_ARCH__ || (window.__EDX_INJECT_ARCH__ = {});
    arch.ready = true;
    arch.lastReadyAt = Date.now();
    arch.lastItemId = window.__edx_lastItemId || null;
})();
