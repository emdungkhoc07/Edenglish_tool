// ========================= INJECT PAGE-CONTEXT BRIDGE =========================

try {
    fetch(chrome.runtime.getURL('inject.js'))
        .then(r => r.text())
        .then(code => {
            const s = document.createElement('script');
            s.textContent = code;
            (document.head || document.documentElement).appendChild(s);
            s.remove();
        })
        .catch((e) => _warn('[EDX] inject.js failed:', e));
} catch (e) {
    _warn('[EDX] inject.js setup failed:', e);
}

