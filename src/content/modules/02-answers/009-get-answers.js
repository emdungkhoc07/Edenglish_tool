// ========================= GET ANSWERS =========================
async function getAns(forceRefresh = false) {
    if (isOffMode()) return false;
    if (__dndInProgress) return false;
    const __flowTrigger = forceRefresh ? 'manual_refresh' : (__activeRefreshReason || 'direct_fetch');
    const __flowTransition = __EDX_CONTROL_PLANE__.beginTransition(__flowTrigger, {
        forceRefresh: !!forceRefresh,
        reason: __activeRefreshReason || "",
        pageType: typeof detectPageType === 'function' ? detectPageType() : "unknown",
        questionType: typeof __qType === 'string' ? __qType : "unknown"
    });
    const __finishFlow = (status, meta) => __EDX_CONTROL_PLANE__.finish(status, {
        transitionId: __flowTransition?.transitionId || 0,
        pageType: typeof detectPageType === 'function' ? detectPageType() : "unknown",
        questionType: typeof __qType === 'string' ? __qType : "unknown",
        ...(meta || {})
    });
    const __previousAns = Array.isArray(__ans) ? __ans.slice() : [];
    const __previousAllAns = Array.isArray(__allAns) ? __allAns.slice() : [];
    const __previousQType = typeof __qType === 'string' ? __qType : 'unknown';
    const __previousDndCategories = __dndCategories || null;
    const __restorePreviousAnswerState = () => {
        __ans = __previousAns.slice();
        __allAns = __previousAllAns.slice();
        __dndCategories = __previousDndCategories || null;
        if (__previousQType && __previousQType !== 'unknown') {
            __qType = __previousQType;
        }
    };
    try {
        if (!forceRefresh && __authBlockedUntil > Date.now()) {
            __fetching = false;
            updateAnswerDisplay('Phiên truy cập đang bị tạm khóa. Mở lại câu hỏi rồi bấm Refresh.');
            __finishFlow('blocked', { reason: 'auth_blocked' });
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
            __finishFlow('blocked', { reason: 'extension_context_invalid' });
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
                __finishFlow('non_question', { reason: nonQuestionKind || 'non_question_early_abort' });
                return false;
            }
        }

        const datax = await waitForAnsContext();
        if (requestId !== __currentRequestId) { __fetching = false; return false; }

        let { aRequest: ansUrl, autho } = datax || {};

        const currentPageSignature = getPageSignature();
        const pageStillMatchesPreviousAnswer = !!(
            currentPageSignature &&
            __lastAnswerPageSignature &&
            currentPageSignature === __lastAnswerPageSignature
        );
        const pageSignatureChangedSinceLastAnswer = !!(
            currentPageSignature &&
            __lastAnswerPageSignature &&
            currentPageSignature !== __lastAnswerPageSignature
        );
        if (!forceRefresh && ansUrl && ansUrl === __lastFetchedUrl && pageStillMatchesPreviousAnswer && __previousAns.length) {
            _log('[EDX] Reusing existing answers for unchanged page');
            __restorePreviousAnswerState();
            __fetching = false;
            __lastAnswerAt = Date.now();
            __EDX_CONTROL_PLANE__.syncPageIdentity({
                ansUrl,
                pageSignature: currentPageSignature,
                pageType: typeof detectPageType === 'function' ? detectPageType() : "unknown",
                questionType: typeof __qType === 'string' ? __qType : "unknown"
            });
            __EDX_CONTROL_PLANE__.note('answers.reused', {
                answerCount: __previousAns.length,
                pageSignature: currentPageSignature
            });
            updateAnswerDisplay();
            __finishFlow('reused', { reason: 'same_page_cached_answers' });
            return true;
        }


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
                    setTimeout(() => { _autoPlayVideo().catch(() => { }); }, 50);
                } else if (nonQuestionKindNow === 'instruction_text') {
                    updateAnswerDisplay('Trang lý thuyết (bấm Next)');
                } else {
                    updateAnswerDisplay('Trang lý thuyết');
                }
                __finishFlow('non_question', { reason: nonQuestionKindNow || 'stale_url_non_question' });
                return false;
            }

            const shouldWaitFreshUrl =
                __activeRefreshReason === 'auto_next' ||
                __activeRefreshReason === 'auto_section_next' ||
                __activeRefreshReason === 'auto_section_btn' ||
                (Date.now() - __lastNavigateTime) < 2200;
            if (!shouldWaitFreshUrl) {
                _log('[EDX] Stale URL on stable page, skipping fresh-url wait');
            } else {
                _log('[EDX] Stale URL detected, waiting briefly for new question XHR...');
            }
            // Clear stale content immediately while waiting for a fresh question URL.
            __ans = [];
            __allAns = [];
            updateAnswerDisplay('');
            updateTypeBadge('unknown');
            if (window.updateStatus) updateStatus(UI_TEXT.status.waitingFreshQuestion);
            const freshData = shouldWaitFreshUrl ? await waitForFreshAnsUrl(__lastFetchedUrl, 900) : null;
            if (requestId !== __currentRequestId) { __fetching = false; return false; }
            if (freshData?.aRequest && freshData.aRequest !== __lastFetchedUrl) {
                ansUrl = freshData.aRequest;
                autho = freshData.autho || autho;
            } else {
                const pageTypeAfterWait = detectPageType();
                const nonQuestionKindAfterWait = getNonQuestionPageKind();
                const hasQuestionDomAfterWait = hasVisibleQuestionDom();
                const nonQuestionAfterWait = !!nonQuestionKindAfterWait;
                const pageSignatureChangedAfterWait = !!(
                    currentPageSignature &&
                    __lastAnswerPageSignature &&
                    currentPageSignature !== __lastAnswerPageSignature
                );
                const shouldRejectForcedReuse =
                    nonQuestionAfterWait ||
                    !hasQuestionDomAfterWait ||
                    pageSignatureChangedAfterWait;
                if (shouldRejectForcedReuse) {
                    _warn('[EDX] Stale URL persisted after timeout without a fresh question. Skipping forced fetch.', {
                        nonQuestionAfterWait,
                        hasQuestionDomAfterWait,
                        pageSignatureChangedAfterWait
                    });
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
                        setTimeout(() => { _autoPlayVideo().catch(() => { }); }, 50);
                    } else if (nonQuestionKindAfterWait === 'instruction_text') {
                        updateAnswerDisplay('Trang lý thuyết (bấm Next)');
                    } else if (nonQuestionAfterWait) {
                        updateAnswerDisplay('Trang lý thuyết');
                    } else {
                        updateAnswerDisplay(UI_TEXT.status.waitingFreshQuestion);
                    }
                    __finishFlow('waiting', {
                        reason: nonQuestionAfterWait ? (nonQuestionKindAfterWait || 'non_question_after_wait') : 'waiting_fresh_question'
                    });
                    return false;
                }
                if (pageSignatureChangedSinceLastAnswer) {
                    _warn('[EDX] Stale URL belongs to previous page signature. Rejecting stale fetch reuse.');
                    clearAnsContext();
                    __ans = [];
                    __allAns = [];
                    __apiHasSession = false;
                    __qType = 'unknown';
                    updateTypeBadge(__qType);
                    if (window.updateStatus) updateStatus(UI_TEXT.status.waitingFreshQuestion);
                    updateAnswerDisplay(UI_TEXT.status.waitingFreshQuestion);
                    __finishFlow('waiting', { reason: 'stale_url_previous_page_signature' });
                    return false;
                }
                // If forceRefresh not set and fresh URL not found, re-use current URL anyway
                _warn('[EDX] Stale URL persisted after timeout. Re-using for forced fetch.');
            }
        }

        __EDX_CONTROL_PLANE__.syncPageIdentity({
            ansUrl,
            pageSignature: currentPageSignature,
            pageType: typeof detectPageType === 'function' ? detectPageType() : "unknown",
            questionType: typeof __qType === 'string' ? __qType : "unknown"
        });
        _trace('context.ready', {
            hasAnsUrl: !!ansUrl,
            hasAuth: !!autho,
            requestId,
            ms: Math.round(performance.now() - __loadStart),
        });
        if (!ansUrl || !autho) {
            const visibleTypeWithoutSession = detectQuestionType();
            const localDndZones = typeof getDndZones === 'function' ? getDndZones(true) : [];
            const localDndFilled = visibleTypeWithoutSession === 'dnd' &&
                localDndZones.length > 0 &&
                areAllDndZonesSatisfied(localDndZones);
            const canReusePreviousAnswerState = !forceRefresh &&
                pageStillMatchesPreviousAnswer &&
                __previousAns.length > 0;
            const localQuestionRecovered =
                canReusePreviousAnswerState ||
                localDndFilled;
            if (visibleTypeWithoutSession === 'speaking' && hasRealSpeakingUi()) {
                _log('[EDX] Speaking page without API session: proceeding with local speaking handler');
                __apiHasSession = false;
                __qType = 'speaking';
                updateTypeBadge('speaking');
                updateAnswerDisplay('Đang chuẩn bị ghi âm...');
                __fetching = false;
                __finishFlow('ready', { reason: 'local_speaking_without_session' });
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
                if (shouldAutoAdvance()) {
                    setTimeout(() => _autoSkipNonQuestionPage(0), 50);
                } else {
                    _autoPlayVideo().catch(() => {
                        if (window.updateStatus) updateStatus('');
                    });
                }
                return false;
            }

            if (localQuestionRecovered) {
                __apiHasSession = false;
                __restorePreviousAnswerState();
                if (visibleTypeWithoutSession && visibleTypeWithoutSession !== 'unknown') {
                    __qType = visibleTypeWithoutSession;
                }
                updateTypeBadge(__qType);
                __lastAnswerAt = Date.now();
                _warn('[EDX] Missing auth context, reusing local question state on same page.', {
                    localDndFilled,
                    pageStillMatchesPreviousAnswer,
                    previousAnswerCount: __previousAns.length
                });
                updateAnswerDisplay();
                if (localDndFilled && shouldAutoAdvance()) {
                    const localSubtypeContext = typeof refreshSubtypeContext === 'function'
                        ? refreshSubtypeContext()
                        : null;
                    const localVerified = localSubtypeContext
                        ? verifySubtypeContext(localSubtypeContext)
                        : true;
                    const localSafeToNext = localSubtypeContext
                        ? (localVerified && canSubtypeAutoNext(localSubtypeContext) && areAllDndZonesSatisfied(localDndZones))
                        : true;
                    if (localSubtypeContext) {
                        recordSubtypeResult(createSubtypeResult(localVerified ? 'handled' : 'waiting', {
                            context: localSubtypeContext,
                            reason: localVerified ? 'missing_auth_reused_local_dnd' : 'missing_auth_reused_local_state',
                            remaining: 0,
                            safeToNext: localSafeToNext,
                            handled: localVerified,
                            verified: localVerified
                        }));
                    }
                    if (localSafeToNext) {
                        setTimeout(() => autoNextIfEnabled(true, 400), 500);
                    }
                }
                __fetching = false;
                __finishFlow('reused', {
                    reason: localDndFilled ? 'missing_auth_reused_local_dnd' : 'missing_auth_reused_local_question'
                });
                return false;
            }

            const pageTypeHint = detectPageType();
            const nonQuestionKindHint = getNonQuestionPageKind();
            const isNonQuestionHint = !!nonQuestionKindHint;
            const inferredInstructionKind =
                !isNonQuestionHint && pageTypeHint === 'instruction'
                    ? (hasVisibleMediaControls() && shouldRequireInstructionMediaPlayback()
                        ? 'instruction_media'
                        : 'instruction_text')
                    : null;
            if (isNonQuestionHint || inferredInstructionKind) {
                const resolvedNonQuestionKind = nonQuestionKindHint || inferredInstructionKind;
                __apiHasSession = false;
                __qType = pageTypeHint === 'start_test' ? 'start_test' : 'instruction';
                updateTypeBadge(__qType);

                if (shouldAutoAdvance()) {
                    updateAnswerDisplay(UI_TEXT.status.skippingPage);
                    setTimeout(() => _autoSkipNonQuestionPage(0), 50);
                } else if (isRunMode() && resolvedNonQuestionKind === 'instruction_media') {
                    updateAnswerDisplay('Trang lý thuyết / media (đang phát)');
                    setTimeout(() => { _autoPlayVideo().catch(() => { }); }, 50);
                } else if (resolvedNonQuestionKind === 'instruction_text') {
                    updateAnswerDisplay('Trang lý thuyết (bấm Next)');
                } else if (resolvedNonQuestionKind === 'start_test') {
                    updateAnswerDisplay('Trang bắt đầu bài, sẵn sàng chạy');
                } else {
                    updateAnswerDisplay('Trang lý thuyết');
                }
                __finishFlow('non_question', { reason: resolvedNonQuestionKind || 'missing_session_non_question' });
                return false;
            }

            const hasLocalMediaOnly =
                hasVisibleMediaControls() &&
                !hasVisibleQuestionDom();
            if (hasLocalMediaOnly) {
                __apiHasSession = false;
                __qType = 'instruction';
                updateTypeBadge('instruction');
                updateAnswerDisplay('Trang media / nghe — đang phát');
                if (window.updateStatus) {
                    const hasVideo = !!document.querySelector('video, #CTrackerPlayBtn, #play-pause');
                    updateStatus(hasVideo ? UI_TEXT.status.playingVideo : UI_TEXT.status.playingAudio);
                }
                if (shouldAutoAdvance()) {
                    setTimeout(() => _autoSkipNonQuestionPage(0), 50);
                } else if (isRunMode()) {
                    setTimeout(() => { _autoPlayVideo().catch(() => { }); }, 50);
                }
                __finishFlow('non_question', { reason: 'missing_session_media_page' });
                return false;
            }

            __apiHasSession = false;
            updateAnswerDisplay("Chưa có phiên hợp lệ. Mở 1 câu hỏi rồi bấm Refresh.");
            __finishFlow('blocked', { reason: 'missing_auth_context' });
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
                if (shouldAutoAdvance()) {
                    setTimeout(() => _autoSkipNonQuestionPage(0), 50);
                } else {
                    _autoPlayVideo().catch(() => {
                        if (window.updateStatus) updateStatus('');
                    });
                }
            }
            __fetching = false;
            __finishFlow('non_question', { reason: 'video_only_page' });
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
                __finishFlow('non_question', { reason: nonQuestionKindHint || 'unknown_dom_instruction' });
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
                    _autoPlayVideo().catch(() => { });
                }
                __finishFlow('non_question', { reason: 'video_only_unknown_type' });
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
                __finishFlow('unsupported', { reason: 'question_type_unknown_after_inference' });
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
            __finishFlow('non_question', { reason: pageTypeAfterSignals || 'signals_rejected_non_question' });
            return false;
        }
        const finalUrl = patchAssessmentUrl(ansUrl);
        const contextCandidates = [{ finalUrl, autho }];

        try {
            let bestParsed = null;
            let bestScore = -Infinity;
            let lastAuthFailure = false;


            const captures = await requestCapturedPayloads(80);
            if (requestId !== __currentRequestId) return false;

            const targetPath = new URL(finalUrl, location.origin).pathname;
            const targetSuffix = targetPath.split('GetItem/')[1]; // use full path for unique question matching

            let matchedJson = null;
            if (targetSuffix) {
                const matchedCap = captures.find(c => {
                    try {
                        return new URL(c.url, location.origin).pathname.includes(targetSuffix);
                    } catch (_) { return false; }
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
            __lastAnswerPageSignature = getPageSignature();
            __lastAnswerAt = Date.now();


            const API_PRIORITY_TYPES = ['speaking', 'writing'];
            if (!bestParsed.qType || !API_PRIORITY_TYPES.includes(__qType)) {
                __qType = qType;
            }

            if (bestParsed.qType && API_PRIORITY_TYPES.includes(bestParsed.qType)) {
                if (bestParsed.qType === 'speaking' && !hasRealSpeakingUi() && detectQuestionType() !== 'speaking') {
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
            __EDX_CONTROL_PLANE__.syncPageIdentity({
                ansUrl: finalUrl,
                pageType: typeof detectPageType === 'function' ? detectPageType() : "unknown",
                questionType: __qType
            });
            __EDX_CONTROL_PLANE__.note('answers.ready', {
                answerCount: __ans.length,
                allOptionCount: __allAns.length,
                source: bestParsed?._source || __EDX_STORE__.getState().lastAnswerSource || "api"
            });
            updateAnswerDisplay();
            __finishFlow('ready', {
                reason: 'answers_loaded',
                pageIdentityAfter: __EDX_CONTROL_PLANE__.capturePageIdentity({
                    ansUrl: finalUrl,
                    pageType: typeof detectPageType === 'function' ? detectPageType() : "unknown",
                    questionType: __qType
                })
            });
            return true;
        } catch (e) {
            if (e.name === 'AbortError') {
                __finishFlow('aborted', { reason: 'abort_error' });
                return false;
            }
            _warn("[EDX] getAns inner:", e.message);
            updateAnswerDisplay("Lỗi tải đáp án (thử F5): " + e.message);
            __finishFlow('error', { reason: 'inner_getAns_error', error: e.message });
            return false;
        }
    } catch (e) {
        _warn('[EDX] getAns outer:', e.message);
        if (e.name !== 'AbortError') {
            updateAnswerDisplay("Lỗi bất ngờ (thử F5): " + (e.message || "Unknown error"));
        }
        __finishFlow(e.name === 'AbortError' ? 'aborted' : 'error', {
            reason: e.name === 'AbortError' ? 'outer_abort_error' : 'outer_getAns_error',
            error: e.message || "Unknown error"
        });
        return false;
    } finally {
        if (__fetching) __fetching = false;
    }
}

