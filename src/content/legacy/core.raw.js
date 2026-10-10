// ========================= STEALTH MODE =========================
(function() {
let __edsIntervalBypass = null;
let __edsIntervalPageChange = null;
let __edsIntervalActivityModal = null;
let __speakingInProgress = false;
let __videoPlaying = false;
let __userAutoNext = 'disable';
let __spaTimer = null;
const __DEBUG = (() => {
    try { return localStorage.getItem('edx_debug') === '1'; } catch (_) { return false; }
})();  // set localStorage.edx_debug = '1' when debugging
const _log = (...a) => { if (__DEBUG) console.log(...a); };
const _warn = (...a) => { if (__DEBUG) console.warn(...a); };
const {
    __obfEvent, __bridgeToken, withBridgeDetail, isValidBridgeEvent, makeBridgeRequestId,
    __bridgeEventName, __dispatchBridgeEvent, __addBridgeListener, __removeBridgeListener,
    requestCapturedPayloads, requestScopeMining, pageSyncDrop
} = window.edxBridge;
const _trace = (stage, details) => {
    if (!__DEBUG) return;
    try {
        console.log(`[EDX TRACE] ${stage}`, details || {});
    } catch (_) {
        console.log(`[EDX TRACE] ${stage}`);
    }
};
const __obfClassToken = (token) => {
    if (typeof token !== 'string' || !token) return token;
    if (token.startsWith('eds-') || token === 'edx' || token === 'edx-speaking-status') {
        return (typeof window._O === 'function' ? window._O(token) : token);
    }
    return token;
};
const __obfClassList = (classes) => {
    if (typeof classes !== 'string' || !classes) return classes;
    return classes.split(/\s+/).map(__obfClassToken).join(' ');
};
const __obfSelector = (selector) => {
    if (typeof selector !== 'string' || !selector) return selector;
    return selector.replace(/\.((?:eds-[a-zA-Z0-9_-]+)|edx|edx-speaking-status)\b/g, (_, cls) => `.${__obfClassToken(cls)}`);
};
const __addObfClass = (el, ...tokens) => {
    if (!el?.classList) return;
    el.classList.add(...tokens.map(__obfClassToken).filter(Boolean));
};
const __removeObfClass = (el, ...tokens) => {
    if (!el?.classList) return;
    el.classList.remove(...tokens.map(__obfClassToken).filter(Boolean));
};
const __toggleObfClass = (el, token, force) => {
    if (!el?.classList) return false;
    const nextToken = __obfClassToken(token);
    return arguments.length > 2
        ? el.classList.toggle(nextToken, force)
        : el.classList.toggle(nextToken);
};
const __containsObfClass = (el, token) => !!el?.classList?.contains(__obfClassToken(token));
let __bypassEnabled = true;
const MODE_WATCH = 'disable';
const MODE_RUN = 'off';
const MODE_AUTO = 'full';

const UI_TEXT = Object.freeze({
    status: {
        loadingAnswers: 'Đang tải đáp án...',
        waitingNext: 'Đang chờ câu mới...',
        skippingPage: 'Đang bỏ qua trang...',
        waitingFreshQuestion: 'Đang chờ câu hỏi mới...',
        reusingStaleUrl: 'Đang dùng lại URL cũ để tải...',
        checkingPage: 'Đang kiểm tra trang...',
        retryingAnswers: 'Đang lấy lại đáp án...',
        changingPage: 'Đang chuyển trang...',
        playingVideo: 'Đang phát video...',
        playingAudio: 'Đang phát audio...',
        waitingMedia: 'Đang chờ media chạy...',
        dndFilling: 'Đang kéo thả đáp án...',
        dndDone: 'Kéo thả xong, đang chuyển câu...',
        submittingTest: 'Đang nộp bài...',
        speakingPreparing: 'Speaking: đang chuẩn bị...',
        speakingChoosingSentence: 'Đang chọn câu để ghi âm...',
        speakingWaitingStart: 'Đang chờ nút Start...',
        speakingStarting: 'Đang bắt đầu ghi âm...',
        speakingRecording: 'Đang ghi âm...',
        speakingRecorded: 'Đã ghi âm xong',
        speakingManual: 'Speaking chưa hoàn tất. Vui lòng nói rồi bấm Next thủ công.',
        speakingStartMissing: 'Không thấy nút Start. Vui lòng làm thủ công hoặc bấm Next.',
        speakingError: 'Lỗi xử lý speaking',
    },
    mode: {
        watch: { label: 'WATCH', desc: 'Chỉ hiển thị đáp án, không tự điền, không tự chuyển' },
        run: { label: 'RUN', desc: 'Tự động điền đáp án, nhưng không tự chuyển câu' },
        auto: { label: 'AUTO', desc: 'Tự động điền và tự chuyển câu' },
        stopped: 'Đã dừng tự động',
        autoToast: 'Chế độ AUTO - câu sẽ tự chuyển sau khi điền xong',
    },
    actions: {
        refreshAnswers: 'Lấy lại đáp án',
        pinPanel: 'Ghim/thả panel',
        minimizePanel: 'Thu gọn panel',
    },
    recovery: {
        refetchAnswers: 'Lấy lại đáp án',
        pressF5: 'F5 để tải lại',
        unsupportedManual: 'Dạng bài này cần làm thủ công. Hoàn thiện rồi bấm Space để tiếp tục.',
    }
});

const STATUS_MESSAGES = new Set(Object.values(UI_TEXT.status));

const isWatchMode = () => __autoNext === MODE_WATCH;
const isRunMode = () => __autoNext === MODE_RUN;
const isAutoMode = () => __autoNext === MODE_AUTO;
const shouldAutoFill = () => !isWatchMode();
const shouldAutoAdvance = () => isAutoMode();

function isEditableNode(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName?.toUpperCase();
    if (tag === "TEXTAREA") return true;
    if (tag !== "INPUT") return false;
    const type = (el.type || "text").toLowerCase();
    return !["checkbox", "radio", "button", "submit", "range", "color", "file", "image", "reset", "hidden"].includes(type);
}

function setElementValue(el, val) {
    try {
        if (!el) return false;
        if (el.isContentEditable) {
            el.textContent = val;
            return true;
        }
        if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
            let setOk = false;
            try {
                const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
                const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
                if (setter) {
                    setter.call(el, val);
                    setOk = true;
                }
            } catch (_) { }
            if (!setOk) el.value = val;
            return true;
        }
        return false;
    } catch (_) { return false; }
}

function insertTextIntoEditable(el, text) {
    try {
        if (!el || !text) return false;
        if (el.isContentEditable) {
            try {
                document.execCommand("insertText", false, text);
                return true;
            } catch (_) {
                el.textContent = (el.textContent || "") + text;
                return true;
            }
        }
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            const start = Number.isInteger(el.selectionStart) ? el.selectionStart : (el.value || "").length;
            const end = Number.isInteger(el.selectionEnd) ? el.selectionEnd : start;
            const oldVal = el.value || "";
            const nextVal = oldVal.slice(0, start) + text + oldVal.slice(end);
            if (!setElementValue(el, nextVal)) return false;
            const cursor = start + text.length;
            try { el.setSelectionRange(cursor, cursor); } catch (_) { }
            return true;
        }
        return false;
    } catch (_) { return false; }
}

async function typeTextIntoEditable(el, text, baseDelay = 50) {
    if (!el || !text) return false;
    const chars = text.split('');
    const randomDelay = () => baseDelay + Math.random() * 40;
    __typingInProgress++;

    try {
        try {
            if (el.focus) el.focus({ preventScroll: true });
            else el.dispatchEvent(new Event('focus', { bubbles: true }));
        } catch (_) { }

        let startPos = 0;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            startPos = el.selectionStart ?? (el.value || '').length;
        }

        for (let i = 0; i < chars.length; i++) {
            const char = chars[i];
            const keyCode = char.length === 1 ? char.toUpperCase().charCodeAt(0) : 0;
            const opts = { bubbles: true, cancelable: true };

            try {
                el.dispatchEvent(new KeyboardEvent('keydown', { ...opts, key: char, code: keyCode ? `Key${char.toUpperCase()}` : '' }));
                el.dispatchEvent(new KeyboardEvent('keypress', { ...opts, key: char, charCode: char.charCodeAt(0) || 0 }));
            } catch (_) { }

            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                const currentVal = el.value || '';
                const newVal = currentVal.slice(0, startPos + i) + char + currentVal.slice(startPos + i);
                if (!setElementValue(el, newVal)) return false;
                const newCursor = startPos + i + 1;
                try { el.setSelectionRange(newCursor, newCursor); } catch (_) { }
            } else {
                if (!insertTextIntoEditable(el, char)) {
                    el.textContent = (el.textContent || '') + char;
                }
            }

            try {
                el.dispatchEvent(new InputEvent('input', { ...opts, data: char, inputType: 'insertText' }));
            } catch (_) {
                el.dispatchEvent(new Event('input', opts));
            }
            try {
                el.dispatchEvent(new KeyboardEvent('keyup', { ...opts, key: char }));
            } catch (_) { }

            await delay(randomDelay());
        }

        el.dispatchEvent(new Event('change', { bubbles: true }));
        if (el.blur) el.blur();
        else el.dispatchEvent(new Event('blur', { bubbles: true }));

        syncInputState(el, (el.value || el.textContent || '').trim(), "autofill");
        triggerAngularSync(el);
        return true;
    } finally {
        __typingInProgress = Math.max(0, __typingInProgress - 1);
    }
}

function syncInputState(el, val, source) {
    try {
        if (!el) return;
        const opts = { bubbles: true, cancelable: true };
        if (val?.length > 0) {
            el.dispatchEvent(new KeyboardEvent("keydown", { ...opts, key: val[0] }));
        }
        try {
            el.dispatchEvent(new InputEvent("beforeinput", {
                bubbles: true,
                cancelable: true,
                inputType: source === "paste" ? "insertFromPaste" : "insertText",
                data: val || ""
            }));
        } catch (_) { }
        el.dispatchEvent(new Event("input", opts));
        if (val?.length > 0) {
            el.dispatchEvent(new KeyboardEvent("keyup", { ...opts, key: val[val.length - 1] }));
        }
        el.dispatchEvent(new Event("change", opts));
        el.dispatchEvent(new Event("blur", opts));

        const tag = '__edx_input_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        el.setAttribute('data-edx-input-sync', tag);
        __dispatchBridgeEvent(document, '__edx_sync_input', {
            detail: { tag, value: val || "", source: source || "manual" }
        });
        setTimeout(() => {
            try { el.removeAttribute('data-edx-input-sync'); } catch (_) { }
        }, 1400);
    } catch (_) { }
}

function commitAnswerState() {
    try {
        __dispatchBridgeEvent(document, '__edx_force_commit', {
            detail: { reason: 'pre-submit' }
        });
    } catch (_) { }
}

function injectWritingText(text) {
    return new Promise((resolve) => {
        __dispatchBridgeEvent(document, '__edx_writing_insert_text', { detail: { text } });

        setTimeout(() => {
            try {
                const tmce = window.tinymce || window.tinyMCE;
                const iframe = document.querySelector('iframe[id$="_ifr"], iframe[title*="Rich Text" i]');
                const body = iframe?.contentDocument?.body;
                const hasContent = (body?.innerText?.trim().length > 0) ||
                    (tmce?.activeEditor?.getContent()?.length > 0);
                resolve(hasContent);
            } catch (_) {
                resolve(true);
            }
        }, 800);
    });
}

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

// ========================= GLOBALS =========================
const _panelId = "eds_float";
let __apiZoneMap = new Map();
let __dndCategories = null;
let __autoSkipActive = false;
let __cardPairs = null;
let __currentRequestId = 0;
let __abortController = null;
let __lastFetchedUrl = null;

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

// ========================= PAGE-CONTEXT DATA SOURCES =========================
// Bridge functions extracted to js/runtime/bridge.js
// Build answers from scope mining result.
// Kept in content.js because it still depends on local parser helpers/state.
function buildAnswersFromScope(scopeData, qType, signals) {
    if (!scopeData) return null;
    const correct = scopeData.correct || [];
    const all = scopeData.all || [];
    if (!all.length) return null;
    if (correct.length > 0) {
        const optionSet = signals?.optionTexts?.length ? new Set(signals.optionTexts) : null;
        const validCorrect = optionSet
            ? correct.filter(t => optionSet.has(norm(t)))
            : correct;
        if (validCorrect.length > 0) {
            return {
                ans: validCorrect,
                allAns: all,
                apiZoneMap: new Map(),
                ansQs: [],
                questionTexts: [],
                dndCategories: null,
                _source: 'scope-direct',
            };
        }
    }
    if (scopeData.rawItems?.length) {
        const fakeQuestion = {
            al: [{
                a: scopeData.rawItems.map(item => {
                    const copy = { ...item };
                    if (!('txt' in copy) && ('text' in copy)) copy.txt = copy.text;
                    if (!('txt' in copy) && ('t' in copy)) copy.txt = copy.t;
                    return copy;
                })
            }]
        };
        const fakeJson = { i: { q: [fakeQuestion] } };
        const parsed = parseAnswerPayload(fakeJson, qType, false);
        if (parsed.ans.length > 0) {
            parsed._source = 'scope-rawItems';
            return parsed;
        }
    }
    return null;
}

function isContextValid() {
    try { return !!chrome.runtime?.id; } catch (_) { return false; }
}

// ========================= DATA =========================
let __ans = [];
let __allAns = [];
let __qType = "?";
let __fetching = false;
let __apiHasSession = false;
let __authBlockedUntil = 0;
let __lastPageSignature = "";
let __pageChangeTimer = null;
let __navigationWatchToken = 0;
let __activeRefreshReason = null;
let __finalRetryPending = false;
let __lastNavigateTime = 0;
const __refreshReasonPriority = Object.freeze({
    trusted_nav_click: 70,
    auto_next: 60,
    auto_section_next: 55,
    auto_section_btn: 55,
    auto_skip: 50,
    auto_skip_after_play: 45,
    auto_start_test: 40,
    observer_recheck: 20,
    observer_page_change: 10
});

function getRefreshReasonPriority(reason) {
    return __refreshReasonPriority[reason] || 0;
}

function releaseRefreshCycle(reason = null) {
    if (!reason || __activeRefreshReason === reason) {
        __activeRefreshReason = null;
    }
    __finalRetryPending = false;
}

function isNoise(txt) {
    if (!txt) return true;
    const t = txt.trim();
    if (!t) return true;
    if (/^(other variation|column\s*[ab]?)$/i.test(t)) return true;
    return false;
}

// ========================= CORE DELAY =========================
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const delayFetchJitter = () => delay(50 + Math.random() * 150);

// ========================= ASSESSMENT PAGE DETECTION =========================
// Assessment URLs: /api/Assessments/GetItem/{id}/{user}/{version}/{pageIndex}
// The stored URL might have a stale pageIndex from a different page.
// Detect current page from DOM pagination and patch the URL.

function getCurrentAssessmentPage() {
    const readPageValue = (raw) => {
        const val = (raw || '').trim();
        if (!val) return null;
        const m = val.match(/^(\d+)\s*[\/\\]\s*(\d+)$/);
        if (m) {
            const cur = parseInt(m[1], 10);
            const total = parseInt(m[2], 10);
            if (cur >= 1 && cur <= total && total <= 200) return cur - 1;
            return null;
        }
        const numOnly = parseInt(val, 10);
        if (!isNaN(numOnly) && numOnly > 0 && numOnly <= 200) return numOnly - 1;
        return null;
    };

    const paginatorRoots = [
        ...document.querySelectorAll('.p-paginator, [class*="paginator"], [class*="pagination"]')
    ].filter(el => {
        const text = (el.innerText || el.textContent || '').trim();
        return text && text.length <= 80;
    });

    // Strategy 1: Find pagination text like "1 / 10" or "3 / 10"
    const paginatorSelectors = [
        '.p-paginator-current',
        '.p-paginator .current-page',
        '[class*="paginator"] [class*="current"]',
        '[class*="pagination"] [class*="current"]',
        '.p-paginator input',
    ];
    for (const sel of paginatorSelectors) {
        const el = document.querySelector(sel);
        if (el) {
            const page = readPageValue(el.value || el.innerText || el.textContent || '');
            if (page !== null) return page;
        }
    }

    // Strategy 2: Scan only within paginator containers and only visible leaf nodes.
    for (const root of paginatorRoots) {
        const candidates = root.querySelectorAll('*');
        for (const el of candidates) {
            if (el.children?.length > 0) continue;
            if (el.getClientRects && el.getClientRects().length === 0) continue;
            const page = readPageValue(el.innerText || el.textContent || '');
            if (page !== null) return page;
        }

        const numInput = root.querySelector('input[type="number"], input');
        if (numInput && numInput.value) {
            const page = readPageValue(numInput.value);
            if (page !== null) return page;
        }
    }

    return null; // unknown
}

function patchAssessmentUrl(url) {
    if (!url) return url;
    try {
        const parsed = new URL(url);
        if (!parsed.pathname.includes('/api/Assessments/GetItem')) return url;

        const currentPage = getCurrentAssessmentPage();
        if (currentPage === null || currentPage < 0) return url;

        // Path: /api/Assessments/GetItem/{id}/{user}/{version}/{pageIndex}
        // Replace the LAST non-empty segment with current page index
        const parts = parsed.pathname.split('/');
        // Find the last segment (should be the page index)
        for (let i = parts.length - 1; i >= 0; i--) {
            if (parts[i] !== '') {
                const oldPage = parseInt(parts[i], 10);
                if (!isNaN(oldPage)) {
                    if (oldPage !== currentPage) {
                        _log('[EDX] Patching Assessment URL: page', oldPage, '->', currentPage);
                        parts[i] = String(currentPage);
                        parsed.pathname = parts.join('/');
                        return parsed.toString();
                    }
                }
                break;
            }
        }
        return url;
    } catch (_) {
        return url;
    }
}

function getPageSignature() {
    const pagTexts = [];
    // Try scoped query first, fall back to broader scan if nothing found
    const containers = document.querySelectorAll('.p-paginator, [class*="paginator"], [class*="pagination"], .lessonMultipleAnswers, .learning__container, .practice__container');
    const nodes = containers.length > 0 
        ? Array.from(containers).flatMap(c => Array.from(c.querySelectorAll('span, div, p, td, li')))
        : [];

    // Fallback: broader scan if scoped query found nothing
    const scanNodes = nodes.length > 0 ? nodes : document.querySelectorAll('span, div, p, td, li');

    scanNodes.forEach(el => {
        if (el.children?.length > 0) return;
        const t = (el.textContent || '').trim();
        if (t.length <= 10 && /^\d{1,3}\s*\/\s*\d{1,3}$/.test(t)) pagTexts.push(t);
    });

    const questionEl = document.querySelector(
        '.practice__container, .lessonPlayArea, .question-text, [class*="question"], main'
    );
    const qText = (questionEl?.textContent || '').trim().substring(0, 160);
    const page = getCurrentAssessmentPage();
    return [page ?? '?', pagTexts.join('|'), qText].join('::');
}

let __recoveryInProgress = false;
function scheduleAnswerRefresh(reason, delayMs = 150, retryCount = 0) {
    // Block auto-refresh while user-triggered recovery is running
    if (__recoveryInProgress) {
        _log('[EDX] scheduleRefresh blocked: recovery in progress');
        return;
    }
    _log('[EDX] scheduleRefresh:', reason, 'delay:', delayMs, 'retry:', retryCount);
    let allowTakeover = false;
    if (retryCount === 0) {
        if (__activeRefreshReason && __activeRefreshReason !== reason) {
            const nextPrio = getRefreshReasonPriority(reason);
            const activePrio = getRefreshReasonPriority(__activeRefreshReason);
            const pageTypeNow = resolveSectionPageType();
            const questionTakeover =
                __activeRefreshReason === 'auto_start_test' &&
                (reason === 'observer_page_change' || reason === 'observer_recheck') &&
                pageTypeNow === 'question';
            if (!questionTakeover && nextPrio <= activePrio) {
                _log('[EDX] scheduleRefresh ignored:', reason, '— active cycle:', __activeRefreshReason);
                return;
            }
            allowTakeover = true;
            if (questionTakeover) {
                _log('[EDX] scheduleRefresh takeover:', reason, '— question page overrides active cycle:', __activeRefreshReason);
            } else {
                _log('[EDX] scheduleRefresh takeover:', reason, '— replacing active cycle:', __activeRefreshReason);
            }
        }
    }
    if (
        __pageChangeTimer &&
        (retryCount > 0 || !__activeRefreshReason || __activeRefreshReason === reason || allowTakeover)
    ) {
        clearTimeout(__pageChangeTimer);
        __pageChangeTimer = null;
    }
    if (retryCount === 0) {
        __activeRefreshReason = reason;
        __finalRetryPending = false;
    }
    if (retryCount === 0 && window.__lastRefreshReason && window.__lastRefreshReason !== reason) {
        _log('[EDX] New reason', reason, '— resetting from old reason', window.__lastRefreshReason);
    }
    window.__lastRefreshReason = reason;
    __pageChangeTimer = setTimeout(async () => {
        __pageChangeTimer = null;

        // Schedule delayed writing modal check
        if (retryCount === 0) {
            setTimeout(() => {
                if (_isCompleteActivityModal()) {
                    const stayBtn = [...document.querySelectorAll('button, a')]
                        .find(el => /stay in this step/i.test(el.textContent) &&
                            (el.offsetParent !== null || el.getClientRects?.().length));
                    if (stayBtn) stayBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    updateAnswerDisplay(UI_TEXT.recovery.unsupportedManual);
                }
            }, 2000);
        }

        // Skip if a modal dialog is visible
        if (_isCompleteActivityModal()) {
            const stayBtn = [...document.querySelectorAll('button, a')]
                .find(el => /stay in this step/i.test(el.textContent) &&
                    (el.offsetParent !== null || el.getClientRects?.().length));
            if (stayBtn) stayBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            updateAnswerDisplay(UI_TEXT.recovery.unsupportedManual);
            releaseRefreshCycle(reason);
            return;
        }
        if (_isModalDialogVisible()) {
            _log('[EDX] scheduleRefresh skipped: modal dialog visible');
            releaseRefreshCycle(reason);
            return;
        }

        const resolvedPageType = resolveSectionPageType();
        if (resolvedPageType === 'review') {
            __ans = [];
            __allAns = [];
            __dndCategories = null;
            __apiHasSession = false;
            clearAnsContext();
            __qType = "unknown";
            __fetching = false;
            updateTypeBadge(__qType);
            if (shouldAutoAdvance()) {
                updateAnswerDisplay(UI_TEXT.status.skippingPage);
                releaseRefreshCycle(reason);
                setTimeout(() => _autoNextContinueAfterSubmit(), 200);
                return;
            }
            updateAnswerDisplay("Đã hoàn thành - xem kết quả");
            releaseRefreshCycle(reason);
            return;
        }

        const isSectionTransitionReason =
            reason === 'auto_section_next' ||
            reason === 'auto_section_btn';
        if (isSectionTransitionReason) {
            const pageTypeNow = resolveSectionPageType();
            const nonQuestionKindNow = getNonQuestionPageKind();
            if (nonQuestionKindNow) {
                _log('[EDX] scheduleRefresh: section transition is non-question, skipping answer fetch:', nonQuestionKindNow);
                __ans = [];
                __allAns = [];
                __dndCategories = null;
                __apiHasSession = false;
                clearAnsContext();
                __qType = nonQuestionKindNow === 'start_test' ? 'start_test' : 'instruction';
                updateTypeBadge(__qType);
                updateAnswerDisplay(UI_TEXT.status.skippingPage);
                releaseRefreshCycle(reason);
                _autoSkipNonQuestionPage(0);
                return;
            }
        }


        if (retryCount >= 2 && shouldAutoAdvance() && _isNonQuestionPage()) {
            _log('[EDX] scheduleRefresh: confirmed non-question page after', retryCount, 'retries, skipping');
            releaseRefreshCycle(reason);
            if (!__autoSkipActive) {
                // For post-play skip reasons, continue the skip chain rather than
                // restarting from scratch (avoids replaying media on the NEXT page)
                const skipAttempt = (reason === 'auto_skip_after_play') ? 1 : 0;
                _autoSkipNonQuestionPage(skipAttempt);
            }
            return;
        }

        if (__fetching || __dndInProgress) {
            _log('[EDX] scheduleRefresh deferred: fetching:', __fetching, 'dnd:', __dndInProgress);
            if (retryCount < 8) scheduleAnswerRefresh(reason, 200, retryCount + 1);
            return;
        }

        __dndDone = false;
        __dndFailCount = 0;

        const ok = await getAns();
        if (ok) {
            __activeRefreshReason = null;
            __finalRetryPending = false;

            if (_isCompleteActivityModal()) {
                const stayBtn = [...document.querySelectorAll('button, a')]
                    .find(el => /stay in this step/i.test(el.textContent) &&
                        (el.offsetParent !== null || el.getClientRects?.().length));
                if (stayBtn) stayBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                updateAnswerDisplay(UI_TEXT.recovery.unsupportedManual);
                return;
            }

            handleQuestion();
            return;
        }

        if (isSectionTransitionReason) {
            const nonQuestionKindAfterGetAns = getNonQuestionPageKind();
            if (nonQuestionKindAfterGetAns) {
                _log('[EDX] scheduleRefresh: post-getAns non-question resolution:', nonQuestionKindAfterGetAns);
                __ans = [];
                __allAns = [];
                __dndCategories = null;
                __apiHasSession = false;
                clearAnsContext();
                __qType = nonQuestionKindAfterGetAns === 'start_test' ? 'start_test' : 'instruction';
                updateTypeBadge(__qType);
                updateAnswerDisplay(UI_TEXT.status.skippingPage);
                releaseRefreshCycle(reason);
                _autoSkipNonQuestionPage(0);
                return;
            }
        }

        const visibleType = detectQuestionType();
        const maxRetries = visibleType === 'dnd' ? 6 : 4;
        if (retryCount < maxRetries) {
            _log('[EDX] Refresh retry for', reason, retryCount + 1);
            if (window.updateStatus) updateStatus(`Đang thử lại lần ${retryCount + 1}...`);
            _trace('refresh.retry', { reason, retryCount: retryCount + 1, visibleType, maxRetries });
            scheduleAnswerRefresh(reason, visibleType === 'dnd' ? 700 : 400, retryCount + 1);
        } else {

            if (_isCompleteActivityModal()) {
                const stayBtn = [...document.querySelectorAll('button, a')]
                    .find(el => /stay in this step/i.test(el.textContent) &&
                        (el.offsetParent !== null || el.getClientRects?.().length));
                if (stayBtn) stayBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                updateAnswerDisplay(UI_TEXT.recovery.unsupportedManual);
                releaseRefreshCycle(reason);
            } else if (__apiHasSession) {
                _log('[EDX] Retries exhausted but API has session — final long retry');
                if (__finalRetryPending) {
                    _log('[EDX] Final retry already pending, skipping duplicate apiHasSession retry');
                    return;
                }
                __finalRetryPending = true;
                setTimeout(async () => {
                    try {
                        if (__fetching || __dndInProgress) return;
                        const finalOk = await getAns();
                        if (finalOk) {
                            handleQuestion();
                        } else {
                            __qType = 'unknown';
                            updateTypeBadge('unknown');
                            updateAnswerDisplay('Dạng câu hỏi chưa hỗ trợ');
                            _log('[EDX] Final retry also failed (apiHasSession path)');
                        }
                    } finally {
                        releaseRefreshCycle(reason);
                    }
                }, 1200);
            } else if (_isNonQuestionPage()) {
                releaseRefreshCycle(reason);
                _autoSkipNonQuestionPage();
            } else {
                _log('[EDX] Retries exhausted — scheduling final long-delay attempt');
                if (__finalRetryPending) {
                    _log('[EDX] Final retry already pending, skipping duplicate fallback retry');
                    return;
                }
                __finalRetryPending = true;
                setTimeout(async () => {
                    try {
                        if (__fetching || __dndInProgress) return;
                        const finalOk = await getAns();
                        if (finalOk) {
                            handleQuestion();
                        } else {
                            __qType = detectQuestionType() || 'unknown';
                            updateTypeBadge(__qType);
                            updateAnswerDisplay('Không lấy được đáp án');
                            _log('[EDX] Final retry also failed — giving up');
                        }
                    } finally {
                        releaseRefreshCycle(reason);
                    }
                }, 1500);
            }
        }
    }, delayMs);
}

function waitForQuestionTransition(reason, previousSignature, previousPage, timeoutMs = 3000) {
    const token = ++__navigationWatchToken;
    let settled = false;
    if (typeof _chibiClimb === 'function') _chibiClimb();

    const evaluate = () => {
        const signature = getPageSignature();
        const page = getCurrentAssessmentPage();
        const pageChanged = previousPage !== null && page !== null && page !== previousPage;
        const signatureChanged = !!signature && signature !== previousSignature;
        return { changed: pageChanged || signatureChanged, signature };
    };

    const finish = (changed, signature) => {
        if (settled || token !== __navigationWatchToken) return;
        settled = true;
        try { clearInterval(pollTimer); } catch (_) { }
        clearTimeout(timeoutTimer);
        observer.disconnect();
        __navigating = false;

        if (changed && signature) __lastPageSignature = signature;
        if (reason === 'auto_section_next' || reason === 'auto_section_btn') {
            const sectionDelay = changed ? 350 : 500;
            setTimeout(() => {
                const nonQuestionKindNow = getNonQuestionPageKind();
                const pageTypeNow = resolveSectionPageType();
                const nonQuestionNow = !!nonQuestionKindNow;
                if (pageTypeNow === 'question') {
                    scheduleAnswerRefresh(reason, 300);
                    return;
                }
                if (nonQuestionKindNow === 'review' && shouldAutoAdvance()) {
                    _log('[EDX] section transition hit review state, continuing to next step...');
                    __ans = [];
                    __allAns = [];
                    __dndCategories = null;
                    __apiHasSession = false;
                    clearAnsContext();
                    updateTypeBadge('unknown');
                    updateAnswerDisplay(UI_TEXT.status.skippingPage);
                    setTimeout(() => _autoNextContinueAfterSubmit(), 300);
                    return;
                }
                if (nonQuestionNow) {
                    _log('[EDX] section transition resolved to non-question page:', nonQuestionKindNow);
                    __ans = [];
                    __allAns = [];
                    __dndCategories = null;
                    __apiHasSession = false;
                    clearAnsContext();
                    updateTypeBadge(nonQuestionKindNow === 'start_test' ? 'start_test' : 'instruction');
                    updateAnswerDisplay(UI_TEXT.status.skippingPage);
                    _autoSkipNonQuestionPage(0);
                    return;
                }
                scheduleAnswerRefresh(reason, changed ? 400 : 300);
            }, sectionDelay);
            return;
        }
        scheduleAnswerRefresh(reason, changed ? 400 : 300);
    };

    const checkNow = () => {
        const result = evaluate();
        if (result.changed) finish(true, result.signature);
    };

    const observer = new MutationObserver(() => checkNow());
    try {
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true
        });
    } catch (_) { }

    // Backup poll every 120ms for frameworks that swap DOM without mutation events
    const pollTimer = setInterval(checkNow, 120);

    const timeoutTimer = setTimeout(() => {
        const result = evaluate();
        finish(result.changed, result.signature || previousSignature);
    }, timeoutMs);

    checkNow();
}

async function decryptToken(encObj) {
    if (!encObj || !encObj.iv || !encObj.data) return null;
    if (!isContextValid() || !chrome.runtime?.sendMessage) return null;
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value || null);
        };
        try {
            chrome.runtime.sendMessage({ type: "decryptAuth", encObj }, (res) => {
                if (chrome.runtime?.lastError) {
                    _warn("[EDX] Decryption message error:", chrome.runtime.lastError.message);
                    finish(null);
                    return;
                }
                finish(res?.autho || null);
            });
        } catch (e) {
            _warn("[EDX] Decryption dispatch failed:", e?.message || e);
            finish(null);
        }
    });
}

// Use requestCapturedPayloads() defined via inject bridge
function requestAnsContext(timeoutMs = 1000) {
    return new Promise((resolve) => {
        if (!isContextValid() || !chrome.runtime?.sendMessage) {
            resolve(null);
            return;
        }

        let settled = false;
        const finish = (data) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(data || null);
        };

        const timer = setTimeout(() => finish(null), timeoutMs);
        try {
            chrome.runtime.sendMessage({ type: "ansUrl" }, async (data) => {
                if (chrome.runtime?.lastError) {
                    _warn("[EDX] runtime message error:", chrome.runtime.lastError.message);
                    finish(null);
                    return;
                }
                if (data && (data.autho || data.encAutho)) {
                    // Try to use plaintext autho directly, or decrypt legacy if it's an object
                    let finalAutho = data.autho || data.encAutho;
                    if (typeof finalAutho === 'object' && finalAutho.iv && finalAutho.data) {
                        try {
                            const decrypted = await decryptToken(finalAutho);
                            if (decrypted) finalAutho = decrypted;
                        } catch (_) { }
                    }
                    if (typeof finalAutho === 'string') {
                        finish({ aRequest: data.aRequest, autho: finalAutho });
                        return;
                    }
                }
                finish(data || null);
            });
        } catch (_) {
            finish(null);
        }
    });
}

function clearAnsContext() {
    if (!isContextValid() || !chrome.runtime?.sendMessage) return;
    try {
        chrome.runtime.sendMessage({ type: "clearAnsContext" }, () => {
            if (chrome.runtime?.lastError) return;
        });
    } catch (_) { }
}

async function waitForAnsContext(timeoutMs = 2000, pollMs = 150) {
    const deadline = Date.now() + timeoutMs;
    let lastData = null;

    while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        const data = await requestAnsContext(Math.min(900, Math.max(250, remaining)));
        lastData = data || lastData;

        if (data?.aRequest && data?.autho) {
            return data;
        }

        await delay(Math.min(pollMs, Math.max(80, deadline - Date.now())));
    }

    return lastData;
}

// Wait until background.js reports a DIFFERENT aRequest than staleUrl
// (meaning the new question's XHR has been captured)
async function waitForFreshAnsUrl(staleUrl, timeoutMs = 2500) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const data = await requestAnsContext(800);
        if (data?.aRequest && data.aRequest !== staleUrl) {
            _log('[EDX] Fresh URL detected after', timeoutMs - (deadline - Date.now()), 'ms');
            return data;
        }
        await delay(120);
    }
    _warn('[EDX] waitForFreshAnsUrl timed out, using current URL');
    if (window.updateStatus) updateStatus(UI_TEXT.status.reusingStaleUrl);
    return await requestAnsContext(500);
}

function isTrueLike(v) {
    if (v === null || v === undefined || v === false || v === 0 || v === "" || v === "0") return false;
    if (v === "false" || v === "no" || v === "n" || v === "off") return false;
    return true; // 1, "1", true, "true", "yes", "Y", 2, any other truthy value
}

function getOptionText(op) {
    if (!op || typeof op !== "object") return "";
    // Primary: op.txt (the standard key in ED API)
    // Decode HTML entities the API sometimes leaves raw in txt fields (e.g. &nbsp;, &amp;)
    const raw = (op.txt || op.text || op.t || op.label || op.content || "").toString().trim();
    return raw
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/\s+/g, " ")
        .trim();
}

function isCorrectOption(op) {
    if (!op || typeof op !== "object") return false;

    // Reference: op.c === 1 || op.c === "1" || op.c === true
    if ('c' in op) return isTrueLike(op.c);
    // Extended fallback keys: cover common ED API variants
    const safeKeys = ["correct", "isCorrect", "cr", "is_correct", "r", "ra", "ca", "ri", "right"];
    for (const k of safeKeys) {
        if (k in op) {
            const v = op[k];

            if (typeof v === 'boolean' || v === 0 || v === 1 || v === '0' || v === '1') {
                return isTrueLike(v);
            }
        }
    }
    return false;
}

/**
 * Scan sibling option objects to auto-detect the correctness key.
 * Finds any key whose values VARY between 0/false and 1/true across items
 * (excluding known text/structural keys). Returns the key name or null.
 */
function autoDetectCorrectnessKey(items) {
    if (!items || items.length < 2) return null;
    const skipKeys = new Set([
        'id', 'txt', 'text', 't', 'label', 'name', 'value', 'content',
        'answer', 'a', 'al', 'q', 'i', 'type', 'ty', 'pos', 'idx',
        'index', 'order', 'o', 'len', 'length', 'kind', 'k', 'img',
        'image', 'src', 'url', 'href', 'class', 'style', 'html',
        'desc', 'description', 'title', 'hint', 'feedback', 'fb'
    ]);
    const keyStats = new Map();
    items.forEach(op => {
        if (!op || typeof op !== 'object') return;
        for (const [key, val] of Object.entries(op)) {
            if (skipKeys.has(key)) continue;
            if (typeof val === 'string' && val.length > 5) continue;
            if (Array.isArray(val) || (typeof val === 'object' && val !== null)) continue;
            if (!keyStats.has(key)) keyStats.set(key, { trueCount: 0, falseCount: 0, total: 0 });
            const st = keyStats.get(key);
            st.total++;
            if (isTrueLike(val)) st.trueCount++;
            else st.falseCount++;
        }
    });
    // Priority pass: prefer keys semantically related to correctness
    const priorityNames = new Set(['c', 'correct', 'isCorrect', 'is_correct', 'ans', 'score', 'right', 'isRight', 'is_right', 'isAnswer', 'selected']);
    let fallbackKey = null;
    for (const [key, st] of keyStats) {
        if (st.total >= items.length && st.trueCount > 0 && st.falseCount > 0) {
            if (priorityNames.has(key)) {
                _log('[EDX] Auto-detected correctness key (priority):', key, st);
                return key;
            }
            if (!fallbackKey) fallbackKey = key;
        }
    }
    if (fallbackKey) {
        _log('[EDX] Auto-detected correctness key (fallback):', fallbackKey, keyStats.get(fallbackKey));
    }
    return fallbackKey;
}

function keyLooksCorrectish(key) {
    if (!key) return false;
    return /^(c|r|cr|ca|ra|ri|aid|answerid|answerindex|rightanswer|correctanswer|correct|right|solution|key)$/i.test(String(key).trim());
}

function unwrapPrimitiveCandidate(val) {
    if (val === null || val === undefined) return null;
    if (Array.isArray(val)) {
        if (val.length !== 1) return null;
        return unwrapPrimitiveCandidate(val[0]);
    }
    if (typeof val === 'object') return null;
    return val;
}

function inferOptionTextFromScalar(value, answers) {
    const raw = unwrapPrimitiveCandidate(value);
    if (raw === null || raw === undefined) return "";
    if (!answers?.length) return "";

    const options = answers.map((op, index) => ({
        index,
        id: op?.id,
        text: getOptionText(op),
        norm: norm(getOptionText(op))
    })).filter(op => op.text);
    if (!options.length) return "";

    const rawStr = String(raw).trim();
    if (!rawStr) return "";
    const rawNorm = norm(rawStr);

    const byId = options.find(op => String(op.id).trim() === rawStr);
    if (byId) return byId.text;

    const numeric = Number(rawStr);
    if (!Number.isNaN(numeric)) {
        const zeroBased = options.find(op => op.index === numeric);
        if (zeroBased) return zeroBased.text;
        const oneBased = options.find(op => op.index === numeric - 1);
        if (oneBased) return oneBased.text;
    }

    if (/^[A-Z]$/i.test(rawStr)) {
        const alphaIndex = rawStr.toUpperCase().charCodeAt(0) - 65;
        const letterMatch = options.find(op => op.index === alphaIndex);
        if (letterMatch) return letterMatch.text;
    }

    const byText = options.find(op => op.norm === rawNorm);
    if (byText) return byText.text;

    return "";
}

function inferOptionTextsFromValue(value, answers) {
    if (!answers?.length || value === null || value === undefined) return [];

    if (Array.isArray(value)) {
        return uniqueByNorm(value.flatMap((item) => inferOptionTextsFromValue(item, answers)).filter(Boolean));
    }

    if (typeof value === 'string') {
        const raw = value.trim();
        if (!raw) return [];

        const direct = inferOptionTextFromScalar(raw, answers);
        if (direct) return [direct];

        if (/[|;,]/.test(raw)) {
            const splitMatches = uniqueByNorm(
                raw.split(/[|;,]/)
                    .map(part => inferOptionTextFromScalar(part.trim(), answers))
                    .filter(Boolean)
            );
            if (splitMatches.length > 1) return splitMatches;
        }

        const numericMatches = raw.match(/\d+/g);
        if (numericMatches?.length > 1) {
            const mapped = uniqueByNorm(numericMatches.map(token => inferOptionTextFromScalar(token, answers)).filter(Boolean));
            if (mapped.length > 1) return mapped;
        }

        const alphaMatches = raw.match(/[A-Z]/gi);
        if (alphaMatches?.length > 1) {
            const mapped = uniqueByNorm(alphaMatches.map(token => inferOptionTextFromScalar(token, answers)).filter(Boolean));
            if (mapped.length > 1) return mapped;
        }

        return [];
    }

    if (typeof value === 'object') return [];

    const single = inferOptionTextFromScalar(value, answers);
    return single ? [single] : [];
}

function inferCorrectTextFromStructure(question, choice, answers, itemObj) {
    const scanTargets = [
        { prefix: 'q', obj: question },
        { prefix: 'ch', obj: choice }
    ];
    if (itemObj && typeof itemObj === 'object') {
        scanTargets.push({ prefix: 'item', obj: itemObj });
    }
    const skipKeys = new Set([
        'id', 'i', 'idx', 'index', 'pos', 'order', 'o', 'len', 'length',
        'txt', 'text', 't', 'label', 'name', 'title', 'desc', 'description',
        'a', 'al', 'q', 'html', 'class', 'style', 'img', 'image', 'src', 'url', 'href'
    ]);
    const hits = [];

    scanTargets.forEach(({ prefix, obj }) => {
        if (!obj || typeof obj !== 'object') return;
        for (const [key, val] of Object.entries(obj)) {
            if (skipKeys.has(key)) continue;
            const inferred = inferOptionTextFromScalar(val, answers);
            if (!inferred) continue;
            hits.push({
                source: `${prefix}.${key}`,
                text: inferred,
                hinted: keyLooksCorrectish(key)
            });
        }
    });

    if (!hits.length) return "";

    const hintedTexts = [...new Set(hits.filter(hit => hit.hinted).map(hit => hit.text))];
    if (hintedTexts.length === 1) {
        _log('[EDX] Inferred correct answer via hinted structural field:', hits.filter(hit => hit.hinted)[0]?.source, '->', hintedTexts[0]);
        return hintedTexts[0];
    }

    return "";
}

function inferCorrectTextsFromStructure(question, choice, answers, itemObj) {
    const scanTargets = [
        { prefix: 'q', obj: question },
        { prefix: 'ch', obj: choice }
    ];
    if (itemObj && typeof itemObj === 'object') {
        scanTargets.push({ prefix: 'item', obj: itemObj });
    }
    const skipKeys = new Set([
        'id', 'i', 'idx', 'index', 'pos', 'order', 'o', 'len', 'length',
        'txt', 'text', 't', 'label', 'name', 'title', 'desc', 'description',
        'a', 'al', 'q', 'html', 'class', 'style', 'img', 'image', 'src', 'url', 'href'
    ]);
    const hits = [];

    scanTargets.forEach(({ prefix, obj }) => {
        if (!obj || typeof obj !== 'object') return;
        for (const [key, val] of Object.entries(obj)) {
            if (skipKeys.has(key)) continue;
            const inferred = inferOptionTextsFromValue(val, answers);
            if (!inferred.length) continue;
            hits.push({
                source: `${prefix}.${key}`,
                texts: inferred,
                hinted: keyLooksCorrectish(key)
            });
        }
    });

    if (!hits.length) return [];

    const hinted = hits.filter(hit => hit.hinted);
    if (hinted.length) {
        const combined = uniqueByNorm(hinted.flatMap(hit => hit.texts));
        if (combined.length) {
            _log('[EDX] Inferred correct answer(s) via hinted structural field:', hinted[0]?.source, '->', combined);
            return combined;
        }
    }

    return [];
}

function collectApiQuestionTexts(ansQs) {
    const texts = [];
    const seen = new Set();

    const addText = (value) => {
        const raw = typeof value === 'string' ? value : '';
        const cleaned = norm(raw);
        if (!cleaned || cleaned.length < 4) return;
        if (seen.has(cleaned)) return;
        seen.add(cleaned);
        texts.push(cleaned);
    };

    const walk = (value, depth = 0) => {
        if (!value || depth > 2) return;
        if (typeof value === 'string') {
            addText(value);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(item => walk(item, depth + 1));
            return;
        }
        if (typeof value !== 'object') return;

        for (const [key, val] of Object.entries(value)) {
            if (key === 'a' || key === 'al') continue;
            if (typeof val === 'string') addText(val);
            else if (depth < 1 && val && typeof val === 'object' && !Array.isArray(val)) walk(val, depth + 1);
        }
    };

    ansQs.forEach((q) => {
        walk(q, 0);
        (q.al || []).forEach((ch) => walk(ch, 1));
    });

    return texts;
}

function buildPerQuestionAnswers(ansQs, qType, rootData) {
    if (!Array.isArray(ansQs) || !(qType === 'mcq' || qType === 'checkbox')) return [];

    return ansQs.map((q, index) => {
        const prompt = norm(q?.qt || '');
        const allAns = uniqueByNorm((q?.al || []).flatMap((ch) => (ch?.a || []).map(getOptionText).filter(Boolean)));
        let answers = uniqueByNorm((q?.al || []).flatMap((ch) => {
            const options = ch?.a || [];
            const markedCorrect = options.filter(isCorrectOption).map(getOptionText).filter(Boolean);
            if (markedCorrect.length) return markedCorrect;
            if (qType === 'checkbox') return inferCorrectTextsFromStructure(q, ch, options, rootData) || [];
            if (qType === 'mcq') {
                const inferred = inferCorrectTextFromStructure(q, ch, options, rootData);
                return inferred ? [inferred] : [];
            }
            return [];
        }));

        if (!answers.length && qType === 'mcq') {
            const inferred = inferCorrectTextFromStructure(q, null, allAns.map(txt => ({ txt })), rootData);
            if (inferred) answers = [inferred];
        }

        return {
            index,
            prompt,
            ans: answers.filter(t => !isNoise(t)),
            allAns: allAns.filter(t => !isNoise(t)),
        };
    }).filter(entry => entry.prompt || entry.ans.length || entry.allAns.length);
}

function selectCurrentQuestionGroup(parsed, signals) {
    const groups = parsed?.perQuestion;
    if (!Array.isArray(groups) || groups.length <= 1) return null;

    const prompt = norm(signals?.promptText || '');
    const optionSet = new Set((signals?.optionTexts || []).map(norm).filter(Boolean));
    const matchedGroups = [];

    groups.forEach((group) => {
        let score = 0;
        let overlapAll = 0;
        let overlapCorrect = 0;
        if (prompt && group.prompt) {
            if (group.prompt.includes(prompt) || prompt.includes(group.prompt)) {
                score += 220;
            } else {
                const promptTokens = prompt.split(' ').filter(token => token.length >= 4);
                score += promptTokens.filter(token => group.prompt.includes(token)).length * 30;
            }
        }

        if (optionSet.size) {
            overlapAll = (group.allAns || []).filter(a => optionSet.has(norm(a))).length;
            overlapCorrect = (group.ans || []).filter(a => optionSet.has(norm(a))).length;
            score += overlapAll * 40 + overlapCorrect * 60;
            if ((group.allAns || []).length === optionSet.size && overlapAll === optionSet.size) score += 120;
        }

        if (score > 0 && (overlapAll > 0 || overlapCorrect > 0 || (prompt && group.prompt))) {
            matchedGroups.push({ ...group, score });
        }
    });

    if (!matchedGroups.length) return null;

    matchedGroups.sort((a, b) => a.index - b.index);
    return {
        indexes: matchedGroups.map(group => group.index),
        prompt: matchedGroups.map(group => group.prompt).filter(Boolean).join(' | '),
        ans: uniqueByNorm(matchedGroups.flatMap(group => group.ans || [])),
        allAns: uniqueByNorm(matchedGroups.flatMap(group => group.allAns || [])),
    };
}

function collectScalarTexts(value, depth = 0, out = []) {
    if (!value || depth > 2) return out;
    if (typeof value === 'string') {
        out.push(value);
        return out;
    }
    if (Array.isArray(value)) {
        value.forEach(item => collectScalarTexts(item, depth + 1, out));
        return out;
    }
    if (typeof value !== 'object') return out;

    for (const [key, val] of Object.entries(value)) {
        if (key === 'a' || key === 'al') continue;
        if (typeof val === 'string') out.push(val);
        else if (val && typeof val === 'object' && depth < 1) collectScalarTexts(val, depth + 1, out);
    }

    return out;
}

function findMatchingDragEntry(candidates, dragEntries, excludeNorms = new Set()) {
    let best = null;
    let bestScore = 0;

    candidates.forEach((candidate) => {
        const cn = norm(candidate);
        if (!cn || isNoise(cn)) return;

        dragEntries.forEach((entry) => {
            if (!entry?.norm || excludeNorms.has(entry.norm)) return;

            let score = 0;
            if (entry.norm === cn) score = 1;
            else if (entry.norm.includes(cn) || cn.includes(entry.norm)) score = 0.92;
            else if (cn.length > 15 && entry.norm.length > 15) score = _fuzzyOverlap(cn, entry.norm);

            if (score > bestScore) {
                bestScore = score;
                best = entry;
            }
        });
    });

    return bestScore >= 0.6 ? best : null;
}

function parseAnswerPayload(ansJson, qType, logDebug = false) {
    let ansQs = ansJson?.i?.q || [];
    if (!ansQs.length && Array.isArray(ansJson?.q)) ansQs = ansJson.q;
    if (!ansQs.length && Array.isArray(ansJson?.items)) ansQs = ansJson.items;
    if (!ansQs.length && Array.isArray(ansJson?.questions)) ansQs = ansJson.questions;
    if (!ansQs.length && ansJson?.data?.i?.q) ansQs = ansJson.data.i.q;

    const idToAnswer = new Map();
    const arrCorrect = [];
    const arrAll = [];
    const isMCQorCB = qType === 'mcq' || qType === 'checkbox';
    const isDndLike = qType === 'dnd' || qType === 'dnd_sequence' || qType === 'dnd_classification';
    const isCategorizedDnd = qType === 'dnd' || qType === 'dnd_classification';
    // Track whether at least one answer was marked by explicit op.c flag (vs inference)
    let hasExplicitCorrect = false;


    if (ansQs.length > 0) {
        const firstQ = ansQs[0];
        const choiceList = firstQ?.al || [];
        if (choiceList.length === 1) {
            const ch = choiceList[0];
            const answers = ch?.a || [];
            const isSegmentAudioMcq =
                ch?.t === 3 &&
                answers.length >= 2 &&
                answers.every(a => /^\([A-Z]\)$/.test((a?.txt || '').trim())) &&
                Array.isArray(ansJson?.i?.media?.m) &&
                ansJson.i.media.m.length >= answers.length;
            
            // Writing Type Check
            const isWritingType = ch?.t === 2;
            const allEmpty = answers.length > 0 && answers.every(a => !a.txt && !isTrueLike(a.c));
            if (isWritingType || allEmpty) {
                const sampleText = answers.find(a => a.txt && a.txt.trim())?.txt || '';
                if (sampleText) {

                    _log('[EDX] parseAnswerPayload: writing with sample detected, qType=writing');
                    return {
                        ans: [sampleText],
                        allAns: [],
                        qType: 'writing',
                        dndCategories: null,
                        cardPairs: null,
                        questionTexts: [],
                    };
                } else {

                    _log('[EDX] parseAnswerPayload: open-ended writing, qType=writing');
                    return {
                        ans: [],
                        allAns: [],
                        qType: 'writing',
                        dndCategories: null,
                        cardPairs: null,
                        questionTexts: [],
                    };
                }
            }

            // Speaking Type Check (t=3)
            const isSpeakingType = ch?.t === 3;
            if (isSpeakingType && !isSegmentAudioMcq) {
                _log('[EDX] parseAnswerPayload: speaking detected (t=3)');
                let sampleText = answers.find(a => a.c === "1" && a.txt?.trim())?.txt;
                if (!sampleText) {
                    sampleText = answers.find(a => a.txt && a.txt.trim())?.txt || '';
                }
                return {
                    ans: sampleText ? [sampleText] : [],
                    allAns: [],
                    qType: 'speaking',
                    dndCategories: null,
                    cardPairs: null,
                    questionTexts: [],
                };
            }
        }
    }




    if (ansQs.length > 0) {
        const firstQ = ansQs[0];
        const choiceList = firstQ?.al || [];
        if (choiceList.length === 1) {
            const positions = choiceList[0]?.a || [];
            const allNull = positions.length > 1 && positions.every(p => p.txt === null || p.txt === undefined || p.txt === '');
            if (allNull) {
                const correctPos = positions.findIndex(p => isTrueLike(p.c));
                if (correctPos >= 0) {
                    const posStr = 'POS:' + (correctPos + 1); // 1-indexed
                    _log('[EDX] sentence_fit early-exit: pos', correctPos + 1, '/', positions.length);
                    return {
                        ans: [posStr],
                        allAns: positions.map((_, i) => 'POS:' + (i + 1)),
                        qType: 'sentence_fit',
                        dndCategories: null,
                        cardPairs: null,
                        questionTexts: [],
                    };
                }
            }
        }
    }

    if (logDebug && ansQs.length) {
        try {
            const sample = ansQs[0];
            console.log("[EDX DEBUG] q keys:", Object.keys(sample));
            console.log("[EDX DEBUG] q.al.length:", sample.al?.length);
            if (sample.al?.length) {
                const ch0 = sample.al[0];
                console.log("[EDX DEBUG] al[0] keys:", Object.keys(ch0));
                console.log("[EDX DEBUG] al[0].a[0]:", JSON.stringify(ch0.a?.[0]));
                if (sample.al.length > 1) {
                    console.log("[EDX DEBUG] al[1] keys:", Object.keys(sample.al[1]));
                    console.log("[EDX DEBUG] al[1].a[0]:", JSON.stringify(sample.al[1].a?.[0]));
                }
            }
            console.log("[EDX DEBUG] ansJson top keys:", Object.keys(ansJson));
            console.log("[EDX DEBUG] ansJson.i keys:", Object.keys(ansJson.i || {}));
        } catch (_) { }
    }

    ansQs.forEach((q) => {
        let chList = q.al || [];
        if (isDndLike) {
            // Sort by numerical ID to reconstruct the correct sequence if items are scrambled
            chList = [...chList].sort((a, b) => {
                const idA = Number(a.id);
                const idB = Number(b.id);
                if (!Number.isNaN(idA) && !Number.isNaN(idB)) return idA - idB;
                return 0;
            });
        }
        chList.forEach((ch) => {
            const answers = ch.a || [];
            const validTexts = answers.map(getOptionText).filter(Boolean);
            validTexts.forEach((t) => arrAll.push(t));

            const markedCorrect = answers.filter(isCorrectOption).map(getOptionText).filter(Boolean);
            let ansTxt = "";

            if (markedCorrect.length) {
                markedCorrect.forEach((t) => arrCorrect.push(t));
                ansTxt = markedCorrect[0];
                hasExplicitCorrect = true; // at least one op.c flag found
            }

            // Checkbox: try structural inference ONLY when explicit markers are insufficient
            // API may mark only 1 via op.c but encode all correct in fields like q.ra, ch.ra
            // But if explicit c flags already cover enough answers, skip inference to avoid false positives
            if (qType === 'checkbox' && markedCorrect.length === 0) {
                const inferredTexts = inferCorrectTextsFromStructure(q, ch, answers, ansJson?.i);
                if (inferredTexts.length) {
                    inferredTexts.forEach((t) => {
                        if (!arrCorrect.some(existing => norm(existing) === norm(t))) {
                            arrCorrect.push(t);
                        }
                    });
                    if (!ansTxt) ansTxt = inferredTexts[0];
                }
            } else if (!markedCorrect.length && qType === 'mcq') {
                const inferred = inferCorrectTextFromStructure(q, ch, answers, ansJson?.i);
                if (inferred) {
                    arrCorrect.push(inferred);
                    ansTxt = inferred;
                }
            } else if (!markedCorrect.length && !isMCQorCB && answers.length === 1 && validTexts.length === 1) {
                ansTxt = validTexts[0];
                arrCorrect.push(ansTxt);
            }

            if (ansTxt && ch.id !== undefined) {
                idToAnswer.set(ch.id, ansTxt);
                idToAnswer.set(String(ch.id), ansTxt);
                const numId = Number(ch.id);
                if (!Number.isNaN(numId)) idToAnswer.set(numId, ansTxt);
            }
            if (ansTxt && ch.i !== undefined && ch.i !== ch.id) {
                idToAnswer.set(ch.i, ansTxt);
                idToAnswer.set(String(ch.i), ansTxt);
            }
        });
    });

    const cleanCorrect = arrCorrect.filter(t => !isNoise(t));
    const cleanAll = [...new Set(arrAll.filter(t => !isNoise(t)))];

    _log("[EDX DEBUG] qType:", qType, "| arrCorrect:", arrCorrect.length, "| arrAll:", arrAll.length);

    if (isMCQorCB && arrCorrect.length === 0 && arrAll.length > 0 && logDebug) {
        try {
            const dumpKeys = (label, obj) => {
                if (!obj || typeof obj !== 'object') return;
                const entries = Object.entries(obj).filter(([k]) => k !== 'a' && k !== 'al' && k !== 'q');
                if (entries.length) console.warn(`[EDX DUMP] ${label}:`, Object.fromEntries(entries));
            };
            console.warn('[EDX DUMP] MCQ has 0 correct / ' + arrAll.length + ' total. Full structure:');
            console.warn('[EDX DUMP] ansJson.i keys:', Object.keys(ansJson?.i || {}));
            dumpKeys('ansJson.i (non-structural)', ansJson?.i);
            ansQs.forEach((q, qi) => {
                dumpKeys(`q[${qi}]`, q);
                (q.al || []).forEach((ch, ci) => {
                    dumpKeys(`q[${qi}].al[${ci}]`, ch);
                    if (ch.a?.length) console.warn(`[EDX DUMP] q[${qi}].al[${ci}].a[0]:`, JSON.stringify(ch.a[0]));
                });
            });
        } catch (_) { }
    }

    let finalCorrect = cleanCorrect;
    if (cleanCorrect.length === 0 && cleanAll.length > 0) {
        _log('[EDX] No correct answers from known keys, attempting auto-detect...');
        const allRawOptions = [];
        ansQs.forEach(q => (q.al || []).forEach(ch => {
            (ch.a || []).forEach(a => { if (a && typeof a === 'object') allRawOptions.push(a); });
        }));
        const detectedKey = autoDetectCorrectnessKey(allRawOptions);
        if (detectedKey) {
            const detected = [];
            allRawOptions.forEach(a => {
                const txt = getOptionText(a);
                if (txt && !isNoise(txt) && isTrueLike(a[detectedKey])) detected.push(txt);
            });
            if (detected.length > 0 && detected.length < cleanAll.length) {
                finalCorrect = detected;
                _log('[EDX] Auto-detect found', detected.length, 'correct via option key:', detectedKey);
            }
        }
        if (finalCorrect.length === 0) {
            const allChoices = [];
            ansQs.forEach(q => (q.al || []).forEach(ch => { if (ch && typeof ch === 'object') allChoices.push(ch); }));
            const choiceKey = autoDetectCorrectnessKey(allChoices);
            if (choiceKey) {
                const detected2 = [];
                allChoices.forEach(ch => {
                    if (isTrueLike(ch[choiceKey])) {
                        (ch.a || []).map(getOptionText).filter(t => t && !isNoise(t)).forEach(t => detected2.push(t));
                    }
                });
                if (detected2.length > 0 && detected2.length < cleanAll.length) {
                    finalCorrect = detected2;
                    _log('[EDX] Auto-detect found', detected2.length, 'correct via choice key:', choiceKey);
                }
            }
        }
    }

    let answers = [];
    if (isDndLike || qType === 'ddl' || qType === 'text' || qType === 'card_match') {
        answers = finalCorrect.length ? finalCorrect : cleanAll;
    } else {
        answers = finalCorrect;
    }


    // Questions with <BLANK NUM=X/> define fill positions.
    // al[].id maps to BLANK NUM, but blanks may appear in different order in qt.
    // Reorder answers to match visual BLANK appearance order.
    let hasBlankPattern = false;
    if (isCategorizedDnd || qType === 'text' || qType === 'ddl') {
        const blankOrdered = [];
        ansQs.forEach(q => {
            const qt = q.qt || '';
            const blankRe = /<BLANK\s+NUM=(\d+)\s*\/?>/gi;
            // Also match spans with class containing "et" and capture their id attribute
            const spanEtRe = /<span[^>]*?(?:class=['"][^'"]*\bet\b[^'"]*['"][^>]*?id=['"](\d+)['"]|id=['"](\d+)['"][^>]*?class=['"][^'"]*\bet\b[^'"]*['"])[^>]*>/gi;
            const spanEtClassRe = /<span[^>]*class=['"][^'"]*?et\s+(\d+)[^'"]*?['"][^>]*>/gi;
            const blankNums = [];
            let m;

            // Find all <BLANK NUM=X/>
            while ((m = blankRe.exec(qt)) !== null) {
                blankNums.push(parseInt(m[1], 10));
            }
            // Find all <span class="... et ..." id="X"> or <span id="X" class="... et ...">
            while ((m = spanEtRe.exec(qt)) !== null) {
                blankNums.push(parseInt(m[1] || m[2], 10));
            }
            // Fallback for old <span class="et X">
            while ((m = spanEtClassRe.exec(qt)) !== null) {
                if (!blankNums.includes(parseInt(m[1], 10))) {
                    blankNums.push(parseInt(m[1], 10));
                }
            }

            if (blankNums.length > 0) {
                hasBlankPattern = true;
                const alMap = new Map();
                (q.al || []).forEach(ch => {
                    const markedCorrect = (ch.a || []).filter(isCorrectOption).map(getOptionText).filter(Boolean);
                    const txt = markedCorrect[0] || (ch.a || []).map(getOptionText).filter(Boolean)[0];
                    if (txt && ch.id !== undefined) alMap.set(ch.id, txt);
                    _log('[EDX DEBUG] alMap set ch.id=', ch.id, '-> txt=', txt, '| markedCorrect=', markedCorrect);
                });
                _log('[EDX DEBUG] blankNums=', blankNums, '| alMap=', [...alMap.entries()]);
                blankNums.forEach(num => {
                    const ans = alMap.get(num);
                    _log('[EDX DEBUG] blank', num, '->', ans);
                    if (ans) blankOrdered.push(ans);
                });
            } else {
                // No BLANK pattern in this question, keep al[] order with CORRECT answer (not first)
                (q.al || []).forEach(ch => {
                    const markedCorrect = (ch.a || []).filter(isCorrectOption).map(getOptionText).filter(Boolean);
                    const txt = markedCorrect[0] || (ch.a || []).map(getOptionText).filter(Boolean)[0];
                    if (txt) blankOrdered.push(txt);
                });
            }
        });
        if (hasBlankPattern && blankOrdered.length > 0) {
            answers = blankOrdered;
            _log('[EDX] BLANK NUM reorder:', blankOrdered);
        }
    }


    // For categorized DND (True/False, Advantage/Disadvantage, etc.):
    // API structure: q[].al[] = categories, al[].a[] = items per category
    // Build interleaved array: [CatName1, item1, item2, CatName2, item3, item4]
    // Skip when questions use <BLANK NUM=X/> (sequential fill, not categorized)
    let dndCategories = null;
    if (isCategorizedDnd && !hasBlankPattern) {
        const dragEntries = queryVisibleAll('.dnditem').map(el => {
            const raw = (el.innerText || el.textContent || '').trim();
            const normalized = norm(raw);
            return normalized ? { raw: raw || normalized, norm: normalized } : null;
        }).filter(Boolean);
        const zoneHeaders = _getVisibleZoneHeaders();

        // Some EDX categorized DnD payloads are encoded as per-statement questions,
        // where each statement has True/False options instead of category buckets.
        const statementGroups = new Map();
        const usedDragNorms = new Set();

        ansQs.forEach((q) => {
            const optionTexts = uniqueByNorm((q.al || []).flatMap((ch) => {
                const direct = getOptionText(ch);
                const nested = (ch.a || []).map(getOptionText);
                return [direct, ...nested].filter(t => t && !isNoise(t));
            }));
            if (optionTexts.length < 2) return;

            const optionNorms = new Set(optionTexts.map(norm));
            const syntheticOptions = optionTexts.map(txt => ({ txt }));

            let correctLabel = inferCorrectTextFromStructure(q, null, syntheticOptions, ansJson?.i);
            if (!correctLabel) {
                for (const ch of (q.al || [])) {
                    correctLabel = inferCorrectTextFromStructure(q, ch, syntheticOptions, ansJson?.i);
                    if (correctLabel) break;
                }
            }

            const correctNorm = norm(correctLabel);
            if (!correctNorm || !optionNorms.has(correctNorm)) return;

            const scalarTexts = collectScalarTexts(q);
            const statementEntry = findMatchingDragEntry(scalarTexts, dragEntries, usedDragNorms);
            if (!statementEntry) return;

            if (!statementGroups.has(correctNorm)) {
                statementGroups.set(correctNorm, { catName: correctLabel, allItems: [] });
            }
            statementGroups.get(correctNorm).allItems.push(statementEntry.raw);
            usedDragNorms.add(statementEntry.norm);
        });

        const statementCats = [...statementGroups.values()].filter(cat => cat.allItems.length > 0);
        if (statementCats.length >= 2) {
            const filteredStatementCats = statementCats.filter(cat => {
                const cn = norm(cat.catName);
                return zoneHeaders.some(h => h === cn || h.includes(cn) || cn.includes(h));
            });
            const finalStatementCats = filteredStatementCats.length >= 2 ? filteredStatementCats : statementCats;
            const interleaved = [];
            finalStatementCats.forEach(cat => {
                interleaved.push(cat.catName);
                cat.allItems.forEach(item => interleaved.push(item));
            });

            if (interleaved.length > answers.length) {
                answers = interleaved;
            }

            dndCategories = finalStatementCats;
            _log('[EDX] DND statement-groups detected:', finalStatementCats.map(c => `${c.catName}(${c.allItems.length})`).join(', '));
        }

        const catCandidates = [];

        if (!dndCategories) {
            ansQs.forEach((q) => {
                (q.al || []).forEach((ch) => {
                    const catName = getOptionText(ch) || (ch.txt || ch.text || ch.t || ch.label || ch.name || '').toString().trim();
                    const items = (ch.a || []).map(getOptionText).filter(t => t && !isNoise(t));
                    if (!catName || !items.length) return;

                    const matchingDrags = [];
                    items.forEach(item => {
                        const n = norm(item);
                        const matched = dragEntries.find(entry =>
                            entry.norm === n ||
                            entry.norm.includes(n) ||
                            n.includes(entry.norm) ||
                            (n.length > 15 && entry.norm.length > 15 && _fuzzyOverlap(n, entry.norm) > 0.6)
                        );
                        if (matched && !matchingDrags.some(existing => norm(existing) === matched.norm)) {
                            matchingDrags.push(matched.raw);
                        }
                    });

                    if (matchingDrags.length > 0) {
                        catCandidates.push({ catName, allItems: matchingDrags });
                    }
                });
            });

            if (catCandidates.length >= 2) {
                const filteredCats = catCandidates.filter(cat => {
                    const cn = norm(cat.catName);
                    return zoneHeaders.some(h => h === cn || h.includes(cn) || cn.includes(h));
                });

                let finalCats = filteredCats.length >= 2 ? filteredCats : catCandidates;
                if (zoneHeaders.length >= 2 && finalCats.length > zoneHeaders.length) {
                    finalCats = finalCats
                        .slice()
                        .sort((a, b) => b.allItems.length - a.allItems.length)
                        .slice(0, zoneHeaders.length);
                }

                const interleaved = [];
                finalCats.forEach(cat => {
                    interleaved.push(cat.catName);
                    cat.allItems.forEach(item => interleaved.push(item));
                });

                if (interleaved.length > answers.length) {
                    answers = interleaved;
                    _log('[EDX] DND categories detected:', finalCats.map(c => `${c.catName}(${c.allItems.length})`).join(', '));
                }

                dndCategories = finalCats;
            }
        }
    }

    if (isCategorizedDnd) answers = uniqueByNorm(answers);


    let cardPairs = null;
    const media = ansJson?.i?.media;
    if (media?.res?.length && media?.m?.length) {
        const totalAl = ansQs.reduce((s, q) => s + (q.al?.length || 0), 0);
        const resMap = new Map(media.res.map(r => [r.id, r.src]));

        const ridToPairIdx = new Map();

        if (totalAl > 0 && media.m.length === totalAl * 2) {


            const pairMap = new Map();
            const pairLabels = [];
            for (let i = 0; i < totalAl; i++) {
                const ridA = media.m[2 * i]?.r?.[0]?.rid;
                const ridB = media.m[2 * i + 1]?.r?.[0]?.rid;
                const srcA = resMap.get(ridA);
                const srcB = resMap.get(ridB);
                if (srcA && srcB) {
                    pairMap.set(srcA, srcB);
                    pairMap.set(srcB, srcA);
                    const label = ansQs[0]?.al?.[i]?.a?.[0]?.txt || `Pair ${i + 1}`;
                    pairLabels.push({ label, srcA, srcB, ridA, ridB });
                    ridToPairIdx.set(ridA, i);
                    ridToPairIdx.set(ridB, i);
                }
            }
            if (pairLabels.length > 0) {
                cardPairs = { pairMap, pairLabels, numPairs: totalAl, ridToPairIdx, resMap, variant: 'A' };
                // Always set answers when card pairs found (qType may be misdetected)
                answers = pairLabels.map(p => p.label).filter(l => !l.startsWith('word '));
            }
        } else if (totalAl > 0 && media.m.length === totalAl) {

            // al[i].a = [{id, txt:""}, {id, txt:"word"}]  media.m[i] has image rid
            const pairLabels = [];
            for (let i = 0; i < totalAl; i++) {
                const al = ansQs[0]?.al?.[i];
                const rid = media.m[i]?.r?.[0]?.rid;
                const imgSrc = resMap.get(rid);
                const textAns = al?.a?.find(a => a.txt && a.txt.trim().length > 0);
                const label = textAns?.txt || `Pair ${i + 1}`;
                const mId = media.m[i]?.id || '';  // e.g. "1_74"
                pairLabels.push({ label, imgSrc: imgSrc || '', textId: textAns?.id, rid, mId });
                if (rid != null) ridToPairIdx.set(rid, i);
            }
            if (pairLabels.length > 0) {
                cardPairs = { pairLabels, numPairs: totalAl, ridToPairIdx, resMap, variant: 'B' };
                answers = pairLabels.map(p => p.label).filter(l => !l.startsWith('word '));
            }
        }
    }

    return {
        ans: answers,
        allAns: cleanAll,
        apiZoneMap: idToAnswer,
        ansQs,
        questionTexts: collectApiQuestionTexts(ansQs),
        perQuestion: buildPerQuestionAnswers(ansQs, qType, ansJson?.i),
        dndCategories,
        cardPairs,
        hasExplicitCorrect,
        itemType: ansJson?.i?.t, // 0=MCQ, 1=Checkbox, 2=Writing, 3=Speaking, 4=MCQ+Audio
    };
}

function collectVisibleQuestionSignals(qType) {
    const signals = { optionTexts: [], bankTexts: [], zoneHeaders: [], textInputCount: 0, ddlCount: 0, dndZoneCount: 0, promptText: "" };
    if (qType === 'mcq') {
        signals.optionTexts = queryVisibleAll('.prMCQ__answerLabel').map(el => norm(el.innerText || el.textContent || '')).filter(Boolean);
    } else if (qType === 'checkbox') {
        const optionNodes = queryVisibleAll('.lessonMultipleAnswer');
        const mcqLabels = hasMcqCheckboxInputs() ? queryVisibleAll('.prMCQ__answerLabel') : [];
        signals.optionTexts = [...optionNodes, ...mcqLabels].map(el => {
            const txtEl = el.querySelector('.multiTextInline, .multiText, .radioTextWrapper') || el;
            return norm(txtEl.innerText || txtEl.textContent || '');
        }).filter(Boolean);
    } else if (qType === 'dnd' || qType === 'dnd_sequence' || qType === 'dnd_classification') {
        const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
        signals.bankTexts = queryVisibleAll(itemSelectors).map(el => norm(el.innerText || el.textContent || '')).filter(Boolean);
        signals.dndZoneCount = getDndZones(true).length;
        signals.zoneHeaders = _getVisibleZoneHeaders();
    } else if (qType === 'text') {
        signals.textInputCount = findTextInputs().length;
    } else if (qType === 'ddl') {
        signals.ddlCount = queryVisibleAll('.prFITB__DDLOptionsW').length;
    } else if (qType === 'card_match') {
        signals.cardBackCount = document.querySelectorAll('img[src*="cardBack"]').length;
    }

    const interactiveRoot =
        queryVisible('.prMCQ, .prMCQ__container, .lessonMultipleAnswers, .prFITB, .prOpenEnded, .question-text, [class*="question"]') ||
        queryVisible('.practice__container, .lessonPlayArea, main');
    if (interactiveRoot) {
        const clone = interactiveRoot.cloneNode(true);
        clone.querySelectorAll('input, textarea, button, a, .prMCQ__answerLabel, .lessonMultipleAnswer, .dnditem, .dndZone, .dndBank, .prFITB__DDLOptionsW').forEach(el => el.remove());
        const promptLines = (clone.innerText || clone.textContent || '')
            .split(/\r?\n/)
            .map(line => norm(line))
            .filter(line => line && !signals.optionTexts.includes(line) && line.length >= 4);
        signals.promptText = promptLines.slice(0, 4).join(' | ');
    }

    return signals;
}

function scoreParsedPayload(parsed, qType, signals) {
    if (!parsed) return -1;
    let score = 0;
    if (qType === 'mcq' || qType === 'checkbox') {
        const optionSet = new Set(signals.optionTexts);
        const overlapAll = parsed.allAns.filter(a => optionSet.has(norm(a))).length;
        const overlapCorrect = parsed.ans.filter(a => optionSet.has(norm(a))).length;
        score += overlapAll * 25 + overlapCorrect * 40;
        if (signals.optionTexts.length) score -= Math.abs(parsed.allAns.length - signals.optionTexts.length) * 10;
        if (overlapAll === signals.optionTexts.length && overlapAll > 0) score += 120;
        if (parsed.ans.length === 1) score += 15;
    } else if (qType === 'dnd' || qType === 'dnd_sequence' || qType === 'dnd_classification') {
        const bankSet = new Set(signals.bankTexts);
        const dndItems = parsed.dndCategories?.flatMap(cat => cat.allItems || []) || parsed.allAns;
        const overlapBank = dndItems.filter((a) => {
            const n = norm(a);
            if (bankSet.has(n)) return true;
            return signals.bankTexts.some(dt => dt.includes(n) || n.includes(dt) ||
                (n.length > 15 && dt.length > 15 && _fuzzyOverlap(n, dt) > 0.6));
        }).length;
        score += overlapBank * 20;
        if (overlapBank === 0 && signals.bankTexts.length > 0) score -= 60;
        if (signals.dndZoneCount) score -= Math.abs(parsed.ans.length - signals.dndZoneCount) * 6;
        if (parsed.dndCategories?.length) {
            score += parsed.dndCategories.length * 18;
            const matchedHeaders = parsed.dndCategories.filter((cat) => {
                const cn = norm(cat.catName);
                return signals.zoneHeaders.some(h => h === cn || h.includes(cn) || cn.includes(h));
            }).length;
            score += matchedHeaders * 25;
        }
    } else if (qType === 'text') {
        if (signals.textInputCount) score += 60 - Math.abs(parsed.ans.length - signals.textInputCount) * 12;
    } else if (qType === 'ddl') {
        if (signals.ddlCount) score += 60 - Math.abs(parsed.ans.length - signals.ddlCount) * 12;
    } else if (qType === 'card_match') {
        if (parsed.cardPairs?.pairLabels?.length) {
            score += parsed.cardPairs.numPairs * 30;
            if (signals.cardBackCount && signals.cardBackCount >= parsed.cardPairs.numPairs) score += 80;
        }
    }

    if (signals.promptText && parsed.questionTexts?.length) {
        const prompt = signals.promptText;
        let bestPromptScore = 0;
        parsed.questionTexts.forEach((text) => {
            if (!text) return;
            if (text.includes(prompt) || prompt.includes(text)) {
                bestPromptScore = Math.max(bestPromptScore, 220);
                return;
            }
            const promptTokens = prompt.split(' ').filter(token => token.length >= 4);
            const overlap = promptTokens.filter(token => text.includes(token)).length;
            if (overlap > 0) {
                bestPromptScore = Math.max(bestPromptScore, overlap * 28);
            }
        });
        score += bestPromptScore;
    }

    score += Math.min(parsed.ans.length, 6);
    return score;
}

// ========================= GET ANSWERS =========================
async function getAns(forceRefresh = false) {
    if (__dndInProgress) return false;
    try {
        if (!forceRefresh && __authBlockedUntil > Date.now()) {
            __fetching = false;
            updateAnswerDisplay('Phiên truy cập đang bị tạm khóa. Mở lại câu hỏi rồi bấm Refresh.');
            return false;
        }
        __apiHasSession = false;
        const requestId = ++__currentRequestId;
        if (__abortController) { try { __abortController.abort(); } catch (_) { } }
        __abortController = new AbortController();

        __ans = []; __allAns = []; __apiZoneMap = new Map(); __dndCategories = null; __cardPairs = null; __cardBadgeCache = null;
        __dndDone = false;
        __fetching = true;
        const __loadStart = performance.now();
        updateAnswerDisplay(UI_TEXT.status.loadingAnswers);

        if (!isContextValid() || !chrome.runtime?.sendMessage) {
            updateAnswerDisplay("Tiện ích mở rộng đã được cập nhật hoặc khởi động lại. Hãy nhấn F5 trang web này.");
            return false;
        }

        const waitForLoader = async () => {
            for (let i = 0; i < 6; i++) {
                if (!document.querySelector('.loading') && !document.querySelector('.ed-loader')) break;
                await new Promise(r => setTimeout(r, 60));
            }
        };
        await waitForLoader();



        // have no traditional question elements and would be incorrectly aborted
        // Skip this check during page transitions (auto_next) to avoid false positives
        const isTransitioning = __activeRefreshReason === 'auto_next' || __activeRefreshReason === 'auto_skip';
        const justNavigated = (Date.now() - __lastNavigateTime) < 3000; // 3 seconds after navigate
        if (!forceRefresh && !isTransitioning && !justNavigated && _isNonQuestionPage()) {
            await delay(300); // Give Angular an extra moment to render
            if (_isNonQuestionPage()) {
                _log('[EDX] getAns early abort: Non-question page detected');
                clearAnsContext();
                __ans = [];
                __allAns = [];
                const nonQuestionKind = getNonQuestionPageKind();
                __qType = detectPageType();
                updateTypeBadge(__qType);
                if (nonQuestionKind === 'instruction_media') {
                    updateAnswerDisplay('Trang lý thuyết / media');
                } else if (nonQuestionKind === 'instruction_text') {
                    updateAnswerDisplay('Trang lý thuyết (bấm Next)');
                } else if (__qType === 'instruction') {
                    updateAnswerDisplay('Trang lý thuyết');
                } else {
                    updateAnswerDisplay('Chưa có ID câu hỏi (thử chọn lại)');
                }
                return false;
            }
        }

        const datax = await waitForAnsContext();
        if (requestId !== __currentRequestId) { __fetching = false; return false; }

        let { aRequest: ansUrl, autho } = datax || {};


        // If background still reports the same URL as our last successful fetch,
        // the new question's XHR hasn't been captured yet. Wait for it.
        // Skip this guard if forceRefresh is set (e.g., manual retry by user).
        if (!forceRefresh && ansUrl && ansUrl === __lastFetchedUrl) {
            const pageTypeNow = detectPageType();
            const nonQuestionKindNow = getNonQuestionPageKind();
            const nonQuestionNow = !!nonQuestionKindNow;
            if (nonQuestionNow) {
                _log('[EDX] Stale URL on non-question page; skipping fetch reuse');
                clearAnsContext();
                __ans = [];
                __allAns = [];
                __qType = pageTypeNow === 'start_test' ? 'start_test' : 'instruction';
                updateTypeBadge(__qType);
                if (shouldAutoAdvance()) {
                    updateAnswerDisplay(UI_TEXT.status.skippingPage);
                    setTimeout(() => _autoSkipNonQuestionPage(0), 50);
                } else if (isRunMode() && nonQuestionKindNow === 'instruction_media') {
                    updateAnswerDisplay('Trang lý thuyết / media (đang phát)');
                    setTimeout(() => { _autoPlayVideo().catch(() => {}); }, 50);
                } else if (nonQuestionKindNow === 'instruction_text') {
                    updateAnswerDisplay('Trang lý thuyết (bấm Next)');
                } else {
                    updateAnswerDisplay('Trang lý thuyết');
                }
                return false;
            }

            _log('[EDX] Stale URL detected, waiting for new question XHR...');
            // Clear stale content immediately while waiting for a fresh question URL.
            __ans = [];
            __allAns = [];
            updateAnswerDisplay('');
            updateTypeBadge('unknown');
            if (window.updateStatus) updateStatus(UI_TEXT.status.waitingFreshQuestion);
            const freshData = await waitForFreshAnsUrl(__lastFetchedUrl, 2500);
            if (requestId !== __currentRequestId) { __fetching = false; return false; }
            if (freshData?.aRequest && freshData.aRequest !== __lastFetchedUrl) {
                ansUrl = freshData.aRequest;
                autho = freshData.autho || autho;
            } else {
                const pageTypeAfterWait = detectPageType();
                const nonQuestionKindAfterWait = getNonQuestionPageKind();
                const hasQuestionDomAfterWait = hasVisibleQuestionDom();
                const nonQuestionAfterWait = !!nonQuestionKindAfterWait;
                const shouldRejectForcedReuse = nonQuestionAfterWait || !hasQuestionDomAfterWait;
                if (shouldRejectForcedReuse) {
                    _warn('[EDX] Stale URL persisted after timeout without a fresh question. Skipping forced fetch.');
                    clearAnsContext();
                    __ans = [];
                    __allAns = [];
                    __apiHasSession = false;
                    __qType = nonQuestionAfterWait
                        ? (pageTypeAfterWait === 'start_test' ? 'start_test' : 'instruction')
                        : 'unknown';
                    updateTypeBadge(__qType);
                    if (window.updateStatus) {
                        updateStatus(nonQuestionAfterWait ? '' : UI_TEXT.status.waitingFreshQuestion);
                    }
                    if (nonQuestionAfterWait && shouldAutoAdvance()) {
                        updateAnswerDisplay(UI_TEXT.status.skippingPage);
                        setTimeout(() => _autoSkipNonQuestionPage(0), 50);
                    } else if (nonQuestionKindAfterWait === 'instruction_media' && isRunMode()) {
                        updateAnswerDisplay('Trang lý thuyết / media (đang phát)');
                        setTimeout(() => { _autoPlayVideo().catch(() => {}); }, 50);
                    } else if (nonQuestionKindAfterWait === 'instruction_text') {
                        updateAnswerDisplay('Trang lý thuyết (bấm Next)');
                    } else if (nonQuestionAfterWait) {
                        updateAnswerDisplay('Trang lý thuyết');
                    } else {
                        updateAnswerDisplay(UI_TEXT.status.waitingFreshQuestion);
                    }
                    return false;
                }
                // If forceRefresh not set and fresh URL not found, re-use current URL anyway
                _warn('[EDX] Stale URL persisted after timeout. Re-using for forced fetch.');
            }
        }

        _trace('context.ready', {
            hasAnsUrl: !!ansUrl,
            hasAuth: !!autho,
            requestId,
            ms: Math.round(performance.now() - __loadStart),
        });
        if (!ansUrl || !autho) {
            const visibleTypeWithoutSession = detectQuestionType();
            if (visibleTypeWithoutSession === 'speaking' && hasRealSpeakingUi()) {
                _log('[EDX] Speaking page without API session: proceeding with local speaking handler');
                __apiHasSession = false;
                __qType = 'speaking';
                updateTypeBadge('speaking');
                updateAnswerDisplay('Đang chuẩn bị ghi âm...');
                __fetching = false;
                return true;
            }

            const nonQuestionKind = getNonQuestionPageKind();
            if (nonQuestionKind === 'instruction_media' && (shouldAutoAdvance() || isRunMode())) {
                __apiHasSession = false;
                __qType = 'instruction';
                updateTypeBadge('instruction');
                updateAnswerDisplay('Trang media / đang phát');
                if (window.updateStatus) {
                    const hasVideo = !!document.querySelector('video, #CTrackerPlayBtn, #play-pause');
                    updateStatus(hasVideo ? UI_TEXT.status.playingVideo : UI_TEXT.status.playingAudio);
                }
                _autoPlayVideo().then(() => {
                    setTimeout(() => {
                        if (window.updateStatus) updateStatus('');
                        if (shouldAutoAdvance()) goToNextItem();
                    }, 3000);
                }).catch(() => {
                    if (window.updateStatus) updateStatus('');
                });
                return false;
            }

            const pageTypeHint = detectPageType();
            const nonQuestionKindHint = getNonQuestionPageKind();
            const isNonQuestionHint = !!nonQuestionKindHint;
            if (isNonQuestionHint) {
                __apiHasSession = false;
                __qType = pageTypeHint === 'start_test' ? 'start_test' : 'instruction';
                updateTypeBadge(__qType);

                if (shouldAutoAdvance()) {
                    updateAnswerDisplay(UI_TEXT.status.skippingPage);
                    setTimeout(() => _autoSkipNonQuestionPage(0), 50);
                } else if (isRunMode() && nonQuestionKindHint === 'instruction_media') {
                    updateAnswerDisplay('Trang lý thuyết / media (đang phát)');
                    setTimeout(() => { _autoPlayVideo().catch(() => {}); }, 50);
                } else if (nonQuestionKindHint === 'instruction_text') {
                    updateAnswerDisplay('Trang lý thuyết (bấm Next)');
                } else if (nonQuestionKindHint === 'start_test') {
                    updateAnswerDisplay('Trang bắt đầu bài, sẵn sàng chạy');
                } else {
                    updateAnswerDisplay('Trang lý thuyết');
                }
                return false;
            }

            __apiHasSession = false;
            updateAnswerDisplay("Chưa có phiên hợp lệ. Mở 1 câu hỏi rồi bấm Refresh.");
            return false;
        }
        __authBlockedUntil = 0;

        const _hasInteractiveNow = !!(
            document.querySelector('.dndZone, .dnd-target, .TTpanswerDiv, .droptarget, .prFITB__fieldBlanck') ||
            document.querySelector('input[type="text"], textarea, [contenteditable]') ||
            document.querySelector('.answersWrapper, .prMCQ__answerLabel, .lessonMultipleAnswer, input[type="radio"], input[type="checkbox"]') ||
            document.querySelector('.speakingInteractButtonWrapper, .recordingPanel') ||
            document.querySelector('a.button.continue')
        );
        const _hasVideoNow = !!document.querySelector('video, audio, #CTrackerPlayBtn, #play-pause');
        if (_hasVideoNow && !_hasInteractiveNow) {
            _log('[EDX] Video-only page detected (session present but no question DOM) — skipping fetch');
            __qType = 'instruction';
            updateTypeBadge('instruction');
            updateAnswerDisplay('Trang video / nghe — đang phát');
            if (window.updateStatus) updateStatus(UI_TEXT.status.playingVideo);
            if (shouldAutoAdvance() || isRunMode()) {
                _autoPlayVideo().then(() => {
                    setTimeout(() => {
                        if (window.updateStatus) updateStatus('');
                        if (shouldAutoAdvance()) goToNextItem();
                    }, 3000);
                }).catch(() => {
                    if (window.updateStatus) updateStatus('');
                });
            }
            __fetching = false;
            return false;
        }

        let qType = await waitForStableQuestionType();
        if (requestId !== __currentRequestId) { __fetching = false; return false; }
        _trace('question.detected', { qType, requestId, ms: Math.round(performance.now() - __loadStart) });
        __apiHasSession = true;
        if (!qType || qType === 'unknown') {
            const pageTypeHint = detectPageType();
            const nonQuestionKindHint = getNonQuestionPageKind();
            if (pageTypeHint === 'instruction' || nonQuestionKindHint === 'instruction_media' || nonQuestionKindHint === 'instruction_text') {
                _log('[EDX] Unknown page resolved as instruction; skipping API inference');
                __qType = 'instruction';
                updateTypeBadge('instruction');
                updateAnswerDisplay(nonQuestionKindHint === 'instruction_media'
                    ? 'Trang lý thuyết / media (đang chờ phát)'
                    : 'Trang lý thuyết');
                return false;
            }

            const hasInteractiveContent = !!(
                document.querySelector('.dndZone, .dnd-target, .TTpanswerDiv, .droptarget') ||
                document.querySelector('[class*="dropZone"], [class*="drop-zone"], .prFITB__fieldBlanck') ||
                document.querySelector('input[type="text"], textarea, [contenteditable]') ||
                document.querySelector('.answersWrapper, .mcqWrapper, [class*="mcq"], [class*="MCQ"]') ||
                document.querySelector('.speakingInteractButtonWrapper, .recordingPanel') ||
                document.querySelector('a.button.continue')
            );
            const hasVideoOnly = !!(
                document.querySelector('video, .videoContainer, [class*="videoPlayer"]') &&
                !hasInteractiveContent
            );
            if (hasVideoOnly) {
                _log('[EDX] Video-only page detected, skipping question handler');
                __qType = 'instruction';
                updateTypeBadge('instruction');
                updateAnswerDisplay('Trang video / nghe (không có câu hỏi)');
                if (shouldAutoAdvance()) {
                    _autoPlayVideo().catch(() => {});
                }
                return false;
            }

            // DOM detection failed, but the API might still have valid answers.
            // Pre-fetch the payload and try to infer the question type from it.
            _log('[EDX] DOM detection returned unknown: attempting API-based inference');
            let inferredType = 'unknown';
            try {
                const headers = { Authorization: autho };
                await delayFetchJitter();
                const peekRes = await fetch(patchAssessmentUrl(ansUrl), { headers, signal: __abortController.signal });
                if (requestId !== __currentRequestId) { __fetching = false; return false; }
                if (peekRes.ok) {
                    const peekText = await peekRes.text();
                    if (requestId !== __currentRequestId) { __fetching = false; return false; }
                    if (!peekText.includes('<html') && !peekText.includes('<!DOCTYPE')) {
                        const peekJson = JSON.parse(peekText);
                        const peekQs = peekJson?.i?.q || peekJson?.q || [];
                        const hasDistracters = Array.isArray(peekJson?.i?.d) && peekJson.i.d.length > 0;
                        const hasBlanks = peekQs.some(q => /<BLANK\s/i.test(q.qt || ''));
                        const hasMultipleOptions = peekQs.some(q =>
                            (q.al || []).some(ch => (ch.a || []).length > 1)
                        );
                        const isWritingType = peekQs.some(q =>
                            (q.al || []).some(ch => ch.t === 2)
                        );
                        if (isWritingType) {
                            inferredType = 'writing';
                        } else if (hasBlanks && hasDistracters) {
                            inferredType = 'dnd';
                        } else if (hasBlanks) {
                            inferredType = 'text';
                        } else if (hasMultipleOptions) {
                            const totalOptions = peekQs.reduce((acc, q) =>
                                acc + (q.al || []).reduce((a2, ch) => a2 + (ch.a || []).length, 0), 0);
                            inferredType = totalOptions > 4 ? 'checkbox' : 'mcq';
                        }
                        _log('[EDX] API-inferred qType:', inferredType,
                            '| hasBlanks:', hasBlanks,
                            '| hasDistracters:', hasDistracters,
                            '| hasMultipleOptions:', hasMultipleOptions);
                    }
                }
            } catch (e) {
                _warn('[EDX] API inference failed:', e.message);
            }

            if (inferredType === 'unknown') {
                __qType = 'unknown';
                updateTypeBadge('unknown');
                updateAnswerDisplay('Dạng câu hỏi chưa hỗ trợ');
                return false;
            }
            // Use the inferred type and continue with the normal parsing flow
            qType = inferredType;
            _log('[EDX] Proceeding with API-inferred qType:', inferredType);
        }
        const signals = collectVisibleQuestionSignals(qType);
        _trace('signals.collected', {
            qType,
            optionCount: signals.optionTexts?.length || 0,
            bankCount: signals.bankTexts?.length || 0,
            zoneCount: signals.dndZoneCount || 0,
            zoneHeaders: signals.zoneHeaders || [],
            promptText: signals.promptText || '',
        });
        const pageTypeAfterSignals = detectPageType();
        const isExplicitNonQuestionPage =
            pageTypeAfterSignals === 'instruction' ||
            pageTypeAfterSignals === 'start_test' ||
            pageTypeAfterSignals === 'review';
        const interactiveSignalCount =
            (signals.optionTexts?.length || 0) +
            (signals.bankTexts?.length || 0) +
            (signals.dndZoneCount || 0) +
            (signals.textInputCount || 0) +
            (signals.ddlCount || 0);
        if (interactiveSignalCount === 0 && isExplicitNonQuestionPage) {
            _warn('[EDX] Rejecting API-inferred question type on non-question page with empty DOM signals');
            __qType = pageTypeAfterSignals === 'start_test' ? 'start_test' : 'instruction';
            updateTypeBadge(__qType);
            updateAnswerDisplay(__qType === 'start_test'
                ? 'Trang bắt đầu bài, sẵn sàng chạy'
                : 'Trang lý thuyết / media (bấm Play hoặc Next)');
            return false;
        }
        const finalUrl = patchAssessmentUrl(ansUrl);
        const contextCandidates = [{ finalUrl, autho }];

        try {
            let bestParsed = null;
            let bestScore = -Infinity;
            let lastAuthFailure = false;


            const captures = await requestCapturedPayloads(600);
            if (requestId !== __currentRequestId) return false;
            
            const targetPath = new URL(finalUrl, location.origin).pathname;
            const targetSuffix = targetPath.split('GetItem/')[1]; // use full path for unique question matching
            
            let matchedJson = null;
            if (targetSuffix) {
                const matchedCap = captures.find(c => {
                    try {
                        return new URL(c.url, location.origin).pathname.includes(targetSuffix);
                    } catch(_) { return false; }
                });
                if (matchedCap && matchedCap.data) {
                    _log('[EDX] Found matching captured payload for', targetSuffix);
                    matchedJson = matchedCap.data;
                }
            }


            const maxCandidates = Math.min(contextCandidates.length, 1);
            for (let i = 0; i < maxCandidates; i++) {
                const candidate = contextCandidates[i];
                let ansJson = null;

                if (matchedJson) {
                    ansJson = matchedJson;
                } else {
                    _log('[EDX] No captured payload, falling back to fetch...');
                    const headers = { Authorization: candidate.autho };
                    await delayFetchJitter();
                    const ansRes = await fetch(candidate.finalUrl, { headers, signal: __abortController.signal });
                    if (requestId !== __currentRequestId) return false;
                    if (ansRes.status === 401 || ansRes.status === 403) {
                        __authBlockedUntil = Date.now() + 10000;
                        lastAuthFailure = true;
                        continue;
                    }
                    if (!ansRes.ok) continue;

                    const rawText = await ansRes.text();
                    if (requestId !== __currentRequestId) return false;
                    if (rawText.includes("<html") || rawText.includes("<!DOCTYPE")) continue;
                    try { ansJson = JSON.parse(rawText); } catch (_) { continue; }
                }

                if (!ansJson) continue;

                const parsed = parseAnswerPayload(ansJson, qType, __DEBUG && i === 0);
                const score = scoreParsedPayload(parsed, qType, signals);
                _log('[EDX] Candidate score', i, score, 'explicit:', parsed.hasExplicitCorrect, candidate.finalUrl);
                _trace('candidate.scored', {
                    index: i,
                    qType,
                    score,
                    explicit: parsed.hasExplicitCorrect,
                    url: candidate.finalUrl,
                    ansCount: parsed?.ans?.length || 0,
                    allCount: parsed?.allAns?.length || 0,
                    dndCategories: parsed?.dndCategories?.map(cat => ({ name: cat.catName, count: cat.allItems?.length || 0 })) || [],
                });
                if (score > bestScore) {
                    bestScore = score;
                    bestParsed = parsed;
                }
                // Stop early only when we have explicit correct-answer markers
                if (parsed.hasExplicitCorrect && parsed.ans.length > 0 && (qType === 'mcq' || qType === 'checkbox') && score >= 80) break;
                if (parsed.hasExplicitCorrect && parsed.ans.length > 0 && (qType === 'dnd' || qType === 'dnd_classification') && score >= 60) break;
            }

            if (!bestParsed) {
                if (qType === 'dnd' || qType === 'dnd_classification') {
                    const scrapedDnd = await scrapeCategorizedDndViaShowAnswer();
                    if (requestId !== __currentRequestId) return false;
                    if (scrapedDnd?.ans?.length) {
                        bestParsed = {
                            ans: scrapedDnd.ans,
                            allAns: scrapedDnd.ans.filter(Boolean),
                            apiZoneMap: new Map(),
                            ansQs: [],
                            questionTexts: [],
                            dndCategories: scrapedDnd.dndCategories || null,
                        };
                        bestScore = 100;
                    }
                }
            }

            if (!bestParsed) {
                if (lastAuthFailure) {
                    _warn("[EDX] Auth expired, auto-pausing...");
                    __authBlockedUntil = Date.now() + 10000;
                    if (__autoNext !== 'disable') {
                        __autoNext = 'disable';
                        if (typeof _updateAutoNextUI === 'function') _updateAutoNextUI();
                    }
                    flashBlock('Phát hiện truy cập bị từ chối (HTTP 401/403). Đã tự động tắt để đảm bảo an toàn.');
                    return false;
                }
                throw new Error("Không tìm thấy payload đáp án khớp với câu hiện tại.");
            }

            if ((qType === 'dnd' || qType === 'dnd_classification') && bestScore < 0) {
                const scrapedDnd = await scrapeCategorizedDndViaShowAnswer();
                if (requestId !== __currentRequestId) return false;
                if (scrapedDnd?.ans?.length) {
                    bestParsed = {
                        ans: scrapedDnd.ans,
                        allAns: scrapedDnd.ans.filter(Boolean),
                        apiZoneMap: new Map(),
                        ansQs: [],
                        questionTexts: [],
                        dndCategories: scrapedDnd.dndCategories || null,
                    };
                    bestScore = 100;
                } else {
                    throw new Error("Không tìm thấy payload kéo thả khớp với câu hiện tại.");
                }
            }

            __apiZoneMap = bestParsed.apiZoneMap;
            __dndCategories = bestParsed.dndCategories || null;
            __cardPairs = bestParsed.cardPairs || null;
            __allAns = bestParsed.allAns;
            __ans = bestParsed.ans;
            if (qType === 'mcq' || qType === 'checkbox') {
                const currentGroup = selectCurrentQuestionGroup(bestParsed, signals);
                if (currentGroup) {
                    __allAns = currentGroup.allAns;
                    __ans = currentGroup.ans;
                    _trace('question.group.selected', {
                        qType,
                        groupIndexes: currentGroup.indexes,
                        prompt: currentGroup.prompt,
                        ansCount: __ans.length,
                        allCount: __allAns.length,
                    });
                }
            }
            if (bestParsed.qType) __qType = bestParsed.qType;
            else if (qType && qType !== '?' && qType !== 'unknown') __qType = qType;

            const expectedCorrectCount = qType === 'checkbox' ? getExpectedCorrectCountFromPrompt() : 0;
            const shouldUseShowAnswerFallback =
                (qType === 'mcq' || qType === 'checkbox') &&
                __allAns.length > 0 && (
                    __ans.length === 0 ||
                    (qType === 'checkbox' && expectedCorrectCount > 1 && __ans.length < expectedCorrectCount)
                );
            _trace('answers.initial', {
                qType,
                expectedCorrectCount,
                ansCount: __ans.length,
                allCount: __allAns.length,
                shouldUseShowAnswerFallback,
            });

            // Fallback: if MCQ/checkbox inference is missing or under-counted, try Show Answer scraping
            if (shouldUseShowAnswerFallback) {
                _log('[EDX] Using Show Answer fallback for', qType, 'expected:', expectedCorrectCount, 'current:', __ans.length);
                const scraped = await scrapeCorrectViaShowAnswer(qType);
                if (requestId !== __currentRequestId) return false;
                if (scraped && scraped.length > 0) {
                    __ans = scraped;
                    _log('[EDX] Show Answer scraped', scraped.length, 'correct:', scraped);
                }
            }


            if (qType === 'checkbox' && expectedCorrectCount > 1 && __ans.length < expectedCorrectCount) {
                try {
                    const scopeData = await requestScopeMining(2000);
                    if (requestId !== __currentRequestId) { __fetching = false; return false; }
                    if (scopeData) {
                        _trace('scope.mining', {
                            correctCount: scopeData.correct?.length,
                            allCount: scopeData.all?.length,
                            rawItemsCount: scopeData.rawItems?.length,
                            extraKeys: Object.keys(scopeData).filter(k => k.startsWith('scope_')),
                        });
                        const scopeResult = buildAnswersFromScope(scopeData, qType, signals);
                        if (scopeResult && scopeResult.ans.length >= expectedCorrectCount) {
                            __ans = scopeResult.ans;
                            if (scopeResult.allAns.length >= __allAns.length) __allAns = scopeResult.allAns;
                            _log('[EDX] Scope mining recovered', __ans.length, 'answers:', __ans);
                        } else if (scopeResult && scopeResult.ans.length > __ans.length) {
                            __ans = scopeResult.ans;
                            _log('[EDX] Scope mining partial recovery:', __ans.length, 'answers:', __ans);
                        }
                    }
                } catch (_) { }
            }

            if (qType === 'checkbox' && expectedCorrectCount > 1 && __ans.length < expectedCorrectCount) {
                const inferredFromPassage = inferCheckboxAnswersFromPassage(__allAns, expectedCorrectCount, __ans);
                if (inferredFromPassage.length === expectedCorrectCount) {
                    __ans = inferredFromPassage;
                    _log('[EDX] Passage inference recovered checkbox answers:', inferredFromPassage);
                }
            }

            if (qType === 'checkbox' && expectedCorrectCount > 1 && __ans.length < expectedCorrectCount) {
                _trace('checkbox.fallback-incomplete', {
                    expected: expectedCorrectCount,
                    found: __ans.length,
                    ans: __ans,
                    allAns: __allAns,
                });
            }

            _trace('answers.final', {
                qType,
                expectedCorrectCount,
                ans: __ans,
                allAns: __allAns,
                dndCategories: __dndCategories?.map(cat => ({ name: cat.catName, count: cat.allItems?.length || 0 })) || [],
            });

            _log("[EDX] Loaded", __ans.length, "answers in", Math.round(performance.now() - __loadStart), "ms");


            const API_PRIORITY_TYPES = ['speaking', 'writing'];
            if (!bestParsed.qType || !API_PRIORITY_TYPES.includes(__qType)) {
                __qType = qType;
            }

            if (bestParsed.qType && API_PRIORITY_TYPES.includes(bestParsed.qType)) {
                if (bestParsed.qType === 'speaking' && !hasRealSpeakingUi()) {
                    _log('[EDX] Ignored API speaking override: no real speaking UI detected', '(DOM was:', qType, ')');
                } else {
                    __qType = bestParsed.qType;
                    _log('[EDX] API qType overrides DOM:', bestParsed.qType, '(was:', qType, ')');
                }
            }

            // Use itemType from API to distinguish MCQ vs Checkbox (0=MCQ, 1=Checkbox)
            if (bestParsed.itemType !== undefined && (__qType === 'mcq' || __qType === 'checkbox')) {
                const originalType = __qType;
                if (bestParsed.itemType === 0) {
                    __qType = 'mcq';
                } else if (bestParsed.itemType === 1) {
                    __qType = 'checkbox';
                }
                if (originalType !== __qType) {
                    _log('[EDX] itemType override:', bestParsed.itemType, '->', __qType, '(was:', originalType, ')');
                }
            }

            __lastFetchedUrl = ansUrl;
            updateTypeBadge(__qType);
            reorderAnsByVisualOrder(qType);
            __fetching = false;
            updateAnswerDisplay();
            return true;
        } catch (e) {
            if (e.name === 'AbortError') return false;
            _warn("[EDX] getAns inner:", e.message);
            updateAnswerDisplay("Lỗi tải đáp án (thử F5): " + e.message);
            return false;
        }
    } catch (e) {
        _warn('[EDX] getAns outer:', e.message);
        if (e.name !== 'AbortError') {
            updateAnswerDisplay("Lỗi bất ngờ (thử F5): " + (e.message || "Unknown error"));
        }
        return false;
    } finally {
        if (__fetching) __fetching = false;
    }
}

// ========================= SHOW ANSWER FALLBACK =========================
async function scrapeCorrectViaShowAnswer(qType) {
    try {
        const showBtnSels = [
            '.learning__showAnswerLink', '#learning__showAnswer',
            'a[title*="Show"]', 'button[title*="Show"]',
            'a[title*="show"]', 'button[title*="show"]',
        ];
        let showBtn = document.querySelector(showBtnSels.join(','));
        if (!showBtn) {
            showBtn = [...document.querySelectorAll('a, button')].find(el => {
                const t = (el.innerText || '').toLowerCase();
                return t.includes('show answer') || t.includes('see answer');
            });
        }
        if (!showBtn || !isElementVisible(showBtn)) return null;

        // Snapshot current state
        const isMCQ = qType === 'mcq';
        const labels = isMCQ
            ? [...document.querySelectorAll('.prMCQ__answerLabel')]
            : [
                ...document.querySelectorAll('.lessonMultipleAnswer'),
                ...(hasMcqCheckboxInputs() ? [...document.querySelectorAll('.prMCQ__answerLabel')] : [])
            ];
        if (!labels.length) return null;

        const before = labels.map(l => {
            const container = l.closest('.prMCQ__answer, .prMCQ__answerContainer, .prMCQ__answerWrapper') || l.parentElement;
            return {
                el: l,
                container,
                text: (l.innerText || l.textContent || '').trim(),
                classes: new Set([...l.classList, ...(container?.classList || [])]),
                checked: !!(container?.querySelector('input')?.checked)
            };
        });

        // Click Show Answer
        advancedClick(showBtn);


        const detectCorrectNow = () => {
            const result = [];
            labels.forEach((l, i) => {
                const b = before[i];
                if (!b) return;
                const container = l.closest('.prMCQ__answer, .prMCQ__answerContainer, .prMCQ__answerWrapper') || b.container || l.parentElement;

                const allCurrent = [...l.classList, ...(container?.classList || [])];
                const newClasses = allCurrent.filter(c => !b.classes.has(c));
                const newStr = newClasses.join(' ').toLowerCase();
                const allClassStr = allCurrent.join(' ').toLowerCase();
                const hasCorrectClass = allClassStr.includes('correct') || allClassStr.includes('right') ||
                    allClassStr.includes('success') || allClassStr.includes('green') || allClassStr.includes('show-answer') ||
                    (allClassStr.includes('check') && !allClassStr.includes('checkbox')) ||
                    newStr.includes('correct') || newStr.includes('right') ||
                    newStr.includes('success') || newStr.includes('green') || newStr.includes('show-answer');

                const input = container?.querySelector('input') || l.querySelector('input') || l.previousElementSibling;
                const nowChecked = !!input?.checked;
                const wasChecked = b.checked;
                const ariaChecked = (input?.getAttribute?.('aria-checked') || l.getAttribute?.('aria-checked') || container?.getAttribute?.('aria-checked') || '').toLowerCase() === 'true';

                const style = container ? window.getComputedStyle(container) : null;
                const labelStyle = window.getComputedStyle(l);
                const hasGreenBg = Boolean(
                    (style && style.backgroundColor.includes('rgb(') && !style.backgroundColor.includes('255, 255, 255')) ||
                    (labelStyle && labelStyle.backgroundColor.includes('rgb(') && !labelStyle.backgroundColor.includes('255, 255, 255'))
                );

                const selectedByShowAnswer = qType === 'checkbox'
                    ? ((nowChecked && !wasChecked) || ariaChecked || hasCorrectClass || hasGreenBg)
                    : (hasCorrectClass || (nowChecked && !wasChecked) || hasGreenBg);

                if (selectedByShowAnswer && b.text) result.push(b.text);
            });
            return result;
        };

        // Use try/finally to ALWAYS click Redo even if detection throws
        let correct = [];
        try {

            for (const waitMs of [1000, 400, 400, 400]) {
                await delay(waitMs);
                correct = detectCorrectNow();
                if (correct.length > 0) break;
            }
        } finally {

            const redoSels = [
                '.learning__retryLink', '#learning__retry',
                'a[title*="Redo"]', 'a[title*="redo"]',
                'a[title*="Reset"]', 'a[title*="reset"]',
                'button[title*="Redo"]', 'button[title*="Reset"]',
            ];
            let redoBtn = document.querySelector(redoSels.join(','));
            if (!redoBtn) {
                redoBtn = [...document.querySelectorAll('a, button')].find(el => {
                    const t = (el.innerText || '').toLowerCase();
                    return t.includes('redo') || t.includes('reset') || t.includes('try again');
                });
            }
            if (redoBtn) {
                advancedClick(redoBtn);
                await delay(600);
            }
        }

        return correct.length > 0 ? correct : null;
    } catch (e) {
        _warn('[EDX] scrapeCorrectViaShowAnswer error:', e.message);
        return null;
    }
}

async function scrapeCategorizedDndViaShowAnswer() {
    try {
        const showBtnSels = [
            '.learning__showAnswerLink', '#learning__showAnswer',
            'a[title*="Show"]', 'button[title*="Show"]',
            'a[title*="show"]', 'button[title*="show"]',
        ];
        let showBtn = document.querySelector(showBtnSels.join(','));
        if (!showBtn) {
            showBtn = [...document.querySelectorAll('a, button')].find(el => {
                const t = (el.innerText || '').toLowerCase();
                return t.includes('show answer') || t.includes('see answer');
            });
        }
        if (!showBtn || !isElementVisible(showBtn)) return null;

        advancedClick(showBtn);
        await delay(900);

        let categoryZones = getDndZones(true);
        if (!categoryZones.length) {
            categoryZones = Array.from(document.querySelectorAll('.prCLZ__regContainer .dndZone, .prCl__container.regContainer .dndZone, [class*="category"] .dndZone, .dnd-target.flex-1'));
        }
        if (!categoryZones.length) return null;

        const categories = [];
        categoryZones.forEach((zone, idx) => {
            let headerText = '';
            const container = zone.closest('.prCl__col, .col, .flex-1, [class*="column"], td, .prCLZ__regContainer > div, .dnd-column') || zone.parentElement;
            if (container) {
                const titleNode = container.querySelector('.prCLZ__regTitle, .title, .header, [class*="title"], [class*="header"], strong, b, h3, h4') || container.firstElementChild;
                if (titleNode && titleNode !== zone) {
                    headerText = (titleNode.innerText || titleNode.textContent || '').trim();
                }
            }
            const items = queryVisibleAll('.dnditem', zone)
                .map(el => (el.innerText || el.textContent || '').trim())
                .filter(Boolean);
            if (items.length) {
                categories.push({ catName: headerText || `Group ${idx + 1}`, allItems: items });
            }
        });

        const redoSels = [
            '.learning__retryLink', '#learning__retry',
            'a[title*="Redo"]', 'a[title*="redo"]',
            'a[title*="Reset"]', 'a[title*="reset"]',
            'button[title*="Redo"]', 'button[title*="Reset"]',
        ];
        let redoBtn = document.querySelector(redoSels.join(','));
        if (!redoBtn) {
            redoBtn = [...document.querySelectorAll('a, button')].find(el => {
                const t = (el.innerText || '').toLowerCase();
                return t.includes('redo') || t.includes('reset') || t.includes('try again');
            });
        }
        if (redoBtn) {
            advancedClick(redoBtn);
            await delay(700);
        }

        if (categories.length < 2) return null;

        const ans = [];
        categories.forEach(cat => {
            ans.push(cat.catName);
            cat.allItems.forEach(item => ans.push(item));
        });

        return { ans, dndCategories: categories };
    } catch (e) {
        _warn('[EDX] scrapeCategorizedDndViaShowAnswer error:', e.message);
        return null;
    }
}

// ========================= UTILS =========================
const clickElement = (sel) => document.querySelector(sel)?.click();
const goToNextItem = () => {
    if (_handleUnsubmittedTestModal()) {
        _log('[EDX] goToNextItem: submit modal handled, waiting for submit flow');
        return true;
    }
    // Aggressively target known English Discoveries 'next' buttons
    const selectors = [
        "#learning__nextItem",
        "#learning__nextItemLink",
        ".learning__nextItem",
        ".learning__nextItemLink",
        "[id*='nextItem' i]",
        "[class*='nextItem' i]",
        ".p-paginator-next",
        ".p-paginator .p-paginator-next",
        ".p-pagination-item--next",
        ".nextItem",
        ".next-btn",
        ".btnNext",
        "a.next",
        "button.next",
        "[data-action='next']",
        "[aria-label*='next' i]",
        "[title*='next' i]",
        "[aria-label*='continue' i]",
        "[title*='continue' i]",
        "[aria-label*='tiếp' i]",
        "[title*='tiếp' i]",
        "[title*='Next' i]", // Case-insensitive 'next'
        ".controls .next",   // Common footer structures
        ".navigation .next"
    ].join(", ");

    let nextBtn = document.querySelector(selectors);

    // If not found, try to find the arrow icon specifically (based on screenshot)
    if (!nextBtn) {
        const icons = document.querySelectorAll("i.icon-next, span.icon-next, .fa-chevron-right");
        if (icons.length > 0) nextBtn = icons[0].closest("button, a, div[role='button']") || icons[0];
    }

    // Fallback by semantic labels/text
    if (!nextBtn) {
        const candidates = [...document.querySelectorAll("button, a, [role='button'], .btn")];
        nextBtn = candidates.find((el) => {
            const text = (el.textContent || "").trim().toLowerCase();
            const aria = (el.getAttribute("aria-label") || "").trim().toLowerCase();
            const title = (el.getAttribute("title") || "").trim().toLowerCase();
            const navText = text || aria || title;
            return ["next", "continue", "tiếp", "kế tiếp", "câu sau", "trang sau", ">"]
                .some((k) => navText === k || navText.includes(k));
        }) || null;
    }

    // Fallback by paginator control
    if (!nextBtn) {
        const pagers = [...document.querySelectorAll(".p-paginator-next, .p-pagination-next, .pagination-next, [class*='paginator'][class*='next' i]")];
        nextBtn = pagers.find((el) => !!(el.offsetParent !== null || el.getClientRects?.().length)) || null;
    }

    const isVisible = !!(nextBtn && (nextBtn.offsetParent !== null || nextBtn.getClientRects?.().length));
    const isDisabled = !!(
        nextBtn && (
            nextBtn.disabled ||
            nextBtn.getAttribute("disabled") !== null ||
            nextBtn.getAttribute("aria-disabled") === "true" ||
            nextBtn.classList?.contains("disabled") ||
            nextBtn.classList?.contains("is-disabled")
        )
    );

    if (nextBtn && !isDisabled && isVisible) {
        advancedClick(nextBtn);
        nextBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
        nextBtn.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
        return true;
    } else {
        _log("[edx] Next button not found on this page.");
        return false;
    }
};

const norm = (s) => {
    let r = (s == null ? '' : String(s));
    r = r.replace(/\u00A0/g, ' ');
    r = r.replace(/<[^>]*>/g, "");
    r = r.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
    r = r.replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'");
    r = r.replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"');
    r = r.replace(/[\u2013\u2014\u2015]/g, "-");
    return r.toLowerCase().replace(/\s+/g, " ").trim();
};

function getExpectedCorrectCountFromPrompt() {
    const promptTexts = [
        queryVisible('.question-text, .practice__direction, .prMCQ__questionText')?.textContent || '',
        queryVisible('.lessonPlayArea')?.textContent || '',
        document.body?.textContent || ''
    ].map(norm).filter(Boolean);
    const prompt = promptTexts.join(' | ');
    if (!prompt) return 0;

    const digitMatch = prompt.match(/choose\s+(\d+)\s+correct\s+answer/);
    if (digitMatch) return Number(digitMatch[1]) || 0;

    const wordToNumber = {
        one: 1,
        two: 2,
        three: 3,
        four: 4,
        five: 5,
        six: 6
    };
    const wordMatch = prompt.match(/choose\s+(one|two|three|four|five|six)\s+correct\s+answer/);
    if (wordMatch) return wordToNumber[wordMatch[1]] || 0;

    return 0;
}

function getVisiblePassageText() {
    const roots = queryVisibleAll('.lessonPlayArea > div, .practice__container > div, main > div, [class*="splitter"] > div, [class*="panel"]');
    const leftRoots = roots.filter((el) => {
        const rect = el.getBoundingClientRect?.();
        if (!rect || rect.width < 220 || rect.height < 120) return false;
        return rect.left < window.innerWidth * 0.55;
    });

    const texts = leftRoots
        .map(el => (el.textContent || '').trim())
        .filter(text => text.length >= 120);

    if (texts.length) return texts.join(' ');

    const fallback = queryVisible('.lessonPlayArea, .practice__container, main');
    return (fallback?.textContent || '').trim();
}

function findSelectableSentenceNode(answerText) {
    const target = norm(answerText).replace(/[.!?,;:]+$/g, '').trim();
    if (!target || target.length < 8) return null;

    const candidates = queryVisibleAll('.lessonPlayArea span, .lessonPlayArea p, .lessonPlayArea div, .practice__container span, .practice__container p, .practice__container div, main span, main p, main div')
        .filter((el) => {
            const rect = el.getBoundingClientRect?.();
            if (!rect || rect.width < 40 || rect.height < 12) return false;
            if (rect.left > window.innerWidth * 0.6) return false;
            const text = norm(el.textContent || '').replace(/[.!?,;:]+$/g, '').trim();
            if (!text || text.length < 8) return false;
            if (!(text === target || text.includes(target) || target.includes(text))) return false;
            return true;
        })
        .sort((a, b) => {
            const lenA = Math.abs(norm(a.textContent || '').length - target.length);
            const lenB = Math.abs(norm(b.textContent || '').length - target.length);
            return lenA - lenB;
        });

    return candidates[0] || null;
}

function handleSentenceSelection() {
    try {
        if (!__ans?.length) return false;
        const target = __ans[0];
        const node = findSelectableSentenceNode(target);
        _trace('sentence-selection.lookup', {
            target,
            found: !!node,
            nodeText: node ? (node.textContent || '').trim() : '',
        });
        if (!node) return false;

        advancedClick(node);
        triggerAngularSync(node);
        return true;
    } catch (e) {
        _warn('[edx] SentenceSelection error:', e.message);
        return false;
    }
}

function inferCheckboxAnswersFromPassage(options, expectedCount, knownCorrect = []) {
    if (!Array.isArray(options) || !options.length || expectedCount <= 1) return [];

    const passage = norm(getVisiblePassageText());
    if (!passage || passage.length < 50) return [];

    const matched = uniqueByNorm(options.filter((option) => {
        const cleaned = norm(option).replace(/[.!?,;:]+$/g, '').trim();
        if (!cleaned || cleaned.length < 3) return false;
        return passage.includes(cleaned);
    }));


    if (matched.length === expectedCount) return matched;

    // Over-match: prioritize known correct answers, fill remaining from passage matches
    if (matched.length > expectedCount && knownCorrect?.length > 0) {
        const knownNorms = new Set(knownCorrect.map(norm));
        const sure = matched.filter(m => knownNorms.has(norm(m)));
        const rest = matched.filter(m => !knownNorms.has(norm(m)));
        const needed = expectedCount - sure.length;
        if (needed >= 0 && needed <= rest.length) {
            return uniqueByNorm([...sure, ...rest.slice(0, needed)]);
        }
    }

    return [];
}

const uniqueByNorm = (arr) => {
    const out = [];
    const seen = new Set();
    for (const value of (arr || [])) {
        const key = norm(value);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
};

function _fuzzyOverlap(a, b) {
    if (!a || !b) return 0;
    const tokensA = a.split(/\s+/).filter(t => t.length >= 3);
    const tokensB = new Set(b.split(/\s+/).filter(t => t.length >= 3));
    if (!tokensA.length) return 0;
    const matches = tokensA.filter(t => tokensB.has(t)).length;
    return matches / tokensA.length;
}

function _getVisibleZoneHeaders() {
    const headers = [];
    const categoryZones = queryVisibleAll('.dndZone, .dnd-target, [class*="dropZone"], [class*="droppable"]');
    categoryZones.forEach(zone => {
        const container = zone.closest('.prCl__col, .col, .flex-1, [class*="column"], td, .prCLZ__regContainer > div, .dnd-column') || zone.parentElement;
        if (!container) return;
        const titleNode = container.querySelector('.prCLZ__regTitle, .title, .header, [class*="title"], [class*="header"], strong, b, h3, h4');
        if (titleNode && !titleNode.contains(zone)) {
            const t = norm(titleNode.innerText || titleNode.textContent || '');
            if (t && t.length >= 2) headers.push(t);
        }
    });
    // Also check column headers above zones
    queryVisibleAll('.prCLZ__regTitle, [class*="columnHeader"], [class*="col-header"], th').forEach(el => {
        const t = norm(el.innerText || el.textContent || '');
        if (t && t.length >= 2 && !headers.includes(t)) headers.push(t);
    });
    return headers;
}

function isElementVisible(el) {
    try {
        if (!el || !el.isConnected) return false;
        if (el.hidden) return false;
        const style = window.getComputedStyle(el);
        if (!style || style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
        const rect = el.getBoundingClientRect?.();
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        let cur = el;
        while (cur && cur !== document.body && cur !== document.documentElement) {
            if (cur.hidden) return false;
            const curStyle = window.getComputedStyle(cur);
            if (!curStyle || curStyle.display === "none" || curStyle.visibility === "hidden" || curStyle.visibility === "collapse") return false;
            if (cur.getAttribute?.("aria-hidden") === "true") return false;
            cur = cur.parentElement;
        }
        return true;
    } catch (_) {
        return false;
    }
}

function queryVisibleAll(selector, root = document) {
    try {
        return [...root.querySelectorAll(selector)].filter(isElementVisible);
    } catch (_) {
        return [];
    }
}

function queryVisible(selector, root = document) {
    return queryVisibleAll(selector, root)[0] || null;
}

function hasMcqCheckboxInputs() {
    const labels = queryVisibleAll('.prMCQ__answerLabel');
    if (!labels.length) return false;
    return labels.some((label) => {
        if (label.querySelector('input[type="checkbox"]')) return true;
        const prev = label.previousElementSibling;
        if (prev?.matches?.('input[type="checkbox"]')) return true;
        const container = label.closest?.('.prMCQ__answer, .prMCQ__answerContainer, .prMCQ__answerWrapper');
        return !!container?.querySelector('input[type="checkbox"]');
    });
}

let __reviewScreenCache = { result: false, at: 0, signature: "" };

function getReviewScreenSignature() {
    const page = getCurrentAssessmentPage();
    const reviewNode = queryVisible('.learning__bodyW--SubComp-TestResults, .jsTestResults');
    const stepTitle = (queryVisible('.learning_stepInstructionsTitle')?.textContent || '').trim();
    const hasStartTest = !!queryVisible(
        '#testIntro.startTest.testEntry .btnStartTest, #testIntro .btnStartTest, ' +
        '#testIntro [class*="btnStartTest"], .testIntro .btnStartTest, ' +
        '.btnStartTest, [aria-label*="Start Test"], [title*="Start Test"]'
    );
    return [
        page ?? '?',
        stepTitle,
        hasStartTest ? 'start' : 'nostart',
        reviewNode ? 'review' : 'noreview'
    ].join('::');
}

function _isReminderModal() {
    const bodyText = document.body?.innerText || '';
    return /you need to play the video/i.test(bodyText) &&
        !![...document.querySelectorAll('button, a')]
            .find(el => /stay in this step/i.test(el.textContent) &&
                (el.offsetParent !== null || el.getClientRects?.().length));
}

function _isCompleteActivityModal() {
    const bodyText = document.body?.textContent || '';
    if (!/you need to complete the activity/i.test(bodyText)) return false;
    return !![...document.querySelectorAll('button, a')]
        .find(el => /stay in this step/i.test(el.textContent || ''));
}

function _findStayInStepButton() {
    return [...document.querySelectorAll('button, a')]
        .find((el) => {
            if (!/stay in this step/i.test(el.textContent || '')) return false;
            return el.offsetParent !== null || el.getClientRects?.().length;
        }) || null;
}

let __lastUnsubmittedModalHandledAt = 0;
function _handleUnsubmittedTestModal() {
    const now = Date.now();
    if (now - __lastUnsubmittedModalHandledAt < 1200) return true;

    const frame = document.querySelector('#EdoFrameBoxContent iframe, iframe[src*="MsgPage"], #colorBoxIframe');
    if (!frame) return false;

    try {
        const frameDoc = frame.contentDocument || frame.contentWindow?.document;
        if (!frameDoc) return false;

        const popupText = frameDoc.body?.innerText || frameDoc.body?.textContent || '';
        if (!/haven't submitted|haven't answered|submit the test/i.test(popupText)) return false;

        const submitBtn = frameDoc.querySelector('input[name="btnOk"], .okButton, [onclick*="terminateTest"]');
        if (!submitBtn) return false;

        __lastUnsubmittedModalHandledAt = now;
        _log('[EDX] Detected unsubmitted test modal - clicking Submit');
        if (window.updateStatus) updateStatus(UI_TEXT.status.submittingTest);
        try { advancedClick(submitBtn); } catch (_) {
            try { submitBtn.click?.(); } catch (_) { }
        }
        if (shouldAutoAdvance()) {
            setTimeout(() => _autoNextContinueAfterSubmit(), 1800);
        }
        return true;
    } catch (_) {
        return false;
    }
}

function checkAndCloseActivityModal() {
    if (_handleUnsubmittedTestModal()) return true;
    if (!_isReminderModal() && !_isCompleteActivityModal()) return false;
    const stayBtn = _findStayInStepButton();
    if (!stayBtn) return false;
    stayBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    _log('[EDX] Closed activity reminder modal via "Stay in this step"');
    return true;
}

function hasRealSpeakingUi(root = document) {
    // Exclude Start Test pages to avoid misclassification
    if (isVisibleStartTestPage()) return false;
    
    const strongSelectors = [
        '.recordingPanel',
        '.recordingPanelWrapper',
        '.recordingPanelSentence',
        '.learning__SpeakingPal',
        '[id*="CTrackerSpeakBtn"]',
        '.speakingInteractButtonWrapper',
        '.speakingInteract__chooseSpeaker',
        '.speakingInteract__speakerImg',
        '.speakingInteract__speaker',
        '.lessonAnswerSentenceWrapper',
    ];
    if (strongSelectors.some((sel) => queryVisible(sel, root))) return true;

    const visibleButtons = queryVisibleAll('button, a, [role="button"]', root);
    // Exclude Start Test buttons to avoid misclassifying test pages
    const isStartTestButton = (text) => /start\s*test/i.test(text);
    if (visibleButtons.some((el) => {
        const text = el.textContent || '';
        if (isStartTestButton(text)) return false;
        return /\b(start\s+recording|record|try\s+again|stop\s+recording)\b/i.test(text);
    })) {
        return true;
    }

    const hasMicUi = !!queryVisible('.speakingLips, [class*="speakingInteract"]', root);
    const hasSentenceUi = !!queryVisible('.sentenceWrapper, .recordingPanelSentence, .lessonAnswerSentenceWrapper', root);
    return hasMicUi && hasSentenceUi;
}

// Detect modal/confirmation dialogs
function _isModalDialogVisible() {
    if (_isReminderModal()) return false;
    if (_isCompleteActivityModal()) return false;
    // 1. Check common modal selectors
    const modalSelectors = [
        '.modal.show', '.modal.in', '.modal[style*="display: block"]',
        '.dialog-overlay', '.overlay.active', '.popup-overlay',
        '[class*="componentPanelContainer"][style*="display: block"]',
        '.swal2-popup', '.swal-overlay--show-modal',
    ];
    for (const sel of modalSelectors) {
        const el = document.querySelector(sel);
        if (el && (el.offsetParent !== null || el.getClientRects?.().length)) return true;
    }

    const dialogBtnTexts = ['cancel', 'continue', 'submit'];
    const btns = [...document.querySelectorAll('button, a')];
    const inModalCtx = (b) => !!b.closest('[role="dialog"], .modal, .swal2-popup, [class*="modal"], [class*="dialog"]');
    const visibleDialogBtns = btns.filter(b => {
        const t = (b.textContent || '').trim().toLowerCase();
        return dialogBtnTexts.includes(t)
            && (b.offsetParent !== null || b.getClientRects?.().length)
            && inModalCtx(b);
    });
    if (visibleDialogBtns.length >= 2) {
        // Two or more dialog-like buttons visible = very likely a modal
        return true;
    }
    // 3. Check for known dialog text patterns
    const bodyText = document.body?.innerText || '';
    const dialogPatterns = [
        "haven't submitted", "haven't answered", "not be recorded",
        "exit now", "sure you want to submit", "want to continue",
        "are you sure",
    ];
    if (dialogPatterns.some(p => bodyText.includes(p))) {
        if (visibleDialogBtns.length >= 1) return true;
    }
    return false;
}

function isReviewSummaryScreen() {
    const now = Date.now();
    const signature = getReviewScreenSignature();
    if (
        now - __reviewScreenCache.at < 250 &&
        __reviewScreenCache.signature === signature
    ) {
        return __reviewScreenCache.result;
    }
    if (hasVisibleStepInstructions() || isVisibleStartTestPage()) {
        __reviewScreenCache = { result: false, at: now, signature };
        return false;
    }
    if (queryVisible('.learning__bodyW--SubComp-TestResults, .jsTestResults')) {
        __reviewScreenCache = { result: true, at: now, signature };
        return true;
    }
    const pageText = norm(document.body?.textContent || "");
    if (!pageText) {
        __reviewScreenCache = { result: false, at: now, signature };
        return false;
    }
    const result = (
        pageText.includes("your test score is") ||
        pageText.includes("please review your answers") ||
        pageText.includes("to review your answers") ||
        pageText.includes("click on the review button below")
    );
    __reviewScreenCache = { result, at: now, signature };
    return result;
}

function hasVisibleMediaControls() {
    return !!(queryVisible(
        'video, audio, #CTrackerPlayBtn, #play-pause, .CTrackerPlayBtn, ' +
        '.layout_mediaPlayPause, .layout__mediaPlayPause, ' +
        '[class*="mediaPlayPause"], [class*="CTrackerPlayBtn"], ' +
        '[class*="mediaPlay"], [class*="videoPlayer"], [class*="audioPlayer"], ' +
        '[class*="mediaTimeline"], [class*="tracker"], ' +
        '.lessonVideo, .lessonAudio, .lesson-video, .practiceVideo'
    ) || document.querySelector(
        'video, audio, #CTrackerPlayBtn, #play-pause, .CTrackerPlayBtn, ' +
        '.layout_mediaPlayPause, .layout__mediaPlayPause, ' +
        '[class*="mediaPlayPause"], [class*="CTrackerPlayBtn"], ' +
        '[class*="mediaPlay"], [class*="videoPlayer"], [class*="audioPlayer"], ' +
        '[class*="mediaTimeline"], [class*="tracker"], ' +
        '.lessonVideo, .lessonAudio, .lesson-video, .practiceVideo'
    ));
}

function getVisiblePracticeAreaRoot() {
    return queryVisible(
        '#rightDiv.learning_practiceArea, #rightDiv, ' +
        '.learning_practiceArea.rightDiv, .learning_practiceArea'
    );
}

function getVisiblePmContainer(root = getVisiblePracticeAreaRoot()) {
    if (!root) return null;
    return queryVisible('#pmContainer, .pmContainer', root);
}

function hasVisibleStepInstructions() {
    const title = queryVisible('.learning_stepInstructionsTitle');
    const text = queryVisible('.learning_stepInstructionsText');
    return !!(title && text);
}

function hasVisibleStandaloneResourceArea() {
    if (getVisiblePracticeAreaRoot()) return false;
    return !!queryVisible(
        '.learning__resourcesArea, .learning__resourcesArea--full, ' +
        '.leftDiv, #leftDiv, .learning__RAIWrapper, #bgContainer, ' +
        '[class*="RAMediaResourceW"], [class*="RAMediaResource"], ' +
        '[class*="RAMediaAw"], [class*="RATextResource"], ' +
        '.mediaContainer, #trContainer, .CTrackerCtrl, ' +
        '[class*="audioControls"], [class*="mediaContainer"]'
    );
}

function isVisibleInstructionPage() {
    if (hasRealSpeakingUi()) return false;
    const hasVisiblePractice = !!getVisiblePracticeAreaRoot();
    const hasPracticeNode = !!document.querySelector('#rightDiv, .learning_practiceArea.rightDiv, .learning_practiceArea');
    const hasVisibleResourceArea = !!queryVisible(
        '.learning__resourcesArea, .learning__resourcesArea--full, ' +
        '.leftDiv, #leftDiv, .learning__RAIWrapper, .learning__RAMediaResourceW'
    );
    const hasStandaloneResourceArea = hasVisibleStandaloneResourceArea();
    if (hasVisibleStepInstructions()) {
        if (hasPracticeNode && !hasVisiblePractice) return true;
        return hasVisibleMediaControls() || hasVisibleResourceArea || hasStandaloneResourceArea;
    }
    return !hasVisiblePractice && hasStandaloneResourceArea;
}

function isVisibleStartTestPage() {
    const startBtn = queryVisible(
        '#testIntro.startTest.testEntry .btnStartTest, #testIntro .btnStartTest, ' +
        '#testIntro [class*="btnStartTest"], .testIntro .btnStartTest, ' +
        '.btnStartTest, [aria-label*="Start Test"], [title*="Start Test"]'
    );
    if (!startBtn) return false;
    return !getVisiblePracticeAreaRoot();
}

function getNonQuestionPageKind() {
    if (hasRealSpeakingUi()) return null;
    const hasInstructions = hasVisibleStepInstructions();
    const hasMedia = hasVisibleMediaControls();
    const hasQuestion = hasVisibleQuestionDom();
    const hasStandaloneResourceArea = hasVisibleStandaloneResourceArea();
    const hasNextBtn = !!queryVisible(
        '#learning__nextItem, .learning__nextItem, #learning__nextItemLink, ' +
        '.p-paginator-next, .btnContinue, .btn-continue'
    );

    if (isVisibleStartTestPage()) return 'start_test';

    if (!hasQuestion && (hasInstructions || hasStandaloneResourceArea || hasMedia)) {
        // Safety check: on split-layout pages (video left + DnD right),
        // hasVisibleQuestionDom() may miss drag items in the right panel.
        // Do a broader, unscoped DOM query as a second opinion.
        const hasDndGlobal = !!document.querySelector(
            '.dnditem, .dnd-item, .dndItem, cdk-drag, .dragItem, .drag-item, ' +
            '.dndZone, .dnd-target, .dropZone, cdk-drop-list, ' +
            '.prMCQ__answerLabel, .lessonMultipleAnswer, .prFITB__DDLOptionsW, ' +
            '.prFITB__fieldBlanck input, ed-la-fitb input, ed-la-dictation input'
        );
        if (hasDndGlobal) return null; // Has interactive question elements — not an instruction page
        return hasMedia ? 'instruction_media' : 'instruction_text';
    }

    if (isReviewSummaryScreen()) return 'review';

    const pageType = resolveSectionPageType();
    if (pageType === 'question' || pageType === 'unknown') {
        if (!hasQuestion && hasNextBtn) return 'instruction_text';
        return null;
    }
    if (pageType === 'start_test') return 'start_test';
    if (pageType === 'review') return 'review';

    if ((pageType === 'instruction' || hasInstructions) && !hasQuestion) {
        return hasMedia ? 'instruction_media' : 'instruction_text';
    }

    if (!hasQuestion) {
        if (hasMedia || hasStandaloneResourceArea) return hasMedia ? 'instruction_media' : 'instruction_text';
        if (hasNextBtn) return 'instruction_text';
    }

    return null;
}

function hasVisibleQuestionDom() {
    const root = getVisiblePracticeAreaRoot();
    if (!root) return false;
    const pmRoot = getVisiblePmContainer(root) || root;
    return !!queryVisible(
        '.prMCQ__answerLabel, .lessonMultipleAnswer, .prFITB__DDLOptionsW, ' +
        '.dnditem, .dnd-item, .dndItem, [draggable="true"], cdk-drag, .dragItem, .drag-item, [class*="dragItem"], [class*="drag-item"], ' +
        'cdk-drop-list, .dnd-target, .dropZone, .dndZone, ' +
        '.prOpenEnded__qaItemText, .prFITB__fieldBlanck input, textarea, ' +
        'ed-la-sorting-text, ed-la-ordering, ed-la-dictation input, ed-la-fitb input, ' +
        'span.et[contenteditable]:not([contenteditable="false"]), ' +
        '[class*="question"] input[type="radio"], [class*="question"] input[type="checkbox"], ' +
        '.recordingPanel, .learning__SpeakingPal, .recordingPanelSentence, .sentenceWrapper, [class*="speaking" i]'
    , pmRoot);
}


function detectPageType() {
    const visiblePracticeRoot = getVisiblePracticeAreaRoot();
    const visiblePmRoot = getVisiblePmContainer(visiblePracticeRoot);
    const questionScope = visiblePmRoot || visiblePracticeRoot;

    if (isVisibleStartTestPage()) {
        return 'start_test';
    }

    if (hasRealSpeakingUi(questionScope || document)) {
        return 'question';
    }

    if (isVisibleInstructionPage()) {
        return 'instruction';
    }

    if (isReviewSummaryScreen()) return 'review';

    const hasQuestionElements = !!(questionScope && queryVisible(
        '.prMCQ__answerLabel, .prFITB__DDLOptionsW, ' +
        '.dnditem, .dnd-item, .dndItem, [draggable="true"], cdk-drag, .dragItem, .drag-item, [class*="dragItem"], [class*="drag-item"], ' +
        'cdk-drop-list, .dnd-target, .dropZone, .dndZone, ' +
        '.prOpenEnded__qaItemText, .prFITB__fieldBlanck input, ' +
        'ed-la-sorting-text, ed-la-ordering, span.et[contenteditable]:not([contenteditable="false"]), ' +
        '.lessonMultipleAnswer, [class*="question"] input[type="radio"], [class*="question"] input[type="checkbox"], ' +
        'ed-la-writing, .tox-tinymce, iframe[id*="tiny"], ed-la-memory-game, ed-la-matching-game, .backSide, .memory-card, ' +
        '.recordingPanel, .learning__SpeakingPal, .recordingPanelSentence, .sentenceWrapper, [class*="speaking" i]'
    , questionScope));


    if (hasQuestionElements) {
        return 'question';
    }


    const hasStartTestBtn = !!queryVisible(
        '.btnStartTest, [aria-label*="Start Test"], [title*="Start Test"]'
    );
    if (hasStartTestBtn) {
        return 'start_test';
    }

    // 4. Text patterns
    const bodyText = document.body?.innerText?.toLowerCase() || '';
    const pageTitle = document.title?.toLowerCase() || '';

    // 5. Instruction patterns (Step 1, Step 2, vocabulary lists)
    const instructionPatterns = [
        /step\s+[12]\s*:?\s*(explore|focusing on vocabulary)/i,
        /here is a list of words and phrases/i,
        /listen to the (conversation|dialogue|recording)/i,
        /listen to the conversation again and do the tasks that follow/i,
        /read the (text|passage|article)/i,
        /watch the video/im,
        /look at the picture/i,
        /focusing on vocabulary/i,
        /use the student tools/i,
    ];

    // Guard: if body text strongly implies a real question, don't override with instruction patterns
    if (/drag the correct answer|drag.*into place/i.test(bodyText)) return 'question';
    if (/choose the correct answer|select the correct|fill in the blank/i.test(bodyText)) return 'question';
    if (/true or false|true\/false|decide if.*true or false/i.test(bodyText)) return 'question';
    if (/are the following.*true or false|mark.*true.*false/i.test(bodyText)) return 'question';

    if (queryVisible('.prWriting__editorW, .prWriting__editorSaveBtn, .mceEditor')) return 'question';

    const hasSaveEdit = !!queryVisibleAll('button, [role="button"]', visiblePmRoot || visiblePracticeRoot || document)
        .find(el => /^(save|edit text)$/i.test((el.textContent || '').trim()));
    if (hasSaveEdit) return 'question';


    const hasClickableOptions = !!(questionScope && queryVisible(
        '.lessonMultipleAnswer, .learning__selectTxt_st, .multiRadio, .multiBtnText, .answerBtn, ' +
        '[class*="answerOption"], [class*="answer-option"], [class*="selectTxt"]'
    , questionScope));
    if (hasClickableOptions) return 'question';

    for (const pattern of instructionPatterns) {
        if (pattern.test(bodyText) || pattern.test(pageTitle)) {
            return 'instruction';
        }
    }

    // 5.5 Question types detected via text patterns (no standard DOM inputs):
    //    Card-match: "click on the boxes to match the words and pictures"
    //    Sentence-fit: "select the place in the text where these sentences best fit"
    if (
        bodyText.includes('click on the boxes to match') ||
        bodyText.includes('click on the box to match') ||
        bodyText.includes('click on the cards to match') ||
        bodyText.includes('match the words and pictures') ||
        bodyText.includes('match the electrical appliances') ||
        !!(questionScope && queryVisible('.card-back, .card-front', questionScope)) // Explicit elements for card matching
    ) {
        return 'question'; // card_match
    }
    if (
        bodyText.includes('select the place in the text') ||
        bodyText.includes('select where these sentences best fit') ||
        bodyText.includes('where these sentences best fit')
    ) {
        return 'question'; // sentence_fit
    }

    // 6. Structural fallback: if no question inputs exist AND a next button is available,


    const hasQuestionInputs = !!(questionScope && queryVisible(
        '.prMCQ__answerLabel, .lessonMultipleAnswer, .prFITB__DDLOptionsW, ' +
        '.dnditem, .dnd-item, .dndItem, [draggable="true"], cdk-drag, .dragItem, .drag-item, [class*="dragItem"], [class*="drag-item"], ' +
        'cdk-drop-list, .dnd-target, .dropZone, .dndZone, ' +
        '.prOpenEnded__qaItemText, .prFITB__fieldBlanck input, ' +
        'ed-la-sorting-text, ed-la-ordering, ed-la-dictation input, ed-la-fitb input, span.et[contenteditable]:not([contenteditable="false"]), ' +
        '.prSentenceSelection, [class*="question"] input[type="radio"], [class*="question"] input[type="checkbox"], ' +
        'ed-la-writing, .tox-tinymce, iframe[id*="tiny"], ed-la-memory-game, ed-la-matching-game, .backSide, .memory-card, ' +
        '.recordingPanel, .learning__SpeakingPal, .recordingPanelSentence, .sentenceWrapper, [class*="speaking" i]'
    , questionScope));
    if (!hasQuestionInputs) {

        const hasNextBtn = !!queryVisible(
            '#learning__nextItem, .learning__nextItem, #learning__nextItemLink, ' +
            '.p-paginator-next, .btnContinue, .btn-continue'
        );
        const hasQuestionPrompt = /choose the correct|select the correct|fill in|drag the|complete the/i.test(bodyText);
        if (hasNextBtn && !hasQuestionPrompt) return 'instruction';
    }

    // 7. Video/audio-only page: has a media player but no question elements
    const hasMediaPlayer = hasVisibleMediaControls();
    if (hasMediaPlayer && !hasQuestionInputs) return 'instruction';

    return 'unknown';
}

function resolveSectionPageType() {
    const pageType = detectPageType();
    if (pageType !== 'unknown') return pageType;

    if (hasRealSpeakingUi()) return 'question';
    if (!hasVisibleQuestionDom() && hasVisibleStandaloneResourceArea()) return 'instruction';
    if (isVisibleInstructionPage()) return 'instruction';
    if (isVisibleStartTestPage()) return 'start_test';
    if (hasVisibleQuestionDom()) return 'question';

    const bodyText = (document.body?.innerText || '').toLowerCase();
    if (
        /step\s+[12]\s*:?\s*(explore|focusing on vocabulary)/i.test(bodyText) ||
        /listen to the (conversation|dialogue|recording)/i.test(bodyText) ||
        /use the student tools/i.test(bodyText) ||
        /here is a list of words and phrases/i.test(bodyText)
    ) {
        return 'instruction';
    }

    if (queryVisible('.btnStartTest, [aria-label*="Start Test"], [title*="Start Test"]')) {
        return 'start_test';
    }

    if (isReviewSummaryScreen()) return 'review';
    return 'unknown';
}

async function waitForStableQuestionType(timeoutMs = 500) {
    const deadline = Date.now() + timeoutMs;
    let lastType = null;
    let stableHits = 0;

    while (Date.now() < deadline) {
        if (isReviewSummaryScreen()) return "unknown";
        const currentType = detectQuestionType();
        if (currentType && currentType !== "unknown") {
            if (currentType === lastType) stableHits++;
            else {
                lastType = currentType;
                stableHits = 1;
            }
            if (stableHits >= 2) return currentType;
        }
        await delay(40);
    }

    return detectQuestionType();
}

function triggerAngularSync(el) {
    try {
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        const tag = '__edx_sync_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        el.setAttribute('data-edx-sync', tag);
        __dispatchBridgeEvent(document, '__edx_sync_element', { detail: { tag } });
        setTimeout(() => el.removeAttribute('data-edx-sync'), 1000);
    } catch (_) { }
}

function advancedClick(el) {
    if (!el) return;
    // Focus document.body first to ensure a valid selection context for page JS (avoids getSelection() = null)
    try { if (document.body && document.activeElement !== document.body) document.body.focus(); } catch (_) { }
    const opts = { bubbles: true, cancelable: true, view: window, composed: true };
    el.dispatchEvent(new MouseEvent("mouseover", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    if (typeof el.click === 'function') {
        try { el.click(); } catch (_) { el.dispatchEvent(new MouseEvent("click", Object.assign({}, opts, { detail: 1 }))); }
    } else {
        el.dispatchEvent(new MouseEvent("click", Object.assign({}, opts, { detail: 1 })));
    }
}

const sortVisually = (arr) => {
    return arr.sort((a, b) => {
        try {
            const getRect = (el) => typeof el.getBoundingClientRect === 'function'
                ? el.getBoundingClientRect() : { top: 0, left: 0 };
            const rA = getRect(a), rB = getRect(b);
            if (Math.abs(rA.top - rB.top) > 15) return rA.top - rB.top;
            return rA.left - rB.left;
        } catch (e) { return 0; }
    });
};

const isTypingContext = (e) => {
    try {
        const el = document.activeElement || e?.target;
        if (!el) return false;
        const tag = el.tagName?.toUpperCase();
        const type = el.type?.toLowerCase();
        if (el.isContentEditable) return true;
        if (tag === "TEXTAREA") return true;
        if (tag === "INPUT") return !["checkbox", "radio", "button", "submit", "range", "color", "file", "image", "reset", "hidden"].includes(type);
        return false;
    } catch (_) { return false; }
};



// ========================= VISUAL REORDER FOR DISPLAY =========================
// Reorder __ans to match the visual (top-to-bottom, left-to-right) order of
// the interactive elements on the page. This makes the panel display match what
// the user sees. Filling logic already uses zone-ID mapping, so this is purely
// cosmetic for the panel.

function reorderAnsByVisualOrder(qType) {
    if (!__ans?.length) return;

    const hasSameAnswerMultiset = (left, right) => {
        if (!Array.isArray(left) || !Array.isArray(right)) return false;
        if (left.length !== right.length) return false;

        const count = (arr) => {
            const map = new Map();
            arr.forEach((item) => {
                const key = norm(item);
                if (!key) return;
                map.set(key, (map.get(key) || 0) + 1);
            });
            return map;
        };

        const a = count(left);
        const b = count(right);
        if (a.size !== b.size) return false;
        for (const [key, value] of a.entries()) {
            if (b.get(key) !== value) return false;
        }
        return true;
    };

    // Collect all interactive slots on the page based on question type
    let slots = [];
    try {
        if (qType === 'ddl') {
            slots = sortVisually([...document.querySelectorAll(".prFITB__DDLOptionsW")]);
        } else if (qType === 'text') {
            slots = findTextInputs(); // already sorted visually
        } else if (qType === 'dnd' || qType === 'dnd_sequence' || qType === 'dnd_classification') {
            slots = getDndZones();    // already sorted visually
        }
        // MCQ/checkbox: answers are unordered options, visual order of labels
        // doesn't correspond 1:1 to __ans entries, so skip reorder for those.
    } catch (_) { return; }

    if (!slots.length || slots.length < __ans.length) return;

    // For each visual slot, resolve its answer.

    const orderedx = [];
    const usedIndices = new Set();

    for (let i = 0; i < Math.min(slots.length, __ans.length); i++) {
        let ans = null;
        try {
            if (qType === 'ddl') {
                ans = resolveDdlAnswer(slots[i], i);
            } else if (qType === 'text') {
                ans = resolveInputAnswer(slots[i], i);
            } else if (qType === 'dnd' || qType === 'dnd_sequence' || qType === 'dnd_classification') {
                ans = resolveZoneAnswer(slots[i], i);
            }
        } catch (_) { }

        if (ans && norm(ans)) {
            orderedx.push(ans);
            const idx = __ans.findIndex((a, j) => !usedIndices.has(j) && norm(a) === norm(ans));
            if (idx >= 0) usedIndices.add(idx);
        }
    }

    if (hasSameAnswerMultiset(__ans, orderedx)) {
        _log('[EDX] Reordered __ans by visual order:', orderedx);
        __ans = orderedx;
    } else {
        _warn('[EDX] Skip unsafe visual reorder:', { before: __ans, after: orderedx });
    }
}

// ========================= SELECTORS =========================
const dndBankSel =
    ".dndBank, [id^='bank_'], ed-la-dndcloze, [dg_name='TTpTablePlaceHolder'], " +
    "#bankContainer .dndZone, .prCl__container--bank .dndZone, " +
    ".prMT_T2T__wordsBankWrapper .dndZone, .prCl__container--bank, " +
    "#TTpTablePlaceHolder, .wordsBankTable, " +
    "[class*='wordBank'], [class*='word-bank'], [class*='WordBank']";

const bankSelector =
    ".dndBank, [id^='bank_'], [dg_name='TTpTablePlaceHolder'], " +
    "#bankContainer .dndZone, .prCl__container--bank .dndZone, " +
    ".prMT_T2T__wordsBankWrapper .dndZone, .prCl__container--bank, " +
    "#TTpTablePlaceHolder, .wordsBankTable";

function getDndZones(includeMultiItem = false) {
    const selectors = ".dndZone, .dnd-target, [class*='dropZone'], [class*='drop-zone'], cdk-drop-list, [class*='droppable'], .prFITB__fieldBlanck.dnd-target, ed-la-dndcloze .dnd-target, .droptarget, .TTpanswerDiv, .TTpanswerDiv.droptarget";
    const zones = queryVisibleAll(selectors).filter(z => {
        if (z.closest(".prCl__container--bank")) return false;
        if (z.closest(".prMT_T2T__wordsBankWrapper")) return false;
        if (z.closest("[class*='wordBank']")) return false;
        if (z.closest("[class*='word-bank']")) return false;
        if (z.closest("[class*='WordBank']")) return false;
        if (z.closest("#bankContainer")) return false;
        if (z.closest("#TTpTablePlaceHolder")) return false;
        if (!includeMultiItem) {
            const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
            const dndItems = z.querySelectorAll(itemSelectors);
            if (dndItems.length > 1) return false;
        }
        return true;
    });
    return sortVisually(zones);
}

// ========================= DETECT QUESTION TYPE =========================
function detectQuestionType() {
    if (isReviewSummaryScreen()) return "unknown";
    if (queryVisible("ed-la-sorting-text, ed-la-ordering, .prSO__container")) return "dnd_sequence";

    // Explicit cloze check
    if (queryVisible("ed-la-dndcloze, .prFITB__fieldBlanck.dnd-target")) return "dnd";

    const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
    const dndItems = queryVisibleAll(itemSelectors);
    if (dndItems.length > 0 && !queryVisible(dndBankSel)) {
        const isCategorized = queryVisibleAll(
            ".prCLZ__regContainer .dndZone, .prCl__container.regContainer .dndZone, [class*='category'] .dndZone"
        ).length > 0;
        if (!isCategorized) return "dnd_sequence";
    }
    // Check for MCQ/Checkbox BEFORE checking classification to avoid misdetection
    // (Angular containers like .prCLZ__regContainer can appear on checkbox pages)
    if (hasMcqCheckboxInputs()) return "checkbox";
    if (queryVisible(".prMCQ__answerLabel")) return "mcq";
    if (queryVisible(".lessonMultipleAnswer")) return "checkbox";

    // Classification DnD (type 1) - table with multiple columns
    // Only if we confirmed there are REAL drag items AND no MCQ/checkbox inputs
    if (queryVisible('.prCLZ__regContainer, .prCl__container') && dndItems.length > 0) {
        return "dnd_classification";
    }
    if (queryVisible(dndBankSel) && dndItems.length > 0) return "dnd";

    const pageText = norm(document.body?.textContent || '');
    if (
        pageText.includes('click on the boxes to match') ||
        pageText.includes('click on the box to match') ||
        pageText.includes('click on the cards to match') ||
        pageText.includes('match the words and pictures') ||
        pageText.includes('match the electrical appliances') ||
        queryVisible('.card-back') || queryVisible('.card-front')
    ) return 'card_match';
    if (pageText.includes('select the place in the text') || pageText.includes('select where these sentences best fit')) {
        return 'sentence_fit';
    }
    if (pageText.includes('select the sentence in the text') || pageText.includes('click on the sentence in the text')) {
        return 'text';
    }
    
    // (MCQ/checkbox checks moved above dnd_classification)
    if (queryVisible(".prFITB__DDLOptionsW")) return "ddl";

    // Explicitly unsupported types for now
    if (queryVisible('ed-la-writing, .tox-tinymce, iframe[id*="tiny"], .prWriting__editorW, .prWriting__editorSaveBtn, .mceEditor') || pageText.includes('write a short paragraph')) return "writing";
    if (queryVisible('ed-la-memory-game, ed-la-matching-game, .backSide, .memory-card')) return "unsupported_memory";
    if (hasRealSpeakingUi() &&
        !queryVisible('.prMCQ__answerLabel, input[type="radio"], input[type="checkbox"], .lessonMultipleAnswer'))
        return 'speaking';

    const hasText = queryVisible(
        '.prOpenEnded__qaItemText, input[type="text"], input:not([type]), input[type="field"], textarea, span.et[contenteditable]:not([contenteditable="false"]),' +
        '.prFITB__fieldBlanck input, ed-la-dictation input, ed-la-fitb input,' +
        '.practice__container input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="button"]):not([type="submit"]),' +
        '.lessonPlayArea input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="button"]):not([type="submit"])'
    );
    if (hasText) return "text";
    return "unknown";
}

// ========================= HANDLER: MCQ =========================
async function handleMCQ() {
    try {
        if (!__ans?.length) return false;
        const set = new Set(__ans.map(norm));
        const labels = queryVisibleAll(".prMCQ__answerLabel");
        if (!labels.length) return false;
        let n = 0;
        let isAnyCorrectSelected = false;
        for (const l of labels) {
            const t = norm(l.innerText || l.textContent || "");
            let input = l.querySelector('input[type="radio"], input[type="checkbox"]');
            if (!input) {
                const prev = l.previousElementSibling;
                if (prev?.matches?.('input[type="radio"], input[type="checkbox"]')) input = prev;
            }
            if (!input) {
                const container = l.closest?.('.prMCQ__answer, .prMCQ__answerContainer, .prMCQ__answerWrapper');
                if (container) input = container.querySelector('input[type="radio"], input[type="checkbox"]');
            }
            const isMatched = set.has(t);
            const isChecked = input ? input.checked
                : (l.classList.contains("checked") || l.classList.contains("selected") || l.classList.contains("active"));

            if (isMatched !== Boolean(isChecked)) {
                if (input) advancedClick(input);
                else advancedClick(l);
                triggerAngularSync(input || l);
                await delay(60 + Math.floor(Math.random() * 60));
                n++;
            }
            if (isMatched) {
                isAnyCorrectSelected = true;
            }
        }
        // Return true if we toggled anything, OR if there's at least one correct answer selected (meaning it was already correct)
        return n > 0 || isAnyCorrectSelected;
    } catch (e) { _warn("[edx] MCQ error:", e.message); return false; }
}

// ========================= HANDLER: CHECKBOX =========================
async function handleCheckbox() {
    try {
        if (!__ans?.length) return false;
        const set = new Set(__ans.map(norm));
        const conts = queryVisibleAll(".lessonMultipleAnswer");
        const mcqLike = hasMcqCheckboxInputs() ? queryVisibleAll('.prMCQ__answerLabel') : [];
        const allOptions = [...conts, ...mcqLike];
        if (!allOptions.length) return false;
        let toggled = 0;
        let isAnyCorrectSelected = false;
        for (const c of allOptions) {
            const txtEl = c.querySelector(".multiTextInline, .multiText, .radioTextWrapper") || c;
            const t = norm(txtEl?.innerText || txtEl?.textContent || "");
            let match = set.has(t);
            if (!match) {
                const tS = t.replace(/[.!?,;]+$/, "");
                for (const a of set) {
                    const aS = a.replace(/[.!?,;]+$/, "");
                    if (tS === aS) { match = true; break; }
                }
            }
            let inp = c.querySelector("input.lessonMultipleCheck, input[type='checkbox']");
            if (!inp) {
                const prev = c.previousElementSibling;
                if (prev?.matches?.("input[type='checkbox']")) inp = prev;
            }
            if (!inp) {
                const container = c.closest?.('.prMCQ__answer, .prMCQ__answerContainer, .prMCQ__answerWrapper');
                if (container) inp = container.querySelector("input.lessonMultipleCheck, input[type='checkbox']");
            }
            const isChecked = !!(inp?.checked || c.classList.contains("check") || c.classList.contains("checked"));
            if (match !== isChecked) {
                if (inp) advancedClick(inp);
                else {
                    const label = c.querySelector("label.overlayCheckbox, label") || c;
                    advancedClick(label || c);
                }
                triggerAngularSync(inp || c);
                await delay(60 + Math.floor(Math.random() * 60));
                toggled++;
            }
            if (match) {
                isAnyCorrectSelected = true;
            }
        }
        // Return true if we toggled anything, OR if there's at least one correct answer that is selected
        return toggled > 0 || isAnyCorrectSelected;
    } catch (e) { _warn("[edx] Checkbox error:", e.message); return false; }
}

// ========================= HANDLER: DDL (async) =========================
function resolveDdlAnswer(ddlEl, fallbackIndex) {





    return __ans[fallbackIndex] || "";
}

let __ddlRunning = false;
async function handleDDL() {
    if (__ddlRunning) return false;
    __ddlRunning = true;
    const myRequestId = __currentRequestId;
    try {
        if (!__ans?.length) return false;
        const ddls = [...document.querySelectorAll(".prFITB__DDLOptionsW")];
        if (!ddls.length) return false;
        const sortedDdls = sortVisually(ddls);
        let changed = 0;

        // Build count-based tracker so duplicate answers (e.g. "calm","calm") work correctly
        const answerBudget = new Map();
        for (const a of __ans) { const n = norm(a); answerBudget.set(n, (answerBudget.get(n) || 0) + 1); }
        const usedCounts = new Map();
        const _useAns = (n) => usedCounts.set(n, (usedCounts.get(n) || 0) + 1);
        const _isAvailable = (n) => (usedCounts.get(n) || 0) < (answerBudget.get(n) || 0);

        for (let i = 0; i < sortedDdls.length; i++) {
            if (__currentRequestId !== myRequestId) {
                _warn('[EDX] handleDDL: question changed, aborting');
                return false;
            }

            const w = sortedDdls[i];
            const sel = w.querySelector(".DDLOptions__selected");
            if (!sel) continue;

            // Resolve correct answer: try zone ID mapping first, then sequential fallback
            let correctAns = norm(resolveDdlAnswer(w, i));

            // If this answer's budget is exhausted, find next available from __ans
            if (correctAns && !_isAvailable(correctAns)) {
                const alt = __ans.find(a => _isAvailable(norm(a)));
                if (alt) correctAns = norm(alt);
            }

            if (!correctAns) continue;

            // Check if already correct BEFORE opening dropdown
            const curBefore = norm(sel.innerText || sel.textContent || "");
            if (curBefore === correctAns) {
                _useAns(correctAns);
                changed++;
                continue;
            }


            sel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            await delay(100);

            if (__currentRequestId !== myRequestId) return false;
            const list = (w.parentElement || w).querySelector(".DDLOptions__list");
            if (!list) {
                // Dropdown didn't open; try again
                sel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                await delay(150);
                const retryList = (w.parentElement || w).querySelector(".DDLOptions__list");
                if (!retryList) continue;
            }
            const openList = (w.parentElement || w).querySelector(".DDLOptions__list");
            if (!openList) continue;

            const listItems = [...openList.querySelectorAll(".DDLOptions__listItem")];
            const optionTexts = listItems.map(it => norm(it.innerText || it.textContent || ""));

            // Check if our mapped answer exists in this dropdown
            let targetAns = correctAns;
            if (!optionTexts.includes(targetAns)) {

                const available = __ans.find(a => {
                    const n = norm(a);
                    return n && optionTexts.includes(n) && _isAvailable(n);
                });
                if (available) targetAns = norm(available);
                else {
                    // Close dropdown and skip
                    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
                    await delay(50);
                    continue;
                }
            }

            const cur = norm(sel.innerText || sel.textContent || "");
            if (cur === targetAns) {

                document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
                await delay(50);
                _useAns(targetAns);
                changed++;
                continue;
            }

            let found = false;
            for (const it of listItems) {
                const t = norm(it.innerText || it.textContent || "");
                if (t === targetAns) {
                    it.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    await delay(120);
                    if (__currentRequestId !== myRequestId) return false;
                    // Close dropdown explicitly
                    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
                    await delay(150);
                    if (__currentRequestId !== myRequestId) return false;
                    _useAns(targetAns);
                    changed++;
                    found = true;
                    break;
                }
            }
            if (!found) {
                // Close dropdown if no match found
                document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
                await delay(100);
            }
        }
        return changed > 0;
    } catch (e) { _warn("[edx] DDL error:", e.message); return false; }
    finally { __ddlRunning = false; }
}

// ========================= HANDLER: TEXT INPUT =========================
function findTextInputs() {
    const exclude = '[type="checkbox"],[type="radio"],[type="hidden"],[type="button"],[type="submit"],[type="range"],[type="color"],[type="file"],[type="image"]';
    const selectors = [
        `.prOpenEnded__qaItemText`,
        `input[type="text"], input:not([type]), input[type="field"], textarea`,
        `.prFITB__fieldBlanck input`,
        `[placeholder*="Type"], [placeholder*="type"], [placeholder*="word"], [placeholder*="sentence"]`,
        `ed-la-dictation input, ed-la-dictation textarea`,
        `ed-la-fitb input, ed-la-write input, ed-la-sentence-completion input`,
        `.practice__container input:not(${exclude}), .practice__container textarea`,
        `.lessonPlayArea input:not(${exclude}), .lessonPlayArea textarea`,
        `main input:not(${exclude}), main textarea`,
        `#app input:not(${exclude}), #app textarea`,
        `span.et[contenteditable]:not([contenteditable="false"])` // Only editable spans in email exercises
    ];
    const seen = new Set();
    const all = [];
    for (const sel of selectors) {
        try {
            document.querySelectorAll(sel).forEach(el => {
                if (seen.has(el)) return;
                seen.add(el);
                if (el.readOnly || el.disabled) return;
                if (el.closest?.(".carry, .header, .nav")) return;
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) all.push(el);
            });
        } catch (_) { }
    }
    return sortVisually(all);
}

async function fillInput(inp, val, typing = false) {
    try {
        if (!val) return false;
        if (typing && val.length > 0) {
            return await typeTextIntoEditable(inp, val);
        }

        if (inp.focus) inp.focus({ preventScroll: true });
        
        // Handle non-input elements (like span.et)
        if (inp.tagName && inp.tagName.toLowerCase() !== 'input' && inp.tagName.toLowerCase() !== 'textarea') {
            inp.dispatchEvent(new Event('focus', { bubbles: true }));
            inp.innerText = val;
            inp.textContent = val;
            syncInputState(inp, val, "autofill");
            inp.dispatchEvent(new Event('blur', { bubbles: true }));
        } else {
            if (!setElementValue(inp, val)) return false;
            syncInputState(inp, val, "autofill");
        }

        try {
            const ngEl = window.angular?.element?.(inp);
            const ctrl = ngEl?.controller?.("ngModel");
            if (ctrl) { ctrl.$setViewValue(val); ctrl.$render(); }
            ngEl?.scope?.()?.$apply?.();
        } catch (_) { }
        triggerAngularSync(inp);
        if (inp.blur) inp.blur();
        return true;
    } catch (_) { return false; }
}

function getSmartAnswer() {
    if (!__ans?.length) return "";
    const inputs = findTextInputs();
    if (!inputs.length) return __ans[0];
    for (let i = 0; i < inputs.length; i++) {
        const cur = (inputs[i].value || inputs[i].textContent || "").trim();
        if (!cur) return __ans[i] || __ans[0];
    }
    return __ans[Math.max(0, inputs.length - 1)] || __ans[0];
}

async function smartFillFocused() {
    const active = document.activeElement;
    const value = getSmartAnswer();
    if (!value) return false;

    if (isEditableNode(active)) {
        return await fillInput(active, value);
    }

    const inputs = findTextInputs();
    const empty = inputs.find(inp => !(inp.value || inp.textContent || "").trim()) || inputs[0];
    if (!empty) return false;
    return await fillInput(empty, value);
}

function resolveInputAnswer(inputEl, fallbackIndex) {
    // Try to match input to API zone by ID/attributes, similar to DDL
    const candidateKeys = new Set();
    const addKey = (v) => {
        if (v === null || v === undefined) return;
        const s = String(v).trim();
        if (s) candidateKeys.add(s);
    };

    const searchEls = [inputEl];
    const parent = inputEl.closest?.('[id], [data-id], [data-zone-id], [data-question-id], [name]');
    if (parent && parent !== inputEl) searchEls.push(parent);
    const blankContainer = inputEl.closest?.('.prFITB__fieldBlanck, .prFITB__field, [class*="field"]');
    if (blankContainer && !searchEls.includes(blankContainer)) searchEls.push(blankContainer);

    for (const el of searchEls) {
        addKey(el.id);
        ['id', 'name', 'data-id', 'data-zone-id', 'data-question-id', 'data-answer-id', 'dg_id']
            .forEach(attr => addKey(el.getAttribute?.(attr)));
        if (el.dataset) Object.values(el.dataset).forEach(addKey);
    }

    for (const el of searchEls) {
        if (el.id) {
            const numMatch = el.id.match(/(\d+)/);
            if (numMatch) addKey(numMatch[1]);
        }
    }

    for (const key of candidateKeys) {
        if (__apiZoneMap.has(key)) return __apiZoneMap.get(key);
        const num = Number(key);
        if (!Number.isNaN(num) && __apiZoneMap.has(num)) return __apiZoneMap.get(num);
        for (const [k, v] of __apiZoneMap.entries()) {
            if (String(k) === key) return v;
        }
    }

    return __ans[fallbackIndex] || "";
}

async function handleTextInput() {
    try {
        if (!__ans?.length) return false;
        const inputs = findTextInputs();
        if (!inputs.length) return handleSentenceSelection();
        const useTyping = shouldAutoAdvance();
        let filled = 0;
        // Count-based tracker so duplicate answers work correctly
        const answerBudget = new Map();
        for (const a of __ans) { const n = norm(a); answerBudget.set(n, (answerBudget.get(n) || 0) + 1); }
        const usedCounts = new Map();
        const _useAns = (n) => usedCounts.set(n, (usedCounts.get(n) || 0) + 1);
        const _isAvailable = (n) => (usedCounts.get(n) || 0) < (answerBudget.get(n) || 0);
        for (let i = 0; i < inputs.length; i++) {
            let answer = resolveInputAnswer(inputs[i], i);
            // Dedup: if answer budget exhausted, find next available
            if (answer && !_isAvailable(norm(answer))) {
                const alt = __ans.find(a => _isAvailable(norm(a)));
                if (alt) answer = alt;
            }
            if (!answer) continue;
            _useAns(norm(answer));
            if (await fillInput(inputs[i], answer, useTyping)) filled++;
            if (!useTyping) await delay(120 + Math.floor(Math.random() * 100));
        }
        return filled > 0;
    } catch (e) { _warn("[edx] TextInput error:", e.message); return false; }
}

// ========================= DISPATCHER =========================
// Auto-next modes: WATCH(disable) | RUN(off) | AUTO(full)
let __autoNext = MODE_RUN;
const AUTO_NEXT_DELAY = 1500;

const humanJitter = (baseMs, plusRange = 800) => baseMs + Math.floor(Math.random() * plusRange);
const __autoNextModes = [
    { key: MODE_WATCH, label: UI_TEXT.mode.watch.label, desc: UI_TEXT.mode.watch.desc },
    { key: MODE_RUN, label: UI_TEXT.mode.run.label, desc: UI_TEXT.mode.run.desc },
    { key: MODE_AUTO, label: UI_TEXT.mode.auto.label, desc: UI_TEXT.mode.auto.desc },
];

let __autoFillEnabled = true;
let __typingInProgress = 0;

let __recoveryAttempted = false;

function flashBlock(reason, showRecovery = true) {
    _warn("[edx] auto-next blocked:", reason);
    if (!typeBadge) return;
    const prev = typeBadge.style.background;
    typeBadge.style.background = "#b91c1c";
    typeBadge.title = "Dừng: " + reason;
    setTimeout(() => {
        typeBadge.style.background = prev || "";
        typeBadge.title = "Loại câu hỏi - click để lấy lại đáp án";
    }, 2500);
    // Show recovery UI in panel body
    if (showRecovery && ansBody) {
        const wrap = document.createElement('div');
        wrap.className = __obfClassList('eds-empty eds-empty--error');
        wrap.style.cssText = 'gap:10px; padding:14px 10px;';
        const msg = document.createElement('span');
        msg.style.cssText = 'font-size:11px; line-height:1.4;';
        msg.textContent = reason;
        wrap.appendChild(msg);
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; gap:8px; align-items:center;';
        const retryBtn = document.createElement('span');
        retryBtn.className = __obfClassList('eds-recovery-btn');
        const retryIcon = iconRefresh();
        retryIcon.style.cssText = 'width:12px; height:12px; flex-shrink:0;';
        retryBtn.appendChild(retryIcon);
        const retryText = document.createElement('span');
        retryText.textContent = UI_TEXT.recovery.refetchAnswers;
        retryBtn.appendChild(retryText);
        retryBtn.onclick = () => _attemptRecovery();
        actions.appendChild(retryBtn);
        const sep = document.createElement('span');
        sep.style.cssText = 'width:1px; height:12px; background:#333;';
        actions.appendChild(sep);
        const f5Hint = document.createElement('span');
        f5Hint.textContent = UI_TEXT.recovery.pressF5;
        f5Hint.style.cssText = 'color:#555; font-size:10px; letter-spacing:.02em;';
        actions.appendChild(f5Hint);
        wrap.appendChild(actions);
        ansBody.innerHTML = '';
        ansBody.appendChild(wrap);
    }
}

function flashOk(message) {
    if (!typeBadge) return;
    const prevBg = typeBadge.style.background;
    const prevTitle = typeBadge.title;
    typeBadge.style.background = "#15803d";
    typeBadge.title = message;
    setTimeout(() => {
        typeBadge.style.background = prevBg || "";
        typeBadge.title = prevTitle || "Loại câu hỏi - click để lấy lại đáp án";
    }, 2000);
}


let __spaceToastEl = null;
let __spaceToastTimer = null;
function _showSpaceToast() {

    if (__spaceToastTimer) { clearTimeout(__spaceToastTimer); __spaceToastTimer = null; }
    if (!__spaceToastEl) {
        __spaceToastEl = document.createElement('div');
        __spaceToastEl.style.cssText = [
            'position:fixed', 'bottom:72px', 'left:50%', 'transform:translateX(-50%)',
            'background:rgba(30,30,40,0.93)', 'color:#e2e8f0',
            'font:600 12px/1.5 -apple-system,system-ui,sans-serif',
            'padding:8px 16px', 'border-radius:8px',
            'box-shadow:0 4px 16px rgba(0,0,0,0.4)',
            'pointer-events:none', 'z-index:2147483646',
            'border:1px solid rgba(99,102,241,0.5)',
            'display:none', 'white-space:nowrap',
            'transition:opacity 0.2s',
        ].join(';');
        document.body.appendChild(__spaceToastEl);
    }
    __spaceToastEl.textContent = UI_TEXT.mode.autoToast;
    __spaceToastEl.style.display = 'block';
    __spaceToastEl.style.opacity = '1';
    __spaceToastTimer = setTimeout(() => {
        __spaceToastEl.style.opacity = '0';
        setTimeout(() => {
            if (__spaceToastEl) __spaceToastEl.style.display = 'none';
        }, 220);
        __spaceToastTimer = null;
    }, 2500);
}

// Recovery: re-fetch answers and retry fill
let __recoveryTimer = null;
async function _attemptRecovery() {
    // Debounce: cancel pending recovery timer khi spam click
    if (__recoveryTimer) {
        clearTimeout(__recoveryTimer);
        __recoveryTimer = null;
    }


    __recoveryInProgress = true;
    if (__pageChangeTimer) {
        clearTimeout(__pageChangeTimer);
        __pageChangeTimer = null;
    }


    if (__abortController) { try { __abortController.abort(); } catch (_) { }  }
    __abortController = new AbortController();
    __lastFetchedUrl = null;
    __recoveryAttempted = true;


    __fetching = true;


    await new Promise(resolve => { __recoveryTimer = setTimeout(resolve, 300); });
    __recoveryTimer = null;

    // Reset fetching so getAns can set it properly
    __fetching = false;

    updateAnswerDisplay(UI_TEXT.status.retryingAnswers);
    let ok = false;
    try {
        ok = await getAns(true);
    } finally {
        __recoveryInProgress = false; // Always unblock before returning
    }
    if (ok && __ans.length > 0) {
        flashOk('Đã lấy lại đáp án - đang điền...');
        handleQuestion();
        return true;
    }
    updateAnswerDisplay('Không lấy được - thử lại hoặc nhấn F5');
    return false;
}

function recoverLockedWriting() {
    return new Promise((resolve) => {
        let responded = false;
        let tries = 0;
        const done = (ok, msg) => {
            if (responded) return;
            responded = true;
            if (ok) flashOk(msg || "Đã mở lại quyền chỉnh sửa");
            else flashBlock(msg || "Không tìm thấy vùng viết để mở khóa");
            resolve(!!ok);
        };

        try {
            const editBtn = Array.from(document.querySelectorAll("button, a, span")).find(el => {
                const t = (el.textContent || "").trim().toLowerCase();
                return t === "edit text" || t.includes("edit text");
            });
            if (editBtn) {
                try { advancedClick(editBtn); } catch (_) { }
            }

            const listener = (e) => {
                if (!isValidBridgeEvent(e)) return;
                __removeBridgeListener(document, '__edx_recover_writing_result', listener);
                const ok = !!e.detail?.success;
                if (ok) {
                    done(true, "Khôi phục vùng viết thành công");
                    return;
                }
                if (tries >= 2) {
                    done(false, "Khôi phục thất bại");
                    return;
                }
                tries++;
                setTimeout(runRecover, 260);
            };

            const runRecover = () => {
                __addBridgeListener(document, '__edx_recover_writing_result', listener);
                __dispatchBridgeEvent(document, '__edx_recover_writing', {
                    detail: { reason: 'user_repair_locked_editor', attempt: tries + 1 }
                });
            };

            runRecover();

            setTimeout(() => {
                __removeBridgeListener(document, '__edx_recover_writing_result', listener);
                done(false, "Không phản hồi từ bộ khôi phục");
            }, 6000);
        } catch (_) {
            done(false, "Không thể gọi bộ khôi phục");
        }
    });
}

let __autoNextPending = false;
let __autoNextTimerId = null;


function cancelPendingAutoNext() {
    if (__autoNextTimerId) {
        clearTimeout(__autoNextTimerId);
        __autoNextTimerId = null;
    }
    __autoNextPending = false;



}

function stopAutomationForModeSwitch(nextMode, oldMode) {
    cancelPendingAutoNext();
    __bootAttempts = 0;
    __recoveryAttempted = false;

    if (nextMode === oldMode) return;

    if (nextMode === MODE_WATCH) {
        __currentRequestId++;
        __navigating = false;
        if (__abortController) { try { __abortController.abort(); } catch (_) { } }
        __fetching = false;
        __dndAutomating = false;
        __dndInProgress = false;
    }
}

function autoNextIfEnabled(success, delayMs) {
    if (!shouldAutoAdvance()) return;
    if (!success) {
        // Try recovery once before giving up
        if (!__recoveryAttempted) {
            _attemptRecovery();
            return;
        }
        flashBlock("Chưa hỗ trợ - vui lòng làm thủ công. Sẽ tiếp tục auto ở câu sau.", false);
        __recoveryAttempted = false;
        return;
    }
    __recoveryAttempted = false;
    if (typeof _chibiCelebrate === 'function') _chibiCelebrate();
    if (__autoNextPending) { _log('[EDX] autoNext already pending, skip'); return; }
    __autoNextPending = true;

    const scheduleDelay = humanJitter(delayMs ?? AUTO_NEXT_DELAY, 500);
    _log('[EDX] autoNext scheduled, delay:', scheduleDelay);


    const doNavigate = () => {
        __autoNextTimerId = null;
        __autoNextPending = false;
        if (_handleUnsubmittedTestModal()) {
            _log('[EDX] autoNext: modal handled before navigate, waiting for submit flow');
            return;
        }
        // Check submit button for exam mode
        const sub = document.querySelector(".learning__submitTestLink, #learning__submitTestItem");
        if (sub && sub.offsetParent !== null) {
            commitAnswerState();
            setTimeout(() => {
                try { sub.removeAttribute?.("disabled"); sub.classList?.remove?.("disabled"); } catch (_) { }
                if (window.updateStatus) updateStatus(UI_TEXT.status.submittingTest);
                sub.click();
                _log('[EDX] autoNext: submitted test, waiting for result...');
                if (shouldAutoAdvance()) {
                    setTimeout(() => _autoNextContinueAfterSubmit(), 2500);
                }
            }, 120);
            return;
        }
        // Navigate to next page
        const previousSignature = getPageSignature();
        const previousPage = getCurrentAssessmentPage();
        __ans = [];
        __allAns = [];
        __dndCategories = null;
        __dndDone = false;
        __qType = "?";
        updateTypeBadge("unknown");
        updateAnswerDisplay("\u0110ang ch\u1edd c\u00e2u m\u1edbi...");
        if (__abortController) { try { __abortController.abort(); } catch (_) { } }
        __fetching = false;
        __lastNavigateTime = Date.now();
        goToNextItem();
        _log('[EDX] autoNext: navigated, waiting for transition');
        waitForQuestionTransition('auto_next', previousSignature, previousPage);
    };

    __autoNextTimerId = setTimeout(() => {
        __autoNextPending = false;

        if (__typingInProgress > 0) {
            const typingStart = Date.now();
            const TYPING_WAIT_MAX = 20000;
            _log('[EDX] autoNext: typing still in progress, waiting...');

            const waitTyping = () => {
                if (__typingInProgress <= 0) {
                    _log('[EDX] autoNext: typing finished, proceeding');
                    doNavigate();
                    return;
                }
                if (Date.now() - typingStart > TYPING_WAIT_MAX) {
                    _log('[EDX] autoNext: typing wait timeout after 20s, aborting auto-next');
                    flashBlock("Điền chữ quá lâu - vui lòng tự chuyển câu", false);
                    return;
                }
                __autoNextTimerId = setTimeout(waitTyping, 250);
            };

            __autoNextTimerId = setTimeout(waitTyping, 250);
            return;
        }


        if (__dndInProgress || document.querySelector(".gu-mirror, .gu-transit")) {
            const dndStart = Date.now();
            const DND_WAIT_MAX = 25000;
            _log('[EDX] autoNext: DnD in progress, waiting (time-based)...');

            const waitDnd = () => {
                const stillBusy = __dndInProgress || !!document.querySelector(".gu-mirror, .gu-transit");
                if (!stillBusy) {
                    _log('[EDX] autoNext: DnD finished, proceeding');
                    // Gate 2: Verify zones before navigating
                    const zones = getDndZones();
                    if (zones.length > 0) {
                        const unfilled = zones.filter(z => !z.querySelector('.dnditem')).length;
                        if (unfilled > 0) {
                            _log('[EDX] autoNext: still', unfilled, 'unfilled zones, abort');
                            flashBlock(`Còn ${unfilled} ô chưa điền`);
                            return;
                        }
                    }
                    doNavigate();
                    return;
                }
                if (Date.now() - dndStart > DND_WAIT_MAX) {
                    _log('[EDX] autoNext: DnD wait timeout after 25s, aborting auto-next');
                    flashBlock("DnD timeout - vui lòng tự chuyển câu", false);
                    return;
                }
                __autoNextTimerId = setTimeout(waitDnd, 300);
            };
            __autoNextTimerId = setTimeout(waitDnd, 300);
            return;
        }


        const zones = getDndZones();
        if (zones.length > 0) {
            const unfilled = zones.filter(z => !z.querySelector('.dnditem')).length;
            if (unfilled > 0) {
                _log('[EDX] autoNext: still', unfilled, 'unfilled zones, abort');
                flashBlock(`Còn ${unfilled} ô chưa điền`); return;
            }
        }

        doNavigate();
    }, scheduleDelay);
}

// Continue navigation after submit (section/full modes)
function _autoNextContinueAfterSubmit() {
    if (!shouldAutoAdvance()) return;
    _log('[EDX] autoNext: continue after submit, mode:', __autoNext);
    const previousSignature = getPageSignature();
    const previousPage = getCurrentAssessmentPage();
    const clearAndWait = (reason) => {
        __ans = []; __allAns = []; __dndCategories = null; __dndDone = false; __dndInProgress = false;
        __apiHasSession = false;
        clearAnsContext();
        __qType = "?"; updateTypeBadge("unknown");
        updateAnswerDisplay("\u0110ang ch\u1edd c\u00e2u m\u1edbi...");
        if (__abortController) { try { __abortController.abort(); } catch (_) { } }
        __fetching = false;
        waitForQuestionTransition(reason, previousSignature, previousPage);
    };

    // Try "Start Test" button (full mode)
    if (shouldAutoAdvance()) {
        const startBtn = document.querySelector(".btnStartTest, [aria-label*='Start Test'], [title*='Start Test']");
        if (startBtn && startBtn.closest(':not([style*="display: none"])')) {
            _log('[EDX] autoNext: clicking Start Test');
            startBtn.click();
            clearAndWait('auto_start_test');
            return;
        }
    }

    // Try next section/item button
    if (goToNextItem()) {
        clearAndWait('auto_section_next');
        return;
    }

    // Try "Continue" / "Next Lesson" / section navigation buttons
    const sectionBtns = [...document.querySelectorAll(
        '.btnContinue, .btn-continue, [class*="continue" i], [class*="nextLesson" i], ' +
        '[class*="next-lesson" i], [class*="nextSection" i], [class*="next-section" i], ' +
        '.learning__nextItem, #learning__nextItem, #learning__nextItemLink'
    )].filter(el => !!(el.offsetParent !== null || el.getClientRects?.().length));
    if (sectionBtns.length) {
        _log('[EDX] autoNext: clicking section button:', sectionBtns[0].className);
        advancedClick(sectionBtns[0]);
        clearAndWait('auto_section_btn');
        return;
    }

    _log('[EDX] autoNext: no further navigation found after submit');
}

// Fast check: is this clearly a non-question page?

function _isNonQuestionPage() {
    if (hasRealSpeakingUi()) return false;

    if (queryVisible('ed-la-writing, .tox-tinymce, iframe[id*="tiny"], .prOpenEnded__qaItemText, .prOE__wrapper, .prWriting__editorW, .prWriting__editorSaveBtn, .mceEditor')) return false;

    const hasSaveEdit = !!queryVisibleAll('button, [role="button"]')
        .find(el => /^(save|edit text)$/i.test((el.textContent || '').trim()));
    if (hasSaveEdit) return false;
    const bodyText = (document.body?.innerText || '').toLowerCase();
    if (/type your answer|write a short|write your|integrated writing/i.test(bodyText)) return false;

    return !!getNonQuestionPageKind();
}


function _dismissReminderModal() {
    const stayBtn = [...document.querySelectorAll('button, .btn, [role="button"], a')]
        .find(el => /stay in this step/i.test(el.textContent) && isElementVisible(el));
    if (stayBtn) {
        stayBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        _log('[EDX] dismissReminderModal: clicked Stay');
        return true;
    }
    return false;
}


async function _autoPlayVideo() {
    if (__videoPlaying) {
        _log('[EDX] _autoPlayVideo: already playing, skip');
        return true;
    }
    __videoPlaying = true;
    try {
        const hasVideo = !!document.querySelector('video, .videoContainer, [class*="videoPlayer"]');
        const playingStatus = hasVideo ? UI_TEXT.status.playingVideo : UI_TEXT.status.playingAudio;
        if (window.updateStatus) updateStatus(playingStatus);

        _dismissReminderModal();
        await delay(300);


        const playBtn = document.querySelector(
            '#CTrackerPlayBtn, #play-pause, ' +
            '.layout_mediaPlayPause.layout_mediaPlayPause--play, ' +
            '.layout__mediaPlayPause.layout__mediaPlayPause--play, ' +
            '.CTrackerPlayBtn.layout_mediaPlayPause--play, ' +
            '.CTrackerPlayBtn.layout__mediaPlayPause--play, ' +
            '[class*="mediaPlayPause--play"]'
        ) || document.querySelector(
            '#CTrackerPlayBtn, #play-pause, ' +
            '[class*="mediaPlayPause"], [class*="CTrackerPlayBtn"]'
        );

        if (!playBtn) {
            if (window.updateStatus) updateStatus('');
            return false;
        }


        // Prefer HTML5 media element state over CSS classes
        const _isPlaying = () => {
            const vid = document.querySelector('video');
            if (vid && !vid.paused) return true;
            const aud = document.querySelector('audio');
            if (aud && !aud.paused) return true;
            // Check both single and double underscore pause class
            return playBtn.classList.contains('layout_mediaPlayPause--pause') ||
                   playBtn.classList.contains('layout__mediaPlayPause--pause') ||
                   playBtn.classList.contains('playing');
        };
        if (_isPlaying()) {
            if (window.updateStatus) updateStatus(UI_TEXT.status.waitingMedia);
            return true;
        }


        for (let i = 0; i < 3; i++) {
            playBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            await delay(600);
            if (_isPlaying()) {
                _log('[EDX] _autoPlayVideo: playing after', i + 1, 'attempt(s)');
                if (window.updateStatus) updateStatus(UI_TEXT.status.waitingMedia);
                return true;
            }

            if (_dismissReminderModal()) await delay(300);
        }

        // 5. Fallback: try direct .play() on <video> or <audio> element
        const media = document.querySelector('video') || document.querySelector('audio');
        if (media) {
            try {
                await media.play();
                _log('[EDX] _autoPlayVideo: direct media.play() succeeded');
                if (window.updateStatus) updateStatus(UI_TEXT.status.waitingMedia);
                return true;
            } catch (e) {
                _log('[EDX] _autoPlayVideo: direct play failed:', e.message);
            }
        }

        _log('[EDX] _autoPlayVideo: failed to confirm playback');
        if (window.updateStatus) updateStatus('');
        return false;
    } finally {
        __videoPlaying = false;
    }
}

// Auto-skip non-question pages (intro, explore, listen-only) when auto-next is active
function _autoSkipNonQuestionPage(attempt) {

    if (__autoNext !== 'full') return;
    // Prevent re-entrant calls — only one auto-skip chain at a time
    if (__autoSkipActive && attempt === 0) {
        _log('[EDX] autoSkip: already active, ignoring re-entry');
        return;
    }
    __autoSkipActive = true;
    if (hasRealSpeakingUi()) {
        _log('[EDX] autoSkip: speaking UI visible, skip non-question flow');
        __autoSkipActive = false;
        return;
    }

    if (_isReminderModal()) {
        _dismissReminderModal();
        setTimeout(() => _autoSkipNonQuestionPage(attempt || 0), 500);
        return;
    }

    if (_isCompleteActivityModal()) {

        const stayBtn = [...document.querySelectorAll('button, a')]
            .find(el => /stay in this step/i.test(el.textContent) &&
                (el.offsetParent !== null || el.getClientRects?.().length));
        if (stayBtn) stayBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        updateAnswerDisplay(UI_TEXT.recovery.unsupportedManual);
        __autoSkipActive = false;
        return;
    }

    // Don't skip if modal dialog visible
    if (_isModalDialogVisible()) { __autoSkipActive = false; return; }

    const pageType = resolveSectionPageType();
    const nonQuestionKind = getNonQuestionPageKind();


    if (pageType === 'question') { __autoSkipActive = false; return; }


    if (pageType === 'review') {
        if (shouldAutoAdvance()) {
            _log('[EDX] autoSkip: review detected, continuing after submit');
            updateAnswerDisplay(UI_TEXT.status.skippingPage);
            setTimeout(() => _autoNextContinueAfterSubmit(), 300);
            __autoSkipActive = false;
            return;
        }
        updateAnswerDisplay("Đã hoàn thành - xem kết quả");
        __autoSkipActive = false;
        return;
    }

    attempt = attempt || 0;
    _log('[EDX] autoSkip:', pageType, '| kind:', nonQuestionKind, 'attempt:', attempt);

    const previousSignature = getPageSignature();
    const previousPage = getCurrentAssessmentPage();

    const clearAndWait = (reason) => {
        __ans = []; __allAns = []; __dndCategories = null; __dndDone = false; __dndInProgress = false;
        __apiHasSession = false;
        clearAnsContext();
        __qType = "?"; updateTypeBadge("unknown");
        updateAnswerDisplay(UI_TEXT.status.skippingPage);
        if (window.updateStatus) updateStatus(UI_TEXT.status.skippingPage);
        if (__abortController) { try { __abortController.abort(); } catch (_) { } }
        __fetching = false;
        __autoSkipActive = false; // Release lock before handing off to transition watcher
        waitForQuestionTransition(reason, previousSignature, previousPage);
    };

    const mediaBtnSelectors = [
        '#CTrackerPlayBtn',
        '#play-pause',
        '.layout_mediaPlayPause',
        '.layout__mediaPlayPause',
        '.CTrackerPlayBtn'
    ];
    const startTestSelectors = [
        '.btnStartTest',
        '[aria-label*="Start Test"]',
        '[title*="Start Test"]'
    ];
    const nextOnlySelectors = [
        '#learning__nextItem',
        '.learning__nextItem',
        '.p-paginator-next',
        '.btnContinue',
        '.btn-continue'
    ];
    const nextBtnSelectors =
        nonQuestionKind === 'instruction_media'
            ? [...mediaBtnSelectors, ...startTestSelectors, ...nextOnlySelectors]
            : nonQuestionKind === 'start_test'
                ? [...startTestSelectors, ...nextOnlySelectors]
                : [...nextOnlySelectors, ...startTestSelectors, ...mediaBtnSelectors];

    for (const selector of nextBtnSelectors) {
        const btn = document.querySelector(selector);

        const isPlayBtn = [
            '#CTrackerPlayBtn', '#play-pause', 
            '.layout_mediaPlayPause', '.layout__mediaPlayPause', '.CTrackerPlayBtn'
        ].includes(selector);

        if (btn && (isPlayBtn || isElementVisible(btn)) && !btn.disabled) {
            _log(`[EDX] autoSkip: clicking ${selector}`);


            if (selector.includes('Start Test') || selector === '.btnStartTest') {
                __ans = []; __allAns = []; __dndCategories = null; __qType = "?";
                // Preserve the previous fetched URL so getAns() can detect stale
                // session reuse on the first real question after Start Test.
                if (__abortController) { try { __abortController.abort(); } catch (_) { } }
                updateTypeBadge("unknown");
                btn.focus();
                btn.click();
                btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
                btn.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
                triggerAngularSync(btn);
                commitAnswerState();
                __dispatchBridgeEvent(document, '__edx_click_start_test');
                clearAndWait('auto_start_test');
                return;
            }


            if (isPlayBtn) {
                // Check if next btn is already visible (page already advanced without play)
                const nextBtnEarly = document.querySelector('#learning__nextItem, .learning__nextItem, .p-paginator-next');
                if (nextBtnEarly && isElementVisible(nextBtnEarly)) {
                    _log('[EDX] autoSkip: next btn already visible, skipping play step');
                    clearAndWait('auto_skip');
                    return;
                }

                updateAnswerDisplay("Đang phát media...");
                __ans = []; __allAns = []; __dndCategories = null; __dndDone = false;
                __qType = "?"; updateTypeBadge("unknown");

                _autoPlayVideo().then((playing) => {
                    if (!playing) {

                        _log('[EDX] autoSkip: _autoPlayVideo failed, retry attempt', attempt + 1);
                        setTimeout(() => _autoSkipNonQuestionPage(attempt + 1), 1000);
                        return;
                    }

                    // After play: poll for a next button with increasing patience
                    let waitedMs = 0;
                    const pollForNext = () => {
                        const nextBtn = document.querySelector('#learning__nextItem, .learning__nextItem, .p-paginator-next');
                        if (nextBtn && isElementVisible(nextBtn)) {
                            try { advancedClick(nextBtn); } catch (_) {}
                            __autoSkipActive = false; // Release before transition watcher
                            waitForQuestionTransition('auto_skip', previousSignature, previousPage);
                        } else if (waitedMs < 6000) {
                            waitedMs += 500;
                            setTimeout(pollForNext, 500);
                        } else {
                            _log('[EDX] autoSkip: next btn never appeared after play, retry');
                            setTimeout(() => _autoSkipNonQuestionPage(attempt + 1), 500);
                        }
                    };
                    setTimeout(pollForNext, 1500);
                });
                return;
            }

            const hasMedia = !!document.querySelector('video, audio, #CTrackerPlayBtn');
            if (hasMedia) {
                _autoPlayVideo().catch(() => {});
                setTimeout(() => {
                    advancedClick(btn);
                    clearAndWait('auto_skip');
                }, 2000);
                return;
            }

            advancedClick(btn);
            clearAndWait('auto_skip');
            return;
        }
    }


    if (attempt < 20) {
        const retryDelay = 300;
        setTimeout(() => _autoSkipNonQuestionPage(attempt + 1), retryDelay);
        return;
    }

    _log('[EDX] autoSkip: no navigation button found');
    __autoSkipActive = false;
}

// ========================= LEGACY CLICK OPTIONS =========================
function handleLegacyClickOptions() {
    if (!__ans?.length) return false;
    const ansSet = new Set(__ans.map(norm));

    // Collect clickable option elements from various legacy selectors
    const candidateSelectors = [
        '[id^="question-"][id*="_answer-"]',  // #question-1_answer-1, etc.
        '.learning__selectTxt_st',
        '.multiRadio',
        '.multiBtnText',
        '.answerBtn',
        '.option-item',
        '.questionOptions .option',
    ];
    const candidates = [];
    for (const sel of candidateSelectors) {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
            if (!candidates.some(c => c.el === el)) {
                candidates.push({ el, text: norm(el.innerText || el.textContent || '') });
            }
        });
    }

    if (!candidates.length) return false;

    let clicked = false;
    for (const { el, text } of candidates) {
        if (ansSet.has(text)) {
            _log('[EDX Legacy] Clicking matching option:', text);
            advancedClick(el);
            clicked = true;
            break;
        }
    }

    // Fuzzy fallback: partial match
    if (!clicked) {
        for (const { el, text } of candidates) {
            for (const ans of __ans) {
                const na = norm(ans);
                if (text && na && (text.includes(na) || na.includes(text))) {
                    _log('[EDX Legacy] Fuzzy clicking option:', text, '~', na);
                    advancedClick(el);
                    clicked = true;
                    break;
                }
            }
            if (clicked) break;
        }
    }

    return clicked;
}

// ========================= HANDLER: SENTENCE FIT =========================



function handleSentenceFit() {
    try {
        if (!__ans?.length) return false;
        const posStr = __ans[0]; // e.g. "POS:4"
        const posMatch = posStr.match(/^POS:(\d+)$/);
        if (!posMatch) return false;
        const targetPos = parseInt(posMatch[1], 10); // 1-indexed





        const candidateSelectors = [
            // EDX specific insert-point markers (yellow \u25c6 icon buttons)
            '.sentenceSelect__addBtn, .sentenceSelect__insertBtn',
            '[class*="insertBtn"], [class*="insert-btn"], [class*="InsertBtn"]',
            '[class*="insertPoint"], [class*="insert-point"], [class*="insert_point"]',
            '[class*="sentenceInsert"], [class*="sentence-insert"], [class*="SentenceInsert"]',
            '[class*="sentenceSelect"], [class*="sentence-select"]',
            '[class*="addPoint"], [class*="add-point"], [class*="AddPoint"]',
            '[class*="dropPoint"], [class*="drop-point"]',
            // Data and ng-click attributes usually associated with these insertion points
            '[ng-click*="insert"], [ng-click*="Insert"], [ng-click*="addSentence"], [ng-click*="selectSentence"]',
            'img[src*="insert"], img[src*="add"], img[src*="plus"]',
            // Additional variations seen in early English Discoveries classes
            '[class*="addinTxt"], [class*="addin-txt"]',
            'span.ITNewText',
            // Input radio/buttons by position/place naming
            'input[type="radio"][name*="place"], input[type="radio"][name*="position"], input[type="radio"][name*="sentence"]',
            // Legacy EDX selectors
            '.learning__selectTxt_st', '[class*="selectTxt"]',
            // Data attributes
            '[data-position], [data-pos], [data-index], [data-insert]',
            // Generic clickable elements with + or add icons (buttons/spans)
            'button[class*="add"], span[class*="add"][role="button"]',
        ];

        // Build flat list of all visible candidates, sorted visually
        let candidates = [];
        for (const sel of candidateSelectors) {
            try {
                document.querySelectorAll(sel).forEach(el => {
                    if (!candidates.includes(el) && isElementVisible(el)) candidates.push(el);
                });
            } catch (_) { }
        }
        candidates = sortVisually(candidates);

        if (candidates.length >= targetPos) {
            const target = candidates[targetPos - 1]; // convert 1-indexed to 0-indexed
            _log('[EDX SentenceFit] Clicking position', targetPos, '/', candidates.length, target);
            advancedClick(target);
            triggerAngularSync(target);
            return true;
        }


        const byValue = document.querySelector(
            `input[type="radio"][value="${targetPos}"], [data-position="${targetPos}"], [data-index="${targetPos}"], [data-pos="${targetPos}"]`
        );
        if (byValue && isElementVisible(byValue)) {
            _log('[EDX SentenceFit] Clicking by value/data attribute, pos', targetPos);
            advancedClick(byValue);
            triggerAngularSync(byValue);
            return true;
        }

        _warn('[EDX SentenceFit] No insertion point found for position', targetPos, '(candidates:', candidates.length, ')');
        return false;
    } catch (e) {
        _warn('[EDX SentenceFit] Error:', e.message);
        return false;
    }
}


function showPasteButton(extraMsg) {
    if (!ansBody) return;
    ansBody.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:4px 0';
    const msg = document.createElement('div');
    msg.className = __obfClassList('eds-empty');
    msg.style.cssText = 'padding:8px 0;font-size:11px;color:#888;text-align:left;';
    msg.textContent = extraMsg || 'Bài viết tự do - điền xong bấm Done, rồi Space để tiếp.';
    wrap.appendChild(msg);
    const pasteBtn = document.createElement('button');
    pasteBtn.className = __obfClassList('eds-btn eds-btn--primary');
    pasteBtn.textContent = 'Dán nội dung vào editor';
    pasteBtn.style.cssText = 'width:100%;margin-top:6px;';
    pasteBtn.onclick = async () => {
        try {
            pasteBtn.disabled = true;
            pasteBtn.textContent = 'Đang dán...';
            const clipText = await navigator.clipboard.readText();
            if (!clipText?.trim()) {
                pasteBtn.textContent = 'Clipboard trống - hãy copy text trước';
                pasteBtn.disabled = false;
                return;
            }
            pasteBtn.textContent = 'Đang gõ...';
            const ok = await injectWritingText(clipText);
            if (ok) { pasteBtn.textContent = 'Hoàn thành'; }
            else { pasteBtn.textContent = 'Thất bại - thử lại'; pasteBtn.disabled = false; }
        } catch (_) {
            pasteBtn.textContent = 'Không có quyền clipboard';
            pasteBtn.disabled = false;
        }
    };
    wrap.appendChild(pasteBtn);
    ansBody.appendChild(wrap);
}

async function handleQuestion() {

    cancelPendingAutoNext();

    if (!__qType || __qType === '?' || __qType === 'unknown') {
        __qType = detectQuestionType();
    }
    _trace('handler.route', { qType: __qType, ansCount: __ans?.length || 0, allCount: __allAns?.length || 0 });
    updateTypeBadge(__qType);


    if (__qType.startsWith('unsupported_')) {
        flashBlock("Dạng bài này cần tự làm - dừng auto", false);
        stopAutomationForModeSwitch('disable', __autoNext);
        __autoNext = 'disable';
        if (typeof _updateAutoNextUI === 'function') _updateAutoNextUI();
        return;
    }


    if (isWatchMode()) {
        if (!__ans || !__ans.length) {
            if (__allAns?.length) __ans = [...__allAns];
        }
        updateAnswerDisplay();
        return;
    }



    if (shouldAutoAdvance()) {
        if (_isNonQuestionPage()) {
            _log('[EDX] handleQuestion: non-question page detected early, skipping');
            _autoSkipNonQuestionPage();
            return;
        }
    }

    const resolvedSectionType = resolveSectionPageType();
    if (__qType === "unknown" && resolvedSectionType === 'review') {
        if (shouldAutoAdvance()) {
            updateAnswerDisplay(UI_TEXT.status.skippingPage);
            setTimeout(() => _autoNextContinueAfterSubmit(), 200);
            return;
        }
        updateAnswerDisplay("Đã hoàn thành - xem kết quả");
        return;
    }

    if (__qType === "unknown" && (!__ans || __ans.length === 0)) {
        // Fast-path for explicit non-question screens
        if (shouldAutoAdvance() && _isNonQuestionPage()) {
            _log('[EDX] handleQuestion: detected non-question page immediately, skipping');
            _autoSkipNonQuestionPage();
            return;
        }


        const hasSpeak = hasRealSpeakingUi();
        if (hasSpeak) {
            _log('[EDX] handleQuestion: speaking UI visible but no answers/type, fallback to speaking');
            __qType = 'speaking';

        } else {
            if (shouldAutoAdvance()) {
                updateAnswerDisplay(UI_TEXT.status.checkingPage);
                setTimeout(() => {
                    const recheck = detectQuestionType();
                    if (recheck && recheck !== 'unknown') {
                        _log('[EDX] handleQuestion: question appeared, re-fetching');
                        __qType = recheck;
                        getAns().then(ok => { if (ok) handleQuestion(); });
                    } else if (_isNonQuestionPage()) {
                        _autoSkipNonQuestionPage();
                    } else if (shouldAutoAdvance()) {
                        _log('[EDX] handleQuestion: forcing skip in FULL mode for unknown page');
                        _autoSkipNonQuestionPage();
                    } else {
                        updateAnswerDisplay('Không tìm thấy câu hỏi');
                    }
                }, 1500);
            } else {
                updateAnswerDisplay('Không lấy được đáp án');
            }
            return;
        }
    }


    if (__qType === 'unknown') {
        const hasSpeak = hasRealSpeakingUi();
        if (hasSpeak) {
            _log('[EDX] handleQuestion: speaking UI visible and qType unknown, overriding to speaking');
            __qType = 'speaking';
        }
    }

    if (__qType === 'speaking' && !hasRealSpeakingUi()) {
        _log('[EDX] handleQuestion: speaking ignored because no real speaking UI is visible');
        if (shouldAutoAdvance() && _isNonQuestionPage()) {
            _autoSkipNonQuestionPage();
            return;
        }
        updateAnswerDisplay('Trang này không có giao diện ghi âm để chạy tự động.');
        return;
    }

    switch (__qType) {

        case 'writing':

            if (__ans.length && __ans[0]) {
                updateAnswerDisplay('Đang dán đáp án mẫu...');

                __dispatchBridgeEvent(document, '__edx_recover_writing');
                setTimeout(() => {
                    injectWritingText(__ans[0]).then(ok => {
                        if (ok) {
                            updateAnswerDisplay('Đã dán xong - bấm Done/Save để tiếp.');
                            // Trigger Angular model update and pm.setUserAnswer
                            setTimeout(() => {
                                triggerAngularSync(document.querySelector('.tox-tinymce, iframe[id*="tiny"], .prWriting__editorW, .mceEditor'));
                                __dispatchBridgeEvent(document, '__edx_force_commit');
                                _log('[EDX] Writing: Triggered Angular sync and force commit');
                            }, 300);
                        } else {
                            showPasteButton('Không thể dán tự động - dùng nút bên dưới.');
                        }
                    }).catch(() => showPasteButton('Lỗi dán - dùng nút bên dưới.'));
                }, 800);
            } else {
                showPasteButton();
            }
            return;

        case 'speaking':

            if (window.__speakingInProgress) {
                _log('[EDX] Speaking already in progress, skip re-trigger');
                return;
            }
            const speakingKey = `${location.href}::${norm((__ans || []).join(' | ')).slice(0, 160)}`;
            if (window.__speakAttemptState?.key === speakingKey && window.__speakAttemptState.status === 'manual') {
                updateStatus(UI_TEXT.status.speakingManual);
                return;
            }
            if (window.__speakAttemptState?.key === speakingKey && window.__speakAttemptState.status === 'done') {
                updateStatus(UI_TEXT.status.speakingRecorded);
                return;
            }
            window.__speakingInProgress = true;
            window.__speakAttemptState = { key: speakingKey, status: 'running', ts: Date.now() };
            updateStatus(UI_TEXT.status.speakingPreparing);

            checkAndCloseActivityModal();
            (async () => {
                const checkAbort = () => {
                    if (__qType !== 'speaking') {
                        _log('[EDX] Speaking handler aborted: qType changed to', __qType);
                        window.__speakingInProgress = false;
                        if (window.updateStatus) updateStatus('');
                        return true;
                    }
                    return false;
                };
                const finishSpeakingAttempt = (status, message = '') => {
                    window.__speakingInProgress = false;
                    window.__speakAttemptState = { key: speakingKey, status, ts: Date.now() };
                    updateStatus(message);
                };

                try {


                    const isInteractIntro = (
                        !!document.querySelector('.speakingInteract__chooseSpeaker, ed-la-practicearea[class*="interact"]')
                        || /select the speaker you would like/i.test(document.body?.innerText?.substring(0, 500) || '')
                    ) && !document.querySelector('.recordingPanelWrapper, .recordingPanelSentence, .recordingPanel');
                    if (isInteractIntro) {
                        _log('[EDX] Speaking Interact intro: tự động bỏ qua vì chưa chọn speaker');

                        const speakerBtn = document.querySelector(
                            '.speakingInteract__speakerImg, .speakingInteract__speaker, ' +
                            '[class*="chooseSpeaker"] img, [class*="chooseSpeaker"] a, ' +
                            '[class*="speaker"] img, [class*="speaker"] button'
                        );
                        if (shouldAutoAdvance()) {
                            const d = humanJitter(1000, 500);
                            await delay(d);
                            if (checkAbort()) return;
                            if (speakerBtn) {
                                try { advancedClick(speakerBtn); } catch (_) {}
                                _log('[EDX] Speaking Interact: clicked speaker');
                            } else {

                                _log('[EDX] Speaking Interact: no speaker btn, auto-next');
                                goToNextItem();
                            }
                        }
                        window.__speakingInProgress = false;
                        return;
                    }

                    const _findCharacterArrow = () => {
                        const arrows = Array.from(document.querySelectorAll(
                            '.generalIcon.left .chooseCaracterArrow, .generalIcon.right .chooseCaracterArrow, ' +
                            '.leftIcon .chooseCaracterArrow, .rightIcon .chooseCaracterArrow, ' +
                            '.chooseCaracterArrow'
                        ));
                        return arrows.find(arrow => {
                            if (!isElementVisible(arrow)) return false;
                            const holder = arrow.closest('.generalIcon, .leftIcon, .rightIcon');
                            if (holder?.classList?.contains('disable')) return false;
                            if (holder?.classList?.contains('selectedSpeaker')) return false;
                            return true;
                        }) || null;
                    };

                    const _isInteractChooseArrowMode = () => {
                        if (!queryVisible('.chooseCaracterArrow')) return false;
                        if (document.querySelector('.selectedSpeaker')) return false;
                        const pageText = (document.body?.innerText || '').toLowerCase();
                        if (pageText.includes('click on the arrow next to the character you would like to practice')) return true;
                        return !!queryVisible('.generalIcon.left .chooseCaracterArrow, .generalIcon.right .chooseCaracterArrow');
                    };

                    const _isChooseArrowSpeakingFlow = () => {
                        if (queryVisible('.chooseCaracterArrow')) return true;
                        if (document.querySelector('.selectedSpeaker, .currentActiveText')) return true;
                        return !!document.querySelector(
                            '.generalIcon .chooseCaracterArrow, .leftIcon .chooseCaracterArrow, .rightIcon .chooseCaracterArrow'
                        );
                    };

                    if (_isInteractChooseArrowMode()) {
                        const arrow = _findCharacterArrow();
                        if (arrow) {
                            const arrowDelay = humanJitter(1000, 700);
                            updateStatus(UI_TEXT.status.speakingChoosingSentence);
                            _log('[EDX] Speaking interact chooser: clicking character arrow first');
                            await delay(arrowDelay);
                            if (checkAbort()) return;
                            try { advancedClick(arrow); } catch (_) {}
                            await delay(humanJitter(1000, 800));
                            if (checkAbort()) return;
                        }
                    }




                    const correctText = Array.isArray(__ans) ? __ans[0] : null;


                    const _tryClickCharacterArrow = async () => {
                        const arrow = document.querySelector(
                            '.speakingInteract__carouselArrow, .carousel-control, [class*="CarouselArrow"], ' +
                            '[class*="arrow-right"], [class*="arrowRight"], [class*="next-arrow"], ' +
                            '.ng-carousel-next, .slick-next'
                        );
                        if (arrow && isElementVisible(arrow)) {
                            _log('[EDX] Speaking interact: clicking character arrow to reveal sentences');
                            try { advancedClick(arrow); } catch (_) {}
                            await delay(1000);
                        }
                    };


                    const _getSentenceWrappers = () => Array.from(document.querySelectorAll(
                        '.lessonAnswerSentenceWrapper, .sentenceWrapper, .recordingPanelSentence, ' +
                        '[class*="sentenceWrapper"], [class*="SentenceWrapper"]'
                    )).filter(el => isElementVisible(el));

                    let sentenceWrappers = _getSentenceWrappers();

                    if (sentenceWrappers.length === 0 && shouldAutoAdvance()) {

                        await _tryClickCharacterArrow();
                        if (checkAbort()) return;
                        sentenceWrappers = _getSentenceWrappers();
                    }

                    if (sentenceWrappers.length > 0) {

                        const alreadySelected = document.querySelector(
                            '.recordingPanelSentence.selected, .lessonAnswerSentenceWrapper.active, ' +
                            '[class*="sentence"][class*="active"], [class*="sentence"][class*="selected"]'
                        );
                        if (!alreadySelected) {
                            let target = null;
                            if (correctText) {
                                target = sentenceWrappers.find(el =>
                                    norm(el.textContent).includes(norm(correctText).substring(0, 15))
                                );

                                if (!target && shouldAutoAdvance()) {
                                    _log('[EDX] Không thấy câu đúng trong danh sách, chọn câu đầu tiên rồi tiếp tục');
                                    await _tryClickCharacterArrow();
                                    if (checkAbort()) return;
                                    sentenceWrappers = _getSentenceWrappers();
                                    target = sentenceWrappers.find(el =>
                                        norm(el.textContent).includes(norm(correctText).substring(0, 15))
                                    );
                                }
                            }


                            if (!target) {
                                _log('[EDX] Không thấy câu phù hợp, chọn ngẫu nhiên câu đầu tiên');
                                target = sentenceWrappers[0];
                            }

                            if (target) {
                                const preClickDelay = humanJitter(1000, 1000); // 1-2s
                                _log(`[EDX] Speaking interact: waiting ${preClickDelay}ms before clicking sentence`);
                                updateStatus(`${UI_TEXT.status.speakingChoosingSentence} (${Math.round(preClickDelay / 1000)}s)`);
                                await delay(preClickDelay);
                                if (checkAbort()) return;
                                try { advancedClick(target); } catch (_) {}
                                await delay(humanJitter(800, 400));
                                if (checkAbort()) return;
                            }
                        }
                    }

                    const _findQuickRecordBtn = () => {
                        const candidates = Array.from(document.querySelectorAll(
                            '.recordingPanelSentence.selected .panelButton.speakIcon, ' +
                            '.recordingPanelSentence.selected .speakIcon, ' +
                            '.RecordButtonWrapper:not(.disable) .panelButton.speakIcon, ' +
                            '.RecordButtonWrapper:not(.disable) .speakIcon, ' +
                            '.recordPanelWrapper .panelButton.speakIcon, ' +
                            '.recordPanelWrapper .speakIcon, ' +
                            'a.button.continue:not(.retry), button.button.continue:not(.retry)'
                        ));
                        return candidates.find(btn => {
                            if (!isElementVisible(btn)) return false;
                            if (btn.disabled) return false;
                            if (btn.getAttribute?.('aria-disabled') === 'true') return false;
                            if (btn.closest?.('.disable')) return false;
                            return true;
                        }) || null;
                    };

                    const isInteractQuickRecord = !correctText && sentenceWrappers.length > 0 && !_isChooseArrowSpeakingFlow();
                    if (isInteractQuickRecord) {
                        const quickBtn = _findQuickRecordBtn();
                        if (quickBtn) {
                            const quickDelay = humanJitter(1200, 800);
                            updateStatus(UI_TEXT.status.speakingStarting);
                            _log('[EDX] Speaking interact quick path: click record/start and continue');
                            await delay(humanJitter(700, 400));
                            if (checkAbort()) return;
                            try { advancedClick(quickBtn); } catch (_) {}
                            updateStatus(UI_TEXT.status.speakingRecording);
                            await delay(quickDelay);
                            if (checkAbort()) return;
                            finishSpeakingAttempt('done', UI_TEXT.status.speakingRecorded);
                            if (shouldAutoAdvance()) {
                                setTimeout(() => { goToNextItem(); }, 600);
                            }
                            return;
                        }
                    }




                    // Try again:   a.button.continue.retry (text "Try again")

                    const _findStartBtn = () => {

                        let btn = document.querySelector('a.button.continue:not(.retry)');
                        if (btn &&
                            /^start$/i.test((btn.textContent || '').trim()) &&
                            !btn.closest?.('.disable') &&
                            btn.getAttribute?.('aria-disabled') !== 'true' &&
                            !btn.disabled) return btn;


                        const allBtns = Array.from(document.querySelectorAll(
                            'a.button, button, [role="button"], a[class*="button"], a[class*="btn"]'
                        ));
                        btn = allBtns.find(b => {
                            const t = (b.textContent || '').trim().toLowerCase();
                            if (t !== 'start' && t !== 'record') return false;
                            if (b.classList.contains('retry')) return false;
                            if (b.closest?.('.disable')) return false;
                            if (b.getAttribute?.('aria-disabled') === 'true') return false;
                            if (b.disabled) return false;
                            return b.offsetParent !== null || (b.getClientRects?.()?.length || 0) > 0;
                        });
                        return btn || null;
                    };

                    let startBtn = null;
                    for (let attempt = 0; attempt < 6; attempt++) {
                        if (checkAbort()) return;
                        startBtn = _findStartBtn();
                        if (startBtn) break;
                        updateStatus(`${UI_TEXT.status.speakingWaitingStart} (${attempt + 1}/6)`);
                        _log(`[EDX] Speaking: Start button not found, attempt ${attempt+1}`);
                        await delay(1500);
                    }

                    if (!startBtn) {
                        _warn('[EDX] Không tìm thấy nút Start sau 9 giây');
                        finishSpeakingAttempt('manual', UI_TEXT.status.speakingStartMissing);
                        return;
                    }




                    const startDelay = humanJitter(1500, 1000); // 1.5 - 2.5s
                    updateStatus(`${UI_TEXT.status.speakingStarting} (${(startDelay / 1000).toFixed(1)}s)`);
                    _log(`[EDX] Speaking: waiting ${startDelay}ms before clicking Start`);
                    await delay(startDelay);
                    if (checkAbort()) return;

                    try { advancedClick(startBtn); } catch (_) {}
                    updateStatus(UI_TEXT.status.speakingRecording);
                    _log('[EDX] Speaking: clicked Start button');





                    //   2. Icon correct (.status.active, .icon-v)



                    await delay(humanJitter(3000, 2000));
                    if (checkAbort()) return;

                    const initialStartSignature = (() => {
                        const btn = _findStartBtn();
                        if (!btn) return 'missing';
                        return `${(btn.textContent || '').trim().toLowerCase()}|${btn.disabled ? 'disabled' : 'enabled'}`;
                    })();

                    await new Promise((resolve) => {
                        let settled = false;
                        const finish = () => {
                            if (settled) return;
                            settled = true;
                            try { wrapperObs.disconnect(); } catch (_) { }
                            clearInterval(btnPoll);
                            clearTimeout(timeoutId);
                            resolve();
                        };

                        const wrapperObs = new MutationObserver(() => {
                            if (!document.querySelector('.speakingInteractButtonWrapper, .recordingPanelWrapper, .recordingPanel')) {
                                finish();
                            }
                        });
                        try {
                            wrapperObs.observe(document.body, { childList: true, subtree: true });
                        } catch (_) { }

                        const btnPoll = setInterval(() => {
                            if (checkAbort()) {
                                finish();
                                return;
                            }
                            const btn = _findStartBtn();
                            const sig = btn
                                ? `${(btn.textContent || '').trim().toLowerCase()}|${btn.disabled ? 'disabled' : 'enabled'}`
                                : 'missing';
                            if (sig !== initialStartSignature) {
                                finish();
                            }
                        }, 300);

                        const timeoutId = setTimeout(() => finish(), 25000);
                    });

                    finishSpeakingAttempt('done', UI_TEXT.status.speakingRecorded);
                    if (shouldAutoAdvance()) {
                        setTimeout(() => { goToNextItem(); }, 600);
                    }
                } catch (e) {
                    _warn('[EDX] Speaking handling error:', e);
                    finishSpeakingAttempt('manual', UI_TEXT.status.speakingError);
                }
            })();
            return;

        case "dnd":
            if (__ans.length === 0) { flashBlock("Không có đáp án"); return; }
            if (window.updateStatus) updateStatus(UI_TEXT.status.dndFilling);
            {
                const zones = getDndZones();
                if (zones.length === 0) {
                    _log('[EDX] DnD: no zones found, likely video-only page — skipping');
                    __ans = [];
                    __allAns = [];
                    updateAnswerDisplay('');
                    updateTypeBadge('unknown');
                    if (shouldAutoAdvance()) {
                        _autoPlayVideo().catch(() => {});
                        setTimeout(() => autoNextIfEnabled(true, 500), 3000);
                    }
                    return;
                }
            }
            autoPlaceDndFirst().then((skipped) => {
                if (skipped) { _panelRestoreAfterDnD(); flashBlock("Không hỗ trợ kéo thả tự động"); return; }
                if (!shouldAutoAdvance()) { _panelRestoreAfterDnD(); return; }
                setTimeout(() => {
                    const allZones = getDndZones();
                    const remaining = allZones.filter(z => !z.querySelector(".dnditem")).length;
                    _log('[EDX] DnD fill done, remaining:', remaining, '/', allZones.length);
                    if (window.updateStatus) {
                        updateStatus(remaining === 0 ? UI_TEXT.status.dndDone : `Kéo thả còn ${remaining} ô chưa điền`);
                    }
                    if (remaining === 0) {
                        _panelRestoreAfterDnD();
                        setTimeout(() => {
                            if (_handleUnsubmittedTestModal()) return;
                            autoNextIfEnabled(true, 400);
                        }, 500);
                    } else {
                        _log('[EDX] DnD missing items, running Pass 2...');
                        autoPlaceDndFirst().then(() => {
                            setTimeout(() => {
                                const left = getDndZones().filter(z => !z.querySelector(".dnditem")).length;
                                _log('[EDX] DnD Pass 2 retry check, remaining:', left);
                                _panelRestoreAfterDnD();
                                if (window.updateStatus) {
                                    updateStatus(left === 0 ? UI_TEXT.status.dndDone : `Kéo thả còn ${left} ô chưa điền`);
                                }
                                if (left === 0 && !__dndUserDrag) {
                                    setTimeout(() => {
                                        if (_handleUnsubmittedTestModal()) return;
                                        autoNextIfEnabled(true, 400);
                                    }, 500);
                                } else {
                                    const redoBtn = document.querySelector('.learning__retryLink, #learning__retry, a[title*="Redo"], a[title*="redo"], a[title*="Reset"], button[title*="Redo"], button[title*="Reset"], [class*="retry"], [class*="reset"]');
                                    if (redoBtn && isElementVisible(redoBtn)) {
                                        _log('[EDX] DnD missing items after Pass 2 -> click Redo');
                                        updateAnswerDisplay("Lỗi kéo thả: Đang làm lại...");
                                        advancedClick(redoBtn);
                                        setTimeout(() => handleQuestion(), 1500);
                                    } else {
                                        _log('[EDX] DnD missing items, no Redo button -> Stopping auto-fill');
                                        updateAnswerDisplay("Lỗi kéo thả: Vui lòng tự kéo phần còn lại.");
                                        flashBlock("Thả bị kẹt - dừng auto", false);
                                    }
                                }
                            }, 1000);
                        });
                    }
                }, 400);
            });
            break;

        case "dnd_sequence":
            if (__ans.length === 0) { flashBlock("Không có đáp án"); return; }
            scrapeSequenceOrder().then(correctOrder => {
                if (correctOrder && correctOrder.length > 0) {
                    __ans = correctOrder;
                    updateAnswerDisplay();
                }
                return autoFillOrdering();
            }).catch(e => {
                _warn("[edx] dnd_sequence error:", e.message);
            }).finally(() => {
                __dndInProgress = false;
                _panelRestoreAfterDnD();
                if (!shouldAutoAdvance()) return;
                setTimeout(() => autoNextIfEnabled(true, 800), 500);
            });
            break;

        case "dnd_classification":
            if (__ans.length === 0) { flashBlock("Không có đáp án"); return; }
            if (window.updateStatus) updateStatus(UI_TEXT.status.dndFilling);
            {
                const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
                const dragTexts = Array.from(document.querySelectorAll(itemSelectors)).map(el => norm(el.innerText || el.textContent));
                autoFillClassification(dragTexts).then(ok => {
                    __dndInProgress = false;
                    _panelRestoreAfterDnD();
                    if (ok) __dndDone = true;
                    if (window.updateStatus) updateStatus(ok ? UI_TEXT.status.dndDone : 'Lỗi kéo thả');
                    if (ok && shouldAutoAdvance()) setTimeout(() => autoNextIfEnabled(true, 800), 600);
                }).catch(e => {
                    _warn("[edx] dnd_classification error:", e.message);
                    __dndInProgress = false;
                    _panelRestoreAfterDnD();
                });
            }
            break;

        case "mcq": {
            const ok = await handleMCQ();
            const mcqDelay = humanJitter(800, 1200);
            if (!ok && __ans?.length > 0 && shouldAutoAdvance()) {
                const hasMcqDom = !!document.querySelector('.prMCQ__answerLabel, .lessonMultipleAnswer, input[type="radio"]');
                if (!hasMcqDom) {
                    const _isVideoPage = !!document.querySelector('video, audio, #CTrackerPlayBtn');
                    if (_isVideoPage) {
                        _log('[EDX] mcq: no DOM + video page detected — stale qType, playing video instead');
                        __qType = 'instruction';
                        updateTypeBadge('instruction');
                        if (shouldAutoAdvance()) {
                            _autoPlayVideo().then(() => setTimeout(() => goToNextItem(), 3000)).catch(() => {});
                        }
                        return;
                    }
                    _log('[EDX] mcq: no DOM elements, bypassing recovery and auto-nexting');
                    __recoveryAttempted = true;
                    autoNextIfEnabled(true, mcqDelay);
                } else {
                    autoNextIfEnabled(ok);
                }
            } else { autoNextIfEnabled(ok, mcqDelay); }
            break;
        }
        case "checkbox": {
            const ok = await handleCheckbox();
            const cbDelay = humanJitter(900, 1000);
            if (!ok && __ans?.length > 0 && shouldAutoAdvance()) {
                const hasCheckboxDom = hasMcqCheckboxInputs() || !!document.querySelector('input[type="checkbox"], .lessonMultipleAnswer');
                if (!hasCheckboxDom) {
                    _log('[EDX] checkbox: no DOM elements, bypassing recovery and auto-nexting');
                    __recoveryAttempted = true;
                    autoNextIfEnabled(true, cbDelay);
                } else {
                    autoNextIfEnabled(ok);
                }
            } else { autoNextIfEnabled(ok, cbDelay); }
            break;
        }
        case "ddl": handleDDL().then(ok => autoNextIfEnabled(ok, humanJitter(900, 1000))).catch(e => { _warn('[EDX] DDL unhandled error:', e?.message); }); break;
        case "text": {
            handleTextInput().then(ok => {
                if (!ok && __ans?.length > 0 && shouldAutoAdvance()) {
                    const hasTextDom = !!document.querySelector(
                        '.prFITB__fieldBlanck input, ed-la-fitb input, ed-la-dictation input, '
                        + '[contenteditable="true"], .prOpenEnded__qaItemText textarea'
                    );
                    if (!hasTextDom) {
                        _log('[EDX] text: no DOM inputs, bypassing recovery and auto-nexting');
                        __recoveryAttempted = true;
                        autoNextIfEnabled(true, 800);
                    } else {
                        autoNextIfEnabled(ok);
                    }
                } else {
                    autoNextIfEnabled(ok);
                }
            }).catch(e => {
                _warn('[EDX] text unhandled error:', e?.message);
                autoNextIfEnabled(false);
            });
            break;
        }

        case "card_match":
            if (!__cardPairs?.pairLabels?.length) { flashBlock("Kh\u00f4ng c\u00f3 d\u1eef li\u1ec7u gh\u00e9p th\u1ebb"); return; }
            autoFillCardMatch().then(ok => autoNextIfEnabled(ok, 1200));
            break;

        case "sentence_fit": {
            const ok = handleSentenceFit();
            autoNextIfEnabled(ok);
            break;
        }

        default:
 
            const fallbackMcqOk = await handleMCQ();
            const fallbackOk = fallbackMcqOk || await handleCheckbox();
            _trace('handler.default-fallback', { fallbackOk, qType: __qType, ans: __ans });
            if (!fallbackOk) {
                handleTextInput().then(textOk => {
                    if (textOk) {
                        autoNextIfEnabled(true);
                        return;
                    }
                    handleDDL().then(ok => {
                        if (!ok) {
                            const legacyOk = handleLegacyClickOptions();
                            if (!legacyOk) {

                                updateAnswerDisplay('Loại câu này chưa được hỗ trợ tự động (đã hiển thị đáp án trần)');
                            }

                        } else {
                            autoNextIfEnabled(true);
                        }
                    });
                }).catch(() => {
                    handleDDL().then(ok => {
                        if (!ok) {
                            const legacyOk = handleLegacyClickOptions();
                            if (!legacyOk) {

                                updateAnswerDisplay('Loại câu này chưa được hỗ trợ tự động (đã hiển thị đáp án trần)');
                            }

                        } else {
                            autoNextIfEnabled(true);
                        }
                    });
                });
            } else {
                autoNextIfEnabled(true);
            }
    }
}

// ========================= DIAGNOSTIC OVERLAY =========================
let __diagActive = false;
const __diagOverlays = [];
let debugBtn = null;

const DIAG_COLORS = {
    bank: "#f59e0b", zone: "#3b82f6", input: "#10b981",
    mcq: "#8b5cf6", cb: "#ec4899", ddl: "#06b6d4",
};

function clearDiagOverlays() {
    __diagOverlays.forEach(o => o.remove());
    __diagOverlays.length = 0;
    __diagActive = false;
    if (debugBtn) {
        __removeObfClass(debugBtn, "eds-btn--active");
        debugBtn.title = "Diagnostic";
    }
}

function createOverlay(el, label, color) {
    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const ov = document.createElement("div");
    ov.className = __obfClassList("eds-diag-overlay");
    ov.style.cssText = `position:absolute;left:${rect.left + scrollX}px;top:${rect.top + scrollY}px;width:${Math.max(rect.width, 30)}px;height:${Math.max(rect.height, 20)}px;border:2px solid ${color};border-radius:4px;z-index:999998;pointer-events:none;box-sizing:border-box;`;
    const badge = document.createElement("span");
    badge.style.cssText = `position:absolute;top:-18px;left:0;background:${color};color:#fff;font:600 10px/16px -apple-system,system-ui,sans-serif;padding:0 5px;border-radius:3px 3px 0 0;white-space:nowrap;pointer-events:none;`;
    badge.textContent = label;
    ov.appendChild(badge);
    document.body.appendChild(ov);
    __diagOverlays.push(ov);
}

function runDiagnostic() {
    if (__diagActive) { clearDiagOverlays(); return; }
    console.group("[edx] --- DIAGNOSTIC ---");
    const type = detectQuestionType();
    console.log("Type:", type, "| __ans:", __ans);
    const banks = document.querySelectorAll(dndBankSel);
    const zones = getDndZones();
    console.log(`Banks: ${banks.length}, Zones: ${zones.length}`);
    zones.forEach((z, i) => console.log(`  zone[${i}] #${z.id} ${z.querySelector(".dnditem") ? "FILLED" : "EMPTY"}`));
    console.groupEnd();
    banks.forEach((b, i) => createOverlay(b, `BANK[${i}]`, DIAG_COLORS.bank));
    zones.forEach((z, i) => {
        const filled = !!z.querySelector(".dnditem");
        createOverlay(z, `ZONE[${i}]${filled ? " OK" : ""}`, filled ? "#64748b" : DIAG_COLORS.zone);
    });
    findTextInputs().forEach((el, i) => createOverlay(el, `INPUT[${i}]`, DIAG_COLORS.input));
    document.querySelectorAll(".prMCQ__answerLabel").forEach((el, i) => createOverlay(el, `MCQ[${i}]`, DIAG_COLORS.mcq));
    document.querySelectorAll(".lessonMultipleAnswer").forEach((el, i) => createOverlay(el, `CB[${i}]`, DIAG_COLORS.cb));
    document.querySelectorAll(".prFITB__DDLOptionsW").forEach((el, i) => createOverlay(el, `DDL[${i}]`, DIAG_COLORS.ddl));
    __diagActive = true;
    if (debugBtn) { __addObfClass(debugBtn, "eds-btn--active"); debugBtn.title = "Click để tắt"; }
}
// ========================= KEYBOARD =========================
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && __diagActive) clearDiagOverlays();
}, true);

let __navigating = false;
document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" && e.key !== " " && e.keyCode !== 32) return;
    if (isTypingContext(e)) return;
    if (__navigating) return;
    e.preventDefault();
    __navigating = true;
    const previousSignature = getPageSignature();
    const previousPage = getCurrentAssessmentPage();
    const afterNext = (reason) => {
        // Clear stale answers immediately
        __ans = [];
        __allAns = [];
        __dndCategories = null;
        __dndDone = false;
        __dndInProgress = false;
        __apiHasSession = false;
        __qType = "?";
        updateTypeBadge("unknown");
        updateAnswerDisplay(UI_TEXT.status.waitingNext);
        if (__abortController) { try { __abortController.abort(); } catch (_) { } }
        __fetching = false;
        waitForQuestionTransition(reason, previousSignature, previousPage);
    };




    // 1. Try Start Test Button
    const startBtn = document.querySelector(".btnStartTest, [aria-label*='Start Test'], [title*='Start Test']");
    if (startBtn && startBtn.closest(':not([style*="display: none"])')) {
        __navigating = true;
        startBtn.click(); afterNext('start_test'); return;
    }

    // 2. Try generic "Next" buttons via robust utility
    const clickedNext = goToNextItem();

    if (clickedNext) {
        __navigating = true;
        afterNext('space_next');
        return;
    }

    // 3. Try Submit Button
    const sub = document.querySelector(".learning__submitTestLink, #learning__submitTestItem");
    if (sub && sub.offsetParent !== null) {
        __navigating = true;
        sub.click();
        afterNext('submit_next');
        return;
    }

    // 4. Default to Media Controls — ONLY on non-question pages (intro/media-only)
    const hasQuestionContent = !!document.querySelector(
        '.practice__container, .lessonPlayArea, .prMCQ__answerLabel, .lessonMultipleAnswer, '
        + '.prFITB__DDLOptionsW, .dndZone, [class*="question"], ed-la-fitb, ed-la-dictation'
    );
    if (!hasQuestionContent) {
        const mediaBtns = document.querySelectorAll("#CTrackerPlayBtn, #play-pause, .layout_mediaPlayPause, .layout__mediaPlayPause, .CTrackerPlayBtn");
        if (mediaBtns.length > 0) {
            let clicked = false;
            for (const btn of mediaBtns) {
                if (isElementVisible(btn) || btn.id === 'CTrackerPlayBtn' || btn.id === 'play-pause') {
                    clickElement(btn);
                    clicked = true;
                }
            }
            if (clicked) {
                updateAnswerDisplay("Đã bật/tắt video/audio");
                return;
            }
        }
    }
    __navigating = false;
}, true);

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

const header = document.createElement("div");
header.className = __obfClassList("eds-header"); panel.appendChild(header);

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
panel.appendChild(modeWrap);

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

/* Minimize - collapse panel, show chibi */
const minimizeBtn = document.createElement("button");
minimizeBtn.className = __obfClassList("eds-btn eds-btn--ghost");
minimizeBtn.title = "Thu gọn - click vào Nhân Vật để mở lại";
minimizeBtn.setAttribute("aria-label", UI_TEXT.actions.minimizePanel);
appendIcon(minimizeBtn, iconMinimize, null);
headerBtns.appendChild(minimizeBtn);


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
ansBody.className = __obfClassList("eds-body"); panel.appendChild(ansBody);

const statusBar = document.createElement("div");
statusBar.className = __obfClassList("eds-status-bar"); statusBar.style.display = "none";
panel.appendChild(statusBar);

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
footer.className = __obfClassList("eds-footer"); footer.style.display = "none"; panel.appendChild(footer);

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
panel.insertBefore(progressWrap, ansBody);

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

function _resetPanelPosition() {
    panel.style.left = ""; panel.style.top = ""; panel.style.right = "";
    __pinned = true;
    panel.style.resize = "none";
    pinBtn.replaceChildren(iconPin());
    applyToggleState(pinBtn, __pinned, "Đang ghim", "Đang thả", false);
    try { chrome.storage.local.remove("eds_pos"); } catch (_) { }
}

dragHandle.addEventListener("mousedown", (e) => {
    if (__pinned) return;
    e.preventDefault(); isDragging = true;
    const rect = panel.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left; dragOffsetY = e.clientY - rect.top;
    panel.style.transition = "none";
});
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


const __qtypeLabels = { mcq: "MCQ", checkbox: "Multi", ddl: "DDL", dnd: "DnD", dnd_sequence: "Order", text: "Fill", card_match: "Match", sentence_fit: "SenFit", unknown: "--" };
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

// ========================= DND SHARED STATE =========================
let __dndUserDrag = false, __dndAutomating = false;
let __dndInProgress = false;
let __dndDone = false;
let __dndFailCount = 0;
const DND_MAX_FAILS = 3;

// Block real user pointer events when automating so Dragula doesn't get interrupted
// but allow programmatic (isTrusted=false) to pass through
function _blockRealUserEvents(e) {
    if (__dndAutomating && e.isTrusted) {
        if (e.target && e.target.closest && e.target.closest(__obfSelector('.eds-panel, .eds-autonext-popup, #eds-panel'))) return;
        const dndTarget = e.target && e.target.closest &&
            e.target.closest('.dnditem, ed-la-dnditem, .dndZone, .dragula-container, [class*="dropzone"], [class*="droppable"], [class*="wordBank"], [class*="draggable"]');
        if (!dndTarget) return;
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();
    }
}
['mousedown', 'mousemove', 'mouseup', 'click', 'pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'dragstart'].forEach(evt => {
    document.addEventListener(evt, _blockRealUserEvents, true);
});

document.addEventListener("mousedown", (e) => {
    if (__dndAutomating) return;
    if (e.target?.closest(".dnditem") || e.target?.closest("ed-la-dnditem")) __dndUserDrag = true;
}, true);
document.addEventListener("mouseup", () => {
    if (__dndAutomating) return;
    if (__dndUserDrag) setTimeout(() => { __dndUserDrag = false; }, 120);
}, true);
document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t) return;
    if (!e.isTrusted) return;
    const isNav = t.id === "learning__nextItem" || t.id === "learning__prevItem" ||
        t.closest?.("#learning__nextItem") || t.closest?.("#learning__prevItem") ||
        t.closest?.(".p-pagination-item") || t.closest?.("[class*=\"pagination\"] a");
    if (isNav) {
        // Clear stale answers IMMEDIATELY so user never sees old data
        __ans = [];
        __allAns = [];
        __dndCategories = null;
        __qType = "?";
        updateTypeBadge("unknown");
        updateAnswerDisplay(UI_TEXT.status.waitingNext);
        // Abort any in-flight fetch
        if (__abortController) { try { __abortController.abort(); } catch (_) { } }
        __fetching = false;
        const previousSignature = getPageSignature();
        const previousPage = getCurrentAssessmentPage();
        __navigating = true;
        waitForQuestionTransition('trusted_nav_click', previousSignature, previousPage);
    }
}, true);

// ========================= FIND BANK ITEM =========================
function findBankItem(bank, expectedText) {
    const targetZones = getDndZones();
    const allDndItems = [...document.querySelectorAll(".dnditem, .draggable.wordBankTile, .draggableContainer > .draggable, .wordBankTile")];
    const items = allDndItems.filter(el => !targetZones.some(zone => zone.contains(el)));
    if (!items.length) return null;
    let matched = null;
    if (!expectedText) {
        matched = items[0];
    } else {
        const target = norm(expectedText);
        matched = items.find(it => norm(it.innerText || "") === target);
        if (!matched && target.length >= 4) {
            matched = items.find(it => {
                const t = norm(it.innerText || "");
                if (t.length < 4) return false;
                return t.includes(target) || target.includes(t);
            });
        }
        if (!matched && target.length >= 4 && !/\s/.test(target)) {
            matched = items.find(it => {
                const t = norm(it.innerText || "");
                if (t.length < 4) return false;
                if (/\s/.test(t)) return false;
                return t.includes(target) || target.includes(t);
            });
        }
        if (!matched && target.length >= 12) {
            matched = items.find(it => _fuzzyOverlap(norm(it.innerText || ""), target) > 0.6);
        }
        if (!matched && items.length === 1) matched = items[0];
    }
    if (!matched) return null;
    return matched.closest(".draggableContainer") || matched.closest("ed-la-dnditem") || matched;
}

function resolveZoneAnswer(zone, fallbackIndex = -1) {
    try {
        if (!zone) return fallbackIndex >= 0 ? (__ans[fallbackIndex] || "") : "";

        const candidateKeys = new Set();
        const addKey = (v) => {
            if (v === null || v === undefined) return;
            const s = String(v).trim();
            if (!s) return;
            candidateKeys.add(s);
        };

        addKey(zone.id);
        ["id", "name", "data-id", "data-zone-id", "data-question-id", "data-answer-id", "data-target-id", "dg_id"]
            .forEach((attr) => addKey(zone.getAttribute?.(attr)));

        if (zone.dataset) Object.values(zone.dataset).forEach(addKey);

        const owner = zone.closest?.("[id], [data-id], [data-zone-id], [data-question-id], [data-answer-id], [dg_id], [name]");
        if (owner && owner !== zone) {
            addKey(owner.id);
            ["id", "name", "data-id", "data-zone-id", "data-question-id", "data-answer-id", "data-target-id", "dg_id"]
                .forEach((attr) => addKey(owner.getAttribute?.(attr)));
            if (owner.dataset) Object.values(owner.dataset).forEach(addKey);
        }

        for (const key of candidateKeys) {
            if (__apiZoneMap.has(key)) return __apiZoneMap.get(key);
            const num = Number(key);
            if (!Number.isNaN(num) && __apiZoneMap.has(num)) return __apiZoneMap.get(num);

            for (const [k, v] of __apiZoneMap.entries()) {
                if (String(k) === key) return v;
            }
        }

        if (fallbackIndex >= 0) return __ans[fallbackIndex] || "";
        return "";
    } catch (_) {
        return fallbackIndex >= 0 ? (__ans[fallbackIndex] || "") : "";
    }
}

function getMatchZoneDefinition(zone, idx) {
    let defText = `Slot ${idx + 1}`;
    const row = zone?.closest?.(".prMT_T2T__row, tr, .matching__row, .lessonPlayArea > div > div");
    if (row) {
        const leftEl = row.querySelector(".prMT_T2T__leftLabel, .matching__left_item, td:first-child, th, [class*='left'], [class*='Left']");
        if (leftEl && !leftEl.contains(zone)) defText = leftEl.innerText?.trim() || defText;
        else if (row.firstElementChild && !row.firstElementChild.contains(zone)) defText = row.firstElementChild.innerText?.trim() || defText;
    } else {
        const prev = zone?.previousElementSibling || zone?.parentElement?.previousElementSibling;
        if (prev && !prev.contains(zone)) defText = prev.innerText?.trim() || defText;
    }
    return defText;
}

function getMatchAnswerPool(zones) {
    const defsSet = new Set(["definition", "word"]);
    const zoneDefs = zones.map((zone, idx) => {
        const text = getMatchZoneDefinition(zone, idx);
        defsSet.add(norm(text));
        return text;
    });

    const optionTexts = Array.from(document.querySelectorAll(".dnditem, .dnd-item, .dndItem, [draggable='true']"))
        .map(el => (el.innerText || el.textContent || "").trim())
        .filter(Boolean);
    const optionNorms = new Set(optionTexts.map(norm).filter(Boolean));

    let pool = __ans.filter((a) => {
        const n = norm(a);
        if (!n || defsSet.has(n)) return false;
        if (!optionNorms.size) return true;
        return optionNorms.has(n);
    });

    if (pool.length < zones.length) {
        const fallback = __ans.filter((a) => {
            const n = norm(a);
            return n && !defsSet.has(n);
        });
        if (fallback.length) pool = fallback;
    }

    if (!pool.length && optionTexts.length) {
        pool = optionTexts.filter((a) => !defsSet.has(norm(a)));
    }

    return { zoneDefs, defsSet, filteredx: pool, optionNorms };
}

// ========================= TTp DIRECT FILL =========================
function fillSingleBlank(text) {
    const blank = document.querySelector('[contenteditable], input[type=text], textarea');
    if (!blank) return;
    blank.focus();
    const sel = document.getSelection?.();
    if (sel) {
        sel.selectAllChildren?.(blank);
        if (blank.tagName === 'INPUT' || blank.tagName === 'TEXTAREA') {
            blank.select?.();
        }
    }
    blank.textContent = text;
    if (blank.tagName === 'INPUT' || blank.tagName === 'TEXTAREA') blank.value = text;
    blank.dispatchEvent(new InputEvent('input', { bubbles: true }));
    blank.dispatchEvent(new Event('change', { bubbles: true }));
    triggerAngularSync(blank);
}

async function autoFillTTp(allZones) {

    if (__ans.length === 1 && !allZones.length) {
        fillSingleBlank(__ans[0]);
        return;
    }
    let filled = 0;
    setDndProgress(0, allZones.length);
    for (let i = 0; i < allZones.length; i++) {
        const zone = allZones[i];
        let expectedx = resolveZoneAnswer(zone, i) || __ans[i];
        if (!expectedx) continue;
        const expectedNorm = norm(expectedx);
        const allItems = [...document.querySelectorAll(
            '#TTpTablePlaceHolder .wordBankTile, ' +
            '#TTpTablePlaceHolder .draggable, ' +
            '.wordsBankTable .wordBankTile, ' +
            '.draggable.wordBankTile, ' +
            '.wordBankTile'
        )].filter((el, i, arr) => arr.indexOf(el) === i);
        const item = allItems.find(el => norm(el.textContent) === expectedNorm) || allItems.find(el => norm(el.textContent).includes(expectedNorm));
        if (!item) { _warn(`[TTp] Not found: "${expectedx}"`); continue; }
        const itemId = item.getAttribute('data-id') || item.querySelector('[data-id]')?.getAttribute('data-id');
        if (itemId) zone.setAttribute('ans', itemId);
        const wrapper = item.closest('.draggableContainer') || item;
        const existingChild = zone.querySelector('.dnditem, .draggable, [class*="dnd"]');
        if (existingChild) existingChild.remove();
        [...zone.querySelectorAll('.draggableContainer, .wordBankTile, .draggable')].forEach(el => el.remove());
        wrapper.style.visibility = 'hidden';
        const clone = wrapper.cloneNode(true);
        clone.style.visibility = '';
        zone.appendChild(clone);
        const r = zone.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        zone.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
        zone.dispatchEvent(new MouseEvent('drop', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
        zone.dispatchEvent(new Event('change', { bubbles: true }));
        await delay(150);
        filled++;
        setDndProgress(filled, allZones.length);
    }
}

// ========================= MAIN DND ENTRY POINT =========================
async function autoPlaceDndFirst() {
    if (__dndInProgress || __dndUserDrag || __dndDone) return false;
    if (!__ans || __ans.length === 0) return false;

    // Set IMMEDIATELY to prevent observer from clearing __ans during zone detection
    __dndInProgress = true;
    try {
        let allZones = getDndZones();
        if (!allZones.length) {
            for (let poll = 0; poll < 15 && !allZones.length; poll++) {
                await delay(200);
                allZones = getDndZones();
            }
        }
        if (!allZones.length) return false;

        // TTp question type (drag-drop via .TTpanswerDiv)
        const isTTp = allZones.some(z => z.classList.contains('TTpanswerDiv') || z.classList.contains('droptarget') || z.hasAttribute('ed-trackable-drop'));
        if (isTTp) {
            _log('[edx] TTp page detected, using direct fill');
            await autoFillTTp(allZones);
            __dndDone = true;
            return false;
        }

        const isMatchColumns = !!(
            document.querySelector('ed-la-matching-text-to-text, .prMT_T2T, [class*="matching"], [class*="matchColumn"]') ||
            document.querySelector('.prMT_T2T__regContainer, .prMT_T2T__wordsBankWrapper')
        );

        if (isMatchColumns) {
            _log("[edx] Match Columns detected.");
            await autoFillMatchColumns(allZones);
            __dndDone = true;
            return false;
        }

        const hasExplicitTF = __ans.some(a => /^true$/i.test(a.trim())) && __ans.some(a => /^false$/i.test(a.trim()));
        const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
        const dragTexts = Array.from(document.querySelectorAll(itemSelectors)).map(el => norm(el.innerText || el.textContent));
        let isCategorized = !!(__dndCategories && __dndCategories.length >= 2);
        if (!isCategorized && dragTexts.length > 0 && !isMatchColumns) {
            let catCount = 0;
            __ans.forEach(a => {
                const normA = norm(a);
                if (!dragTexts.some(dt => dt.includes(normA) || normA.includes(dt))) catCount++;
            });
            if (catCount > 1) isCategorized = true;
        }

        if (hasExplicitTF || isCategorized) {
            _log("[edx] Categorized DnD detected.");
            const catOk = await autoFillCategorized(dragTexts, hasExplicitTF);
            if (catOk) __dndDone = true;
            return false;
        }

        let bank = document.querySelector(bankSelector) || document.body;
        await autoFillSequential(bank, allZones);
        __dndDone = true;
        return false;
    } finally {
        __dndInProgress = false;
    }
}

// ========================= MATCH COLUMNS FILL (FIXED) =========================
// Root cause of 1/5: After each drag, the bank re-renders and item positions change.
// Fix: re-read bank items fresh each iteration, re-scroll both source and target,
// use multiple verification methods, and increase inter-drag delay.
async function autoFillMatchColumns(allZones) {
    const totalToFill = allZones.filter(z => !z.querySelector(".dnditem")).length;
    let filledCount = 0;
    // Count-based tracker so duplicate answers work correctly
    const answerBudget = new Map();
    for (const a of __ans) { const n = norm(a); answerBudget.set(n, (answerBudget.get(n) || 0) + 1); }
    const usedCounts = new Map();
    const _useAns = (n) => usedCounts.set(n, (usedCounts.get(n) || 0) + 1);
    const _isAvailable = (n) => (usedCounts.get(n) || 0) < (answerBudget.get(n) || 0);
    const { defsSet, filteredx, optionNorms } = getMatchAnswerPool(allZones);
    setDndProgress(0, totalToFill);

    for (let i = 0; i < allZones.length; i++) {
        if (__dndUserDrag) break;

        const zone = allZones[i];
        let expectedx = resolveZoneAnswer(zone, -1);
        let expectedNorm = norm(expectedx);

        if (!expectedx || defsSet.has(expectedNorm) || (optionNorms.size && !optionNorms.has(expectedNorm))) {
            expectedx = "";
            expectedNorm = "";
        }

        if (!expectedx) {
            const alt = filteredx.find((a) => {
                const n = norm(a);
                return n && _isAvailable(n) && !!findBankItem(null, a);
            });
            if (alt) {
                expectedx = alt;
                expectedNorm = norm(alt);
            }
        }

        if (expectedNorm && !_isAvailable(expectedNorm)) {
            const alt = filteredx.find((a) => {
                const n = norm(a);
                return n && _isAvailable(n) && !!findBankItem(null, a);
            });
            if (alt) {
                expectedx = alt;
                expectedNorm = norm(alt);
            }
        }

        if (!expectedx) continue;
        if (expectedNorm) _useAns(expectedNorm);

        // Check if already correctly filled
        const existingItem = zone.querySelector(".dnditem");
        if (existingItem) {
            const existingText = norm(existingItem.innerText || existingItem.textContent || "");
            const curExpectedNorm = norm(expectedx);
            const isCorrect = existingText === curExpectedNorm ||
                existingText.includes(curExpectedNorm) || curExpectedNorm.includes(existingText);
            if (isCorrect) {
                filledCount++;
                setDndProgress(filledCount, totalToFill);
                continue;
            }
            // Evict wrong item back to bank
            _log(`[edx] Match[${i}]: Evicting wrong item "${existingText}"`);
            const bankTarget = document.querySelector(bankSelector) ||
                document.querySelector(".prMT_T2T__wordsBankWrapper") || document.body;
            const evictEl = existingItem.closest("ed-la-dnditem") || existingItem;
            await simulateDragDrop(evictEl, bankTarget);
            await delay(400);
            // Poll confirm eviction
            for (let p = 0; p < 8 && zone.querySelector(".dnditem"); p++) await delay(100);
            if (zone.querySelector(".dnditem")) {
                _warn(`[edx] Match[${i}]: Evict failed, skipping`);
                continue;
            }
        }

        // Wait for any ongoing animation
        while (document.querySelector(".gu-mirror, .gu-transit")) await delay(50);

        // Re-read bank item FRESH each iteration (critical fix for 1/5 bug)
        // The bank re-renders after each drop, so stale references fail
        let placed = false;
        let attempts = 0;
        const MAX_ATTEMPTS = 3;

        while (!placed && attempts < MAX_ATTEMPTS) {
            attempts++;

            // Fresh item lookup each attempt
            const liveBank = document.querySelector(bankSelector) ||
                document.querySelector(".prMT_T2T__wordsBankWrapper") || document.body;
            const itemNode = findBankItem(liveBank, expectedx);
            if (!itemNode) {
                _warn(`[edx] Match[${i}]: Item "${expectedx}" not found in bank (attempt ${attempts})`);
                await delay(300);
                continue;
            }

            _log(`[edx] Match[${i}]: Placing "${expectedx}" into zone (attempt ${attempts})`);

            const beforeCount = zone.querySelectorAll(".dnditem").length;
            const success = await simulateDragDrop(itemNode, zone);
            await delay(180 + attempts * 70);

            const afterCount = zone.querySelectorAll(".dnditem").length;
            placed = afterCount > beforeCount || success;

            if (!placed && attempts < MAX_ATTEMPTS) {
                _warn(`[edx] Match[${i}]: Attempt ${attempts} failed, retrying in ${400 + attempts * 200}ms`);
                await delay(260 + attempts * 120);
                // Re-poll zones in case DOM shifted
                while (document.querySelector(".gu-mirror, .gu-transit")) await delay(50);
            }
        }

        if (placed) {
            filledCount++;
            setDndProgress(filledCount, totalToFill);
            _log(`[edx] Match[${i}]: Placed "${expectedx}"`);
        } else {
            _warn(`[edx] Match[${i}]: All attempts failed for "${expectedx}"`);
        }


        await delay(90);
    }

    _log(`[edx] Match Columns: ${filledCount}/${totalToFill} filled`);
}

// ========================= CATEGORIZED FILL =========================
async function autoFillCategorized(dragTexts, hasExplicitTF) {
    _log("[edx] Starting Categorized Fill (Enhanced)");
    const bank = document.querySelector(bankSelector) || document.querySelector(".dndBank") || document.body;
    let categoryZones = getDndZones(true);
    if (categoryZones.length === 0) {
        categoryZones = Array.from(document.querySelectorAll(".prCLZ__regContainer .dndZone, .prCl__container.regContainer .dndZone, [class*='category'] .dndZone, .dnd-target.flex-1"));
    }

    if (!categoryZones.length) {
        _warn("[edx] No category zones found");
        return false;
    }

    // 1. Build Category Map (Header Text -> Zone) and Assignments
    let catMap = [];
    let parsedAssignments = [];
    const parsedSeen = new Set();

    // Read zone headers directly from DOM
    const zoneHeaders = [];
    categoryZones.forEach((zone, idx) => {
        let headerText = "";
        const container = zone.closest('.prCl__col, .col, .flex-1, [class*="column"], td, .prCLZ__regContainer > div, .dnd-column') || zone.parentElement;
        if (container) {
            const titleNode = container.querySelector('.prCLZ__regTitle, .title, .header, [class*="title"], [class*="header"], strong, b, h3, h4') || container.firstElementChild;
            if (titleNode && titleNode !== zone) {
                headerText = norm(titleNode.innerText || titleNode.textContent);
            } else {
                const clone = container.cloneNode(true);
                const zNode = clone.querySelector('.dndZone, .dnd-target');
                if (zNode) zNode.remove();
                headerText = norm(clone.innerText || clone.textContent);
            }
        }
        if (!headerText && hasExplicitTF && categoryZones.length === 2)
            headerText = idx === 0 ? "true" : "false";
        zoneHeaders.push(headerText || "unknown");
    });


    if (__dndCategories && __dndCategories.length >= 2) {
        // Match each API category to a zone by comparing names to zone headers
        const usedZoneIndexes = new Set();
        __dndCategories.forEach(cat => {
            const cn = norm(cat.catName);
            let bestIdx = -1;
            let bestScore = 0;
            zoneHeaders.forEach((h, idx) => {
                if (usedZoneIndexes.has(idx)) return;
                let score = 0;
                if (h === cn) score = 3;
                else if (h.includes(cn) || cn.includes(h)) score = 2;
                else if (_fuzzyOverlap(h, cn) > 0.5) score = 1;
                if (score > bestScore) { bestScore = score; bestIdx = idx; }
            });
            if (bestIdx === -1) {
                bestIdx = zoneHeaders.findIndex((_h, idx) => !usedZoneIndexes.has(idx));
            }
            if (bestIdx >= 0) {
                usedZoneIndexes.add(bestIdx);
                catMap.push({ zoneIndex: bestIdx, catName: cn });
                cat.allItems.forEach(item => {
                    const t = norm(item);
                    const key = `${cn}||${t}`;
                    if (!parsedSeen.has(key)) {
                        parsedSeen.add(key);
                        parsedAssignments.push({ groupName: cn, itemText: t });
                    }
                });
            }
        });
        _log("[edx] Using API dndCategories:", catMap.map(c => c.catName).join(', '),
            "assignments:", parsedAssignments.length);
    } else {

        const inferredCategories = __ans.filter(a => {
            const t = norm(a);
            return !dragTexts.some(dt => dt.includes(t) || t.includes(dt));
        });

        if (inferredCategories.length === categoryZones.length && inferredCategories.length > 0) {
            categoryZones.forEach((zone, idx) => {
                catMap.push({ zoneIndex: idx, catName: norm(inferredCategories[idx]) });
            });
        } else {
            categoryZones.forEach((zone, idx) => {
                catMap.push({ zoneIndex: idx, catName: zoneHeaders[idx] });
            });
        }

        // Parse Assignments from __ans
        let currentCat = null;
        __ans.forEach(a => {
            const t = norm(a);
            const isAnswerItem = dragTexts.some(dt => dt.includes(t) || t.includes(dt));
            if (!isAnswerItem) {
                currentCat = t;
            } else if (currentCat) {
                const key = `${currentCat}||${t}`;
                if (!parsedSeen.has(key)) {
                    parsedSeen.add(key);
                    parsedAssignments.push({ groupName: currentCat, itemText: t });
                }
            }
        });

        // Fallback for True/False sets
        if (parsedAssignments.length === 0 && hasExplicitTF) {
            currentCat = null;
            __ans.forEach(a => {
                const t = norm(a);
                if (/^true$/i.test(t)) { currentCat = "true"; return; }
                if (/^false$/i.test(t)) { currentCat = "false"; return; }
                if (currentCat && dragTexts.some(dt => dt.includes(t) || t.includes(dt))) {
                    const key = `${currentCat}||${t}`;
                    if (!parsedSeen.has(key)) {
                        parsedSeen.add(key);
                        parsedAssignments.push({ groupName: currentCat, itemText: t });
                    }
                }
            });
        }
    }

    _log("[edx] Parsed assignments:", parsedAssignments.length);

    // 3. Process assignments with FRESH bank lookup each iteration
    // Bank re-renders after each drag; stale element refs cause "Elements not found".
    let filledCount = 0;
    for (let idx = 0; idx < parsedAssignments.length; idx++) {
        if (__dndUserDrag) break;
        const assignment = parsedAssignments[idx];
        if (!assignment || assignment.used) continue;

        const itemText = norm(assignment.itemText || "");
        if (!itemText) continue;

        // Find the correct zone(s) for this category
        // In activities like the screenshot, there might be multiple distinct slots (zones) per category.
        const liveZones = getDndZones(true);
        let targetZones = catMap.filter(c =>
            c.catName === assignment.groupName ||
            (c.catName.length >= 3 && c.catName.includes(assignment.groupName)) ||
            (assignment.groupName.length >= 3 && assignment.groupName.includes(c.catName))
        ).map(c => liveZones[c.zoneIndex]).filter(Boolean);

        if (!targetZones.length && hasExplicitTF && liveZones.length >= 2) {
            if (assignment.groupName === 'true') targetZones = [liveZones[0]];
            if (assignment.groupName === 'false') targetZones = [liveZones[1]];
            targetZones = targetZones.filter(Boolean);
        }

        if (!targetZones.length) continue;

        // Find an empty or available slot in those target zones
        let targetZone = null;
        for (const zone of targetZones) {
            if (!zone.querySelector(".dnditem")) {
                targetZone = zone;
                break;
            }
        }

        // Fallback: if all targeted slots are "full" but we have an assignment, pick the first one 
        // (maybe it's a multi-item container zone)
        if (!targetZone) targetZone = targetZones[0];

        // De-duplication: skip if a matching item already exists in the target zone
        const alreadyInZone = [...targetZone.querySelectorAll(".dnditem")].some(el => {
            const t = norm(el.innerText || el.textContent || "");
            return t === itemText || t.includes(itemText) || itemText.includes(t);
        });
        if (alreadyInZone) {
            assignment.used = true;
            _log(`[edx] Categorized: "${itemText}" already in zone, skipping`);
            continue;
        }

        const liveBank = document.querySelector(bankSelector) || document.querySelector(".dndBank") || document.body;
        let itemWrapper = findBankItem(liveBank, assignment.itemText);
        if (!itemWrapper) {
            _warn(`[edx] Categorized: item not found in bank: "${assignment.itemText}"`);
            continue;
        }
        itemWrapper = itemWrapper.closest("ed-la-dnditem") || itemWrapper;

        _log(`[edx] Categorized: Placing "${itemText}" -> "${assignment.groupName}"`);
        const before = targetZone.querySelectorAll(".dnditem").length;

        let placed = false;
        let attempts = 0;
        const MAX_ATTEMPTS = 3;

        while (!placed && attempts < MAX_ATTEMPTS) {
            attempts++;

            const currentBank = document.querySelector(bankSelector) || document.querySelector(".dndBank") || document.body;
            let currentItem = findBankItem(currentBank, assignment.itemText);
            
            if (!currentItem) {
                _warn(`[edx] Categorized: Item "${assignment.itemText}" lost from bank on attempt ${attempts}`);
                await delay(300);
                continue;
            }

            currentItem = currentItem.closest("ed-la-dnditem") || currentItem;
            await simulateDragDrop(currentItem, targetZone);
            await delay(180 + attempts * 70);

            // Verify if placement succeeded
            const nowHasItem = [...targetZone.querySelectorAll(".dnditem")].some(el => {
                const t = norm(el.innerText || el.textContent || "");
                return t === itemText || t.includes(itemText) || itemText.includes(t);
            }) || targetZone.contains(currentItem);

            if (targetZone.querySelectorAll(".dnditem").length > before || nowHasItem) {
                placed = true;
            } else if (attempts < MAX_ATTEMPTS) {
                _warn(`[edx] Categorized: Drop failed for "${itemText}", retrying (${attempts}/${MAX_ATTEMPTS})`);
                await delay(200 + attempts * 100);
            }
        }

        if (placed) {
            assignment.used = true; // Match succeeded
            filledCount++;
            setDndProgress(filledCount, parsedAssignments.length);
        } else {
            _warn(`[edx] Categorized: Failed to place "${itemText}" after ${MAX_ATTEMPTS} attempts`);
        }
    }

    return filledCount > 0;
}

// ========================= CLASSIFICATION FILL (Type 1) =========================
// Classification DnD: table with multiple columns, each cell can receive multiple items
async function autoFillClassification(dragTexts) {
    _log("[edx] Starting Classification Fill (Type 1)");
    
    // Get all category columns/zones
    let categoryZones = getDndZones(true);
    if (!categoryZones.length) {
        categoryZones = Array.from(document.querySelectorAll(
            ".prCLZ__regContainer .dndZone, .prCl__container .dndZone, .prCl__col .dndZone, .dnd-target.flex-1, [class*='classification'] .dndZone"
        ));
    }
    if (!categoryZones.length) {
        _warn("[edx] Classification: No zones found");
        return false;
    }
    
    // Get zone headers
    const zoneHeaders = [];
    categoryZones.forEach((zone, idx) => {
        let headerText = "";
        const container = zone.closest('.prCl__col, .col, .flex-1, [class*="column"], td, .prCLZ__regContainer > div, .dnd-column') || zone.parentElement;
        if (container) {
            const titleNode = container.querySelector('.prCLZ__regTitle, .title, .header, [class*="title"], [class*="header"], strong, b, h3, h4') || container.firstElementChild;
            if (titleNode && titleNode !== zone) {
                headerText = norm(titleNode.innerText || titleNode.textContent);
            }
        }
        zoneHeaders.push(headerText || `column_${idx}`);
    });
    
    _log("[edx] Classification zones:", zoneHeaders.length, "headers:", zoneHeaders);
    
    // Build assignments from __ans
    // Format: [CatName1, item1, item2, CatName2, item3, item4] or from __dndCategories
    const assignments = [];
    const parsedSeen = new Set();
    
    if (__dndCategories && __dndCategories.length >= 2) {
        // Use API-provided categories
        __dndCategories.forEach(cat => {
            const catName = norm(cat.catName);
            cat.allItems.forEach(item => {
                const itemText = norm(item);
                const key = `${catName}||${itemText}`;
                if (!parsedSeen.has(key)) {
                    parsedSeen.add(key);
                    assignments.push({ groupName: catName, itemText });
                }
            });
        });
    } else {
        // Parse from __ans array
        let currentCat = null;
        __ans.forEach(a => {
            const t = norm(a);
            const isAnswerItem = dragTexts.some(dt => dt.includes(t) || t.includes(dt));
            if (!isAnswerItem) {
                currentCat = t;
            } else if (currentCat) {
                const key = `${currentCat}||${t}`;
                if (!parsedSeen.has(key)) {
                    parsedSeen.add(key);
                    assignments.push({ groupName: currentCat, itemText: t });
                }
            }
        });
    }
    
    if (!assignments.length) {
        _warn("[edx] Classification: No assignments parsed");
        return false;
    }
    
    _log("[edx] Classification assignments:", assignments.length);
    
    // Match categories to zones
    const catToZone = new Map();
    zoneHeaders.forEach((header, idx) => {
        assignments.forEach(ass => {
            if (!catToZone.has(ass.groupName)) {
                const gn = ass.groupName;
                if (header === gn || header.includes(gn) || gn.includes(header) || _fuzzyOverlap(header, gn) > 0.5) {
                    catToZone.set(gn, idx);
                }
            }
        });
    });
    
    // Fill unmapped categories to remaining zones
    let zoneIdx = 0;
    assignments.forEach(ass => {
        if (!catToZone.has(ass.groupName)) {
            while (zoneIdx < categoryZones.length && [...catToZone.values()].includes(zoneIdx)) {
                zoneIdx++;
            }
            if (zoneIdx < categoryZones.length) {
                catToZone.set(ass.groupName, zoneIdx);
            }
        }
    });
    
    // Perform drags
    const bank = document.querySelector(bankSelector) || document.querySelector(".dndBank") || document.body;
    let filledCount = 0;
    const MAX_ATTEMPTS = 3;
    
    for (const ass of assignments) {
        const zoneIndex = catToZone.get(ass.groupName);
        if (zoneIndex === undefined) continue;
        
        const zone = categoryZones[zoneIndex];
        const itemText = ass.itemText;
        
        // Find item in bank
        const itemEl = findItemInBank(bank, itemText);
        if (!itemEl) {
            _warn(`[edx] Classification: Item not found "${itemText}"`);
            continue;
        }
        
        // Check if already placed
        const existing = Array.from(zone.querySelectorAll('.dnditem, .dnd-item, .draggable, [draggable="true"]'))
            .find(el => norm(el.innerText || el.textContent).includes(itemText));
        if (existing) {
            filledCount++;
            continue;
        }
        
        // Attempt drag
        let placed = false;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS && !placed; attempt++) {
            try {
                await scrollToElement(zone);
                await scrollToElement(itemEl);
                await simulateDragDrop(itemEl, zone);
                await delay(150 + Math.random() * 100);
                
                // Verify
                const afterDrag = Array.from(zone.querySelectorAll('.dnditem, .dnd-item, .draggable, [draggable="true"]'))
                    .find(el => norm(el.innerText || el.textContent).includes(itemText));
                if (afterDrag) {
                    placed = true;
                    filledCount++;
                }
            } catch (e) {
                _warn(`[edx] Classification: Drag failed "${itemText}" attempt ${attempt}`);
                await delay(200 + attempt * 100);
            }
        }
        
        if (!placed) {
            _warn(`[edx] Classification: Failed to place "${itemText}" after ${MAX_ATTEMPTS} attempts`);
        }
    }
    
    _log("[edx] Classification completed:", filledCount, "/", assignments.length);
    return filledCount > 0;
}

// ========================= SEQUENCE ORDER SCRAPE (FIXED) =========================
// Fix: better container detection, poll for stable render after Show Answer,
// fallback to multiple scraping strategies
async function scrapeSequenceOrder() {
    try {
        // Find Show Answer button
        const showBtnSelectors = [
            '.learning__showAnswerLink', '#learning__showAnswer',
            'a[title*="Show"]', 'button[title*="Show"]',
            'a[title*="show"]', 'button[title*="show"]',
            'a[title*="See"]', 'button[title*="See"]'
        ];
        let showBtn = document.querySelector(showBtnSelectors.join(','));
        if (!showBtn) {
            showBtn = Array.from(document.querySelectorAll("a, button")).find(el => {
                const text = (el.innerText || el.textContent || "").toLowerCase();
                return text.includes("show answer") || text.includes("see answer");
            });
        }
        if (!showBtn) {
            _warn("[edx] Show Answer button not found");
            return null;
        }

        // Snapshot current order before clicking Show Answer
        const getItemTexts = () => {
            const container = document.querySelector("ed-la-sorting-text, ed-la-ordering, .prSO__container");
            let items = [];
            if (container) {
                // Strategy 1: find the list with exactly __ans.length children
                const lists = Array.from(container.querySelectorAll("ul, ol, div"))
                    .filter(c => c.children.length === __ans.length && c.children.length > 0);
                if (lists.length > 0) {
                    // Pick the deepest matching list (most specific)
                    const deepest = lists.reduce((a, b) => (b.contains(a) ? b : a));
                    items = Array.from(deepest.children);
                }
                // Strategy 2: all .dnditem inside container
                const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
                if (!items.length) items = Array.from(container.querySelectorAll(itemSelectors));
                // Strategy 3: direct children
                if (!items.length) items = Array.from(container.children);
            }
            const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
            // Strategy 4: global .dnditem
            if (!items.length) items = Array.from(document.querySelectorAll(itemSelectors));
            return items.map(el => (el.innerText || el.textContent || "").trim()).filter(Boolean);
        };

        const beforeOrder = getItemTexts();
        _log("[edx] Sequence before Show Answer:", beforeOrder);

        showBtn.click();


        let afterOrder = [];
        const pollStart = Date.now();
        const POLL_TIMEOUT = 3000;
        const STABLE_THRESHOLD = 2; // require 2 consecutive identical reads

        let stableCount = 0;
        let lastRead = "";

        while (Date.now() - pollStart < POLL_TIMEOUT) {
            await delay(200);
            const current = getItemTexts();
            const currentStr = current.join("|");

            // Check if order has changed from before (Show Answer applied)
            const changed = currentStr !== beforeOrder.join("|") && current.length === __ans.length;

            if (changed && currentStr === lastRead) {
                stableCount++;
                if (stableCount >= STABLE_THRESHOLD) {
                    afterOrder = current;
                    _log("[edx] Sequence stable after Show Answer:", afterOrder);
                    break;
                }
            } else {
                stableCount = changed ? 1 : 0;
                lastRead = currentStr;
            }
        }

        // Fallback: just take whatever we have after timeout
        if (!afterOrder.length) {
            afterOrder = getItemTexts();
            _log("[edx] Sequence (timeout fallback):", afterOrder);
        }

        // Click Redo/Reset
        const redoBtnSelectors = [
            '.learning__retryLink', '#learning__retry',
            'a[title*="Redo"]', 'a[title*="Reset"]',
            'a[title*="redo"]', 'a[title*="reset"]'
        ];
        const redoBtn = document.querySelector(redoBtnSelectors.join(','));
        if (redoBtn) {
            redoBtn.click();
            await delay(800);
        } else {
            _warn("[edx] Redo button not found");
        }

        if (afterOrder.length > 0) return afterOrder;
        return null;
    } catch (e) {
        _warn("[edx] scrapeSequenceOrder error:", e.message);
        return null;
    }
}

// ========================= ORDERING FILL (FIXED) =========================
// Fix: removed double __dndInProgress management, fixed Angular swap verify
async function autoFillOrdering() {
    let filledCount = 0;
    const totalToFill = __ans.length;
    setDndProgress(0, totalToFill);

    for (let i = 0; i < __ans.length; i++) {
        const expectedx = norm(__ans[i]);
        if (!expectedx) continue;

        // Always re-read current item list from DOM
        const getItems = () => {
            const container = document.querySelector("ed-la-sorting-text, ed-la-ordering, .prSO__container");
            if (container) {
                const lists = Array.from(container.querySelectorAll("ul, ol, div"))
                    .filter(c => c.children.length === __ans.length && c.children.length > 0);
                if (lists.length > 0) {
                    const deepest = lists.reduce((a, b) => (b.contains(a) ? b : a));
                    return Array.from(deepest.children);
                }
                const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
                const items = Array.from(container.querySelectorAll(itemSelectors));
                if (items.length) return items;
            }
            const itemSelectorsGlobal = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
            return Array.from(document.querySelectorAll(itemSelectorsGlobal));
        };

        const currentItems = getItems();
        if (!currentItems.length) break;


        // This prevents picking an already-placed duplicate at an earlier position
        let targetItemIndex = -1;
        for (let j = i; j < currentItems.length; j++) {
            const t = norm(currentItems[j].innerText || currentItems[j].textContent || "");
            if (t === expectedx || t.includes(expectedx) || expectedx.includes(t)) {
                targetItemIndex = j;
                break;
            }
        }
        if (targetItemIndex === -1) continue;
        if (targetItemIndex === i) {
            filledCount++;
            setDndProgress(filledCount, totalToFill);
            continue;
        }

        if (__dndUserDrag) break;
        while (document.querySelector(".gu-mirror, .gu-transit")) await delay(50);

        const itemNode = currentItems[targetItemIndex];
        const dropSpotNode = currentItems[i];


        let angularSwapped = false;
        try {
            if (window.angular) {
                const itemNg = window.angular.element(itemNode);
                const scope = itemNg.scope ? itemNg.scope() : null;
                const scopesToCheck = [scope, scope?.$parent, scope?.$root];
                const arrNames = ['answers', 'items', 'words', 'options', 'sentences', 'list', 'data'];
                for (const sc of scopesToCheck) {
                    if (!sc || angularSwapped) break;
                    for (const arrName of arrNames) {
                        if (Array.isArray(sc[arrName]) && sc[arrName].length === __ans.length) {
                            const temp = sc[arrName][i];
                            sc[arrName][i] = sc[arrName][targetItemIndex];
                            sc[arrName][targetItemIndex] = temp;
                            try { if (!sc.$$phase && !sc.$root?.$$phase) sc.$apply(); } catch (_) { }
                            await delay(200);
                            angularSwapped = true;
                            _log(`[edx] Ordering: Angular swap via scope.${arrName}`);
                            break;
                        }
                    }
                }
            }
        } catch (e) { }

        if (!angularSwapped) {
            await simulateDragDrop(itemNode, dropSpotNode);
            await delay(500);
        }


        const newItems = getItems();
        const verifyText = norm(newItems[i]?.innerText || newItems[i]?.textContent || "");
        const verified = verifyText === expectedx || verifyText.includes(expectedx) || expectedx.includes(verifyText);

        if (verified) {
            filledCount++;
            setDndProgress(filledCount, totalToFill);
        } else if (!angularSwapped) {
            // Retry drag
            await delay(400);
            await simulateDragDrop(itemNode, newItems[i] || dropSpotNode);
            await delay(500);
            // Verify retry
            const retryItems = getItems();
            const retryText = norm(retryItems[i]?.innerText || retryItems[i]?.textContent || "");
            const retryOk = retryText === expectedx || retryText.includes(expectedx) || expectedx.includes(retryText);
            if (retryOk) {
                filledCount++;
                setDndProgress(filledCount, totalToFill);
            }
        }
    }

    return filledCount > 0;
}

// ========================= SEQUENTIAL FILL =========================
async function autoFillSequential(bank, allZones) {

    const bankTarget = document.querySelector(bankSelector) || document.querySelector(".dndBank, [id^='bank_'], .prCl__container--bank");
    if (bankTarget) {
        const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
        for (let zi = 0; zi < allZones.length; zi++) {
            const zone = allZones[zi];
            const existingItem = zone.querySelector(itemSelectors);
            if (!existingItem) continue;

            // Check if this item is the CORRECT answer for this zone
            let expectedx = resolveZoneAnswer(zone, zi);
            if (!expectedx) expectedx = __ans[zi] || null;
            if (expectedx) {
                const existingText = norm(existingItem.innerText || existingItem.textContent || "");
                const expectedNorm = norm(expectedx);
                if (existingText === expectedNorm || existingText.includes(expectedNorm) || expectedNorm.includes(existingText)) {
                    _log(`[edx] Seq[${zi}]: Already correct "${existingText}", keeping`);
                    continue;
                }
            }

            const evictEl = existingItem.closest("ed-la-dnditem") || existingItem;
            _log(`[edx] Seq[${zi}]: Evicting wrong item "${norm(existingItem.textContent)}"`);
            await simulateDragDrop(evictEl, bankTarget);
            await delay(300);
            // Verify eviction
            for (let p = 0; p < 8 && zone.querySelector(itemSelectors); p++) await delay(100);
        }
        await delay(200);
    }


    const totalToFill = allZones.length;
    let filledCount = 0;
    setDndProgress(0, totalToFill);
    // Count-based tracker so duplicate answers work correctly
    const answerBudget = new Map();
    for (const a of __ans) { const n = norm(a); answerBudget.set(n, (answerBudget.get(n) || 0) + 1); }
    const usedCounts = new Map();
    const _useAns = (n) => usedCounts.set(n, (usedCounts.get(n) || 0) + 1);
    const _isAvailable = (n) => (usedCounts.get(n) || 0) < (answerBudget.get(n) || 0);

    for (let i = 0; i < allZones.length; i++) {
        const zone = allZones[i];
        // Use resolveZoneAnswer (checks all attributes) instead of only zone.id
        let expectedx = resolveZoneAnswer(zone, i);
        if (!expectedx) expectedx = __ans[i] || null;

        // Dedup: if this answer's budget is exhausted, find next available
        if (expectedx && !_isAvailable(norm(expectedx))) {
            const alt = __ans.find(a => _isAvailable(norm(a)));
            if (alt) expectedx = alt;
        }

        if (!expectedx) continue;

        // Skip if zone somehow already has the correct item (edge case)
        const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
        const existingItem = zone.querySelector(itemSelectors);
        if (existingItem) {
            const existingText = norm(existingItem.innerText || existingItem.textContent || "");
            const expectedNorm = norm(expectedx);
            if (existingText === expectedNorm || existingText.includes(expectedNorm) || expectedNorm.includes(existingText)) {
                _useAns(expectedNorm);
                filledCount++;
                setDndProgress(filledCount, totalToFill);
                continue;
            }
        }

        if (__dndUserDrag) break;
        while (document.querySelector(".gu-mirror, .gu-transit")) await delay(50);

        // Re-read bank FRESH each iteration (bank re-renders after each drop)
        const liveBank = document.querySelector(bankSelector) || bank || document.body;
        const item = findBankItem(liveBank, expectedx);
        if (!item) {
            _warn(`[edx] Seq[${i}]: "${expectedx}" not found in bank`);
            continue;
        }

        _log(`[edx] Seq[${i}]: Placing "${expectedx}"`);
        const before = zone.querySelectorAll(itemSelectors).length;
        await simulateDragDrop(item, zone);
        await delay(350);

        // Verify placement by checking if zone now contains an item with correct text
        const expectedNorm = norm(expectedx);
        const placedOk = [...zone.querySelectorAll(itemSelectors)].some(it => {
            const t = norm(it.innerText || it.textContent || '');
            return t === expectedNorm || (t.length >= 3 && (t.includes(expectedNorm) || expectedNorm.includes(t)));
        });

        if (placedOk) {
            _useAns(expectedNorm);
            filledCount++;
            setDndProgress(filledCount, totalToFill);
        } else {
            // Retry once
            await delay(400);
            const retryBank = document.querySelector(bankSelector) || bank || document.body;
            let retryItem = findBankItem(retryBank, expectedx);
            if (retryItem) {
                await simulateDragDrop(retryItem, zone);
                await delay(400);
                const retryOk = [...zone.querySelectorAll(itemSelectors)].some(it => {
                    const t = norm(it.innerText || it.textContent || '');
                    return t === expectedNorm || (t.length >= 3 && (t.includes(expectedNorm) || expectedNorm.includes(t)));
                });
                if (retryOk) {
                    _useAns(expectedNorm);
                    filledCount++;
                    setDndProgress(filledCount, totalToFill);
                }
            }
        }
        await delay(100);
    }

    if (filledCount === 0 && totalToFill > 0) __dndFailCount++;
    else __dndFailCount = 0;
}

// ========================= SIMULATE DRAG DROP =========================
const mkEventOpts = (x, y) => ({
    bubbles: true, cancelable: true, composed: true,
    clientX: x, clientY: y,
    screenX: x + (window.screenX || 0), screenY: y + (window.screenY || 0),
    pageX: x + window.scrollX, pageY: y + window.scrollY,
    button: 0, buttons: 1, view: window, detail: 1,
});

// ========================= CARD MATCH AUTO-FILL =========================
function _cardFn(src) {
    if (!src) return '';
    return src.split('/').pop().split('?')[0].split('#')[0].toLowerCase();
}

// Request inject.js to mine Angular scopes for card data
async function _mineCardScopes(timeoutMs) {
    return new Promise((resolve) => {
        const requestId = makeBridgeRequestId('cards');
        const handler = (e) => {
            if (!isValidBridgeEvent(e)) return;
            if (e?.detail?.requestId !== requestId) return;
            __removeBridgeListener(document, '__edx_cards_result', handler);
            try {
                const raw = typeof e.detail?.result === 'string' ? e.detail.result : '{}';
                if (raw.length > 1500000) {
                    resolve({});
                    return;
                }
                resolve(JSON.parse(raw || '{}'));
            }
            catch (_) { resolve({}); }
        };
        __addBridgeListener(document, '__edx_cards_result', handler);
        __dispatchBridgeEvent(document, '__edx_mine_cards', { detail: { requestId } });
        setTimeout(() => { __removeBridgeListener(document, '__edx_cards_result', handler); resolve({}); }, timeoutMs || 3000);
    });
}


function _overlayBadge(cardEl, num) {
    cardEl.querySelector(__obfSelector('.eds-card-badge'))?.remove();
    const badge = document.createElement('div');
    badge.className = __obfClassList('eds-card-badge');
    badge.textContent = String(num);
    badge.style.cssText = [
        'position:absolute', 'top:2px', 'left:2px', 'z-index:9999',
        'min-width:20px', 'height:20px', 'line-height:20px',
        'padding:0 5px', 'border-radius:4px',
        'background:rgba(0,0,0,0.75)', 'color:#fff',
        'font-size:12px', 'font-weight:700', 'text-align:center',
        'pointer-events:none', 'box-shadow:0 1px 3px rgba(0,0,0,0.4)',
        'font-family:system-ui,sans-serif',
    ].join(';');
    const cs = getComputedStyle(cardEl);
    if (cs.position === 'static') cardEl.style.position = 'relative';
    cardEl.appendChild(badge);
}

function _removeAllBadges(container) {
    container.querySelectorAll(__obfSelector('.eds-card-badge')).forEach(b => b.remove());
}

// Cache for badge mapping
let __cardBadgeCache = null;

// Standalone: mine scopes, map cards, overlay numbered badges
async function overlayCardBadges() {
    __cardBadgeCache = null;
    _log('[EDX CardBadge] overlayCardBadges called, __cardPairs:', !!__cardPairs, 'pairLabels:', __cardPairs?.pairLabels?.length);
    if (!__cardPairs?.pairLabels?.length) return;

    // Block MutationObserver-triggered scheduleRefresh while we mutate DOM
    __fetching = true;

    try {
        const container = document.querySelector('.lessonPlayArea') ||
            document.querySelector('.practice__container') ||
            document.querySelector('.learning__container') ||
            document.querySelector('ed-la-taskspager') ||
            document.querySelector('[ng-controller]') ||
            document.querySelector('main') ||
            document.body;
        _log('[EDX CardBadge] container:', !!container, container?.tagName, container?.className?.substring?.(0, 60));
        if (!container) return;

        _removeAllBadges(container);

        const numPairs = __cardPairs.pairLabels.length;
        const setStatus = (text, type) => {
            try {
                const el = __shadow?.getElementById?.('eds-card-status');
                if (!el) return;
                el.textContent = text;
                el.className = __obfClassList('eds-card-status' + (type ? ' eds-card-status--' + type : ''));
            } catch (_) { }
        };

        const allClickables = [...container.querySelectorAll('[ng-click]')];

        // Collect all documents to search (top + same-origin iframes)
        const searchDocs = [document];
        try {
            for (const ifr of document.querySelectorAll('iframe')) {
                try { const d = ifr.contentDocument || ifr.contentWindow?.document; if (d) searchDocs.push(d); } catch (_) { }
            }
        } catch (_) { }

        let cardEls = [];
        let cardFrontBgMap = new Map(); // cardEl -> front bg-image URL


        for (const doc of searchDocs) {
            try {
                // Find all card-back elements by class or computed bg
                const backSides = [...doc.querySelectorAll('.memoG__cardSideBack, [class*="cardSide"][class*="Back"], [class*="card-back"], [class*="card_back"]')];
                // Also find via computed style if class-based search finds nothing
                if (backSides.length === 0) {
                    const candidates = doc.querySelectorAll('[class*="card"], [class*="Card"], [class*="memo"], [class*="Memo"], [class*="match"], [class*="Match"]');
                    for (const el of candidates) {
                        try {
                            const bg = getComputedStyle(el).backgroundImage || '';
                            if (bg.includes('cardBack') || bg.includes('card_back')) backSides.push(el);
                        } catch (_) { }
                    }
                }
                _log('[EDX CardBadge] Strategy 1: backSides found:', backSides.length, 'in doc', searchDocs.indexOf(doc));

                for (const backEl of backSides) {
                    // Card wrapper = parent of the back/front sides
                    const cardEl = backEl.parentElement;
                    if (!cardEl || cardEls.includes(cardEl)) continue;

                    // Find the front side sibling
                    const frontEl = cardEl.querySelector('.memoG__cardSideFront, [class*="cardSide"][class*="Front"]');
                    let frontBg = '';
                    if (frontEl) {
                        try { frontBg = getComputedStyle(frontEl).backgroundImage || ''; } catch (_) { }
                    }
                    // Also check other children for front images
                    if (!frontBg || frontBg === 'none') {
                        for (const child of cardEl.children) {
                            if (child === backEl) continue;
                            try {
                                const bg = getComputedStyle(child).backgroundImage || '';
                                if (bg && bg !== 'none' && !bg.includes('cardBack')) { frontBg = bg; break; }
                            } catch (_) { }
                        }
                    }

                    cardEls.push(cardEl);
                    if (frontBg && frontBg !== 'none') {
                        cardFrontBgMap.set(cardEl, frontBg);
                    }
                }
            } catch (_) { }
        }
        _log('[EDX CardBadge] Strategy 1 total cards:', cardEls.length, '| with front bg:', cardFrontBgMap.size);


        if (cardEls.length < 2) {
            cardEls = allClickables.filter(el => {
                for (const img of el.querySelectorAll('img')) {
                    const s = img.getAttribute('src') || img.getAttribute('ng-src') || '';
                    if (s.includes('cardBack') || s.includes('card_back')) return true;
                }
                return false;
            });
            _log('[EDX CardBadge] Strategy 2 (ng-click):', cardEls.length);
        }


        if (cardEls.length < 2) {
            const backImgs = searchDocs.flatMap(doc => {
                try { return [...doc.querySelectorAll('img[src*="cardBack"], img[src*="card_back"]')]; } catch (_) { return []; }
            });
            if (backImgs.length >= 2) {
                const cardElSet = new WeakSet();
                cardEls = [];
                for (const img of backImgs) {
                    const el = img.parentElement;
                    if (el && !cardElSet.has(el)) { cardElSet.add(el); cardEls.push(el); }
                }
            }
            _log('[EDX CardBadge] Strategy 3 (img tag):', cardEls.length);
        }


        // This ensures card 1 = top-left, card N = bottom-right as user sees on screen
        cardEls.sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            const rowThreshold = Math.min(ra.height, rb.height) * 0.4;
            const dy = ra.top - rb.top;
            if (Math.abs(dy) > rowThreshold) return dy; // different row
            return ra.left - rb.left;
        });
        _log('[EDX CardBadge] Cards:', cardEls.length, '| Pairs:', numPairs);

        if (cardEls.length < 2) {
            setStatus('Kh\u00f4ng t\u00ecm th\u1ea5y th\u1ebb', 'error');
            return;
        }

        setStatus('\u0110ang ph\u00e2n t\u00edch th\u1ebb...', 'loading');
        const cardToPairIdx = new Map();

        // Build lookup maps from API data
        const ridToPair = __cardPairs.ridToPairIdx || new Map();
        const fnToPair = new Map();
        for (const [rid, pIdx] of ridToPair) {
            const src = __cardPairs.resMap?.get(rid);
            if (src) fnToPair.set(_cardFn(src), pIdx);
        }
        const textToPair = new Map();
        __cardPairs.pairLabels.forEach((p, i) => {
            if (p.label) textToPair.set(p.label.toLowerCase().trim(), i);
        });
        _log('[EDX CardBadge] fnToPair:', [...fnToPair.entries()].map(([k, v]) => k + '=' + v).join(', '));


        for (const el of cardEls) {
            if (cardToPairIdx.has(el)) continue;

            // A1: CSS background-image from cardFrontBgMap (Strategy 1 results)
            const frontBg = cardFrontBgMap.get(el) || '';
            if (frontBg && frontBg !== 'none') {
                // Extract filename from url("https://...path/filename.jpg")
                const urlMatch = frontBg.match(/url\(["']?([^"')]+)["']?\)/);
                if (urlMatch) {
                    const fn = _cardFn(urlMatch[1]);
                    if (fn && fnToPair.has(fn)) {
                        cardToPairIdx.set(el, fnToPair.get(fn));
                    }
                    // Partial match
                    if (!cardToPairIdx.has(el)) {
                        for (const [mapFn, pIdx] of fnToPair) {
                            if (fn.includes(mapFn) || mapFn.includes(fn)) {
                                cardToPairIdx.set(el, pIdx);
                                break;
                            }
                        }
                    }
                }
            }

            // A2: <img> tags inside card
            if (!cardToPairIdx.has(el)) {
                for (const img of el.querySelectorAll('img')) {
                    const src = img.getAttribute('src') || img.getAttribute('ng-src') || img.getAttribute('data-src') || '';
                    if (!src || src.includes('cardBack') || src.includes('card_back') || src.includes('Hover')) continue;
                    const fn = _cardFn(src);
                    if (fn && fnToPair.has(fn)) {
                        cardToPairIdx.set(el, fnToPair.get(fn));
                        break;
                    }
                    for (const [mapFn, pIdx] of fnToPair) {
                        if (fn.includes(mapFn) || mapFn.includes(fn)) {
                            cardToPairIdx.set(el, pIdx);
                            break;
                        }
                    }
                    if (cardToPairIdx.has(el)) break;
                }
            }

            // A3: Text content
            if (!cardToPairIdx.has(el)) {
                const text = (el.innerText || el.textContent || '').trim().toLowerCase();
                if (text && text.length >= 2 && textToPair.has(text)) {
                    cardToPairIdx.set(el, textToPair.get(text));
                }
            }
        }
        _log('[EDX CardBadge] After DOM scan:', cardToPairIdx.size, 'mapped');


        if (cardToPairIdx.size < cardEls.length) {
            const mined = await _mineCardScopes(3000);
            _log('[EDX CardBadge] Mined result:', JSON.stringify(mined).substring(0, 500));

            if (mined.cards?.length) {
                _log('[EDX CardBadge] Mined', mined.cards.length, 'scope entries');

                const mIdToPair = new Map();
                __cardPairs.pairLabels.forEach((p, i) => {
                    if (p.mId) mIdToPair.set(p.mId, i);
                });

                for (const entry of mined.cards) {
                    const elIdx = entry._elIndex;
                    if (elIdx == null) continue;
                    const domEl = allClickables[elIdx];
                    if (!domEl || !cardEls.includes(domEl) || cardToPairIdx.has(domEl)) continue;

                    let pairIdx = -1;

                    if (entry.rid != null && ridToPair.has(entry.rid)) {
                        pairIdx = ridToPair.get(entry.rid);
                    }
                    if (pairIdx < 0) {
                        const src = entry.src || entry.imgSrc || entry.image || entry.resource || '';
                        if (src) {
                            const fn = _cardFn(src);
                            if (fnToPair.has(fn)) pairIdx = fnToPair.get(fn);
                        }
                    }
                    if (pairIdx < 0 && entry.txt) {
                        const t = String(entry.txt).toLowerCase().trim();
                        if (textToPair.has(t)) pairIdx = textToPair.get(t);
                    }
                    if (pairIdx < 0 && entry.mId) {
                        if (mIdToPair.has(entry.mId)) pairIdx = mIdToPair.get(entry.mId);
                    }
                    if (pairIdx < 0 && entry.answerId != null) {
                        for (let pi = 0; pi < __cardPairs.pairLabels.length; pi++) {
                            const p = __cardPairs.pairLabels[pi];
                            if (p.textId === entry.answerId || p.rid === entry.answerId) {
                                pairIdx = pi; break;
                            }
                        }
                    }

                    if (pairIdx >= 0) {
                        cardToPairIdx.set(domEl, pairIdx);
                    }
                }
            }
        }

        const mapped = cardToPairIdx.size;
        _log('[EDX CardBadge] Mapped', mapped, '/', cardEls.length, 'cards');

        for (const [el, pairIdx] of cardToPairIdx) {
            _overlayBadge(el, pairIdx + 1);
        }

        __cardBadgeCache = { cardToPairIdx, cardEls, allClickables };

        // Update panel: fill "V\u1ecb tr\u00ed th\u1ebb" column
        const pairToPositions = new Map();
        for (const [el, pIdx] of cardToPairIdx) {
            const pos = cardEls.indexOf(el);
            if (pos < 0) continue;
            if (!pairToPositions.has(pIdx)) pairToPositions.set(pIdx, []);
            pairToPositions.get(pIdx).push(pos);
        }
        try {
            const mapCells = __shadow?.querySelectorAll?.(__obfSelector('.eds-match-map[data-pair-idx]'));
            _log('[EDX CardBadge] mapCells found:', mapCells?.length, '| pairToPositions:', pairToPositions.size);
            if (mapCells) {
                mapCells.forEach(cell => {
                    const pi = parseInt(cell.getAttribute('data-pair-idx'), 10);
                    const positions = pairToPositions.get(pi);
                    if (positions?.length >= 2) {

                        cell.textContent = 'card ' + (positions[0] + 1) + ' \u2194 card ' + (positions[1] + 1);
                    } else if (positions?.length === 1) {
                        cell.textContent = 'card ' + (positions[0] + 1) + ' \u2194 ?';
                    } else {
                        cell.textContent = '\u2014';
                    }
                });
            }
        } catch (_) { }

        if (mapped >= numPairs * 2) {
            setStatus('\u0110\u00e3 nh\u1eadn di\u1ec7n ' + mapped + ' th\u1ebb \u2014 l\u1eadt th\u1ebb theo s\u1ed1 tr\u00ean', 'success');
        } else if (mapped > 0) {
            setStatus('Nh\u1eadn di\u1ec7n ' + mapped + '/' + cardEls.length + ' th\u1ebb', 'warning');
        } else {
            setStatus('Ch\u01b0a nh\u1eadn di\u1ec7n \u0111\u01b0\u1ee3c th\u1ebb', 'warning');
        }
    } finally {
        __fetching = false;
    }
}

async function autoFillCardMatch() {
    if (!__cardPairs?.pairLabels?.length) return false;

    const container = document.querySelector('.lessonPlayArea') ||
        document.querySelector('.practice__container') ||
        document.querySelector('.learning__container') ||
        document.querySelector('ed-la-taskspager') ||
        document.querySelector('[ng-controller]') ||
        document.querySelector('main') ||
        document.body;
    if (!container) return false;

    const numPairs = __cardPairs.pairLabels.length;
    const setStatus = (text, type) => {
        try {
            const el = __shadow?.getElementById?.('eds-card-status');
            if (!el) return;
            el.textContent = text;
            el.className = __obfClassList('eds-card-status' + (type ? ' eds-card-status--' + type : ''));
        } catch (_) { }
    };

    // Use cached badge data or run fresh overlay
    if (!__cardBadgeCache) await overlayCardBadges();
    const cache = __cardBadgeCache;

    if (!cache?.cardEls?.length) {
        setStatus('Kh\u00f4ng t\u00ecm th\u1ea5y th\u1ebb', 'error');
        return false;
    }

    const { cardToPairIdx, cardEls } = cache;
    _log('[EDX CardMatch] Auto-fill with', cardToPairIdx.size, 'mapped,', cardEls.length, 'cards');

    // Auto-click: pair by pair (if fully mapped)
    if (cardToPairIdx.size >= numPairs * 2) {
        setStatus('\u0110ang gh\u00e9p...', 'loading');
        let matchedCount = 0;
        const clicked = new Set();

        for (let pairIdx = 0; pairIdx < numPairs; pairIdx++) {
            const pairCards = [];
            for (const [el, pi] of cardToPairIdx) {
                if (pi === pairIdx && !clicked.has(el)) pairCards.push(el);
            }
            if (pairCards.length < 2) {
                _warn('[EDX CardMatch] Pair', pairIdx + 1, 'has only', pairCards.length, 'cards');
                continue;
            }
            advancedClick(pairCards[0]);
            await delay(700);
            advancedClick(pairCards[1]);
            await delay(1000);
            clicked.add(pairCards[0]);
            clicked.add(pairCards[1]);
            matchedCount++;
            setStatus('\u0110ang gh\u00e9p... ' + matchedCount + '/' + numPairs, 'loading');
            _log('[EDX CardMatch] Pair', matchedCount, ':', __cardPairs.pairLabels[pairIdx]?.label);
            await delay(300);
        }

        _removeAllBadges(container);
        if (matchedCount >= numPairs) {
            setStatus('\u0110\u00e3 gh\u00e9p xong ' + numPairs + '/' + numPairs + ' c\u1eb7p', 'success');
        } else if (matchedCount > 0) {
            setStatus('Gh\u00e9p \u0111\u01b0\u1ee3c ' + matchedCount + '/' + numPairs + ' c\u1eb7p', 'warning');
        } else {
            setStatus('Kh\u00f4ng gh\u00e9p \u0111\u01b0\u1ee3c', 'error');
        }
        return matchedCount > 0;
    }

    // Fallback: Memory solver - flip cards to discover content
    _log('[EDX CardMatch] Scope mapping incomplete, falling back to flip discovery');
    setStatus('\u0110ang l\u1eadt th\u1ebb...', 'loading');

    const discovered = new Map();
    const matched = new Set();
    let matchedCount = 0;
    const queue = [...Array(cardEls.length).keys()];

    const DEADLINE = Date.now() + 30_000;
    const isExpired = () => Date.now() > DEADLINE;

    const identifyCard = async (el) => {
        for (let attempt = 0; attempt < 5; attempt++) {
            // Check CSS background-image on child elements (Angular 2+ cards)
            for (const child of el.querySelectorAll('*')) {
                try {
                    const bg = getComputedStyle(child).backgroundImage || '';
                    if (!bg || bg === 'none' || bg.includes('cardBack')) continue;
                    const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
                    if (m) {
                        const fn = _cardFn(m[1]);
                        for (let i = 0; i < __cardPairs.pairLabels.length; i++) {
                            const p = __cardPairs.pairLabels[i];
                            const checkFn = p.imgSrc ? _cardFn(p.imgSrc) : (p.srcA ? _cardFn(p.srcA) : '');
                            const checkFn2 = p.srcB ? _cardFn(p.srcB) : '';
                            if ((checkFn && (fn === checkFn || fn.includes(checkFn) || checkFn.includes(fn))) ||
                                (checkFn2 && (fn === checkFn2 || fn.includes(checkFn2) || checkFn2.includes(fn)))) {
                                return i;
                            }
                        }
                        // Also check fnToPair from resMap
                        const ridToPair = __cardPairs.ridToPairIdx || new Map();
                        const fnMap = new Map();
                        for (const [rid, pIdx] of ridToPair) {
                            const src = __cardPairs.resMap?.get(rid);
                            if (src) fnMap.set(_cardFn(src), pIdx);
                        }
                        if (fnMap.has(fn)) return fnMap.get(fn);
                        for (const [mapFn, pIdx] of fnMap) {
                            if (fn.includes(mapFn) || mapFn.includes(fn)) return pIdx;
                        }
                    }
                } catch (_) { }
            }
            // Check <img> tags
            for (const img of el.querySelectorAll('img')) {
                const src = img.getAttribute('src') || img.getAttribute('ng-src') || '';
                if (!src || src.includes('cardBack')) continue;
                const fn = _cardFn(src);
                for (let i = 0; i < __cardPairs.pairLabels.length; i++) {
                    const p = __cardPairs.pairLabels[i];
                    const checkFn = p.imgSrc ? _cardFn(p.imgSrc) : (p.srcA ? _cardFn(p.srcA) : '');
                    const checkFn2 = p.srcB ? _cardFn(p.srcB) : '';
                    if ((checkFn && (fn === checkFn || fn.includes(checkFn) || checkFn.includes(fn))) ||
                        (checkFn2 && (fn === checkFn2 || fn.includes(checkFn2) || checkFn2.includes(fn)))) {
                        return i;
                    }
                }
            }
            const text = (el.innerText || el.textContent || '').trim().toLowerCase();
            if (text && text.length >= 2) {
                for (let i = 0; i < __cardPairs.pairLabels.length; i++) {
                    const lab = __cardPairs.pairLabels[i].label.toLowerCase().trim();
                    if (text === lab || text.includes(lab) || lab.includes(text)) return i;
                }
            }
            await delay(200);
        }
        return -1;
    };

    while (queue.length > 0 && matchedCount < numPairs) {
        if (isExpired()) {
            _warn('[EDX CardMatch] Timeout 30s, dừng');
            setStatus('Hết giờ - thử lại thủ công', 'error');
            break;
        }

        let firstIdx = -1;
        while (queue.length > 0) {
            const c = queue.shift();
            if (!matched.has(c)) { firstIdx = c; break; }
        }
        if (firstIdx < 0) break;

        advancedClick(cardEls[firstIdx]);
        await delay(650);
        const pair1 = await identifyCard(cardEls[firstIdx]);
        if (pair1 >= 0) discovered.set(firstIdx, pair1);

        let partnerIdx = -1;
        if (pair1 >= 0) {
            for (const [j, jPair] of discovered) {
                if (j !== firstIdx && !matched.has(j) && jPair === pair1) {
                    partnerIdx = j; break;
                }
            }
        }

        if (partnerIdx >= 0) {
            advancedClick(cardEls[partnerIdx]);
            await delay(1000);
            matched.add(firstIdx); matched.add(partnerIdx);
            matchedCount++;
            setStatus('\u0110ang gh\u00e9p... ' + matchedCount + '/' + numPairs, 'loading');
        } else {
            let secondIdx = -1;
            while (queue.length > 0) {
                const c = queue.shift();
                if (!matched.has(c)) { secondIdx = c; break; }
            }
            if (secondIdx >= 0) {
                advancedClick(cardEls[secondIdx]);
                await delay(650);
                const pair2 = await identifyCard(cardEls[secondIdx]);
                if (pair2 >= 0) discovered.set(secondIdx, pair2);
                if (pair1 >= 0 && pair2 >= 0 && pair1 === pair2) {
                    matched.add(firstIdx); matched.add(secondIdx);
                    matchedCount++;
                    setStatus('\u0110ang gh\u00e9p... ' + matchedCount + '/' + numPairs, 'loading');
                } else {
                    await delay(1300);
                }
            }
        }
        await delay(300);
    }

    // Phase 2: match remaining discovered pairs
    if (matchedCount < numPairs) {
        const byPair = new Map();
        for (const [idx, pIdx] of discovered) {
            if (matched.has(idx)) continue;
            if (!byPair.has(pIdx)) byPair.set(pIdx, []);
            byPair.get(pIdx).push(idx);
        }
        for (const [pIdx, indices] of byPair) {
            if (indices.length >= 2 && matchedCount < numPairs) {
                advancedClick(cardEls[indices[0]]); await delay(650);
                advancedClick(cardEls[indices[1]]); await delay(1000);
                matched.add(indices[0]); matched.add(indices[1]);
                matchedCount++;
                setStatus('\u0110ang gh\u00e9p... ' + matchedCount + '/' + numPairs, 'loading');
                await delay(300);
            }
        }
    }

    _removeAllBadges(container);
    if (matchedCount >= numPairs) {
        setStatus('\u0110\u00e3 gh\u00e9p xong ' + numPairs + '/' + numPairs + ' c\u1eb7p', 'success');
    } else if (matchedCount > 0) {
        setStatus('Gh\u00e9p \u0111\u01b0\u1ee3c ' + matchedCount + '/' + numPairs + ' c\u1eb7p', 'warning');
    } else {
        setStatus('Kh\u00f4ng gh\u00e9p \u0111\u01b0\u1ee3c \u2014 th\u1eed l\u1ea1i', 'error');
    }
    return matchedCount > 0;
}

// Clamp to safe viewport area (avoid elementFromPoint returning null at edges)
function safeXY(x, y) {
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return [Math.max(2, Math.min(vw - 2, x)), Math.max(2, Math.min(vh - 2, y))];
}

function dispatchMouseOnly(node, type, x, y) {

    // Dragula only listens for mouse events. Dispatching PointerEvent too
    // causes Zone.js double-processing and Dragula internal errors.
    const [cx, cy] = safeXY(x, y);
    node.dispatchEvent(new MouseEvent(type, mkEventOpts(cx, cy)));
}



async function simulateDragDrop(draggable, target) {
    __dndAutomating = true;
    try {
        if (!draggable || !target) return false;

        // Phase 1: page-context sync first (Angular/Dragula aware)
        if (draggable.isConnected && target.isConnected) {
            try {
                const sourceEl = draggable.parentElement || null;
                const syncOk = await pageSyncDrop(draggable, target, sourceEl);
                if (syncOk) return true;
                // Don't wait needlessly if sync succeeded, but if not we proceed to simulation
                await delay(80);
            } catch (_) { }
        }

        // Resolve the ACTUAL drag element (.dnditem inside Angular wrapper if present)
        const innerItem = draggable.querySelector('.dnditem') || draggable;
        const clamp = (v, mn, mx) => Math.min(mx, Math.max(mn, v));



        target.scrollIntoView({ block: "nearest", inline: "nearest" });
        await delay(50);
        innerItem.scrollIntoView({ block: "center", inline: "center" });
        await delay(80);

        // Read source rect AFTER scrolling it into view
        const s = innerItem.getBoundingClientRect();
        if (s.width === 0 && s.height === 0) {
            _warn("[edx] Draggable has zero size, skipping");
            return false;
        }

        const sx = s.left + clamp(s.width / 2, 2, s.width - 2);
        const sy = s.top + clamp(s.height / 2, 2, s.height - 2);


        dispatchMouseOnly(innerItem, "mouseover", sx, sy);
        dispatchMouseOnly(innerItem, "mousedown", sx, sy);
        await delay(150); // Dragula needs time to initialize grab state

        // Kick moves on document.body
        dispatchMouseOnly(document.body, "mousemove", sx + 3, sy + 3);
        await delay(60);
        dispatchMouseOnly(document.body, "mousemove", sx + 8, sy + 8);
        await delay(60);

        // Wait for mirror to appear
        for (let mw = 0; mw < 10; mw++) {
            if (document.querySelector(".gu-mirror")) break;
            await delay(30);
        }

        const mirrorCreated = !!document.querySelector(".gu-mirror");
        if (mirrorCreated) _log('[edx] Drag started (mirror created)');


        // Scroll target into view only AFTER holding the item
        target.scrollIntoView({ block: "center", inline: "center" });
        await delay(80);

        // Read target rect AFTER scrolling it into view. Important: Target may have moved
        // relative to the screen, and standard scrolling may have also moved the 'gu-mirror'.
        // To drop correctly, we must supply the absolute screen coordinates of 'target' now.
        const t = target.getBoundingClientRect();
        const tx = t.left + clamp(t.width / 2, 4, t.width - 4);
        const ty = t.top + clamp(t.height / 2, 4, t.height - 4);

        // Update sx, sy to be the CURRENT position of the mirror to simulate dragged item moving
        let currentX = sx;
        let currentY = sy;
        const mirrorEl = document.querySelector(".gu-mirror");
        if (mirrorCreated && mirrorEl) {
            const mRect = mirrorEl.getBoundingClientRect();
            currentX = mRect.left + mRect.width / 2;
            currentY = mRect.top + mRect.height / 2;
        }

        _log('[edx] Drag sim: from', currentX.toFixed(0), currentY.toFixed(0), 'to', tx.toFixed(0), ty.toFixed(0));


        const steps = 6;
        for (let i = 1; i <= steps; i++) {
            const x = currentX + ((tx - currentX) * i) / steps;
            const y = currentY + ((ty - currentY) * i) / steps;
            dispatchMouseOnly(document.body, "mousemove", x, y);
            await delay(30 + Math.floor(Math.random() * 50));
        }

        // Final hover: fire directly on the target element so Dragula's
        // elementFromPoint lands exactly on it
        dispatchMouseOnly(target, "mouseover", tx, ty);
        dispatchMouseOnly(target, "mousemove", tx, ty);
        await delay(60);

        // Release on the target
        dispatchMouseOnly(target, "mouseup", tx, ty);

        // Wait for mirror removal (confirms drop processed)
        for (let w = 0; w < 15 && document.querySelector(".gu-mirror"); w++) await delay(20);
        await delay(50);

        // Verify placement
        const dragText = norm(innerItem.innerText || innerItem.textContent || draggable.innerText || draggable.textContent || '');
        const placed = [...target.querySelectorAll('.dnditem, ed-la-dnditem, [class*="dnd"]')]
            .some(it => {
                const itText = norm(it.innerText || it.textContent || '');
                return itText === dragText || (dragText.length >= 3 && (itText.includes(dragText) || dragText.includes(itText)));
            }) || target.contains(draggable) || target.contains(innerItem);

        if (placed) return true;


        // If mouse simulation failed, try moving the DOM node directly,
        // then ask inject.js to sync the Angular model.
        if (!placed && innerItem.isConnected && target.isConnected) {
            try {
                const wrapper = draggable.closest('ed-la-dnditem') || draggable;
                target.appendChild(wrapper);
                await delay(50);
                // Ask inject.js to trigger Angular digest on the target
                try { await pageSyncDrop(wrapper, target, null); } catch (_) { }
                await delay(50);
                // Verify DOM fallback worked
                const fallbackOk = target.contains(wrapper) || target.contains(innerItem);
                if (fallbackOk) {
                    _log('[edx] DOM fallback placed item successfully');
                    return true;
                }
            } catch (_) { }
        }

        _warn("[edx] Drag simulation: item not in target after drop");
        return false;
    } catch (e) {
        _warn("[edx] Drag simulation error:", e.message);
        return false;
    } finally {
        __dndAutomating = false;
    }
}

// ========================= AUTO-START =========================
let __bootAttempts = 0;

function bootAutoFill() {
    if (__fetching) return;
    __bootAttempts++;


    if (shouldAutoAdvance() && _isNonQuestionPage()) {
        _log('[EDX] bootAutoFill: non-question page, auto-skipping');
        _autoSkipNonQuestionPage(0);
        return;
    }


    if (isRunMode() && _isNonQuestionPage()) {
        const hasPlayBtn = !!document.querySelector('#CTrackerPlayBtn, #play-pause, video, audio');
        if (hasPlayBtn) {
            // Before auto-playing, check if this might be a question page where DnD
            // items haven't rendered yet (Angular lazy-render on split layouts).
            // Blank areas or FITB input zones adjacent to text indicate pending DnD.
            const hasPendingQuestion = !!document.querySelector(
                '.prFITB__fieldBlanck, .dndZone, .dnd-target, .dropZone, cdk-drop-list, ' +
                '.lessonPlayArea input, ed-la-fitb, ed-la-dictation'
            );
            if (hasPendingQuestion) {
                _log('[EDX] bootAutoFill: video present but FITB/DnD zones found — waiting for render');
                setTimeout(bootAutoFill, 600);
                return;
            }
            _log('[EDX] bootAutoFill: non-question page with video, auto-playing (step mode)');
            _autoPlayVideo();
            return;
        }
    }

    getAns().then((ok) => {
        if (ok) { setTimeout(() => handleQuestion(), 80); return; }

        if (shouldAutoAdvance() && _isNonQuestionPage()) {
            _log('[EDX] bootAutoFill: getAns failed + non-question page, auto-skipping');
            _autoSkipNonQuestionPage(0);
            return;
        }

        const hasPlayBtn = !!document.querySelector('#CTrackerPlayBtn, #play-pause, video, audio');
        if (isRunMode() && hasPlayBtn && _isNonQuestionPage()) {
            _log('[EDX] bootAutoFill: step mode, playing video');
            _autoPlayVideo();
            return;
        }
        if (__bootAttempts < 12 && !isReviewSummaryScreen()) {
            setTimeout(bootAutoFill, __bootAttempts <= 4 ? 800 : 1200);
        }
    }).catch(() => {
        if (shouldAutoAdvance() && _isNonQuestionPage()) {
            _autoSkipNonQuestionPage(0);
            return;
        }
        if (__bootAttempts < 12 && !isReviewSummaryScreen()) {
            setTimeout(bootAutoFill, __bootAttempts <= 4 ? 800 : 1200);
        }
    });
}

setTimeout(bootAutoFill, 1500 + Math.random() * 1000);

// ========================= COMPLETE-ACTIVITY MODAL WATCHER =========================


// ========================= PAGE-CHANGE OBSERVER =========================
// Detect navigation within assessments (e.g. clicking Next/Prev arrows)
// and auto-refresh answers for the new page.
(() => {
    let __lastVisibleQuestion = "";

    function getVisibleQuestionText() {
        const el = queryVisible('.question-text, [class*="question"] > :not(.prMCQ), .prMCQ__questionText, .practice__direction, .lessonPlayArea > div:first-child');
        return el ? norm(el.textContent || '').substring(0, 120) : '';
    }

    function checkPageChange() {
        // Skip if a modal/dialog is visible
        if (_isModalDialogVisible()) return;

        const sig = getPageSignature();
        const sigChanged = sig && sig !== __lastPageSignature;
        const qText = getVisibleQuestionText();
        const qTextChanged = qText && qText.length > 8 && qText !== __lastVisibleQuestion;

        if (!sigChanged && !qTextChanged) return;

        // Update signature
        __lastPageSignature = sig;
        __lastVisibleQuestion = qText;
        // Preserve the last fetched URL so stale-session detection can reject
        // old answers while the next lesson/section is still booting.

        // Skip if navigation or auto-skip in progress
        if (__autoNextPending || __navigating) {
            _log('[EDX] Observer: skip autoNext/navigation in progress');
            return;
        }

        // Skip if an auto_skip refresh cycle is active — prevents cascading
        // through multiple instruction pages
        if (__activeRefreshReason === 'auto_skip' || __activeRefreshReason === 'auto_next') {
            _log('[EDX] Observer: skip — active refresh cycle:', __activeRefreshReason);
            return;
        }

        // Skip if DnD in progress
        if (__dndInProgress || __dndDone) {
            _log('[EDX] Observer: skip DnD in progress/done');
            return;
        }


        const pageType = resolveSectionPageType();
        _log('[EDX] Page type detected:', pageType);


        switch (pageType) {
            case 'review':
                __ans = []; __allAns = [];
                if (shouldAutoAdvance()) {
                    updateAnswerDisplay(UI_TEXT.status.skippingPage);
                    setTimeout(() => _autoNextContinueAfterSubmit(), 200);
                    return;
                }
                updateAnswerDisplay("Đã hoàn thành - xem kết quả");
                return;

            case 'instruction':

                __ans = []; __allAns = []; __dndCategories = null;
                clearAnsContext();
                __qType = "?"; updateTypeBadge("unknown");
                if (__abortController) { try { __abortController.abort(); } catch (_) { } }
                __fetching = false;
                updateAnswerDisplay("Trang hướng dẫn - không có câu hỏi");


                if (shouldAutoAdvance()) {
                    _autoSkipNonQuestionPage(0);
                }
                return;

            case 'start_test':
                __ans = []; __allAns = []; __dndCategories = null;
                clearAnsContext();
                __qType = "?"; updateTypeBadge("unknown");
                // Preserve the previous fetched URL until a fresh question request arrives.
                if (__abortController) { try { __abortController.abort(); } catch (_) { } }
                __fetching = false;
                
                updateAnswerDisplay("Nhấn Start Test để bắt đầu");
                if (shouldAutoAdvance()) {
                    setTimeout(() => {
                        const startBtn = document.querySelector('.btnStartTest, [aria-label*="Start Test"]');
                        if (startBtn && isElementVisible(startBtn)) {
                            startBtn.click();
                            waitForQuestionTransition('auto_start_test', sig, getCurrentAssessmentPage());
                        }
                    }, 800);
                }
                return;

            case 'question':
                _log('[EDX] Question page detected, refreshing answers...');
                __dndDone = false; __dndFailCount = 0; __dndInProgress = false;
                if (__abortController) { try { __abortController.abort(); } catch (_) { } }
                __fetching = false;
                scheduleAnswerRefresh('observer_page_change', 400);
                return;

            default:

                _log('[EDX] Unknown page type, will re-check in 600ms');
                setTimeout(() => {
                    const recheck = resolveSectionPageType();
                    if (recheck === 'question') {
                        __dndDone = false; __dndFailCount = 0; __dndInProgress = false;
                        if (__abortController) { try { __abortController.abort(); } catch (_) { } }
                        __fetching = false;
                        scheduleAnswerRefresh('observer_recheck', 200);
                    } else if ((recheck === 'instruction' || recheck === 'start_test') && shouldAutoAdvance()) {
                        _autoSkipNonQuestionPage(0);
                    }
                }, 600);
        }
    }

    __lastPageSignature = getPageSignature();
    __lastVisibleQuestion = getVisibleQuestionText();
    
    // Convert polling to robust DOM observer (CENTRAL SCHEDULER)
    let _mutTimeout = null;
    const _globalObserver = new MutationObserver(() => {
        if (_mutTimeout) return;
        _mutTimeout = setTimeout(() => {
            _mutTimeout = null;
            if (__bypassEnabled) {
                applyBypassToWindow(window);
                const iframes = document.querySelectorAll('iframe');
                for (let i = 0; i < iframes.length; i++) {
                    if (iframes[i].contentWindow) applyBypassToWindow(iframes[i].contentWindow);
                }
            }
            checkAndCloseActivityModal();
            // Modal detection for auto-pause originally from bypass loop
            const modals = document.querySelectorAll('.p-dialog, .p-toast, .modal');
            for (let i = 0; i < modals.length; i++) {
                const txt = (modals[i].textContent || '').toLowerCase();
                if (txt.includes('detected') || txt.includes('violation') || txt.includes('not allowed')) {
                    if (typeof __autoNext !== 'undefined' && __autoNext !== 'disable') {
                        stopAutomationForModeSwitch('disable', __autoNext);
                        __autoNext = 'disable';
                        if (typeof _updateAutoNextUI === 'function') _updateAutoNextUI();
                        if (typeof flashBlock === 'function') flashBlock('Phát hiện cảnh báo. Đã tắt.');
                    }
                }
            }
            checkPageChange();
        }, 350);
    });
    
    const obsOpts = { childList: true, subtree: true };
    if (document.body) _globalObserver.observe(document.body, obsOpts);
    else document.addEventListener('DOMContentLoaded', () => _globalObserver.observe(document.body, obsOpts), { once: true });
    
    window.addEventListener('beforeunload', () => {
        _globalObserver.disconnect();
        if (_mutTimeout) clearTimeout(_mutTimeout);
        if (__spaTimer) clearTimeout(__spaTimer);
        if (__chibiCurrentBlobUrl) {
            try { URL.revokeObjectURL(__chibiCurrentBlobUrl); } catch (_) { }
            __chibiCurrentBlobUrl = null;
        }
    });
})();

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


