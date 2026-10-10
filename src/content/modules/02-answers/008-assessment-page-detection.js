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
    const pageSignatureNow = getPageSignature();
    if (retryCount === 0) {
        const recentlyScheduledSamePage =
            pageSignatureNow &&
            __lastScheduledPageSignature === pageSignatureNow &&
            __lastScheduledReason === reason &&
            (Date.now() - __lastScheduledAt) < 700;
        if (recentlyScheduledSamePage) {
            _log('[EDX] scheduleRefresh deduped on same page:', reason);
            return;
        }
        const alreadyAnsweredSamePage =
            reason !== 'auto_next' &&
            reason !== 'auto_section_next' &&
            reason !== 'auto_section_btn' &&
            pageSignatureNow &&
            __lastAnswerPageSignature === pageSignatureNow &&
            (Date.now() - __lastAnswerAt) < 5000 &&
            Array.isArray(__ans) &&
            __ans.length > 0;
        if (alreadyAnsweredSamePage) {
            _log('[EDX] scheduleRefresh ignored: page already answered');
            return;
        }
        __lastScheduledPageSignature = pageSignatureNow;
        __lastScheduledReason = reason;
        __lastScheduledAt = Date.now();
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
            if (__dndInProgress && (reason === 'observer_page_change' || reason === 'observer_recheck')) {
                _log('[EDX] scheduleRefresh ignored during DnD transaction:', reason);
                releaseRefreshCycle(reason);
                return;
            }
            _log('[EDX] scheduleRefresh deferred: fetching:', __fetching, 'dnd:', __dndInProgress);
            if (retryCount < 4) scheduleAnswerRefresh(reason, 200, retryCount + 1);
            else releaseRefreshCycle(reason);
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
            const maxRetries = visibleType === 'dnd' ? 4 : 2;
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
    __EDX_CONTROL_PLANE__.beginTransition(reason || 'navigation_transition', {
        reason: reason || 'navigation_transition',
        pageIdentity: __EDX_CONTROL_PLANE__.capturePageIdentity({
            pageSignature: previousSignature || __edxSafeCall(() => getPageSignature(), ""),
            pageIndex: previousPage
        }),
        pageType: typeof detectPageType === 'function' ? detectPageType() : 'unknown',
        questionType: typeof __qType === 'string' ? __qType : 'unknown'
    });
    __EDX_CONTROL_PLANE__.note('transition.watch', {
        reason,
        previousSignature,
        previousPage,
        timeoutMs
    });
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
        __EDX_CONTROL_PLANE__.note('transition.resolved', {
            reason,
            changed,
            signature,
            page: getCurrentAssessmentPage()
        });
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
        __EDX_CONTROL_PLANE__.finish(changed ? 'transition_ready' : 'transition_timeout', {
            reason,
            pageIdentityAfter: __EDX_CONTROL_PLANE__.capturePageIdentity({
                pageSignature: signature || __edxSafeCall(() => getPageSignature(), "")
            })
        });
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

async function waitForAnsContext(timeoutMs = 1200, pollMs = 100) {
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
async function waitForFreshAnsUrl(staleUrl, timeoutMs = 900) {
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

