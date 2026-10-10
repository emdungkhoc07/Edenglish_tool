// ========================= DISPATCHER =========================
// Auto-next modes: WATCH(disable) | RUN(off) | AUTO(full)
let __autoNext = MODE_RUN;
const AUTO_NEXT_DELAY = 1500;
const MIN_AUTO_NEXT_DELAY = 1400;
const MIN_AUTO_SKIP_NAV_GAP = 1300;

const humanJitter = (baseMs, plusRange = 800) => baseMs + Math.floor(Math.random() * plusRange);
const __autoNextModes = [
    { key: MODE_WATCH, label: UI_TEXT.mode.watch.label, desc: UI_TEXT.mode.watch.desc },
    { key: MODE_RUN, label: UI_TEXT.mode.run.label, desc: UI_TEXT.mode.run.desc },
    { key: MODE_AUTO, label: UI_TEXT.mode.auto.label, desc: UI_TEXT.mode.auto.desc },
    { key: MODE_OFF, label: 'OFF', desc: 'Tắt toàn bộ tool' },
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


    if (__abortController) { try { __abortController.abort(); } catch (_) { } }
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

function autoNextIfEnabled(success, delayMs, forceNext = false) {
    const handlerResult = __EDX_CONTROL_PLANE__.recordHandlerResult(
        __EDX_CONTROL_PLANE__.normalizeHandlerResult(success, {
            qType: __qType || 'unknown',
            pageIdentity: __EDX_CONTROL_PLANE__.capturePageIdentity({
                pageType: typeof detectPageType === 'function' ? detectPageType() : 'unknown',
                questionType: __qType || 'unknown'
            })
        })
    );

    if (isOffMode()) return;
    if (!shouldAutoAdvance()) return;
    _autoPlayVideo().catch(() => { });
    const activeTransition = __EDX_CONTROL_PLANE__.getActiveTransition();
    const transitionPage = activeTransition?.pageIdentityAfter || activeTransition?.pageIdentityBefore || null;
    const sameTransitionPage = !transitionPage || __EDX_CONTROL_PLANE__.samePageIdentity(transitionPage, handlerResult.pageIdentity);

    if (!handlerResult.applied || !handlerResult.verified || !sameTransitionPage) {
        __EDX_CONTROL_PLANE__.recordAutoNext('blocked', {
            qType: handlerResult.qType,
            reason: !sameTransitionPage ? 'page_identity_changed_before_next' : (handlerResult.reason || 'handler_not_verified'),
            verified: handlerResult.verified,
            applied: handlerResult.applied,
            message: !sameTransitionPage ? 'Auto-next blocked: page changed' : 'Auto-next blocked: handler not verified'
        });
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

    const scheduleDelay = Math.max(
        MIN_AUTO_NEXT_DELAY,
        humanJitter(delayMs ?? AUTO_NEXT_DELAY, 500)
    );
    _log('[EDX] autoNext scheduled, delay:', scheduleDelay);
    __EDX_CONTROL_PLANE__.recordAutoNext('scheduled', {
        qType: handlerResult.qType,
        delayMs: scheduleDelay,
        verified: true,
        applied: true,
        message: 'Auto-next scheduled'
    });


    const doNavigate = () => {
        __autoNextTimerId = null;
        __autoNextPending = false;
        __EDX_CONTROL_PLANE__.recordAutoNext('executing', {
            qType: handlerResult.qType,
            message: 'Auto-next executing'
        });
        if (_handleUnsubmittedTestModal()) {
            _log('[EDX] autoNext: modal handled before navigate, waiting for submit flow');
            __EDX_CONTROL_PLANE__.recordAutoNext('modal_hold', {
                qType: handlerResult.qType,
                message: 'Auto-next waiting on modal'
            });
            return;
        }
        // Check submit button for exam mode
        const sub = document.querySelector(".learning__submitTestLink, #learning__submitTestItem");
        if (sub && sub.offsetParent !== null) {
            commitAnswerState();
            setTimeout(() => {
                try { sub.removeAttribute?.("disabled"); sub.classList?.remove?.("disabled"); } catch (_) { }
                if (window.updateStatus) updateStatus(UI_TEXT.status.submittingTest);
                __lastNavigateTime = Date.now();
                sub.click();
                _log('[EDX] autoNext: submitted test, waiting for modal/result...');
                __EDX_CONTROL_PLANE__.recordAutoNext('submitted', {
                    qType: handlerResult.qType,
                    message: 'Auto-next submitted test'
                });
                __EDX_CONTROL_PLANE__.finish('submitted', { reason: 'auto_next_submit' });
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
        __lastFetchedUrl = null;
        __lastAnswerPageSignature = "";
        __lastAnswerAt = 0;
        updateTypeBadge("unknown");
        updateAnswerDisplay("\u0110ang ch\u1edd c\u00e2u m\u1edbi...");
        if (__abortController) { try { __abortController.abort(); } catch (_) { } }
        __fetching = false;
        __lastNavigateTime = Date.now();
        __EDX_CONTROL_PLANE__.recordAutoNext('navigated', {
            qType: handlerResult.qType,
            message: 'Auto-next navigated'
        });
        __EDX_CONTROL_PLANE__.finish('navigating', { reason: 'auto_next_navigation' });
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
                    if (!forceNext) {
                        const zones = getDndZones();
                        if (zones.length > 0) {
                            const unfilled = countUnsatisfiedDndZones(zones);
                            if (unfilled > 0) {
                                _log('[EDX] autoNext: still', unfilled, 'unfilled zones, abort');
                                flashBlock(`Còn ${unfilled} ô chưa điền`);
                                return;
                            }
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


        if (!forceNext) {
            const zones = getDndZones();
            if (zones.length > 0) {
                const unfilled = countUnsatisfiedDndZones(zones);
                if (unfilled > 0) {
                    _log('[EDX] autoNext: still', unfilled, 'unfilled zones, abort');
                    flashBlock(`Còn ${unfilled} ô chưa điền`); return;
                }
            }
        }

        doNavigate();
    }, scheduleDelay);
}

// Continue navigation after submit (section/full modes)
function _autoNextContinueAfterSubmit() {
    if (isOffMode() || !shouldAutoAdvance()) return;
    const continueSignature = [
        location.href,
        resolveSectionPageType(),
        getNonQuestionPageKind() || 'none',
        __EDX_HOST_STATE__?.currentStepIndex ?? '?',
        __EDX_HOST_STATE__?.currentTaskIndex ?? '?',
        getPageSignature()
    ].join('::');
    const now = Date.now();
    if (now < __postSubmitContinueLockUntil) {
        _log('[EDX] autoNext: continue-after-submit locked, ignoring duplicate call');
        return;
    }
    if (
        __lastPostSubmitSignature === continueSignature &&
        (now - __lastPostSubmitAt) < 2800
    ) {
        _log('[EDX] autoNext: deduped repeated continue-after-submit on same page');
        return;
    }
    __lastPostSubmitSignature = continueSignature;
    __lastPostSubmitAt = now;
    __postSubmitContinueLockUntil = now + 2600;
    _log('[EDX] autoNext: continue after submit, mode:', __autoNext);
    __EDX_CONTROL_PLANE__.note('post_submit.continue', {
        signature: continueSignature,
        pageType: resolveSectionPageType(),
        nonQuestionKind: getNonQuestionPageKind() || 'none'
    });
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
        __postSubmitContinueLockUntil = Date.now() + 2600;
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
    __postSubmitContinueLockUntil = 0;
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
        setTimeout(() => {
            try { _recoverToIncompleteTaskAfterReminder?.(); } catch (_) { }
        }, 250);
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

function _isMediaPlaybackActive(playBtn) {
    try {
        const vid = document.querySelector('video');
        if (vid && !vid.paused && !vid.ended) return true;
        const aud = document.querySelector('audio');
        if (aud && !aud.paused && !aud.ended) return true;
        if (playBtn) {
            return playBtn.classList.contains('layout_mediaPlayPause--pause') ||
                playBtn.classList.contains('layout__mediaPlayPause--pause') ||
                playBtn.classList.contains('playing');
        }
    } catch (_) { }
    return false;
}

function _waitForMediaCompletion(playBtn, maxWaitMs, subtypeContext) {
    return waitForInstructionMediaSatisfied(subtypeContext, {
        playBtn,
        minRunMs: 800,
        maxWaitMs: Number.isFinite(maxWaitMs) ? maxWaitMs : 45000
    }).then((result) => result?.status || 'timeout');
}

// Auto-skip non-question pages (intro, explore, listen-only) when auto-next is active
function _autoSkipNonQuestionPage(attempt) {
    if (isOffMode()) return;
    if (__autoNext !== 'full') return;
    if (attempt === 0 || attempt === undefined) {
        _autoPlayVideo().catch(() => { });
    }
    const pageTypeNow = resolveSectionPageType();
    const rawNonQuestionKindNow = getNonQuestionPageKind();
    const nonQuestionKindNow =
        rawNonQuestionKindNow ||
        (pageTypeNow === 'instruction'
            ? (hasVisibleMediaControls() && shouldRequireInstructionMediaPlayback()
                ? 'instruction_media'
                : 'instruction_text')
            : null);
    const subtypeContext = detectQuestionSubtype({
        qType: __qType || 'instruction',
        pageType: pageTypeNow
    });
    const instructionMediaSubtypes = new Set([
        'instruction_multi_resource',
        'instruction_video_only',
        'instruction_audio_only',
        'prepare_custom'
    ]);
    const bodyTextNow = (document.body?.innerText || '').toLowerCase();
    const maybeMediaInstruction =
        /listen to the (examples|conversation|dialogue|recording)/i.test(bodyTextNow) ||
        /watch the video/i.test(bodyTextNow) ||
        /listen again/i.test(bodyTextNow) ||
        /use the student tools/i.test(bodyTextNow) ||
        hasVisibleMediaControls() ||
        hasVisibleStandaloneResourceArea();
    const immediateNextBtn =
        subtypeContext?.subtype === 'instruction_text_only' &&
            !maybeMediaInstruction &&
            typeof _findVisibleEnabledNextButton === 'function'
            ? _findVisibleEnabledNextButton()
            : null;
    if (immediateNextBtn && !__autoSkipActive && !__dndInProgress && !__fetching) {
        _log('[EDX] autoSkip: instruction_text with visible next button, clicking immediately');
        __autoSkipActive = true;
        const previousSignature = getPageSignature();
        const previousPage = getCurrentAssessmentPage();
        __ans = [];
        __allAns = [];
        __dndCategories = null;
        __dndDone = false;
        __dndInProgress = false;
        __apiHasSession = false;
        __lastFetchedUrl = null;
        __lastAnswerPageSignature = "";
        __lastAnswerAt = 0;
        clearAnsContext();
        __qType = pageTypeNow === 'start_test' ? 'start_test' : 'instruction';
        updateTypeBadge(__qType);
        updateAnswerDisplay(UI_TEXT.status.skippingPage);
        if (__abortController) { try { __abortController.abort(); } catch (_) { } }
        __fetching = false;
        __lastNavigateTime = Date.now();
        try { advancedClick(immediateNextBtn); } catch (_) { }
        __autoSkipActive = false;
        waitForQuestionTransition('auto_skip', previousSignature, previousPage);
        return;
    }
    if (attempt === 0 && isHostTransitionSettling(1100)) {
        _log('[EDX] autoSkip: host transition still settling, delaying first skip');
        setTimeout(() => _autoSkipNonQuestionPage(1), 500);
        return;
    }
    // Prevent re-entrant calls — only one auto-skip chain at a time
    if (__autoSkipActive && attempt === 0) {
        _log('[EDX] autoSkip: already active, ignoring re-entry');
        return;
    }
    const skipSignature = [
        pageTypeNow,
        nonQuestionKindNow || 'none',
        getCurrentAssessmentPage() ?? '?',
        getPageSignature()
    ].join('::');
    if (attempt === 0 && __lastAutoSkipSignature === skipSignature && (Date.now() - __lastAutoSkipAt) < 1600) {
        const waitMs = 1700 - (Date.now() - __lastAutoSkipAt);
        _log('[EDX] autoSkip: deduped repeated skip on same page signature, retrying in', waitMs);
        setTimeout(() => _autoSkipNonQuestionPage(1), Math.max(220, waitMs));
        return;
    }
    __lastAutoSkipSignature = skipSignature;
    __lastAutoSkipAt = Date.now();
    __autoSkipActive = true;
    const msSinceNavigate = Date.now() - (__lastNavigateTime || 0);
    if (__lastNavigateTime && msSinceNavigate < MIN_AUTO_SKIP_NAV_GAP) {
        const waitMs = MIN_AUTO_SKIP_NAV_GAP - msSinceNavigate + 120;
        _log('[EDX] autoSkip: waiting minimum nav gap', waitMs);
        __autoSkipActive = false;
        setTimeout(() => _autoSkipNonQuestionPage(attempt || 0), waitMs);
        return;
    }
    const previousSignature = getPageSignature();
    const previousPage = getCurrentAssessmentPage();
    function clearAndWait(reason) {
        __ans = []; __allAns = []; __dndCategories = null; __dndDone = false; __dndInProgress = false;
        __apiHasSession = false;
        __lastFetchedUrl = null;
        __lastAnswerPageSignature = "";
        __lastAnswerAt = 0;
        clearAnsContext();
        __qType = "?"; updateTypeBadge("unknown");
        updateAnswerDisplay(UI_TEXT.status.skippingPage);
        if (window.updateStatus) updateStatus(UI_TEXT.status.skippingPage);
        if (__abortController) { try { __abortController.abort(); } catch (_) { } }
        __fetching = false;
        __lastNavigateTime = Date.now();
        __autoSkipActive = false;
        waitForQuestionTransition(reason, previousSignature, previousPage);
    }
    if (isVisibleSpeakingIntroPage()) {
        _log('[EDX] autoSkip: speaking intro detected');
        const speakerBtn = document.querySelector(
            '.speakingInteract__speakerImg, .speakingInteract__speaker, ' +
            '[class*="chooseSpeaker"] img, [class*="chooseSpeaker"] a, ' +
            '[class*="speaker"] img, [class*="speaker"] button, ' +
            '.generalIcon.left .chooseCaracterArrow, .generalIcon.right .chooseCaracterArrow, ' +
            '.leftIcon .chooseCaracterArrow, .rightIcon .chooseCaracterArrow, .chooseCaracterArrow'
        );
        if (speakerBtn && isElementVisible(speakerBtn)) {
            updateAnswerDisplay('Đang chọn speaker...');
            try { advancedClick(speakerBtn); } catch (_) { }
            __ans = []; __allAns = []; __dndCategories = null; __dndDone = false; __dndInProgress = false;
            clearAnsContext();
            __qType = "?"; updateTypeBadge("unknown");
            if (__abortController) { try { __abortController.abort(); } catch (_) { } }
            __fetching = false;
            __lastNavigateTime = Date.now();
            __autoSkipActive = false;
            setTimeout(() => scheduleAnswerRefresh('auto_speaking_intro', 500), 900);
            return;
        }
        if ((attempt || 0) >= 2) {
            _log('[EDX] autoSkip: speaking intro appears empty, skipping to next');
            updateAnswerDisplay('Trang speaking trống - tự động Next');
            if (goToNextItem()) {
                clearAndWait('auto_skip');
                return;
            }
            const nextBtn = document.querySelector('#learning__nextItem, .learning__nextItem, .p-paginator-next, .btnContinue, .btn-continue');
            if (nextBtn && isElementVisible(nextBtn) && !nextBtn.disabled) {
                try { advancedClick(nextBtn); } catch (_) { }
                clearAndWait('auto_skip');
                return;
            }
        }
        __autoSkipActive = false;
        setTimeout(() => _autoSkipNonQuestionPage((attempt || 0) + 1), 500);
        return;
    }
    if (hasRealSpeakingUi()) {
        _log('[EDX] autoSkip: speaking UI visible, skip non-question flow');
        __autoSkipActive = false;
        return;
    }
    if (pageTypeNow !== 'question' && subtypeContext?.group === 'instruction_media' && subtypeContext.subtype === 'unknown') {
        _warn('[EDX] autoSkip: waiting unknown non-question subtype');
        recordSubtypeResult(createSubtypeResult('waiting', {
            context: subtypeContext,
            reason: 'waiting_unknown_subtype'
        }));
        updateAnswerDisplay('Đang chờ nhận diện subtype trang hướng dẫn...');
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
    const rawNonQuestionKind = getNonQuestionPageKind();
    const nonQuestionKind =
        rawNonQuestionKind ||
        (pageType === 'instruction'
            ? (hasVisibleMediaControls() && shouldRequireInstructionMediaPlayback()
                ? 'instruction_media'
                : 'instruction_text')
            : null);
    const hasRealMedia = hasVisibleMediaControls();


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
    _log('[EDX] autoSkip:', pageType, '| kind:', nonQuestionKind, '| subtype:', subtypeContext?.subtype || 'unknown', 'attempt:', attempt);

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
        instructionMediaSubtypes.has(subtypeContext?.subtype) && hasRealMedia
            ? [...mediaBtnSelectors, ...nextOnlySelectors, ...startTestSelectors]
            : nonQuestionKind === 'start_test'
                ? [...startTestSelectors, ...nextOnlySelectors]
                : [...nextOnlySelectors, ...startTestSelectors];

    for (const selector of nextBtnSelectors) {
        const btn = document.querySelector(selector);

        const isPlayBtn = [
            '#CTrackerPlayBtn', '#play-pause',
            '.layout_mediaPlayPause', '.layout__mediaPlayPause', '.CTrackerPlayBtn'
        ].includes(selector);

        if (btn && (!isPlayBtn ? isElementVisible(btn) : (hasRealMedia && isElementVisible(btn))) && !btn.disabled) {
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
                updateAnswerDisplay("Đang phát media...");
                __ans = []; __allAns = []; __dndCategories = null; __dndDone = false;
                __qType = "?"; updateTypeBadge("unknown");

                _autoPlayVideo().then((playing) => {
                    if (!playing) {

                        _log('[EDX] autoSkip: _autoPlayVideo failed, retry attempt', attempt + 1);
                        setTimeout(() => _autoSkipNonQuestionPage(attempt + 1), 1000);
                        return;
                    }

                    _waitForMediaCompletion(btn, 45000, subtypeContext).then((finishState) => {
                        const latestSubtypeContext = detectQuestionSubtype({
                            qType: __qType || 'instruction',
                            pageType: resolveSectionPageType()
                        });
                        const verified = verifySubtypeContext(latestSubtypeContext);
                        recordSubtypeResult(createSubtypeResult(verified ? 'handled' : 'failed', {
                            context: latestSubtypeContext,
                            reason: verified ? 'instruction_media_verified' : `instruction_media_${finishState}`,
                            handled: verified,
                            verified,
                            safeToNext: verified && canSubtypeAutoNext(latestSubtypeContext)
                        }));
                        _log('[EDX] autoSkip: media wait finished:', finishState, '| subtype:', latestSubtypeContext?.subtype || 'unknown', '| verified:', verified);
                        if (!verified) {
                            __autoSkipActive = false;
                            setTimeout(() => _autoSkipNonQuestionPage(attempt + 1), 500);
                            return;
                        }
                        let waitedMs = 0;
                        const pollForNext = () => {
                            const nextBtn = document.querySelector('#learning__nextItem, .learning__nextItem, .p-paginator-next, .btnContinue, .btn-continue');
                            if (nextBtn && isElementVisible(nextBtn) && !nextBtn.disabled) {
                                try { advancedClick(nextBtn); } catch (_) { }
                                __autoSkipActive = false;
                                waitForQuestionTransition('auto_skip', previousSignature, previousPage);
                            } else if (waitedMs < 7000) {
                                waitedMs += 500;
                                setTimeout(pollForNext, 500);
                            } else {
                                _log('[EDX] autoSkip: next btn never appeared after media completion, retry');
                                __autoSkipActive = false;
                                setTimeout(() => _autoSkipNonQuestionPage(attempt + 1), 500);
                            }
                        };
                        pollForNext();
                    });
                });
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

