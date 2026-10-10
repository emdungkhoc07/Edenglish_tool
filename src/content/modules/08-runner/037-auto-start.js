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
        const hasPlayBtn = hasVisibleMediaControls();
        if (hasPlayBtn) {
            const hasPendingQuestion =
                hasVisibleQuestionDom() ||
                hasSplitLayoutQuestionSignals() ||
                !!document.querySelector(
                    '.prFITB__fieldBlanck, .dndZone, .dnd-target, .dropZone, cdk-drop-list, ' +
                    '.lessonPlayArea input, ed-la-fitb, ed-la-dictation, ' +
                    'select, [role="combobox"], .ui-selectonemenu, .p-dropdown, .p-select, ' +
                    '.prFITB__DDLOptionsW, .learning__selectTxt_st, .lessonMultipleAnswer, .prMCQ__answerLabel'
                );
            if (hasPendingQuestion) {
                _log('[EDX] bootAutoFill: video present but question signals found — waiting for render');
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

        const hasPlayBtn = hasVisibleMediaControls();
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

