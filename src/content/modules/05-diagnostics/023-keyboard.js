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

