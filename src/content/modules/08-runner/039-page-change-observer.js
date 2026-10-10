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
        if (isHostTransitionSettling(900)) {
            _log('[EDX] Observer: host transition settling, waiting');
            return;
        }

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
        if (
            __activeRefreshReason === 'auto_skip' ||
            __activeRefreshReason === 'auto_next' ||
            __activeRefreshReason === 'auto_start_test' ||
            __activeRefreshReason === 'auto_section_next' ||
            __activeRefreshReason === 'auto_section_btn'
        ) {
            _log('[EDX] Observer: skip — active refresh cycle:', __activeRefreshReason);
            return;
        }

        // Skip if DnD in progress
        if (__dndInProgress || __dndDone) {
            _log('[EDX] Observer: skip DnD in progress/done');
            return;
        }

        if (window.__speakingInProgress) {
            _log('[EDX] Observer: skip speaking in progress');
            return;
        }


        const pageType = resolveSectionPageType();
        _log('[EDX] Page type detected:', pageType);
        __EDX_CONTROL_PLANE__.note('observer.page_change', {
            signature: sig,
            pageType,
            sigChanged,
            qTextChanged
        });


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

