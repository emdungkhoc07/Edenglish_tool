// ========================= CONSOLE FILTER =========================
// Suppress noisy page logs to keep DevTools clean
(function () {
    'use strict';
    if (window.__EDX_INJECT_CONSOLE_HOOKED__) return;
    window.__EDX_INJECT_CONSOLE_HOOKED__ = true;
    const FILTER_PAGE_CONSOLE = (() => {
        try {
            return window.localStorage?.getItem('edx_filter_page_console') === '1' ||
                window.__EDX_FILTER_PAGE_CONSOLE === true;
        } catch (_) {
            return window.__EDX_FILTER_PAGE_CONSOLE === true;
        }
    })();
    if (!FILTER_PAGE_CONSOLE) return;

    const _origLog = console.log;
    const _origWarn = console.warn;
    const NOISE = [
        /^\[?SP:/i, /^Loading\.\.\.$/i, /^Checking for missing/i,
        /SCRIPT\s+https?:\/\//i, /^SR\s*=>/i, /^true$/,
        /^psc$/, /^totalTime$/, /^rsch$/, /^eos$/, /^timeUpdate$/,
        /syncAudioPlayer/i, /^Skill-/i, /^Course name-/i,
        /InitSP/i, /Initializing/i
    ];
    const isNoisy = (args) => {
        if (!args.length) return false;
        const first = String(args[0]);
        return NOISE.some(rx => rx.test(first));
    };
    console.log = function (...args) { if (!isNoisy(args)) _origLog.apply(console, args); };
    console.warn = function (...args) { if (!isNoisy(args)) _origWarn.apply(console, args); };
})();

