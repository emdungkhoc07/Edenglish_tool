let __edxDebugDrawer = null;
let __edxDebugPre = null;
let __edxDebugRefreshBtn = null;
let __edxDrawerBtn = null;
let __edxDiagBtn = null;
let __edxCaptureBar = null;
let __edxCaptureBtn = null;
let __edxCaptureDebugBtn = null;
let __edxDebugInstallTimer = null;

function __edxFormatDebugSnapshot() {
    const snapshot = __EDX_DIAGNOSTICS__.getSnapshot();
    return JSON.stringify(snapshot, null, 2);
}

function __edxFormatCaptureBundle() {
    const bundle = __EDX_DIAGNOSTICS__.getCaptureBundle();
    return JSON.stringify(bundle, null, 2);
}

function __edxRenderDebugDrawer() {
    if (!__edxDebugDrawer || !__edxDebugPre) return;
    const state = __EDX_STORE__.getState();
    __edxDebugDrawer.style.display = state.ui.debugDrawerOpen ? "block" : "none";
    __edxDebugPre.textContent = __edxFormatDebugSnapshot();
    if (__edxCaptureBar) {
        __edxCaptureBar.style.display = state.ui.debugDrawerOpen ? "flex" : "flex";
    }
    if (__edxDebugRefreshBtn) {
        __edxDebugRefreshBtn.textContent = "Refresh snapshot";
    }
    if (__edxCaptureDebugBtn) {
        if (state.ui.debugDrawerOpen) __addObfClass(__edxCaptureDebugBtn, "eds-btn--active");
        else __removeObfClass(__edxCaptureDebugBtn, "eds-btn--active");
    }
}

function __edxToggleDebugDrawer(force) {
    const current = __EDX_STORE__.getState().ui.debugDrawerOpen;
    const next = typeof force === "boolean" ? force : !current;
    __EDX_STORE__.patch({
        ui: { debugDrawerOpen: next },
        runner: { diagActive: next || !!__diagActive }
    });
    if (__edxDrawerBtn) {
        if (next) __addObfClass(__edxDrawerBtn, "eds-btn--active");
        else __removeObfClass(__edxDrawerBtn, "eds-btn--active");
    }
    __edxRenderDebugDrawer();
}

function __edxInstallDebugDrawer() {
    if (typeof panel === "undefined" || typeof headerBtns === "undefined" || typeof frontFace === "undefined" || typeof progressWrap === "undefined") {
        return false;
    }
    if (!panel || !headerBtns || !frontFace || !progressWrap || __edxDebugDrawer) return false;

    __edxDiagBtn = document.createElement("button");
    __edxDiagBtn.className = __obfClassList("eds-btn eds-btn--ghost");
    __edxDiagBtn.title = "Diagnostic overlay";
    __edxDiagBtn.setAttribute("aria-label", "Diagnostic overlay");
    appendIcon(__edxDiagBtn, iconDebug, null);
    __edxDiagBtn.onclick = () => {
        if (typeof runDiagnostic === "function") runDiagnostic();
    };
    headerBtns.appendChild(__edxDiagBtn);
    debugBtn = __edxDiagBtn;

    __edxDrawerBtn = document.createElement("button");
    __edxDrawerBtn.className = __obfClassList("eds-btn eds-btn--ghost");
    __edxDrawerBtn.title = "Mở architecture drawer";
    __edxDrawerBtn.setAttribute("aria-label", "Mở architecture drawer");
    appendIcon(__edxDrawerBtn, iconCopy, null);
    __edxDrawerBtn.onclick = async () => {
        await __EDX_DIAGNOSTICS__.pollBackground();
        __edxToggleDebugDrawer();
    };
    headerBtns.appendChild(__edxDrawerBtn);

    __edxDebugDrawer = document.createElement("div");
    __edxDebugDrawer.id = "eds-arch-debug";
    __edxDebugDrawer.style.cssText = [
        "display:none",
        "margin:8px 10px 10px",
        "padding:8px",
        "border:1px solid rgba(148,163,184,.25)",
        "border-radius:10px",
        "background:rgba(9,14,26,.9)",
        "color:#cbd5e1",
        "font:12px/1.45 Consolas, 'JetBrains Mono', monospace"
    ].join(";");

    const title = document.createElement("div");
    title.textContent = "Architecture Debug";
    title.style.cssText = "display:flex;align-items:center;justify-content:space-between;font-weight:700;margin-bottom:8px;color:#f8fafc;";

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:6px;";

    __edxDebugRefreshBtn = document.createElement("button");
    __edxDebugRefreshBtn.className = __obfClassList("eds-btn eds-btn--secondary");
    __edxDebugRefreshBtn.style.cssText = "font-size:11px;padding:4px 7px;";
    __edxDebugRefreshBtn.textContent = "Refresh snapshot";
    __edxDebugRefreshBtn.onclick = async () => {
        __edxDebugRefreshBtn.textContent = "Refreshing...";
        await __EDX_DIAGNOSTICS__.pollBackground();
        __edxRenderDebugDrawer();
    };

    const copySnapshotBtn = document.createElement("button");
    copySnapshotBtn.className = __obfClassList("eds-btn eds-btn--ghost");
    copySnapshotBtn.style.cssText = "font-size:11px;padding:4px 7px;";
    copySnapshotBtn.textContent = "Copy snapshot";
    copySnapshotBtn.onclick = () => {
        navigator.clipboard?.writeText(__edxFormatDebugSnapshot()).catch(() => {});
    };

    const copyCaptureJsonBtn = document.createElement("button");
    copyCaptureJsonBtn.className = __obfClassList("eds-btn eds-btn--ghost");
    copyCaptureJsonBtn.style.cssText = "font-size:11px;padding:4px 7px;";
    copyCaptureJsonBtn.textContent = "Copy capture JSON";
    copyCaptureJsonBtn.onclick = () => {
        navigator.clipboard?.writeText(__edxFormatCaptureBundle()).catch(() => {});
    };

    const copyCaptureMdBtn = document.createElement("button");
    copyCaptureMdBtn.className = __obfClassList("eds-btn eds-btn--ghost");
    copyCaptureMdBtn.style.cssText = "font-size:11px;padding:4px 7px;";
    copyCaptureMdBtn.textContent = "Copy capture MD";
    copyCaptureMdBtn.onclick = () => {
        navigator.clipboard?.writeText(__EDX_DIAGNOSTICS__.getCaptureMarkdown()).catch(() => {});
    };

    const downloadCaptureBtn = document.createElement("button");
    downloadCaptureBtn.className = __obfClassList("eds-btn eds-btn--ghost");
    downloadCaptureBtn.style.cssText = "font-size:11px;padding:4px 7px;";
    downloadCaptureBtn.textContent = "Download capture";
    downloadCaptureBtn.onclick = () => {
        __EDX_DIAGNOSTICS__.downloadCaptureBundle();
    };

    actions.appendChild(__edxDebugRefreshBtn);
    actions.appendChild(copySnapshotBtn);
    actions.appendChild(copyCaptureJsonBtn);
    actions.appendChild(copyCaptureMdBtn);
    actions.appendChild(downloadCaptureBtn);
    title.appendChild(actions);
    __edxDebugDrawer.appendChild(title);

    __edxDebugPre = document.createElement("pre");
    __edxDebugPre.style.cssText = "margin:0;max-height:240px;overflow:auto;white-space:pre-wrap;word-break:break-word;";
    __edxDebugDrawer.appendChild(__edxDebugPre);

    __edxCaptureBar = document.createElement("div");
    __edxCaptureBar.style.cssText = [
        "display:flex",
        "gap:8px",
        "margin:8px 10px 0",
        "align-items:center"
    ].join(";");

    __edxCaptureBtn = document.createElement("button");
    __edxCaptureBtn.className = __obfClassList("eds-btn eds-btn--secondary");
    __edxCaptureBtn.style.cssText = "font-size:11px;padding:6px 10px;min-width:96px;";
    __edxCaptureBtn.textContent = "CAPTURE";
    __edxCaptureBtn.title = "Copy capture Markdown";
    __edxCaptureBtn.onclick = async () => {
        await __EDX_DIAGNOSTICS__.pollBackground();
        navigator.clipboard?.writeText(__EDX_DIAGNOSTICS__.getCaptureMarkdown()).catch(() => {});
        const oldText = __edxCaptureBtn.textContent;
        __edxCaptureBtn.textContent = "COPIED";
        setTimeout(() => {
            if (__edxCaptureBtn) __edxCaptureBtn.textContent = oldText;
        }, 1200);
    };
    __edxCaptureBar.appendChild(__edxCaptureBtn);

    __edxCaptureDebugBtn = document.createElement("button");
    __edxCaptureDebugBtn.className = __obfClassList("eds-btn eds-btn--ghost");
    __edxCaptureDebugBtn.style.cssText = "font-size:11px;padding:6px 10px;min-width:72px;";
    __edxCaptureDebugBtn.textContent = "DEBUG";
    __edxCaptureDebugBtn.title = "Open architecture drawer";
    __edxCaptureDebugBtn.onclick = async () => {
        await __EDX_DIAGNOSTICS__.pollBackground();
        __edxToggleDebugDrawer();
    };
    __edxCaptureBar.appendChild(__edxCaptureDebugBtn);

    frontFace.insertBefore(__edxCaptureBar, progressWrap);
    panel.appendChild(__edxDebugDrawer);
    __EDX_STORE__.subscribe(__edxRenderDebugDrawer);
    __EDX_DIAGNOSTICS__.pollBackground().finally(__edxRenderDebugDrawer);
    setInterval(() => {
        if (__EDX_STORE__.getState().ui.debugDrawerOpen) {
            __EDX_DIAGNOSTICS__.pollBackground().finally(__edxRenderDebugDrawer);
        }
    }, 3000);
    return true;
}

function __edxEnsureDebugDrawerInstalled() {
    if (__edxInstallDebugDrawer()) {
        if (__edxDebugInstallTimer) {
            clearInterval(__edxDebugInstallTimer);
            __edxDebugInstallTimer = null;
        }
        return;
    }
    if (__edxDebugInstallTimer) return;
    __edxDebugInstallTimer = setInterval(() => {
        if (__edxInstallDebugDrawer()) {
            clearInterval(__edxDebugInstallTimer);
            __edxDebugInstallTimer = null;
        }
    }, 250);
}

__edxEnsureDebugDrawerInstalled();
