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
let __lastAutoSkipSignature = "";
let __lastAutoSkipAt = 0;
let __lastPostSubmitSignature = "";
let __lastPostSubmitAt = 0;
let __postSubmitContinueLockUntil = 0;
let __lastAnswerPageSignature = "";
let __lastAnswerAt = 0;
let __lastScheduledPageSignature = "";
let __lastScheduledReason = "";
let __lastScheduledAt = 0;
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

