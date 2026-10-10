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


function getVisibleWritingResult() {
    const state = typeof getWritingState === 'function' ? getWritingState() : window.__EDX_WRITING_STATE__;
    const context = typeof extractWritingContext === 'function' ? extractWritingContext() : null;
    if (!state?.lastResult || !context?.pageKey) return null;
    return state.lastResult.pageKey === context.pageKey ? state.lastResult : null;
}

function waitForWritingBridgeResult(eventName, timeoutMs = 2500) {
    return new Promise((resolve) => {
        let done = false;
        const finish = (value) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { __removeBridgeListener(document, eventName, handler); } catch (_) { }
            resolve(value);
        };
        const handler = (event) => finish(event?.detail || {});
        const timer = setTimeout(() => finish({ success: false, timeout: true }), timeoutMs);
        try { __addBridgeListener(document, eventName, handler); } catch (_) { }
    });
}

async function recoverWritingEditor() {
    const pending = waitForWritingBridgeResult('__edx_recover_writing_result', 3200);
    __dispatchBridgeEvent(document, '__edx_recover_writing');
    const detail = await pending;
    return detail?.success !== false;
}

async function typeWritingDraftText(text) {
    if (!text?.trim()) return false;
    const ok = await injectWritingText(text);
    if (!ok) return false;
    setTimeout(() => {
        triggerAngularSync(document.querySelector('.tox-tinymce, iframe[id*="tiny"], .prWriting__editorW, .mceEditor'));
        __dispatchBridgeEvent(document, '__edx_force_commit');
    }, 280);
    return true;
}

async function runWritingAiAction(action = 'draft') {
    try {
        updateWritingState?.({ busy: true, status: 'loading', lastError: '', lastAction: action });
        renderWritingAssistant('Đang gọi Groq để tạo bài viết...');
        await recoverWritingEditor();
        const result = await requestWritingDraft(action);
        const labels = {
            draft: 'Đã tạo draft. Type Draft để gõ vào editor.',
            rewrite: 'Đã tạo bản viết lại. Type Draft để gõ vào editor.',
            shorten: 'Đã tạo bản rút gọn. Type Draft để gõ vào editor.',
            improve: 'Đã tạo bản cải thiện. Type Draft để gõ vào editor.'
        };
        renderWritingAssistant(labels[action] || labels.draft);
        return result;
    } catch (error) {
        renderWritingAssistant(error?.message || 'Không tạo được draft');
        return null;
    }
}

async function typeCurrentWritingDraft(action = 'draft') {
    const result = getVisibleWritingResult();
    if (!result) {
        renderWritingAssistant('Chưa có draft để gõ');
        return false;
    }
    const text = typeof resolveWritingVariantText === 'function'
        ? resolveWritingVariantText(result, action || getWritingState()?.lastAction || 'draft')
        : String(result?.draft || '').trim();
    if (!text) {
        renderWritingAssistant('Draft trống');
        return false;
    }

    renderWritingAssistant('Đang gõ draft vào editor...');
    const recovered = await recoverWritingEditor();
    if (!recovered) {
        renderWritingAssistant('Không mở được editor writing');
        return false;
    }
    const ok = await typeWritingDraftText(text);
    if (ok) {
        updateWritingState?.({ busy: false, status: 'typed', lastError: '' });
        renderWritingAssistant('Đã gõ xong - review rồi tự Save/Submit');
        return true;
    }
    renderWritingAssistant('Không gõ được draft vào editor');
    return false;
}

function renderWritingAssistant(extraMsg) {
    if (!ansBody) return;
    ansBody.innerHTML = '';

    const settings = typeof getEdxSettings === 'function' ? getEdxSettings() : null;
    const hasKey = typeof hasConfiguredAiKey === 'function' ? hasConfiguredAiKey() : false;
    const state = typeof getWritingState === 'function' ? getWritingState() : (window.__EDX_WRITING_STATE__ || {});
    const result = getVisibleWritingResult();

    const wrap = document.createElement('div');
    wrap.className = __obfClassList('eds-writing-panel');

    const stateBox = document.createElement('div');
    stateBox.className = __obfClassList('eds-writing-state');
    let stateText = extraMsg || '';
    if (!stateText) {
        if (state.busy) stateText = 'Đang tạo draft AI...';
        else if (!settings?.writing?.enabled) stateText = 'AI Writing đang tắt trong cài đặt';
        else if (!hasKey) stateText = 'Chưa có Groq API key - mở cài đặt để cấu hình';
        else if (state.lastError) stateText = state.lastError;
        else if (result) stateText = 'Draft sẵn sàng - có thể Type Draft hoặc tạo bản mới';
        else stateText = 'AI Writing sẵn sàng - tạo draft rồi review thủ công';
    }
    stateBox.textContent = stateText;
    wrap.appendChild(stateBox);

    const actions = document.createElement('div');
    actions.className = __obfClassList('eds-writing-actions');

    const makeActionBtn = (label, className, onClick, disabled = false) => {
        const btn = document.createElement('button');
        btn.className = __obfClassList(`eds-btn ${className || ''}`.trim());
        btn.textContent = label;
        btn.disabled = !!disabled;
        btn.onclick = onClick;
        return btn;
    };

    actions.appendChild(makeActionBtn('Generate Draft', 'eds-btn--primary', () => {
        if (!hasKey) {
            window.__EDX_PANEL_SETTINGS_API__?.open?.();
            return;
        }
        void runWritingAiAction('draft');
    }, state.busy || !settings?.writing?.enabled));

    actions.appendChild(makeActionBtn('Type Draft', 'eds-btn--primary', () => {
        void typeCurrentWritingDraft(state.lastAction || 'draft');
    }, state.busy || !result));

    actions.appendChild(makeActionBtn('Rewrite', 'eds-btn--ghost', () => {
        if (!hasKey) {
            window.__EDX_PANEL_SETTINGS_API__?.open?.();
            return;
        }
        void runWritingAiAction('rewrite');
    }, state.busy || !hasKey));

    actions.appendChild(makeActionBtn('Shorten', 'eds-btn--ghost', () => {
        if (!hasKey) {
            window.__EDX_PANEL_SETTINGS_API__?.open?.();
            return;
        }
        void runWritingAiAction('shorten');
    }, state.busy || !hasKey));

    actions.appendChild(makeActionBtn('Improve', 'eds-btn--ghost', () => {
        if (!hasKey) {
            window.__EDX_PANEL_SETTINGS_API__?.open?.();
            return;
        }
        void runWritingAiAction('improve');
    }, state.busy || !hasKey));

    actions.appendChild(makeActionBtn('Cài đặt AI', 'eds-btn--ghost', () => {
        window.__EDX_PANEL_SETTINGS_API__?.open?.();
    }, false));

    wrap.appendChild(actions);

    if (result?.draft) {
        const preview = document.createElement('div');
        preview.className = __obfClassList('eds-writing-preview');
        const label = document.createElement('div');
        label.className = __obfClassList('eds-writing-preview-label');
        label.textContent = 'Draft Preview';
        const text = document.createElement('div');
        text.className = __obfClassList('eds-writing-preview-text');
        const selectedDraft = typeof resolveWritingVariantText === 'function'
            ? resolveWritingVariantText(result, state.lastAction || 'draft')
            : result.draft;
        text.textContent = String(selectedDraft || '').slice(0, 420);
        preview.appendChild(label);
        preview.appendChild(text);
        wrap.appendChild(preview);
    }

    if (result?.notes?.length) {
        const notes = document.createElement('div');
        notes.className = __obfClassList('eds-writing-notes');
        const label = document.createElement('div');
        label.className = __obfClassList('eds-writing-notes-label');
        label.textContent = 'AI Notes';
        const list = document.createElement('div');
        list.className = __obfClassList('eds-writing-notes-list');
        result.notes.forEach((note) => {
            const line = document.createElement('div');
            line.textContent = `- ${note}`;
            list.appendChild(line);
        });
        notes.appendChild(label);
        notes.appendChild(list);
        wrap.appendChild(notes);
    }

    ansBody.appendChild(wrap);
}

async function handleQuestion() {

    cancelPendingAutoNext();
    __EDX_CONTROL_PLANE__.note('handler.enter', {
        qType: __qType || 'unknown',
        pageType: typeof detectPageType === 'function' ? detectPageType() : 'unknown'
    });

    let subtypeContext = null;
    const refreshSubtypeContext = (overrides = {}) => {
        subtypeContext = detectQuestionSubtype({
            qType: __qType,
            ...overrides
        });
        return subtypeContext;
    };

    if (!__qType || __qType === '?' || __qType === 'unknown') {
        __qType = detectQuestionType();
    }
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
            const nonQuestionSubtype = refreshSubtypeContext({
                pageType: resolveSectionPageType()
            });
            if (nonQuestionSubtype?.group === 'instruction_media' && nonQuestionSubtype.subtype !== 'unknown') {
                _log('[EDX] handleQuestion: non-question page detected early, skipping | subtype:', nonQuestionSubtype.subtype);
                recordSubtypeResult(createSubtypeResult('handled', {
                    context: nonQuestionSubtype,
                    reason: 'non_question_autoskip',
                    handled: true,
                    safeToNext: canSubtypeAutoNext(nonQuestionSubtype)
                }));
                _autoSkipNonQuestionPage();
                return;
            }
            _warn('[EDX] handleQuestion: non-question page detected but subtype is unknown, waiting');
            recordSubtypeResult(createSubtypeResult('waiting', {
                context: nonQuestionSubtype,
                reason: 'waiting_unknown_subtype'
            }));
            updateAnswerDisplay('Đang chờ nhận diện subtype trang hướng dẫn...');
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
            refreshSubtypeContext();

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
                        const delayedSubtype = detectQuestionSubtype({
                            qType: __qType || 'instruction',
                            pageType: resolveSectionPageType()
                        });
                        if (delayedSubtype?.group === 'instruction_media' && delayedSubtype.subtype !== 'unknown') {
                            _autoSkipNonQuestionPage();
                        } else {
                            recordSubtypeResult(createSubtypeResult('waiting', {
                                context: delayedSubtype,
                                reason: 'waiting_unknown_subtype'
                            }));
                            updateAnswerDisplay('Đang chờ nhận diện subtype trang hướng dẫn...');
                        }
                    } else if (shouldAutoAdvance()) {
                        const waitingContext = detectQuestionSubtype({
                            qType: __qType || 'unknown',
                            pageType: resolveSectionPageType()
                        });
                        _warn('[EDX] handleQuestion: unresolved page stayed unknown, waiting instead of forcing skip');
                        recordSubtypeResult(createSubtypeResult('waiting', {
                            context: waitingContext,
                            reason: 'waiting_unknown_subtype'
                        }));
                        updateAnswerDisplay('Đang chờ nhận diện subtype câu hỏi...');
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
            refreshSubtypeContext();
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

    subtypeContext = refreshSubtypeContext();
    _trace('handler.route', {
        qType: __qType,
        group: subtypeContext?.group || 'unknown',
        subtype: subtypeContext?.subtype || 'unknown',
        ansCount: __ans?.length || 0,
        allCount: __allAns?.length || 0
    });
    __EDX_CONTROL_PLANE__.note('handler.route', {
        qType: __qType,
        group: subtypeContext?.group || 'unknown',
        subtype: subtypeContext?.subtype || 'unknown',
        ansCount: __ans?.length || 0,
        allCount: __allAns?.length || 0
    });
    if (subtypeContext?.pageType === 'question' && subtypeContext.subtype === 'unknown') {
        if (shouldHardWaitForUnknownSubtype(subtypeContext)) {
            _warn('[EDX] handleQuestion: waiting on unknown subtype', subtypeContext.group, subtypeContext.domSignals);
            recordSubtypeResult(createSubtypeResult('waiting', {
                context: subtypeContext,
                reason: 'waiting_unknown_subtype'
            }));
            updateAnswerDisplay('Đang chờ nhận diện subtype câu hỏi...');
            if (window.updateStatus) updateStatus('Đang chờ nhận diện subtype...');
            return;
        }
        _warn('[EDX] handleQuestion: subtype unresolved, using family fallback', subtypeContext.group, subtypeContext.domSignals);
    }

    switch (__qType) {

        case 'writing':
            setTimeout(() => { void recoverWritingEditor(); }, 250);
            renderWritingAssistant();
            return;

        case 'speaking':

            if (window.__speakingInProgress) {
                _log('[EDX] Speaking already in progress, skip re-trigger');
                return;
            }
            const speakingSubtype = subtypeContext?.subtype || 'unknown';
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
                    const latestSpeakingContext = detectQuestionSubtype({ qType: 'speaking' });
                    const verified = status === 'done' ? verifySubtypeContext(latestSpeakingContext) : false;
                    recordSubtypeResult(createSubtypeResult(
                        status === 'done' && verified ? 'handled' : (status === 'done' ? 'failed' : 'failed'),
                        {
                            context: latestSpeakingContext,
                            reason: status === 'done'
                                ? (verified ? 'speaking_verified' : 'speaking_unverified')
                                : 'speaking_manual',
                            handled: status === 'done',
                            verified,
                            safeToNext: false
                        }
                    ));
                };

                const parseClockSeconds = (value) => {
                    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
                    if (!match) return 0;
                    return (parseInt(match[1], 10) * 60) + parseInt(match[2], 10);
                };

                const getSpeakingExpectedDurationMs = () => {
                    const nodes = Array.from(document.querySelectorAll(
                        '.layout__audioTime, .layout_audioTime, .mediaContainerWrapper, .mediaContainer, ' +
                        '.recordingPanelWrapper, .learning__SpeakingPal, .answersWrapper'
                    ));
                    for (const node of nodes) {
                        const text = norm(node.textContent || '');
                        const match = text.match(/(\d{1,2}:\d{2})\s*\/\s*(\d{1,2}:\d{2})/);
                        if (!match) continue;
                        const totalSeconds = parseClockSeconds(match[2]);
                        if (totalSeconds > 0) {
                            return Math.max(12000, Math.min(28000, (totalSeconds * 1000) + 4500));
                        }
                    }
                    return 24000;
                };

                const hasVisibleEnabledStartLikeBtn = () => {
                    const startLikeBtns = Array.from(document.querySelectorAll(
                        'a.button, button, [role="button"], a[class*="button"], a[class*="btn"]'
                    ));
                    return startLikeBtns.some((btn) => {
                        const t = (btn.textContent || '').trim().toLowerCase();
                        if (t !== 'start' && t !== 'record') return false;
                        if (!isElementVisible(btn)) return false;
                        if (btn.closest?.('.disable')) return false;
                        if (btn.getAttribute?.('aria-disabled') === 'true') return false;
                        if (btn.disabled) return false;
                        return true;
                    });
                };

                const hasSpeakingCompletionUi = (elapsedMs = 0, minElapsedMs = 6500) => {
                    if (elapsedMs < minElapsedMs) return false;
                    if (hasVisibleEnabledStartLikeBtn()) return false;
                    if (!hasRealSpeakingUi()) return true;
                    if (queryVisible('.speakingInteract.getFeedback, .showGrades, .speakingInteractPanelsWrapper.showGrades')) return true;
                    if (queryVisible('.button.continue.retry, a.button.continue.retry, button.button.continue.retry')) return true;
                    if (queryVisible('.continueWrapper:not(.disable) .button.continue, .buttonWrapper.continueWrapper:not(.disable) .button.continue')) return true;
                    if (queryVisible('.hearWrapper:not(.hide) a, .hearWrapper:not(.hide), .hearWrapper a')) return true;
                    if (queryVisible('.recordPanelWrapper .playBT, .RecordButtonWrapper .playBT')) return true;
                    const continueBtns = Array.from(document.querySelectorAll('a.button.continue, button.button.continue, .continueWrapper .button.continue'));
                    if (continueBtns.some((btn) => {
                        if (!isElementVisible(btn)) return false;
                        const t = (btn.textContent || '').trim().toLowerCase();
                        if (t === 'start' || t === 'record') return false;
                        return !btn.closest?.('.disable') && btn.getAttribute?.('aria-disabled') !== 'true' && !btn.disabled;
                    })) return true;
                    return false;
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
                                try { advancedClick(speakerBtn); } catch (_) { }
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
                            try { advancedClick(arrow); } catch (_) { }
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
                            try { advancedClick(arrow); } catch (_) { }
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
                                try { advancedClick(target); } catch (_) { }
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
                            const quickTimeoutMs = getSpeakingExpectedDurationMs();
                            const quickMinCompletionMs = Math.max(2500, Math.min(6500, Math.round(quickTimeoutMs * 0.2)));
                            updateStatus(UI_TEXT.status.speakingStarting);
                            _log('[EDX] Speaking interact quick path: click record/start and continue');
                            await delay(humanJitter(700, 400));
                            if (checkAbort()) return;
                            resetEdxSpeakingRuntimeForAttempt(speakingKey);
                            try { advancedClick(quickBtn); } catch (_) { }
                            updateStatus(UI_TEXT.status.speakingRecording);
                            const quickStartedAt = Date.now();
                            const quickCompletion = await waitForSpeakingLifecycleCompletion({
                                startedAt: quickStartedAt,
                                minElapsedMs: quickMinCompletionMs,
                                timeoutMs: quickTimeoutMs,
                                completionUi: hasSpeakingCompletionUi
                            });
                            if (checkAbort()) return;
                            _log('[EDX] Speaking quick completion:', quickCompletion?.status, 'reason:', quickCompletion?.reason || '', 'subtype:', speakingSubtype);
                            if (quickCompletion?.status === 'timeout') {
                                finishSpeakingAttempt('manual', UI_TEXT.status.speakingError);
                                return;
                            }
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
                        _log(`[EDX] Speaking: Start button not found, attempt ${attempt + 1}`);
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

                    resetEdxSpeakingRuntimeForAttempt(speakingKey);
                    try { advancedClick(startBtn); } catch (_) { }
                    updateStatus(UI_TEXT.status.speakingRecording);
                    _log('[EDX] Speaking: clicked Start button | subtype:', speakingSubtype);
                    const speakingStartedAt = Date.now();
                    const speakingTimeoutMs = getSpeakingExpectedDurationMs();
                    const speakingMinCompletionMs = Math.max(6500, Math.min(12000, Math.round(speakingTimeoutMs * 0.35)));
                    const speakingCompletion = await waitForSpeakingLifecycleCompletion({
                        startedAt: speakingStartedAt,
                        minElapsedMs: speakingMinCompletionMs,
                        timeoutMs: speakingTimeoutMs,
                        completionUi: hasSpeakingCompletionUi
                    });
                    _log('[EDX] Speaking completion:', speakingCompletion?.status, 'reason:', speakingCompletion?.reason || '', 'subtype:', speakingSubtype);
                    if (speakingCompletion?.status === 'timeout') {
                        finishSpeakingAttempt('manual', UI_TEXT.status.speakingError);
                        return;
                    }

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
                        _autoPlayVideo().catch(() => { });
                        setTimeout(() => autoNextIfEnabled(true, 500), 3000);
                    }
                    return;
                }
            }
            autoPlaceDndFirst(subtypeContext).then((routeResult) => {
                if (!routeResult || routeResult.status === 'waiting') {
                    _panelRestoreAfterDnD();
                    const waitingContext = routeResult?.context || subtypeContext || refreshSubtypeContext();
                    recordSubtypeResult(createSubtypeResult('waiting', {
                        context: waitingContext,
                        reason: routeResult?.reason || 'waiting_unknown_subtype'
                    }));
                    updateAnswerDisplay('Đang chờ nhận diện subtype kéo thả...');
                    return;
                }
                if (routeResult.status === 'unsupported') {
                    _panelRestoreAfterDnD();
                    recordSubtypeResult(createSubtypeResult('unsupported', {
                        context: routeResult.context || subtypeContext || refreshSubtypeContext(),
                        reason: routeResult.reason || 'unsupported_dnd_subtype'
                    }));
                    flashBlock("Không hỗ trợ kéo thả tự động");
                    return;
                }
                if (routeResult.status === 'failed') {
                    _panelRestoreAfterDnD();
                    recordSubtypeResult(createSubtypeResult('failed', {
                        context: routeResult.context || subtypeContext || refreshSubtypeContext(),
                        reason: routeResult.reason || 'dnd_route_failed'
                    }));
                    updateAnswerDisplay('Không hoàn tất được subtype kéo thả này');
                    return;
                }
                if (!shouldAutoAdvance()) { _panelRestoreAfterDnD(); return; }
                setTimeout(() => {
                    const currentSubtypeContext = refreshSubtypeContext();
                    const allZones = getDndZones();
                    const remaining = countUnsatisfiedDndZones(allZones);
                    const verified = verifySubtypeContext(currentSubtypeContext);
                    const safeToNext = verified && canSubtypeAutoNext(currentSubtypeContext) && remaining === 0;
                    recordSubtypeResult(createSubtypeResult(verified ? 'handled' : 'failed', {
                        context: currentSubtypeContext,
                        reason: verified ? 'dnd_verified' : 'dnd_incomplete',
                        remaining,
                        safeToNext,
                        handled: true,
                        verified
                    }));
                    _log('[EDX] DnD fill done | subtype:', currentSubtypeContext?.subtype || 'unknown', '| remaining:', remaining, '/', allZones.length, '| verified:', verified, '| safeToNext:', safeToNext);
                    if (window.updateStatus) {
                        updateStatus(remaining === 0 ? UI_TEXT.status.dndDone : `Kéo thả còn ${remaining} ô chưa điền`);
                    }
                    if (safeToNext) {
                        _panelRestoreAfterDnD();
                        setTimeout(() => {
                            if (_handleUnsubmittedTestModal()) return;
                            autoNextIfEnabled(true, 400);
                        }, 500);
                    } else {
                        _log('[EDX] DnD missing items, running Pass 2...');
                        autoPlaceDndFirst(currentSubtypeContext).then(() => {
                            setTimeout(() => {
                                const retrySubtypeContext = refreshSubtypeContext();
                                const left = countUnsatisfiedDndZones(getDndZones());
                                const retryVerified = verifySubtypeContext(retrySubtypeContext);
                                const retrySafeToNext = retryVerified && canSubtypeAutoNext(retrySubtypeContext) && left === 0;
                                recordSubtypeResult(createSubtypeResult(retryVerified ? 'handled' : 'failed', {
                                    context: retrySubtypeContext,
                                    reason: retryVerified ? 'dnd_retry_verified' : 'dnd_retry_incomplete',
                                    remaining: left,
                                    safeToNext: retrySafeToNext,
                                    handled: true,
                                    verified: retryVerified
                                }));
                                _log('[EDX] DnD Pass 2 retry check | subtype:', retrySubtypeContext?.subtype || 'unknown', '| remaining:', left, '| verified:', retryVerified, '| safeToNext:', retrySafeToNext);
                                _panelRestoreAfterDnD();
                                if (window.updateStatus) {
                                    updateStatus(left === 0 ? UI_TEXT.status.dndDone : `Kéo thả còn ${left} ô chưa điền`);
                                }
                                if (retrySafeToNext && !__dndUserDrag) {
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
                                        _log('[EDX] DnD missing items, no Redo button -> Forcing Brute-Force Fallback');
                                        updateAnswerDisplay("Đang kéo bừa chắp vá phần còn thiếu...");
                                        (async () => {
                                            const answerZones = getDndZones();
                                            const unsatisfiedZones = answerZones.filter(z => !dndZoneIsSatisfied(z));
                                            let allItems = Array.from(document.querySelectorAll('.dnditem, .dnd-item, .draggableContainer, [class*="dragItem"], [class*="drag-item"], .draggable.wordBankTile'));
                                            allItems = allItems.filter(item => isElementVisible(item));

                                            // An item is unused if it's NOT inside any target answer zone
                                            const unusedItems = allItems.filter(item => !answerZones.some(zone => zone === item || zone.contains(item)));

                                            let attemptCount = 0;
                                            const limit = Math.min(unsatisfiedZones.length, unusedItems.length);
                                            for (let i = 0; i < limit; i++) {
                                                if (typeof simulateDragDrop === 'function') {
                                                    await simulateDragDrop(unusedItems[i], unsatisfiedZones[i]);
                                                    await new Promise(r => setTimeout(r, 450));
                                                    attemptCount++;
                                                }
                                            }

                                            _log('[EDX] Brute-force fallback dragged', attemptCount, 'items. Unsatisfied:', unsatisfiedZones.length, 'Unused:', unusedItems.length);
                                            setTimeout(() => {
                                                if (typeof _handleUnsubmittedTestModal === 'function' && _handleUnsubmittedTestModal()) return;
                                                autoNextIfEnabled(true, 400, true);
                                            }, 800);
                                        })();
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
                            setTimeout(() => _autoSkipNonQuestionPage(0), 50);
                        } else if (isRunMode()) {
                            _autoPlayVideo().catch(() => { });
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
                                if (shouldAutoAdvance()) {
                                    updateAnswerDisplay('Đang bỏ qua trang (chưa hỗ trợ / lý thuyết)...');
                                    setTimeout(() => autoNextIfEnabled(true, 1500, true), 1500);
                                } else {
                                    updateAnswerDisplay('Loại câu này chưa được hỗ trợ tự động (đã hiển thị đáp án trần)');
                                }
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

