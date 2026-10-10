// ========================= BYPASS COPY/PASTE/SELECT RESTRICTIONS =========================
const applyBypassToWindow = (win) => {
    try {
        if (win.__bypassApplied) return;
        win.__bypassApplied = true;

        const doc = win.document;

        // 1. Handle copy, cut, contextmenu simply by stopping anti-scripts
        ["copy", "cut", "contextmenu"].forEach(evt => {
            doc.addEventListener(evt, e => {
                if (!__bypassEnabled) return;
                e.stopImmediatePropagation();
            }, true);
        });

        // 2. Intercept keyboard shortcuts (Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A) to prevent editor blocks
        doc.addEventListener("keydown", e => {
            if (!__bypassEnabled) return;
            if (e.ctrlKey && ['c', 'v', 'x', 'a'].includes(e.key.toLowerCase())) {
                e.stopImmediatePropagation();
                // We don't preventDefault here; we want the browser's native copy/paste to run
            }
        }, true);

        // 3. Handle paste specially: bypass anti-scripts and hard-sync page state
        doc.addEventListener("paste", e => {
            if (!__bypassEnabled) return;
            const target = e.target;
            if (!target) return;
            e.stopImmediatePropagation();

            const text = e.clipboardData?.getData("text/plain") || "";
            if (!isEditableNode(target)) {
                setTimeout(() => syncInputState(target, text, "paste"), 40);
                return;
            }

            if (text) {
                e.preventDefault();
                if (!insertTextIntoEditable(target, text)) {
                    setElementValue(target, text);
                }
                syncInputState(target, text, "paste");
                if (typeof triggerAngularSync === 'function') triggerAngularSync(target);
                return;
            }

            setTimeout(() => {
                const value = target.value || target.textContent || "";
                syncInputState(target, value, "paste");
                if (typeof triggerAngularSync === 'function') triggerAngularSync(target);
            }, 40);
        }, true);
    } catch (_) { }
};

// Apply to main document
applyBypassToWindow(window);

// Guard against SPA re-injection: clear previous intervals isolated to the page's window root
if (window.__edxIntervalBypass) clearInterval(window.__edxIntervalBypass);
if (window.__edxIntervalPageChange) clearInterval(window.__edxIntervalPageChange);

const _registerInterval = (key, interval) => { window[key] = interval; return interval; };

// Modal and iframe logic moved to central scheduler

const _styleOverride = document.createElement("style");
_styleOverride.textContent = `
    html[data-eds-bypass="on"] * { -webkit-user-select: text !important; user-select: text !important; -webkit-touch-callout: default !important; }
    html[data-eds-bypass="on"] *::selection { background: #338FFF !important; color: white !important; }
`;
document.head.appendChild(_styleOverride);

function applyBypassVisualState() {
    try {
        document.documentElement.setAttribute('data-eds-bypass', __bypassEnabled ? 'on' : 'off');
    } catch (_) { }
}

applyBypassVisualState();

