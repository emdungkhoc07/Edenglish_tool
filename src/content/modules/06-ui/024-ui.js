// ========================= UI =========================
let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
let __pinned = true;

const __host = document.createElement("div");

__host.style.cssText = "position:fixed;z-index:2147483647;top:0;left:0;right:0;bottom:0;pointer-events:none;";
const _appendHost = () => {
    (document.body || document.documentElement).appendChild(__host);
};
if (document.body) _appendHost();
else document.addEventListener('DOMContentLoaded', _appendHost, { once: true });
const __shadow = __host.attachShadow({ mode: "closed" });
// Load external content.css and inject into shadow root
{
    const style = document.createElement('style');
    // Set a temporary minimal loader style while fetching
    style.textContent = `
        :host { font-family: "Segoe UI", sans-serif; }
        .eds-panel { display: none; } /* Hide until CSS loaded */
    `;
    __shadow.appendChild(style);

    const cssUrl = chrome.runtime.getURL('content.css');
    fetch(cssUrl)
        .then(res => res.text())
        .then(rawCss => {
            style.textContent = window._O_css ? window._O_css(rawCss) : rawCss;
        })
        .catch(err => {
            _warn('[EDX] Failed to load content.css:', err);
        });
}

const NS = "http://www.w3.org/2000/svg";


function makeSvg(viewBox, ...paths) {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("width", "13"); s.setAttribute("height", "13");
    s.setAttribute("viewBox", viewBox); s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2");
    s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    paths.forEach(([tag, attrs]) => {
        const el = document.createElementNS(NS, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        s.appendChild(el);
    });
    return s;
}


function iconRefresh() {
    return makeSvg("0 0 24 24",
        ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }],
        ["path", { d: "M3 3v5h5" }]);
}


function iconPin() {
    return makeSvg("0 0 24 24",
        ["line", { x1: "12", y1: "17", x2: "12", y2: "22" }],
        ["path", { d: "M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" }]);
}


function iconPinOff() {
    return makeSvg("0 0 24 24",
        ["line", { x1: "2", y1: "2", x2: "22", y2: "22" }],
        ["line", { x1: "12", y1: "17", x2: "12", y2: "22" }],
        ["path", { d: "M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14" }],
        ["path", { d: "M15 9.34V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0-.34 3.98" }]);
}


function iconMinimize() {
    return makeSvg("0 0 24 24",
        ["line", { x1: "5", y1: "12", x2: "19", y2: "12" }]);
}

function iconSettings() {
    return makeSvg("0 0 24 24",
        ["circle", { cx: "12", cy: "12", r: "3" }],
        ["path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c0 .69.4 1.31 1.03 1.58.15.06.31.1.48.11H21a2 2 0 0 1 0 4h-.09c-.17.01-.33.05-.48.11-.63.27-1.03.89-1.03 1.58Z" }]);
}

function iconBack() {
    return makeSvg("0 0 24 24",
        ["path", { d: "M15 18l-6-6 6-6" }],
        ["path", { d: "M9 12h10" }]);
}

function iconEye() {
    return makeSvg("0 0 24 24",
        ["path", { d: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" }],
        ["circle", { cx: "12", cy: "12", r: "3" }]);
}

function iconEyeOff() {
    return makeSvg("0 0 24 24",
        ["path", { d: "M2 12s3.5-6 10-6c1.65 0 3.12.32 4.42.84" }],
        ["path", { d: "M22 12s-3.5 6-10 6c-1.77 0-3.33-.37-4.68-.96" }],
        ["path", { d: "m3 3 18 18" }]);
}

function iconGrip() {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("width", "8"); s.setAttribute("height", "12");
    s.setAttribute("viewBox", "0 0 8 14"); s.setAttribute("fill", "currentColor");
    s.setAttribute("stroke", "none");
    [[2, 2], [6, 2], [2, 7], [6, 7], [2, 12], [6, 12]].forEach(([cx, cy]) => {
        const c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", "1.2");
        s.appendChild(c);
    });
    return s;
}


function iconZap() {
    return makeSvg("0 0 24 24",
        ["path", { d: "m5 3 14 9-14 9V3z" }]);
}




function iconDebug() {
    return makeSvg("0 0 24 24",
        ["circle", { cx: "12", cy: "12", r: "3" }],
        ["path", { d: "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" }]);
}


function iconCopy() {
    return makeSvg("0 0 24 24",
        ["rect", { x: "9", y: "9", width: "13", height: "13", rx: "2", ry: "2" }],
        ["path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" }]);
}

function appendIcon(btn, iconFn, label) {
    btn.appendChild(iconFn());
    if (label) { const sp = document.createElement("span"); sp.textContent = label; btn.appendChild(sp); }
}

const panel = document.createElement("div");
panel.className = __obfClassList("eds-panel"); panel.id = "eds-panel"; panel.style.pointerEvents = "auto";
__shadow.appendChild(panel);

const panelCard = document.createElement("div");
panelCard.className = __obfClassList("eds-card");
panel.appendChild(panelCard);

const frontFace = document.createElement("div");
frontFace.className = __obfClassList("eds-face eds-face--front");
panelCard.appendChild(frontFace);

const backFace = document.createElement("div");
backFace.className = __obfClassList("eds-face eds-face--back");
panelCard.appendChild(backFace);

const header = document.createElement("div");
header.className = __obfClassList("eds-header"); frontFace.appendChild(header);

const dragHandle = document.createElement("div");
dragHandle.className = __obfClassList("eds-handle");
dragHandle.title = "Kéo để di chuyển";
dragHandle.setAttribute("aria-label", "Kéo để di chuyển panel");
dragHandle.appendChild(iconGrip());
header.appendChild(dragHandle);
const typeBadge = document.createElement("button");
typeBadge.className = __obfClassList("eds-badge"); typeBadge.textContent = "\u2014";
typeBadge.title = "Loại câu hỏi - click để lấy lại đáp án";
typeBadge.setAttribute("aria-label", "Loại câu hỏi, click để lấy lại đáp án");
header.appendChild(typeBadge);
const headerBtns = document.createElement("div");
headerBtns.className = __obfClassList("eds-header-btns"); header.appendChild(headerBtns);

function applyToggleState(btn, isOn, onTitle, offTitle, activeWhenOn = true) {
    __toggleObfClass(btn, "eds-btn--active", activeWhenOn ? isOn : !isOn);
    btn.setAttribute("aria-pressed", String(isOn));
    btn.setAttribute("data-state", isOn ? "on" : "off");
    btn.title = isOn ? onTitle : offTitle;
}


const modeWrap = document.createElement("div");
modeWrap.className = __obfClassList("eds-mode-wrap");

const modePill = document.createElement("div");
modePill.className = __obfClassList("eds-mode-pill");
modeWrap.appendChild(modePill);

const modeIndicator = document.createElement("div");
modeIndicator.className = __obfClassList("eds-mode-indicator");
modePill.appendChild(modeIndicator);

__autoNextModes.forEach((m, idx) => {
    const seg = document.createElement("div");
    seg.className = __obfClassList("eds-mode-seg");
    seg.dataset.mode = m.key;
    seg.dataset.idx = idx;
    seg.textContent = m.label;
    seg.title = m.desc;
    seg.onclick = () => {
        const oldMode = __autoNext;
        stopAutomationForModeSwitch(m.key, oldMode);
        __autoNext = m.key;
        __userAutoNext = m.key;
        try { window.__userAutoNext = m.key; } catch (_) { }
        _updateAutoNextUI();


        if ((isAutoMode() && oldMode !== MODE_AUTO) ||
            (isRunMode() && oldMode === MODE_WATCH)) {
            __bootAttempts = 0;
            bootAutoFill();
        } else if (isWatchMode()) {
            updateAnswerDisplay(UI_TEXT.mode.stopped);
        }
    };
    modePill.appendChild(seg);
});
frontFace.appendChild(modeWrap);

const captureQuickWrap = document.createElement("div");
captureQuickWrap.style.cssText = "display:flex;gap:8px;align-items:center;margin:8px 10px 0;";

const captureQuickBtn = document.createElement("button");
captureQuickBtn.className = __obfClassList("eds-btn eds-btn--secondary");
captureQuickBtn.style.cssText = "font-size:11px;padding:6px 10px;min-width:96px;";
captureQuickBtn.textContent = "CAPTURE";
captureQuickBtn.title = "Copy capture Markdown";
captureQuickBtn.onclick = async () => {
    try { await __EDX_DIAGNOSTICS__?.pollBackground?.(); } catch (_) { }
    try {
        await navigator.clipboard?.writeText(__EDX_DIAGNOSTICS__?.getCaptureMarkdown?.() || "");
        const oldText = captureQuickBtn.textContent;
        captureQuickBtn.textContent = "COPIED";
        setTimeout(() => { captureQuickBtn.textContent = oldText; }, 1200);
    } catch (_) { }
};
captureQuickWrap.appendChild(captureQuickBtn);

const captureQuickDebugBtn = document.createElement("button");
captureQuickDebugBtn.className = __obfClassList("eds-btn eds-btn--ghost");
captureQuickDebugBtn.style.cssText = "font-size:11px;padding:6px 10px;min-width:72px;";
captureQuickDebugBtn.textContent = "DEBUG";
captureQuickDebugBtn.title = "Toggle architecture drawer";
captureQuickDebugBtn.onclick = async () => {
    try { await __EDX_DIAGNOSTICS__?.pollBackground?.(); } catch (_) { }
    try {
        const next = !(__EDX_STORE__?.getState?.().ui?.debugDrawerOpen);
        __EDX_STORE__?.patch?.({
            ui: { debugDrawerOpen: next },
            runner: { diagActive: next || !!__diagActive }
        });
    } catch (_) { }
};
captureQuickWrap.appendChild(captureQuickDebugBtn);

frontFace.appendChild(captureQuickWrap);

function _updateAutoNextUI() {
    let activeIdx = 0;
    modePill.querySelectorAll(__obfSelector('.eds-mode-seg')).forEach(seg => {
        const isActive = seg.dataset.mode === __autoNext;
        seg.classList.toggle('active', isActive);
        if (isActive) activeIdx = seg.dataset.idx;
    });
    modePill.setAttribute('data-active-index', activeIdx);
    
    try { chrome.storage.local.set({ eds_auto_next: __autoNext }); } catch (_) { }
}
_updateAutoNextUI();


const refreshBtn = document.createElement("button");
refreshBtn.className = __obfClassList("eds-btn eds-btn--secondary");
refreshBtn.title = UI_TEXT.actions.refreshAnswers;
refreshBtn.setAttribute("aria-label", UI_TEXT.actions.refreshAnswers);
appendIcon(refreshBtn, iconRefresh, null);
refreshBtn.onclick = () => getAns().then(ok => { if (ok) setTimeout(() => handleQuestion(), 150); }); headerBtns.appendChild(refreshBtn);

/* Pin toggle */
const pinBtn = document.createElement("button");
pinBtn.className = __obfClassList("eds-btn eds-btn--ghost");
pinBtn.setAttribute("aria-label", UI_TEXT.actions.pinPanel);
appendIcon(pinBtn, __pinned ? iconPin : iconPinOff, null);
applyToggleState(pinBtn, __pinned, "Đang ghim", "Đang thả", false);
pinBtn.onclick = () => {
    __pinned = !__pinned;
    pinBtn.replaceChildren(__pinned ? iconPin() : iconPinOff());
    applyToggleState(pinBtn, __pinned, "Đang ghim", "Đang thả", false);
    panel.style.resize = __pinned ? "none" : "both";
};
headerBtns.appendChild(pinBtn);

const settingsBtn = document.createElement("button");
settingsBtn.className = __obfClassList("eds-btn eds-btn--ghost");
settingsBtn.title = "Cài đặt AI";
settingsBtn.setAttribute("aria-label", "Mở cài đặt AI");
appendIcon(settingsBtn, iconSettings, null);
headerBtns.appendChild(settingsBtn);

/* Minimize - collapse panel, show chibi */
const minimizeBtn = document.createElement("button");
minimizeBtn.className = __obfClassList("eds-btn eds-btn--ghost");
minimizeBtn.title = "Thu gọn - click vào Nhân Vật để mở lại";
minimizeBtn.setAttribute("aria-label", UI_TEXT.actions.minimizePanel);
appendIcon(minimizeBtn, iconMinimize, null);
headerBtns.appendChild(minimizeBtn);

const settingsShell = document.createElement("div");
settingsShell.className = __obfClassList("eds-settings-shell");
backFace.appendChild(settingsShell);

const settingsHeader = document.createElement("div");
settingsHeader.className = __obfClassList("eds-settings-titlebar");
settingsShell.appendChild(settingsHeader);

const settingsTitle = document.createElement("div");
settingsTitle.className = __obfClassList("eds-settings-title");
settingsTitle.textContent = "Cài đặt";
settingsHeader.appendChild(settingsTitle);

const settingsBody = document.createElement("div");
settingsBody.className = __obfClassList("eds-settings-body");
settingsShell.appendChild(settingsBody);

const providerLabel = document.createElement("div");
providerLabel.className = __obfClassList("eds-settings-label");
providerLabel.textContent = "API KEYS";
settingsBody.appendChild(providerLabel);

const providerValue = document.createElement("div");
providerValue.className = __obfClassList("eds-settings-provider");
const providerDot = document.createElement("span");
providerDot.className = __obfClassList("eds-settings-provider-dot");
providerValue.appendChild(providerDot);
const providerName = document.createElement("span");
providerName.textContent = "Groq";
providerValue.appendChild(providerName);
settingsBody.appendChild(providerValue);

const settingsDivider = document.createElement("div");
settingsDivider.className = __obfClassList("eds-settings-divider");
settingsBody.appendChild(settingsDivider);

const apiKeyRow = document.createElement("div");
apiKeyRow.className = __obfClassList("eds-settings-key-row");
settingsBody.appendChild(apiKeyRow);

const apiKeyInput = document.createElement("input");
apiKeyInput.className = __obfClassList("eds-settings-input");
apiKeyInput.type = "password";
apiKeyInput.placeholder = "gsk_...";
apiKeyInput.autocomplete = "off";
apiKeyInput.spellcheck = false;
apiKeyRow.appendChild(apiKeyInput);

const apiKeyToggleBtn = document.createElement("button");
apiKeyToggleBtn.className = __obfClassList("eds-btn eds-btn--ghost eds-settings-eye");
apiKeyToggleBtn.title = "Hiện / Ẩn key";
apiKeyToggleBtn.setAttribute("aria-label", "Hiện hoặc ẩn API key");
appendIcon(apiKeyToggleBtn, iconEye, null);
apiKeyRow.appendChild(apiKeyToggleBtn);

const settingsSaveBtn = document.createElement("button");
settingsSaveBtn.className = __obfClassList("eds-btn eds-btn--primary eds-settings-save");
settingsSaveBtn.textContent = "Lưu cài đặt";
settingsBody.appendChild(settingsSaveBtn);

const settingsSavedHint = document.createElement("div");
settingsSavedHint.className = __obfClassList("eds-settings-saved");
settingsSavedHint.textContent = "Đã lưu";
settingsSavedHint.style.display = "none";
settingsBody.appendChild(settingsSavedHint);

const settingsFooter = document.createElement("div");
settingsFooter.className = __obfClassList("eds-settings-footer");
settingsBody.appendChild(settingsFooter);

const settingsBackBtn = document.createElement("button");
settingsBackBtn.className = __obfClassList("eds-settings-back");
settingsBackBtn.title = "Quay lại";
settingsBackBtn.setAttribute("aria-label", "Quay lại mặt trước");
appendIcon(settingsBackBtn, iconBack, "Quay lại");
settingsFooter.appendChild(settingsBackBtn);

const settingsLink = document.createElement("a");
settingsLink.className = __obfClassList("eds-settings-link");
settingsLink.href = "https://console.groq.com/keys";
settingsLink.target = "_blank";
settingsLink.rel = "noreferrer noopener";
settingsLink.textContent = "Groq key";
settingsFooter.appendChild(settingsLink);


const __chibiSprites = {
    idle: ['id1_1.png', 'id2_1.png'],
    walk: ['walk1.png', 'walk2.png', 'walk3.png'],
    drag: ['drag1.png', 'drag2.png', 'drag3.png', 'drag4.png', 'drag5.png', 'drag6.png'],
    climb: ['climb1.png', 'climb2.png', 'climb3.png'],
    fall: ['fall1.png', 'fall2.png', 'fall3.png', 'fall4.png', 'fall5.png'],
    special: ['sp1_1.png', 'sp1_2.png', 'sp1_3.png', 'sp1_4.png'],
    special2: ['sp2_1.png', 'sp2_2.png', 'sp2_3.png'],
    special3: ['sp3_1.png', 'sp3_2.png', 'sp3_3.png', 'sp3_4.png', 'sp3_5.png'],
};
let __chibiState = 'idle';
let __chibiFrame = 0;
let __chibiTimer = null;
let __chibiVisible = false;
let __chibiCurrentBlobUrl = null;

const chibi = document.createElement("div");
chibi.className = __obfClassList("eds-chibi");
chibi.style.display = "none";
const chibiImg = document.createElement("img");
chibiImg.alt = "Klee";
chibiImg.draggable = false;
chibi.appendChild(chibiImg);
__shadow.appendChild(chibi);

let __chibiDirection = 1; // 1 = face left (default), -1 = face right
let __chibiLastX = 0;
let __chibiIdleWalkTimer = null;

function _chibiSetDirection(dir) {
    __chibiDirection = dir;
    chibiImg.style.transform = dir === -1 ? 'scaleX(-1)' : 'scaleX(1)';
}

async function _setChibiImage(file) {
    try {
        const resp = await fetch(chrome.runtime.getURL('assets/klee/' + file));
        if (!resp.ok) return;
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        if (__chibiCurrentBlobUrl) URL.revokeObjectURL(__chibiCurrentBlobUrl);
        __chibiCurrentBlobUrl = url;
        chibiImg.src = url;
    } catch (_) { }
}

function _chibiSetSprite(file) {
    void _setChibiImage(file);
}

void _setChibiImage('id1_1.png');

function _chibiAnimate() {
    const sprites = __chibiSprites[__chibiState];
    if (!sprites || sprites.length === 0) return;

    // For 'special' (sitting on bomb) and 'special3' (explosion), we want to hold the very last frame,
    // as seen in the original characters.json loop_end_only logic.
    const isLoopEndOnly = (__chibiState === 'special' || __chibiState === 'special3');

    if (isLoopEndOnly && __chibiFrame === sprites.length - 1) {
        // Hold the last frame, don't advance
    } else {
        __chibiFrame = (__chibiFrame + 1) % sprites.length;
    }

    _chibiSetSprite(sprites[__chibiFrame]);
}

function _chibiStartAnimation() {
    if (__chibiTimer) clearInterval(__chibiTimer);
    __chibiFrame = 0;
    const fps = __chibiState === 'special' || __chibiState === 'special2' || __chibiState === 'special3'
        ? 200 : __chibiState === 'walk' || __chibiState === 'climb' ? 300
            : __chibiState === 'fall' ? 150 : __chibiState === 'drag' ? 180 : 600;
    __chibiTimer = setInterval(_chibiAnimate, fps);
}

function _chibiStopAnimation() {
    if (__chibiTimer) { clearInterval(__chibiTimer); __chibiTimer = null; }
}

function _chibiSetState(state) {
    if (__chibiState === state) return;
    __chibiState = state;
    __chibiFrame = 0;
    const sprites = __chibiSprites[state];
    if (sprites?.length) _chibiSetSprite(sprites[0]);
    _chibiStartAnimation();
}

function _showChibi() {
    if (__chibiVisible) return;
    _cancelPanelDrag();
    __chibiVisible = true;
    panel.style.display = "none";
    chibi.style.display = "";
    __removeObfClass(chibi, "eds-chibi--idle");
    __addObfClass(chibi, "eds-chibi--appear");
    setTimeout(() => {
        __removeObfClass(chibi, "eds-chibi--appear");
        __addObfClass(chibi, "eds-chibi--idle");
    }, 300);
    _chibiSetState('idle');
    _chibiStartAnimation();
    _chibiStartIdleWalk();
    try { chrome.storage.local.set({ eds_chibi: true }); } catch (_) { }
}

function _hideChibi() {
    if (!__chibiVisible) return;
    __chibiVisible = false;
    _chibiStopAnimation();
    _chibiStopIdleWalk();
    chibi.style.display = "none";
    __removeObfClass(chibi, "eds-chibi--idle", "eds-chibi--appear");
    panel.style.display = "";
    try { chrome.storage.local.set({ eds_chibi: false }); } catch (_) { }
}


let __panelAutoHidden = false;
function _cancelPanelDrag() {
    if (!isDragging) return;
    isDragging = false;
    panel.style.transition = "";
}

function _panelHideForDnD() {

    if (__panelAutoHidden || __chibiVisible) return;
    try {
        const panelRect = panel.getBoundingClientRect();
        if (!panelRect.width) return;
        const zones = document.querySelectorAll(
            '.dndZone, .dnd-target, .dnd-zone, cdk-drop-list, ' +
            '.prCLZ__regContainer, .prMT_T2T__sentence, .prFITB__fieldBlanck'
        );
        let overlaps = false;
        for (const zone of zones) {
            if (!isElementVisible(zone)) continue;
            const zr = zone.getBoundingClientRect();

            if (panelRect.left < zr.right + 20 && panelRect.right > zr.left - 20 &&
                panelRect.top < zr.bottom + 20 && panelRect.bottom > zr.top - 20) {
                overlaps = true;
                break;
            }
        }
        if (overlaps) {
            _cancelPanelDrag();
            __panelAutoHidden = true;
            _showChibi();
            _log('[EDX] Panel che zone DnD, tự động thu gọn');
        }
    } catch (_) {}
}

function _panelRestoreAfterDnD() {
    if (!__panelAutoHidden) return;
    __panelAutoHidden = false;
    if (__chibiVisible) {
        _hideChibi();
        _log('[EDX] Panel khôi phục sau DnD');
    }
}


minimizeBtn.onclick = () => _showChibi();


chibi.addEventListener("click", (e) => {
    if (e.detail >= 1 && !_chibiDragged) _hideChibi();
});


let _chibiDragging = false;
let _chibiDragged = false;
let _chibiDragOffX = 0, _chibiDragOffY = 0;

chibi.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    _chibiDragging = true;
    _chibiDragged = false;
    __chibiLastX = e.clientX;
    const rect = chibi.getBoundingClientRect();
    _chibiDragOffX = e.clientX - rect.left;
    _chibiDragOffY = e.clientY - rect.top;
    __removeObfClass(chibi, "eds-chibi--idle");
    _chibiSetState('drag');
    _chibiStopIdleWalk();
});

document.addEventListener("mousemove", (e) => {
    if (!_chibiDragging) return;
    _chibiDragged = true;
    const deltaX = e.clientX - __chibiLastX;
    if (Math.abs(deltaX) > 2) {
        _chibiSetDirection(deltaX > 0 ? -1 : 1);
        __chibiLastX = e.clientX;
    }
    let x = e.clientX - _chibiDragOffX;
    let y = e.clientY - _chibiDragOffY;
    x = Math.max(0, Math.min(x, window.innerWidth - 80));
    y = Math.max(0, Math.min(y, window.innerHeight - 80));
    chibi.style.left = x + "px";
    chibi.style.top = y + "px";
    chibi.style.right = "auto";
    chibi.style.bottom = "auto";
});

document.addEventListener("mouseup", () => {
    if (!_chibiDragging) return;
    _chibiDragging = false;
    // Play fall animation on drop, then return to idle
    if (_chibiDragged) {
        _chibiSetState('fall');
        setTimeout(() => {
            if (__chibiState === 'fall') {
                _chibiSetState('idle');
                __addObfClass(chibi, "eds-chibi--idle");
                _chibiStartIdleWalk();
            }
        }, 800);
    } else {
        _chibiSetState('idle');
        __addObfClass(chibi, "eds-chibi--idle");
        _chibiStartIdleWalk();
    }
    // Allow click event to fire first, then reset drag flag
    setTimeout(() => { _chibiDragged = false; }, 50);
});

// Celebration animation when answer filled successfully
function _chibiCelebrate() {
    if (!__chibiVisible) return;
    const specials = ['special', 'special2', 'special3'];
    const pick = specials[Math.floor(Math.random() * specials.length)];
    _chibiSetState(pick);
    setTimeout(() => {
        if (__chibiState === pick) _chibiSetState('idle');
    }, 1600);
}

function _chibiClimb() {
    if (!__chibiVisible) return;
    _chibiSetState('climb');
    setTimeout(() => {
        if (__chibiState === 'climb') _chibiSetState('idle');
    }, 1200);
}

function _chibiFall() {
    if (!__chibiVisible) return;
    _chibiSetState('fall');
    setTimeout(() => {
        if (__chibiState === 'fall') _chibiSetState('idle');
    }, 1000);
}

// Idle walk: periodically play walk or random special animation
function _chibiStartIdleWalk() {
    _chibiStopIdleWalk();
    const scheduleNext = () => {
        const nextDelay = 3000 + Math.random() * 5000;
        __chibiIdleWalkTimer = setTimeout(() => {
            if (!__chibiVisible || _chibiDragging || __chibiState !== 'idle') {
                scheduleNext();
                return;
            }

            const rand = Math.random();
            if (rand < 0.60) {
                // 60% chance to play a random special idle action (sniff, twirl, look around)
                const specials = ['special', 'special2', 'special3'];
                const pick = specials[Math.floor(Math.random() * specials.length)];
                __removeObfClass(chibi, 'eds-chibi--idle');
                _chibiSetState(pick);

                // Keep the special animation looping/held depending on type
                // 'special' (sitting on bomb) -> hold for 3-6 seconds
                // 'special2' (park bench) -> hold for 3-5 seconds
                // 'special3' (explosion) -> hold for 2-3 seconds
                let duration = 2000;
                if (pick === 'special') duration = 3000 + Math.random() * 3000;
                else if (pick === 'special2') duration = 3000 + Math.random() * 2000;
                else if (pick === 'special3') duration = 2000 + Math.random() * 1000;

                setTimeout(() => {
                    if (__chibiState === pick) {
                        _chibiSetState('idle');
                        __addObfClass(chibi, 'eds-chibi--idle');
                    }
                    scheduleNext();
                }, duration);
            } else {
                // 40% chance to walk
                const dir = Math.random() < 0.5 ? 1 : -1;
                _chibiSetDirection(dir);
                __removeObfClass(chibi, 'eds-chibi--idle');
                _chibiSetState('walk');
                const walkDuration = 1000 + Math.random() * 1000;
                const walkStepSize = dir === -1 ? 1.5 : -1.5;
                const walkInterval = setInterval(() => {
                    if (__chibiState !== 'walk' || !__chibiVisible) { clearInterval(walkInterval); return; }
                    const rect = chibi.getBoundingClientRect();
                    let newLeft = rect.left + walkStepSize;
                    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 80));
                    chibi.style.left = newLeft + 'px';
                    chibi.style.right = 'auto';
                }, 30);
                setTimeout(() => {
                    clearInterval(walkInterval);
                    if (__chibiState === 'walk') {
                        _chibiSetState('idle');
                        __addObfClass(chibi, 'eds-chibi--idle');
                    }
                    scheduleNext();
                }, walkDuration);
            }
        }, nextDelay);
    };
    scheduleNext();
}

function _chibiStopIdleWalk() {
    if (__chibiIdleWalkTimer) { clearTimeout(__chibiIdleWalkTimer); __chibiIdleWalkTimer = null; }
}


const ansBody = document.createElement("div");
ansBody.className = __obfClassList("eds-body"); frontFace.appendChild(ansBody);

const statusBar = document.createElement("div");
statusBar.className = __obfClassList("eds-status-bar"); statusBar.style.display = "none";
frontFace.appendChild(statusBar);

window.updateStatus = function(msg) {
    if (!msg) {
        statusBar.style.display = "none";
        statusBar.textContent = "";
        return;
    }
    statusBar.style.display = "block";
    statusBar.textContent = msg;
};

const footer = document.createElement("div");
footer.className = __obfClassList("eds-footer"); footer.style.display = "none"; frontFace.appendChild(footer);

const progressWrap = document.createElement("div");
progressWrap.className = __obfClassList("eds-progress-wrap");
const progressLabel = document.createElement("div");
progressLabel.className = __obfClassList("eds-progress-label");
const progressText = document.createElement("span");
const progressCount = document.createElement("span");
progressLabel.appendChild(progressText); progressLabel.appendChild(progressCount);
const progressTrack = document.createElement("div");
progressTrack.className = __obfClassList("eds-progress-track");
const progressFill = document.createElement("div");
progressFill.className = __obfClassList("eds-progress-fill");
progressTrack.appendChild(progressFill);
progressWrap.appendChild(progressLabel); progressWrap.appendChild(progressTrack);
frontFace.insertBefore(progressWrap, ansBody);

function setDndProgress(filled, total) {
    if (total === 0) { progressWrap.style.display = "none"; return; }
    progressWrap.style.display = "block";
    const pct = Math.round((filled / total) * 100);
    progressText.textContent = "Điền DnD";
    progressCount.textContent = `${filled}/${total}`;
    progressFill.style.width = pct + "%";
    if (filled >= total) {
        __addObfClass(progressFill, "eds-progress-fill--done");
        setTimeout(() => { progressWrap.style.display = "none"; __removeObfClass(progressFill, "eds-progress-fill--done"); }, 1800);
    } else {
        __removeObfClass(progressFill, "eds-progress-fill--done");
    }
}

let __settingsHintTimer = null;

function syncPanelSettingsFace(settings) {
    const normalized = typeof normalizeEdxSettings === 'function'
        ? normalizeEdxSettings(settings)
        : (settings || {});
    apiKeyInput.value = normalized?.ai?.keys?.groq || '';
}

function openPanelSettings() {
    if (__chibiVisible) _hideChibi();
    __addObfClass(panelCard, 'eds-card--flipped');
    setTimeout(() => {
        try { apiKeyInput.focus({ preventScroll: true }); } catch (_) { }
    }, 180);
}

function closePanelSettings() {
    __removeObfClass(panelCard, 'eds-card--flipped');
}

function showSettingsSavedHint(text = 'Đã lưu') {
    settingsSavedHint.textContent = text;
    settingsSavedHint.style.display = 'block';
    clearTimeout(__settingsHintTimer);
    __settingsHintTimer = setTimeout(() => {
        settingsSavedHint.style.display = 'none';
    }, 2200);
}

window.__EDX_PANEL_SETTINGS_API__ = {
    open: openPanelSettings,
    close: closePanelSettings,
    sync: syncPanelSettingsFace,
    showSavedHint: showSettingsSavedHint
};

settingsBtn.onclick = () => openPanelSettings();
settingsBackBtn.onclick = () => closePanelSettings();
apiKeyToggleBtn.onclick = () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    apiKeyToggleBtn.replaceChildren(isPassword ? iconEyeOff() : iconEye());
};
settingsSaveBtn.onclick = async () => {
    settingsSaveBtn.disabled = true;
    settingsSaveBtn.textContent = 'Đang lưu...';
    try {
        const current = typeof getEdxSettings === 'function'
            ? getEdxSettings()
            : {
                ai: { provider: 'groq', keys: { groq: '' } },
                writing: { enabled: true, insertMode: 'human_type', autoSaveDraft: false, autoSubmit: false }
            };
        current.ai.keys.groq = apiKeyInput.value || '';
        const saved = typeof saveEdxSettings === 'function'
            ? await saveEdxSettings(current)
            : current;
        syncPanelSettingsFace(saved);
        showSettingsSavedHint('Đã lưu');
    } catch (_) {
        showSettingsSavedHint('Lưu thất bại');
    } finally {
        settingsSaveBtn.disabled = false;
        settingsSaveBtn.textContent = 'Lưu cài đặt';
    }
};

function _resetPanelPosition() {
    panel.style.left = ""; panel.style.top = ""; panel.style.right = "";
    __pinned = true;
    panel.style.resize = "none";
    pinBtn.replaceChildren(iconPin());
    applyToggleState(pinBtn, __pinned, "Đang ghim", "Đang thả", false);
    try { chrome.storage.local.remove("eds_pos"); } catch (_) { }
}

function _panelCanStartDrag(target) {
    if (!target) return false;
    return !target.closest(__obfSelector(
        '.eds-btn, .eds-badge, .eds-mode-pill, .eds-mode-seg, .eds-settings-input, .eds-settings-link, .eds-settings-back'
    )) && !target.closest('input, textarea, button, a, select, label');
}

function _startPanelDrag(e) {
    if (__pinned) return;
    if (__dndAutomating || __dndInProgress) return;
    if (!_panelCanStartDrag(e.target)) return;
    e.preventDefault(); isDragging = true;
    const rect = panel.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left; dragOffsetY = e.clientY - rect.top;
    panel.style.transition = "none";
}

dragHandle.addEventListener("mousedown", _startPanelDrag);
header.addEventListener("mousedown", _startPanelDrag);
settingsHeader.addEventListener("mousedown", _startPanelDrag);
document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    let x = e.clientX - dragOffsetX, y = e.clientY - dragOffsetY;
    const maxX = window.innerWidth - panel.offsetWidth;
    const maxY = window.innerHeight - panel.offsetHeight;
    x = Math.max(0, Math.min(x, maxX)); y = Math.max(0, Math.min(y, maxY));
    panel.style.left = x + "px"; panel.style.top = y + "px"; panel.style.right = "auto";
    e.preventDefault();
});
document.addEventListener("mouseup", () => {
    if (isDragging) {
        isDragging = false; panel.style.transition = "";
        const rect = panel.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.left, window.innerWidth - rect.width));
        const y = Math.max(0, Math.min(rect.top, window.innerHeight - rect.height));
        panel.style.left = x + "px"; panel.style.top = y + "px";
        try { chrome.storage.local.set({ eds_pos: { left: panel.style.left, top: panel.style.top } }); } catch (_) { }
    }
});

try {
    chrome.storage.local.get(["eds_pos", "eds_bypass_enabled", "eds_auto_next"], (result) => {
        const saved = result?.eds_pos;
        if (saved?.left && saved?.top) {
            // Validate saved position is within viewport
            const x = parseInt(saved.left, 10);
            const y = parseInt(saved.top, 10);
            if (!isNaN(x) && !isNaN(y) && x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight) {
                __pinned = false;
                panel.style.resize = "both";
                panel.style.left = saved.left; panel.style.top = saved.top; panel.style.right = "auto";
                pinBtn.replaceChildren(iconPinOff()); pinBtn.title = "\u0110ang th\u1ea3";
                applyToggleState(pinBtn, __pinned, "Đang ghim", "Đang thả", false);
            } else {

                try { chrome.storage.local.remove("eds_pos"); } catch (_) { }
            }
        }

        if (typeof result?.eds_bypass_enabled === "boolean") {
            __bypassEnabled = result.eds_bypass_enabled;
            applyBypassVisualState();
        }

        if (result?.eds_auto_next && __autoNextModes.some(m => m.key === result.eds_auto_next)) {
            __autoNext = result.eds_auto_next;
            _updateAutoNextUI();
        }
    });
} catch (_) { }

if (typeof loadEdxSettings === 'function') {
    loadEdxSettings().then(syncPanelSettingsFace).catch(() => { });
}

const __qtypeLabels = {
    mcq: "MCQ",
    checkbox: "Multi",
    ddl: "DDL",
    dnd: "DnD",
    dnd_sequence: "Order",
    dnd_classification: "Classify",
    text: "Fill",
    card_match: "Match",
    sentence_fit: "SenFit",
    writing: "Writing",
    unknown: "--"
};
const __statusMessages = STATUS_MESSAGES;

function updateTypeBadge(type) {
    const labels = __qtypeLabels;
    typeBadge.textContent = labels[type] || type;
    typeBadge.setAttribute("data-qtype", type || "unknown");
    typeBadge.style.background = "";
    typeBadge.style.color = "";
}

function updateAnswerDisplay(errMsg) {
    if (!ansBody) return;
    if (window.updateStatus) updateStatus("");
    ansBody.innerHTML = "";
    if (errMsg) {
        if (__statusMessages.has(errMsg)) {
            const statusDiv = document.createElement("div");
            statusDiv.className = __obfClassList("eds-loading");
            const spinner = document.createElement("div");
            spinner.className = __obfClassList("eds-spinner");
            const text = document.createElement("span");
            text.textContent = errMsg;
            statusDiv.appendChild(spinner);
            statusDiv.appendChild(text);
            ansBody.appendChild(statusDiv);
            return;
        }
        const errDiv = document.createElement("div");
        errDiv.className = __obfClassList("eds-empty eds-empty--error");

        const errIcon = makeSvg("0 0 24 24",
            ["circle", { cx: "12", cy: "12", r: "10" }],
            ["path", { d: "m15 9-6 6M9 9l6 6" }]);
        errDiv.appendChild(errIcon);
        const errTxt = document.createElement("span");
        errTxt.textContent = errMsg;
        errDiv.appendChild(errTxt);
        ansBody.appendChild(errDiv); return;
    }

    if (__fetching && !__ans.length && !__allAns.length) {
        const loading = document.createElement("div");
        loading.className = __obfClassList("eds-loading");
        const spinner = document.createElement("div");
        spinner.className = __obfClassList("eds-spinner");
        const text = document.createElement("span");
        text.textContent = UI_TEXT.status.loadingAnswers;
        loading.appendChild(spinner);
        loading.appendChild(text);
        ansBody.appendChild(loading);
        return;
    }

    const copyText = (txt) => {
        navigator.clipboard?.writeText(txt).catch(() => { });
    };

    if (__ans.length) {
        const isDnd = __qType === 'dnd' || __qType === 'dnd_sequence' || __qType === 'dnd_classification';
        const isMatchColumns = !!(
            queryVisible('ed-la-matching-text-to-text, .prMT_T2T, [class*="matching"], [class*="matchColumn"]') ||
            queryVisible('.prMT_T2T__regContainer, .prMT_T2T__wordsBankWrapper')
        );
        const dragTexts = queryVisibleAll(".dnditem").map(el => norm(el.innerText || el.textContent));


        const allAnsAreBankItems = isDnd && dragTexts.length > 0 &&
            __ans.every(a => dragTexts.some(dt => dt.includes(norm(a)) || norm(a).includes(dt)));

        const categories = [];
        // Prefer __dndCategories (parsed from API structure with fuzzy matching)
        if (__dndCategories && __dndCategories.length >= 2) {
            __dndCategories.forEach(cat => {
                categories.push({ name: cat.catName, items: [...cat.allItems] });
            });
        } else if (dragTexts.length > 0 && !isMatchColumns && !allAnsAreBankItems) {
            let currentCat = null;
            [...__ans].forEach(a => {
                const normA = norm(a);
                const isAnswerDrag = dragTexts.some(dt => dt.includes(normA) || normA.includes(dt));
                if (!isAnswerDrag) {
                    currentCat = { name: a, items: [] };
                    categories.push(currentCat);
                } else if (currentCat) {
                    currentCat.items.push(a);
                } else {
                    if (!categories.length) categories.push({ name: "Answers", items: [] });
                    categories[0].items.push(a);
                }
            });
        }
        if (categories.length < 2) {
            const hasExplicitTF = isDnd && __ans.some(a => /^true$/i.test(a.trim())) && __ans.some(a => /^false$/i.test(a.trim()));
            if (hasExplicitTF) {
                categories.length = 0;
                let currentGroup = null;
                __ans.forEach(a => {
                    const t = a.trim();
                    if (/^true$/i.test(t)) { currentGroup = "True"; categories.push({ name: "True", items: [] }); return; }
                    if (/^false$/i.test(t)) { currentGroup = "False"; categories.push({ name: "False", items: [] }); return; }
                    const target = categories.find(c => c.name === currentGroup) || categories[0];
                    if (target) target.items.push(a);
                });
            }
        }

        if (allAnsAreBankItems) {

            const row = document.createElement("div"); row.className = __obfClassList("eds-section");
            const lbl = document.createElement("div"); lbl.className = __obfClassList("eds-label");
            lbl.textContent = `Kéo thả - ${__ans.length} đáp án`;
            row.appendChild(lbl);
            __ans.forEach(a => {
                const chip = document.createElement("span");
                chip.className = __obfClassList("eds-chip eds-chip--correct");
                chip.textContent = a;
                chip.title = "Click để copy";
                chip.onclick = () => copyText(a);
                row.appendChild(chip);
            });
            ansBody.appendChild(row);
        } else if (categories.length > 1) {
            const row = document.createElement("div");
            row.className = __obfClassList("eds-section");
            const lbl = document.createElement("div");
            lbl.className = __obfClassList("eds-label");
            lbl.textContent = `Phân loại (${categories.reduce((s, c) => s + c.items.length, 0)})`;
            row.appendChild(lbl);

            const grid = document.createElement("div");
            grid.className = __obfClassList("eds-cat-grid");
            grid.style.gridTemplateColumns = `repeat(${categories.length}, minmax(0, 1fr))`;

            categories.forEach((cat) => {
                const col = document.createElement("div");
                col.className = __obfClassList("eds-cat-col");
                const lowerName = cat.name.toLowerCase();
                if (lowerName.includes("true") || lowerName.includes("advantage") || lowerName.includes("agree")) {
                    __addObfClass(col, "eds-cat-col--positive");
                } else if (lowerName.includes("false") || lowerName.includes("disadvantage") || lowerName.includes("disagree")) {
                    __addObfClass(col, "eds-cat-col--negative");
                }

                const hdr = document.createElement("div");
                hdr.className = __obfClassList("eds-cat-hdr");
                hdr.textContent = cat.name;
                col.appendChild(hdr);

                cat.items.forEach(txt => {
                    const item = document.createElement("div");
                    item.className = __obfClassList("eds-cat-item");
                    item.textContent = txt;
                    item.title = "Click để copy";
                    item.onclick = () => copyText(txt);
                    col.appendChild(item);
                });
                grid.appendChild(col);
            });

            row.appendChild(grid);
            ansBody.appendChild(row);
        } else if (isMatchColumns) {
            const row = document.createElement("div");
            row.className = __obfClassList("eds-section");
            const lbl = document.createElement("div");
            lbl.className = __obfClassList("eds-label");
            const zones = getDndZones();
            const { zoneDefs, defsSet, filteredx, optionNorms } = getMatchAnswerPool(zones);
            lbl.textContent = `Đáp án cột B (${filteredx.length})`;
            row.appendChild(lbl);

            const table = document.createElement("div");
            table.className = __obfClassList("eds-match-table");
            const headerRow = document.createElement("div");
            headerRow.className = __obfClassList("eds-match-header-row");
            const th1 = document.createElement("span");
            th1.textContent = "Definition";
            const th2 = document.createElement("span");
            th2.textContent = "Word";
            headerRow.appendChild(th1);
            headerRow.appendChild(th2);
            table.appendChild(headerRow);

            const validPairs = [];
            const usedRenderAnswers = new Set();
            for (let i = 0; i < zones.length; i++) {
                const zone = zones[i];
                let ansText = resolveZoneAnswer(zone, -1);
                const mappedNorm = norm(ansText);
                if (!ansText || defsSet.has(mappedNorm) || (optionNorms.size && !optionNorms.has(mappedNorm))) {
                    ansText = "";
                }
                if (!ansText) {
                    const innerItem = zone.querySelector(".dnditem, .show-answer-text");
                    if (innerItem) ansText = innerItem.innerText?.trim() || "";
                    else {
                        const alt = filteredx.find((a) => {
                            const n = norm(a);
                            return n && !usedRenderAnswers.has(n);
                        });
                        if (alt) ansText = alt;
                    }
                }
                if (ansText) {
                    const ansNorm = norm(ansText);
                    if (usedRenderAnswers.has(ansNorm)) {
                        const alt = filteredx.find((a) => {
                            const n = norm(a);
                            return n && !usedRenderAnswers.has(n);
                        });
                        if (alt) ansText = alt;
                    }
                    usedRenderAnswers.add(norm(ansText));
                    validPairs.push({ def: zoneDefs[i], ans: ansText });
                }
            }

            validPairs.forEach(pair => {
                const pairRow = document.createElement("div");
                pairRow.className = __obfClassList("eds-match-row");
                const dItem = document.createElement("div");
                dItem.className = __obfClassList("eds-match-def");
                dItem.textContent = pair.def;
                dItem.title = pair.def;

                const wItem = document.createElement("div");
                wItem.className = __obfClassList("eds-match-word");
                wItem.textContent = pair.ans;
                wItem.title = "Click để copy";
                wItem.onclick = () => {
                    copyText(pair.ans);
                    __addObfClass(wItem, "eds-match-word--flash");
                    setTimeout(() => __removeObfClass(wItem, "eds-match-word--flash"), 450);
                };

                pairRow.appendChild(dItem);
                pairRow.appendChild(wItem);
                table.appendChild(pairRow);
            });

            row.appendChild(table);
            ansBody.appendChild(row);
        } else if (__qType === 'card_match' && __cardPairs?.pairLabels?.length) {

            const row = document.createElement("div"); row.className = __obfClassList("eds-section");
            const lbl = document.createElement("div"); lbl.className = __obfClassList("eds-label");
            const cardIcon = makeSvg("0 0 24 24",
                ["rect", { x: "2", y: "3", width: "10", height: "14", rx: "1.5" }],
                ["rect", { x: "12", y: "7", width: "10", height: "14", rx: "1.5" }]);
            cardIcon.style.cssText = "width:12px;height:12px;vertical-align:-1px;margin-right:4px;display:inline;";
            lbl.appendChild(cardIcon);
            lbl.appendChild(document.createTextNode(` Gh\u00e9p th\u1ebb \u2014 ${__cardPairs.numPairs} c\u1eb7p`));
            row.appendChild(lbl);

            // Status area
            const statusArea = document.createElement("div");
            statusArea.id = "eds-card-status";
            statusArea.className = __obfClassList("eds-card-status");
            statusArea.textContent = "S\u1eb5n s\u00e0ng";
            row.appendChild(statusArea);

            const table = document.createElement("div"); table.className = __obfClassList("eds-match-table eds-match-table--cards");
            const headerRow = document.createElement("div"); headerRow.className = __obfClassList("eds-match-header-row");
            const th1 = document.createElement("span"); th1.textContent = "#";
            const th2 = document.createElement("span"); th2.textContent = "T\u1eeb c\u1ea7n gh\u00e9p";
            const th3 = document.createElement("span"); th3.textContent = "V\u1ecb tr\u00ed th\u1ebb";
            headerRow.appendChild(th1); headerRow.appendChild(th2); headerRow.appendChild(th3);
            table.appendChild(headerRow);

            __cardPairs.pairLabels.forEach((pair, idx) => {
                const pairRow = document.createElement("div"); pairRow.className = __obfClassList("eds-match-row");
                const numItem = document.createElement("div"); numItem.className = __obfClassList("eds-match-def");
                numItem.textContent = String(idx + 1);
                const wordItem = document.createElement("div"); wordItem.className = __obfClassList("eds-match-word");
                wordItem.textContent = pair.label;
                wordItem.title = "Click \u0111\u1ec3 copy";
                wordItem.onclick = () => {
                    copyText(pair.label);
                    __addObfClass(wordItem, "eds-match-word--flash");
                    setTimeout(() => __removeObfClass(wordItem, "eds-match-word--flash"), 450);
                };
                const mapItem = document.createElement("div"); mapItem.className = __obfClassList("eds-match-map");
                mapItem.setAttribute("data-pair-idx", String(idx));
                mapItem.textContent = "...";
                pairRow.appendChild(numItem); pairRow.appendChild(wordItem); pairRow.appendChild(mapItem);
                table.appendChild(pairRow);
            });

            row.appendChild(table); ansBody.appendChild(row);
            setTimeout(() => { overlayCardBadges().catch(e => _warn('[EDX CardBadge] Error:', e)); }, 600);
        } else {
            const row = document.createElement("div"); row.className = __obfClassList("eds-section");
            const lbl = document.createElement("div"); lbl.className = __obfClassList("eds-label"); lbl.textContent = `Đáp án đúng (${__ans.length})`; row.appendChild(lbl);
            const chips = document.createElement("div"); chips.className = __obfClassList("eds-chips");
            __ans.forEach(a => {
                const chip = document.createElement("span"); chip.className = __obfClassList("eds-chip eds-chip--correct");
                chip.textContent = a; chip.title = "Click để copy";
                chip.onclick = () => {
                    copyText(a);
                    __addObfClass(chip, "eds-chip--copied");
                    setTimeout(() => __removeObfClass(chip, "eds-chip--copied"), 700);
                };
                chips.appendChild(chip);
            });
            row.appendChild(chips); ansBody.appendChild(row);
        }
    }
    const ansSet = new Set(__ans.map(norm));
    const others = __allAns.filter(a => !ansSet.has(norm(a)));

    if (others.length && __qType !== 'card_match' && !__cardPairs?.pairLabels?.length) {
        const row = document.createElement("div"); row.className = __obfClassList("eds-section");
        const lbl2 = document.createElement("div"); lbl2.className = __obfClassList("eds-label eds-label--muted"); lbl2.textContent = `Biến thể (${others.length})`; row.appendChild(lbl2);
        const chips = document.createElement("div"); chips.className = __obfClassList("eds-chips");
        others.forEach(a => { const chip = document.createElement("span"); chip.className = __obfClassList("eds-chip eds-chip--wrong"); chip.textContent = a; chips.appendChild(chip); });
        row.appendChild(chips); ansBody.appendChild(row);
    }
    if (!__ans.length && !others.length) {
        const empty = document.createElement("div");
        empty.className = __obfClassList("eds-empty");
        /* refresh icon hint */
        empty.appendChild(iconRefresh());
        const emptyTxt = document.createElement("span");
        emptyTxt.textContent = "Nhấn Refresh để lấy đáp án";
        empty.appendChild(emptyTxt);
        ansBody.appendChild(empty);
    }
}
updateAnswerDisplay();

