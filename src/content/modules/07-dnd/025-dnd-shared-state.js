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
        // Reset DnD flags so the next page's DnD questions are not skipped
        __dndDone = false;
        __dndInProgress = false;
        __dndFailCount = 0;
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

