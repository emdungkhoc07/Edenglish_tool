// ========================= UTILS =========================
const clickElement = (sel) => document.querySelector(sel)?.click();
function _isDisabledButtonLike(el) {
    return !!(
        el && (
            el.disabled ||
            el.getAttribute?.("disabled") !== null ||
            el.getAttribute?.("aria-disabled") === "true" ||
            el.classList?.contains("disabled") ||
            el.classList?.contains("is-disabled")
        )
    );
}

function _scoreNextNavigationCandidate(el) {
    try {
        const rect = el?.getBoundingClientRect?.();
        if (!rect) return -Infinity;
        const footerBias = rect.bottom >= window.innerHeight * 0.72 ? 4000 : 0;
        const rightBias = Math.max(0, Math.round(rect.left));
        const bottomBias = Math.max(0, Math.round(rect.top));
        const areaBias = Math.min(800, Math.round(rect.width * rect.height * 0.01));
        return footerBias + rightBias + bottomBias + areaBias;
    } catch (_) {
        return -Infinity;
    }
}

function _findVisibleEnabledNextButton() {
    const selectorGroups = [
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
        ".controls .next",
        ".navigation .next",
        ".footer [role='button']",
        ".learning__footer [role='button']",
        ".p-paginator [role='button']",
        ".p-paginator button",
        ".p-paginator a"
    ];

    const candidates = [];
    const pushUnique = (el) => {
        if (!el || candidates.includes(el)) return;
        candidates.push(el);
    };

    selectorGroups.forEach((selector) => {
        try {
            document.querySelectorAll(selector).forEach(pushUnique);
        } catch (_) { }
    });

    document.querySelectorAll("i.icon-next, span.icon-next, .fa-chevron-right, .icon-chevron-right, [class*='chevron-right']").forEach((icon) => {
        pushUnique(icon.closest("button, a, div[role='button'], span[role='button'], li, div"));
    });

    const semanticCandidates = [...document.querySelectorAll("button, a, [role='button'], .btn, li, div[role='button']")];
    semanticCandidates.forEach((el) => {
        const text = (el.textContent || "").trim().toLowerCase();
        const aria = (el.getAttribute("aria-label") || "").trim().toLowerCase();
        const title = (el.getAttribute("title") || "").trim().toLowerCase();
        const navText = `${text} ${aria} ${title}`.trim();
        if (["next", "continue", "tiếp", "kế tiếp", "câu sau", "trang sau"].some((k) => navText.includes(k))) {
            pushUnique(el);
        }
    });

    const footerArrowCandidates = semanticCandidates.filter((el) => {
        const rect = el.getBoundingClientRect?.();
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        if (rect.bottom < window.innerHeight * 0.72 || rect.left < window.innerWidth * 0.72) return false;
        const text = (el.textContent || "").trim();
        const aria = (el.getAttribute("aria-label") || "").trim();
        const title = (el.getAttribute("title") || "").trim();
        return !text || text === ">" || /next|continue|tiếp/i.test(`${text} ${aria} ${title}`);
    });
    footerArrowCandidates.forEach(pushUnique);

    return candidates
        .filter((el) => isElementVisible(el) && !_isDisabledButtonLike(el))
        .sort((a, b) => _scoreNextNavigationCandidate(b) - _scoreNextNavigationCandidate(a))[0] || null;
}

const goToNextItem = () => {
    if (_handleUnsubmittedTestModal()) {
        _log('[EDX] goToNextItem: submit modal handled, waiting for submit flow');
        return true;
    }
    const nextBtn = _findVisibleEnabledNextButton();
    if (nextBtn) {
        _log('[EDX] goToNextItem: clicking next candidate', nextBtn.id || nextBtn.className || nextBtn.tagName);
        advancedClick(nextBtn);
        nextBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
        nextBtn.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
        return true;
    } else {
        _log("[edx] Next button not found on this page.");
        return false;
    }
};

function _scoreCheckActionCandidate(el, nextBtn) {
    try {
        const rect = el?.getBoundingClientRect?.();
        if (!rect || rect.width <= 0 || rect.height <= 0) return -Infinity;
        const text = (el.textContent || "").trim().toLowerCase();
        const aria = (el.getAttribute?.("aria-label") || "").trim().toLowerCase();
        const title = (el.getAttribute?.("title") || "").trim().toLowerCase();
        const cls = `${el.className || ""} ${el.id || ""}`.toLowerCase();
        const meta = `${text} ${aria} ${title} ${cls}`;
        if (/next|continue|tiếp|prev|back|undo|redo|retry|refresh|eye|see answer|seeanswer|resource/.test(meta)) return -Infinity;
        let score = 0;
        if (/check|answer|submit|done|complete|tick|correct/.test(meta)) score += 500;
        if (rect.bottom >= window.innerHeight * 0.72) score += 200;
        if (rect.width >= 28 && rect.width <= 90 && rect.height >= 28 && rect.height <= 90) score += 120;
        if (Math.abs(rect.width - rect.height) <= 28) score += 80;
        if (nextBtn?.getBoundingClientRect) {
            const nextRect = nextBtn.getBoundingClientRect();
            if (rect.left < nextRect.left) score += Math.max(0, 240 - Math.abs(nextRect.left - rect.left));
            score += Math.max(0, 120 - Math.abs((nextRect.top + nextRect.height / 2) - (rect.top + rect.height / 2)));
        }
        score += Math.max(0, Math.round(rect.left));
        return score;
    } catch (_) {
        return -Infinity;
    }
}

function _findVisibleCheckAnswerButton() {
    const nextBtn = _findVisibleEnabledNextButton();
    const selectorGroups = [
        "[id*='check' i]",
        "[class*='check' i]",
        "[title*='check' i]",
        "[title*='answer' i]",
        "[aria-label*='check' i]",
        "[aria-label*='answer' i]",
        "[data-action*='check' i]",
        "[data-action*='answer' i]",
        ".learning__footer [role='button']",
        ".footer [role='button']",
        ".p-paginator [role='button']",
        ".p-paginator button",
        ".p-paginator a"
    ];

    const candidates = [];
    const pushUnique = (el) => {
        if (!el || candidates.includes(el)) return;
        candidates.push(el);
    };
    selectorGroups.forEach((selector) => {
        try { document.querySelectorAll(selector).forEach(pushUnique); } catch (_) { }
    });
    document.querySelectorAll("button, a, [role='button'], .btn, li, div[role='button'], span[role='button']").forEach((el) => {
        const rect = el.getBoundingClientRect?.();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        if (rect.bottom < window.innerHeight * 0.72) return;
        const meta = `${(el.textContent || "").trim()} ${(el.getAttribute("aria-label") || "").trim()} ${(el.getAttribute("title") || "").trim()} ${el.className || ""} ${el.id || ""}`.toLowerCase();
        if (/check|answer|submit|done|complete|tick|correct/.test(meta)) pushUnique(el);
    });

    return candidates
        .filter((el) => el !== nextBtn && isElementVisible(el) && !_isDisabledButtonLike(el))
        .sort((a, b) => _scoreCheckActionCandidate(b, nextBtn) - _scoreCheckActionCandidate(a, nextBtn))[0] || null;
}

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

function _findFirstIncompleteTaskNode() {
    const tasks = [...document.querySelectorAll('.learning__tasksNav_task')].filter((el) => isElementVisible(el));
    if (!tasks.length) return null;

    const parseTaskNumber = (el) => {
        const raw = String(el.textContent || '').match(/\d+/);
        return raw ? Number(raw[0]) : Number.MAX_SAFE_INTEGER;
    };

    const isDone = (el) => el.classList.contains('learning__tasksNav_task--done');
    const isCurrent = (el) => el.classList.contains('learning__tasksNav_task--current');

    const incomplete = tasks
        .filter((el) => !isDone(el))
        .sort((a, b) => parseTaskNumber(a) - parseTaskNumber(b));

    const candidate = incomplete.find((el) => !isCurrent(el)) || incomplete[0] || null;
    return candidate;
}

function _recoverToIncompleteTaskAfterReminder() {
    const taskNode = _findFirstIncompleteTaskNode();
    if (!taskNode) return false;
    try {
        advancedClick(taskNode);
        _log('[EDX] Reminder recovery: navigated to incomplete task', String(taskNode.textContent || '').trim());
        return true;
    } catch (_) {
        return false;
    }
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
        const manualSubmitMessage = 'Chưa trả lời hết - vui lòng tự bấm Submit';
        _log('[EDX] Detected unsubmitted test modal - manual submit required');
        if (window.updateStatus) updateStatus(manualSubmitMessage);
        try { updateAnswerDisplay(manualSubmitMessage); } catch (_) { }
        try {
            window.__EDX_CONTROL_PLANE__?.recordAutoNext?.('blocked', {
                reason: 'manual_submit_modal',
                message: manualSubmitMessage
            });
        } catch (_) { }
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
    setTimeout(() => {
        _recoverToIncompleteTaskAfterReminder();
    }, 250);
    return true;
}

function hasRealSpeakingUi(root = document) {
    // Exclude Start Test pages to avoid misclassification
    if (isVisibleStartTestPage()) return false;
    if (isVisibleSpeakingIntroPage(root)) return false;
    const bodyText = (document.body?.innerText || '').substring(0, 1200);
    const hasSpeakingPrompt =
        /click ['"]?start['"]? to record the correct answer/i.test(bodyText) ||
        /record the correct answer/i.test(bodyText);
    
    const strongSelectors = [
        '.recordingPanel',
        '.recordingPanelWrapper',
        '.recordingPanelSentence',
        '.learning__SpeakingPal',
        '.RecordButtonWrapper',
        '.recordPanelWrapper',
        '.panelButton.speakIcon',
        '.speakIcon',
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
    const hasStartBtn = !!Array.from(document.querySelectorAll('a.button, button, [role="button"], a[class*="button"], a[class*="btn"]'))
        .find((el) => {
            const text = (el.textContent || '').trim().toLowerCase();
            if (text !== 'start' && text !== 'record') return false;
            if (!isElementVisible(el)) return false;
            if (el.closest?.('.disable')) return false;
            if (el.getAttribute?.('aria-disabled') === 'true') return false;
            if (el.disabled) return false;
            return true;
        });
    if (hasSpeakingPrompt && (hasStartBtn || hasSentenceUi || hasMicUi)) return true;
    return hasMicUi && hasSentenceUi;
}

function isVisibleSpeakingIntroPage(root = document) {
    if (!root) return false;
    const introText = (document.body?.innerText || '').substring(0, 1200);
    const hasPrompt = /select the speaker you would like to practice/i.test(introText);
    const hasChooser = !!queryVisible(
        '.speakingInteract__chooseSpeaker, .speakingInteract__speakerImg, .speakingInteract__speaker, ' +
        '[class*="chooseSpeaker"], [class*="speaker"] img, [class*="speaker"] button',
        root
    );
    const hasRecordingUi = !!queryVisible(
        '.recordingPanelWrapper, .recordingPanelSentence, .recordingPanel, ' +
        '.RecordButtonWrapper, .recordPanelWrapper, .continueWrapper .button.continue',
        root
    );
    return (hasPrompt || hasChooser) && !hasRecordingUi;
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
    const mediaSelector =
        'video, audio, #CTrackerPlayBtn, #play-pause, .CTrackerPlayBtn, ' +
        '.layout_mediaPlayPause, .layout__mediaPlayPause, ' +
        '[class*="mediaPlayPause"], [class*="CTrackerPlayBtn"], ' +
        '[class*="mediaPlay"], [class*="videoPlayer"], [class*="audioPlayer"], ' +
        '[class*="mediaTimeline"], [class*="tracker"], ' +
        '.lessonVideo, .lessonAudio, .lesson-video, .practiceVideo';

    const roots = [
        getVisiblePracticeAreaRoot(),
        queryVisible(
            '.learning__resourcesArea, .learning__resourcesArea--full, ' +
            '.leftDiv, #leftDiv, .learning__RAIWrapper, #bgContainer, ' +
            '[class*="RAMediaResourceW"], [class*="RAMediaResource"], ' +
            '.mediaContainer, .lessonVideo, .lessonAudio, .lesson-video, .practiceVideo'
        ),
        document
    ].filter(Boolean);

    for (const root of roots) {
        const match = queryVisible(mediaSelector, root);
        if (!match) continue;
        const rect = match.getBoundingClientRect?.();
        if (!rect || rect.width <= 8 || rect.height <= 8) continue;
        if (root === document && rect.top > (window.innerHeight - 120) && rect.left < 260) {
            // Ignore tiny bottom utility widgets and hidden/off-context tracker buttons.
            continue;
        }
        return true;
    }

    return false;
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

function __questionElementSelectors() {
    return (
        '.prMCQ__answerLabel, .lessonMultipleAnswer, .prFITB__DDLOptionsW, ' +
        'select, option, [role="combobox"], .ui-selectonemenu, .p-dropdown, .p-select, .dropdown, ' +
        '.learning__selectTxt_st, .multiRadio, .multiBtnText, .answerBtn, ' +
        '.dnditem, .dnd-item, .dndItem, [draggable="true"], cdk-drag, .dragItem, .drag-item, [class*="dragItem"], [class*="drag-item"], ' +
        '.draggableContainer, .draggable.wordBankTile, .wordBankTile, ' +
        'cdk-drop-list, .dnd-target, .dropZone, .dndZone, .droptarget, .TTpanswerDiv, ' +
        '.answersWrapper.close, .answersWrapper.close.closeWithPicture, .answersWrapper.close.closeWithBubbles, ' +
        '.answersWrapper.textToPicture, .answersWrapper.mtch, .answersWrapper.classificationW, ' +
        '.wordsBankWrapper, .wordsBankTable, #TTpTablePlaceHolder, ' +
        '.sequence, .sequenceImage, ' +
        '.prOpenEnded__qaItemText, .prFITB__fieldBlanck input, textarea, ' +
        'ed-la-sorting-text, ed-la-ordering, ed-la-dictation input, ed-la-fitb input, ' +
        'span.et[contenteditable]:not([contenteditable="false"]), ' +
        'input[type="radio"], input[type="checkbox"], ' +
        '.recordingPanel, .learning__SpeakingPal, .recordingPanelSentence, .sentenceWrapper, ' +
        '.speakingInteractButtonWrapper, .speakingInteract__chooseSpeaker, .speakingInteract__speaker'
    );
}

function hasQuestionElementsInScope(root) {
    if (!root) return false;
    return !!queryVisible(__questionElementSelectors(), root);
}

function hasSplitLayoutQuestionSignals(root = getVisiblePracticeAreaRoot()) {
    if (!root) return false;

    if (hasQuestionElementsInScope(root)) return true;

    const promptNode = queryVisible(
        '.question-text, .practice__direction, .prMCQ__questionText, ' +
        '.TextDiv, .lessonText, .learning__questionText, [class*="questionText"], ' +
        '.learning__selectTxt_st, .prFITB__fieldBlanck, .prFITB__DDLOptionsW',
        root
    );
    const hasPromptText = !!((promptNode?.innerText || promptNode?.textContent || '').trim());
    const hasInteractiveChoice = !!queryVisible(
        'select, option, [role="combobox"], .ui-selectonemenu, .p-dropdown, .p-select, ' +
        'input[type="radio"], input[type="checkbox"], textarea, ' +
        '.lessonMultipleAnswer, .prMCQ__answerLabel, .answerBtn, .multiRadio, .multiBtnText',
        root
    );
    const hasPromptWithControls = hasPromptText && hasInteractiveChoice;
    if (hasPromptWithControls) return true;

    const visibleBlocks = queryVisibleAll(
        '.TextDiv, .question-text, .practice__direction, .prMCQ__questionText, [class*="questionText"]',
        root
    );
    const hasSentencePrompt = visibleBlocks.some((el) => {
        const text = (el.innerText || el.textContent || '').trim();
        return text.length >= 18 && /[?._]/.test(text);
    });
    return hasSentencePrompt && hasInteractiveChoice;
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

function shouldRequireInstructionMediaPlayback(bodyText = (document.body?.innerText || '').toLowerCase()) {
    const text = String(bodyText || '').toLowerCase();
    if (!text) return false;

    if (
        /review the grammar point and do the tasks that follow/i.test(text) ||
        /if you need help,\s*use the student tools/i.test(text) ||
        /here is a list of words and phrases/i.test(text) ||
        /focusing on vocabulary/i.test(text)
    ) {
        return false;
    }

    return (
        /listen to the (conversation|dialogue|recording|examples)/i.test(text) ||
        /listen again/i.test(text) ||
        /watch the video/i.test(text) ||
        /watch and answer/i.test(text) ||
        /watch the conversation/i.test(text)
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
    if (isVisibleSpeakingIntroPage()) return 'speaking_intro';
    if (hasRealSpeakingUi()) return null;
    const hasInstructions = hasVisibleStepInstructions();
    const hasMedia = hasVisibleMediaControls();
    const hasQuestion = hasVisibleQuestionDom();
    const hasSplitQuestionSignals = hasSplitLayoutQuestionSignals();
    const hasSplitLayoutQuestionEvidence = !!queryVisible(
        '.answersWrapper.close, .answersWrapper.close.closeWithPicture, .answersWrapper.close.closeWithBubbles, ' +
        '.answersWrapper.textToPicture, .answersWrapper.mtch, .answersWrapper.classificationW, ' +
        '#TTpTablePlaceHolder, .wordsBankTable, .wordsBankWrapper, .TTpanswerDiv, .droptarget, ' +
        '.draggableContainer, .draggable.wordBankTile, .wordBankTile, ' +
        'select, [role="combobox"], .ui-selectonemenu, .p-dropdown, .p-select, ' +
        '.prFITB__DDLOptionsW, .learning__selectTxt_st, .lessonMultipleAnswer, .prMCQ__answerLabel'
    );
    const bodyText = (document.body?.innerText || '').toLowerCase();
    const mediaPlaybackRequired = shouldRequireInstructionMediaPlayback(bodyText);
    const hasExploreListenPrompt =
        /listen to the (conversation|dialogue|recording)/i.test(bodyText) ||
        /watch the video/i.test(bodyText) ||
        /listen again/i.test(bodyText) ||
        /use the student tools/i.test(bodyText);
    const hasStandaloneResourceArea = hasVisibleStandaloneResourceArea();
    const hasNextBtn = !!queryVisible(
        '#learning__nextItem, .learning__nextItem, #learning__nextItemLink, ' +
        '.p-paginator-next, .btnContinue, .btn-continue'
    );

    if (hasSplitLayoutQuestionEvidence || hasSplitQuestionSignals) return null;

    if (isVisibleStartTestPage()) return 'start_test';

    if (!hasQuestion && (hasInstructions || hasStandaloneResourceArea || hasMedia || hasExploreListenPrompt)) {
        // Safety check: on split-layout pages (video left + DnD right),
        // hasVisibleQuestionDom() may miss drag items in the right panel.
        // Do a broader, unscoped DOM query as a second opinion.
        const hasDndGlobal = !!document.querySelector(
            '.dnditem, .dnd-item, .dndItem, cdk-drag, .dragItem, .drag-item, ' +
            '.dndZone, .dnd-target, .dropZone, cdk-drop-list, ' +
            '.prMCQ__answerLabel, .lessonMultipleAnswer, .prFITB__DDLOptionsW, ' +
            '.prFITB__fieldBlanck input, ed-la-fitb input, ed-la-dictation input'
        );
        const hasQuestionGlobal = !!document.querySelector(
            '.dnditem, .dnd-item, .dndItem, cdk-drag, .dragItem, .drag-item, ' +
            '.dndZone, .dnd-target, .dropZone, cdk-drop-list, ' +
            '.prMCQ__answerLabel, .lessonMultipleAnswer, .prFITB__DDLOptionsW, ' +
            'select, [role="combobox"], .ui-selectonemenu, .p-dropdown, .p-select, ' +
            '.learning__selectTxt_st, ' +
            '.prFITB__fieldBlanck input, ed-la-fitb input, ed-la-dictation input'
        );
        if (hasDndGlobal || hasQuestionGlobal) return null; // Has interactive question elements — not an instruction page
        return hasMedia && mediaPlaybackRequired ? 'instruction_media' : 'instruction_text';
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
        return hasMedia && mediaPlaybackRequired ? 'instruction_media' : 'instruction_text';
    }

    if (!hasQuestion) {
        if (hasMedia || hasStandaloneResourceArea) {
            return hasMedia && mediaPlaybackRequired ? 'instruction_media' : 'instruction_text';
        }
        if (hasNextBtn) return 'instruction_text';
    }

    return null;
}

function hasVisibleQuestionDom() {
    const root = getVisiblePracticeAreaRoot();
    if (!root) return false;
    const pmRoot = getVisiblePmContainer(root) || root;
    if (hasQuestionElementsInScope(pmRoot)) return true;
    if (pmRoot !== root && hasQuestionElementsInScope(root)) return true;
    if (hasSplitLayoutQuestionSignals(root)) return true;
    return hasQuestionElementsInScope(document);
}


function detectPageType() {
    const visiblePracticeRoot = getVisiblePracticeAreaRoot();
    const visiblePmRoot = getVisiblePmContainer(visiblePracticeRoot);
    const questionScope = visiblePmRoot || visiblePracticeRoot;
    const hasQuestionInPmScope = hasQuestionElementsInScope(visiblePmRoot);
    const hasQuestionInPracticeScope = hasQuestionElementsInScope(visiblePracticeRoot);
    const hasQuestionInDocument = hasQuestionElementsInScope(document);

    if (isVisibleStartTestPage()) {
        return 'start_test';
    }

    if (isVisibleSpeakingIntroPage(questionScope || document)) {
        return 'instruction';
    }

    if (hasRealSpeakingUi(questionScope || document)) {
        return 'question';
    }

    if (isVisibleInstructionPage()) {
        return 'instruction';
    }

    if (isReviewSummaryScreen()) return 'review';

    const hasQuestionElements = !!(
        hasQuestionInPmScope ||
        hasQuestionInPracticeScope ||
        hasSplitLayoutQuestionSignals(questionScope || visiblePracticeRoot) ||
        hasQuestionInDocument ||
        (questionScope && queryVisible(
            'ed-la-writing, .tox-tinymce, iframe[id*="tiny"], ed-la-memory-game, ed-la-matching-game, .backSide, .memory-card',
            questionScope
        ))
    );


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


    const hasQuestionInputs = hasQuestionElements;
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



