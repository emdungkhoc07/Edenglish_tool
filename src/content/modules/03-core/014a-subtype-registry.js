// ========================= SUBTYPE REGISTRY =========================
let __qGroup = "unknown";
let __qSubtype = "unknown";
let __qSubtypeContext = null;
let __qSubtypeResult = null;
window.__EDX_MEDIA_RUNTIME__ = window.__EDX_MEDIA_RUNTIME__ || {};
window.__EDX_SPEAKING_RUNTIME__ = window.__EDX_SPEAKING_RUNTIME__ || {};

function getEdxMediaRuntimeSnapshot() {
    const state = window.__EDX_MEDIA_RUNTIME__ || {};
    const media = document.querySelector("video") || document.querySelector("audio");
    return {
        hookInstalled: !!state.hookInstalled,
        subscribed: !!state.subscribed,
        lastEvent: state.lastEvent || "",
        lastEventAt: state.lastEventAt || 0,
        lastSourceAt: state.lastSourceAt || 0,
        startedAt: state.startedAt || 0,
        endedAt: state.endedAt || 0,
        lastTimeUpdateAt: state.lastTimeUpdateAt || 0,
        currentTimeMs: Number.isFinite(state.currentTimeMs) ? state.currentTimeMs : (media ? Math.round((media.currentTime || 0) * 1000) : 0),
        totalTimeMs: Number.isFinite(state.totalTimeMs) ? state.totalTimeMs : (media && Number.isFinite(media.duration) ? Math.round(media.duration * 1000) : 0),
        isPlaying: typeof state.isPlaying === "boolean" ? state.isPlaying : !!(media && !media.paused && !media.ended),
        eventSource: state.eventSource || ""
    };
}

function getEdxSpeakingRuntimeSnapshot() {
    const state = window.__EDX_SPEAKING_RUNTIME__ || {};
    return {
        hookInstalled: !!state.hookInstalled,
        lastEvent: state.lastEvent || "",
        lastEventAt: state.lastEventAt || 0,
        activeKey: state.activeKey || "",
        resetAt: state.resetAt || 0,
        speechStartedAt: state.speechStartedAt || 0,
        recognitionCompletedAt: state.recognitionCompletedAt || 0,
        recognizerReadyAt: state.recognizerReadyAt || 0,
        micAllowedAt: state.micAllowedAt || 0,
        lastReason: state.lastReason || "",
        lastDescription: state.lastDescription || "",
        lastResultSummary: state.lastResultSummary || ""
    };
}

function resetEdxSpeakingRuntimeForAttempt(activeKey) {
    const state = window.__EDX_SPEAKING_RUNTIME__ || (window.__EDX_SPEAKING_RUNTIME__ = {});
    state.activeKey = activeKey || "";
    state.resetAt = Date.now();
    state.lastEvent = "reset";
    state.lastEventAt = state.resetAt;
    state.speechStartedAt = 0;
    state.recognitionCompletedAt = 0;
    state.recognizerReadyAt = 0;
    state.micAllowedAt = 0;
    state.lastReason = "";
    state.lastDescription = "";
    state.lastResultSummary = "";
}

function waitForSpeakingLifecycleCompletion(options = {}) {
    const startedAt = Number.isFinite(options.startedAt) ? options.startedAt : Date.now();
    const minElapsedMs = Number.isFinite(options.minElapsedMs) ? options.minElapsedMs : 6500;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 24000;
    const completionUi = typeof options.completionUi === "function" ? options.completionUi : null;
    return new Promise((resolve) => {
        const poll = () => {
            const now = Date.now();
            const elapsedMs = now - startedAt;
            const runtime = getEdxSpeakingRuntimeSnapshot();
            const reason = String(runtime.lastReason || "").toLowerCase();
            const callbackSeen = runtime.recognitionCompletedAt >= startedAt - 250;
            const callbackStrong = callbackSeen && (reason === "ok" || reason === "nomatch" || reason === "noinput");
            if (callbackStrong && elapsedMs >= minElapsedMs) {
                resolve({
                    status: "callback_completed",
                    reason,
                    runtime
                });
                return;
            }
            if (completionUi && completionUi(elapsedMs, minElapsedMs)) {
                resolve({
                    status: "ui_completed",
                    reason,
                    runtime
                });
                return;
            }
            if (elapsedMs >= timeoutMs) {
                resolve({
                    status: "timeout",
                    reason,
                    runtime
                });
                return;
            }
            setTimeout(poll, 250);
        };
        setTimeout(poll, 350);
    });
}

function waitForInstructionMediaSatisfied(subtypeContext, options = {}) {
    const startedAt = Date.now();
    const minRunMs = Number.isFinite(options.minRunMs) ? options.minRunMs : 800;
    const maxWaitMs = Number.isFinite(options.maxWaitMs) ? options.maxWaitMs : 45000;
    const playBtn = options.playBtn || null;
    return new Promise((resolve) => {
        const poll = () => {
            const now = Date.now();
            const elapsedMs = now - startedAt;
            const runtime = getEdxMediaRuntimeSnapshot();
            const stillPlaying = typeof _isMediaPlaybackActive === "function" ? _isMediaPlaybackActive(playBtn) : false;
            const currentTimeMs = Math.max(runtime.currentTimeMs || 0, 0);
            const progressSatisfied = currentTimeMs >= minRunMs || (runtime.startedAt >= startedAt - 400 && elapsedMs >= minRunMs);
            const endedSatisfied = runtime.endedAt >= startedAt - 400 && elapsedMs >= minRunMs;
            if (endedSatisfied) {
                resolve({ status: "ended", runtime, subtype: subtypeContext?.subtype || "unknown" });
                return;
            }
            if (progressSatisfied) {
                resolve({ status: stillPlaying ? "progress_playing" : "progress_buffered", runtime, subtype: subtypeContext?.subtype || "unknown" });
                return;
            }
            if (elapsedMs >= maxWaitMs) {
                resolve({ status: "timeout", runtime, subtype: subtypeContext?.subtype || "unknown" });
                return;
            }
            setTimeout(poll, 250);
        };
        setTimeout(poll, 350);
    });
}

function installEdxLifecycleHooks() {
    if (window.__EDX_LIFECYCLE_HOOKS_INSTALLED__) return;
    window.__EDX_LIFECYCLE_HOOKS_INSTALLED__ = true;
    const markMedia = (patch = {}) => {
        const state = window.__EDX_MEDIA_RUNTIME__ || (window.__EDX_MEDIA_RUNTIME__ = {});
        Object.assign(state, patch, { lastEventAt: Date.now() });
    };
    const markSpeaking = (patch = {}) => {
        const state = window.__EDX_SPEAKING_RUNTIME__ || (window.__EDX_SPEAKING_RUNTIME__ = {});
        Object.assign(state, patch, { lastEventAt: Date.now() });
    };
    const attachMediaElHooks = () => {
        const mediaEls = document.querySelectorAll("video, audio");
        mediaEls.forEach((media) => {
            if (media.__edxLifecycleHooked) return;
            media.__edxLifecycleHooked = true;
            ["play", "playing"].forEach((eventName) => media.addEventListener(eventName, () => {
                markMedia({
                    hookInstalled: true,
                    eventSource: "html5_media",
                    lastEvent: eventName,
                    startedAt: Date.now(),
                    isPlaying: true,
                    currentTimeMs: Math.round((media.currentTime || 0) * 1000),
                    totalTimeMs: Number.isFinite(media.duration) ? Math.round(media.duration * 1000) : 0
                });
            }, true));
            media.addEventListener("timeupdate", () => {
                markMedia({
                    hookInstalled: true,
                    eventSource: "html5_media",
                    lastEvent: "timeUpdate",
                    lastTimeUpdateAt: Date.now(),
                    currentTimeMs: Math.round((media.currentTime || 0) * 1000),
                    totalTimeMs: Number.isFinite(media.duration) ? Math.round(media.duration * 1000) : 0,
                    isPlaying: !media.paused && !media.ended
                });
            }, true);
            ["pause", "ended"].forEach((eventName) => media.addEventListener(eventName, () => {
                markMedia({
                    hookInstalled: true,
                    eventSource: "html5_media",
                    lastEvent: eventName,
                    endedAt: eventName === "ended" ? Date.now() : 0,
                    isPlaying: false,
                    currentTimeMs: Math.round((media.currentTime || 0) * 1000),
                    totalTimeMs: Number.isFinite(media.duration) ? Math.round(media.duration * 1000) : 0
                });
            }, true));
        });
    };
    const poll = () => {
        attachMediaElHooks();
        try {
            const $ = window.jQuery || window.$;
            if ($ && typeof $.subscribe === "function" && !window.__EDX_MEDIA_RUNTIME__?.subscribed) {
                $.subscribe("syncAudioNotify", function (_evt, data) {
                    const name = data?.name || "";
                    markMedia({
                        hookInstalled: true,
                        subscribed: true,
                        eventSource: "syncAudioNotify",
                        lastEvent: name,
                        startedAt: name === "timeUpdate" ? ((window.__EDX_MEDIA_RUNTIME__?.startedAt) || Date.now()) : (window.__EDX_MEDIA_RUNTIME__?.startedAt || 0),
                        endedAt: name === "onEndOfStream" ? Date.now() : (window.__EDX_MEDIA_RUNTIME__?.endedAt || 0),
                        lastSourceAt: name === "onSourceChanged" ? Date.now() : (window.__EDX_MEDIA_RUNTIME__?.lastSourceAt || 0),
                        lastTimeUpdateAt: name === "timeUpdate" ? Date.now() : (window.__EDX_MEDIA_RUNTIME__?.lastTimeUpdateAt || 0),
                        currentTimeMs: Number.isFinite(data?.currentTime) ? Math.round(data.currentTime * 1000) : (window.__EDX_MEDIA_RUNTIME__?.currentTimeMs || 0),
                        totalTimeMs: Number.isFinite(data?.totalTime) ? Math.round(data.totalTime * 1000) : (window.__EDX_MEDIA_RUNTIME__?.totalTimeMs || 0),
                        isPlaying: name === "timeUpdate"
                    });
                });
                markMedia({ hookInstalled: true, subscribed: true, lastEvent: "subscribed" });
            }
        } catch (_) { }
        try {
            const pm = window.SR?.PM;
            if (pm) {
                const wrapPmFn = (key, updater) => {
                    const current = pm[key];
                    if (typeof current !== "function" || current.__edxLifecycleWrapped) return;
                    const wrapped = function (...args) {
                        try { updater(...args); } catch (_) { }
                        return current.apply(this, args);
                    };
                    wrapped.__edxLifecycleWrapped = true;
                    pm[key] = wrapped;
                    markSpeaking({ hookInstalled: true, lastEvent: `hook:${key}` });
                };
                wrapPmFn("speechStarted", () => {
                    markSpeaking({
                        hookInstalled: true,
                        lastEvent: "speechStarted",
                        speechStartedAt: Date.now()
                    });
                });
                wrapPmFn("recognizerReady", () => {
                    markSpeaking({
                        hookInstalled: true,
                        lastEvent: "recognizerReady",
                        recognizerReadyAt: Date.now()
                    });
                });
                wrapPmFn("micAllowed", () => {
                    markSpeaking({
                        hookInstalled: true,
                        lastEvent: "micAllowed",
                        micAllowedAt: Date.now()
                    });
                });
                wrapPmFn("recognitionCompleted", (reason, result, description) => {
                    let summary = "";
                    try {
                        summary = typeof result?.get === "function"
                            ? String(result.get("result.interpretation.instance.nl.slot.content", result.get("answer_id", "")) || "")
                            : "";
                    } catch (_) { }
                    markSpeaking({
                        hookInstalled: true,
                        lastEvent: "recognitionCompleted",
                        recognitionCompletedAt: Date.now(),
                        lastReason: String(reason || "").toLowerCase(),
                        lastDescription: String(description || ""),
                        lastResultSummary: summary
                    });
                });
            }
        } catch (_) { }
        setTimeout(poll, 900);
    };
    poll();
}

installEdxLifecycleHooks();

function getQuestionGroupFromType(qType, pageTypeHint) {
    const pageType = pageTypeHint || (typeof detectPageType === "function" ? detectPageType() : "unknown");
    const nonQuestionKind = typeof getNonQuestionPageKind === "function" ? getNonQuestionPageKind() : null;
    if (pageType !== "question" && nonQuestionKind) return "instruction_media";
    switch (qType) {
        case "dnd":
        case "dnd_sequence":
        case "dnd_classification":
            return "dnd";
        case "speaking":
            return "speaking";
        case "card_match":
        case "unsupported_memory":
            return "memory";
        case "writing":
            return "writing";
        case "mcq":
            return "mcq";
        case "checkbox":
            return "checkbox";
        case "ddl":
            return "ddl";
        case "text":
            return "text";
        case "sentence_fit":
            return "sentence_fit";
        default:
            return pageType !== "question" && nonQuestionKind ? "instruction_media" : "unknown";
    }
}

function collectSubtypeDomSignals() {
    const bodyText = norm(document.body?.innerText || "");
    const pageTitle = norm(document.querySelector(".learning__headerIW, .learning__dropDownListTitle")?.textContent || "");
    const playPause = document.querySelector("#play-pause, #CTrackerPlayBtn");
    const videoEl = document.querySelector("video");
    const audioEl = document.querySelector("audio");
    return {
        bodyText,
        pageTitle,
        hasClassification: !!document.querySelector(".answersWrapper.classificationW"),
        hasMatchColumns: !!document.querySelector(".answersWrapper.mtch"),
        hasTextToPicture: !!document.querySelector(".answersWrapper.textToPicture"),
        hasCloseWithPicture: !!document.querySelector(".answersWrapper.close.closeWithPicture"),
        hasCloseWithBubbles: !!document.querySelector(".answersWrapper.close.closeWithBubbles"),
        hasClosePlain: !!document.querySelector(".answersWrapper.close") && !document.querySelector(".answersWrapper.close.closeWithPicture, .answersWrapper.close.closeWithBubbles"),
        hasSequenceImage: !!document.querySelector(".sequenceImage"),
        hasSequenceText: !!document.querySelector(".sequence"),
        hasWordsBankTable: !!document.querySelector("#TTpTablePlaceHolder.wordsBankTable, .wordsBankTable"),
        hasTTpAnswerDiv: !!document.querySelector(".TTpanswerDiv.droptarget, .TTpanswerDiv"),
        hasMemoryGame: !!document.querySelector(".answersWrapper.memoryGame, .MemoGUl, .MemoGCardcontainer"),
        hasSpeakingInteract1: !!document.querySelector("#interact1, .answersWrapper.speakingInteract.improveYourself"),
        hasSpeakingChoiceRecord: !!document.querySelector(".speakingInteract .chooseCaracterArrow, .speakingInteract .recordingPanelSentence, .speakingInteract .RecordButtonWrapper"),
        hasSpeakingBubbleRecord: !!document.querySelector(".answersWrapper.interact2 .bubblesContainer, .answersWrapper.interact2 .recordingPanelSentence"),
        hasOpenSpeaking: !!document.querySelector(".questionAnswersSet.recorder, .questionAnswersSet .statusWrapper .button.continue"),
        hasRtcStatusIcon: !!document.querySelector(".statusIcon"),
        hasSpeakingContinue: !!document.querySelector(".button.continue, .continueWrapper .button.continue"),
        hasSpeakingPlayAll: !!document.querySelector("#interact1PlayAll, .button.startAgain"),
        hasMediaControls: typeof hasVisibleMediaControls === "function" ? hasVisibleMediaControls() : false,
        hasStandaloneResourceArea: typeof hasVisibleStandaloneResourceArea === "function" ? hasVisibleStandaloneResourceArea() : false,
        hasMultiResourceTabs: !!document.querySelector(".learning__RAMultiResTabs, .learning__RAMultiResTab"),
        hasVideoElement: !!videoEl,
        hasAudioElement: !!audioEl,
        isMediaPlaying: !!((videoEl && !videoEl.paused && !videoEl.ended) || (audioEl && !audioEl.paused && !audioEl.ended) ||
            (playPause && (
                playPause.classList.contains("layout_mediaPlayPause--pause") ||
                playPause.classList.contains("layout__mediaPlayPause--pause") ||
                playPause.classList.contains("playing")
            )))
    };
}

function collectSubtypeMediaSignals(domSignals) {
    const signals = domSignals || collectSubtypeDomSignals();
    const runtime = getEdxMediaRuntimeSnapshot();
    return {
        hasMediaControls: !!signals.hasMediaControls,
        hasStandaloneResourceArea: !!signals.hasStandaloneResourceArea,
        hasMultiResourceTabs: !!signals.hasMultiResourceTabs,
        hasVideoElement: !!signals.hasVideoElement,
        hasAudioElement: !!signals.hasAudioElement,
        isPlaying: !!signals.isMediaPlaying || !!runtime.isPlaying,
        runtime
    };
}

function collectSubtypeSpeakingSignals(domSignals) {
    const signals = domSignals || collectSubtypeDomSignals();
    const runtime = getEdxSpeakingRuntimeSnapshot();
    return {
        hasSpeakingInteract1: !!signals.hasSpeakingInteract1,
        hasSpeakingChoiceRecord: !!signals.hasSpeakingChoiceRecord,
        hasSpeakingBubbleRecord: !!signals.hasSpeakingBubbleRecord,
        hasOpenSpeaking: !!signals.hasOpenSpeaking,
        hasRtcStatusIcon: !!signals.hasRtcStatusIcon,
        hasContinue: !!signals.hasSpeakingContinue,
        hasPlayAll: !!signals.hasSpeakingPlayAll,
        hasRealSpeakingUi: typeof hasRealSpeakingUi === "function" ? hasRealSpeakingUi() : false,
        runtime
    };
}

function buildSubtypeContext(overrides = {}) {
    const qType = overrides.qType || __qType || "unknown";
    const pageType = overrides.pageType || (typeof detectPageType === "function" ? detectPageType() : "unknown");
    const domSignals = collectSubtypeDomSignals();
    const group = overrides.group || getQuestionGroupFromType(qType, pageType);
    const pageIdentity = window.__EDX_CONTROL_PLANE__?.capturePageIdentity?.({
        pageType,
        questionType: qType
    }) || null;
    return {
        group,
        subtype: "unknown",
        qType,
        pageType,
        pageSignature: typeof getPageSignature === "function" ? getPageSignature() : "",
        apiPayload: overrides.apiPayload || {
            answers: Array.isArray(__ans) ? [...__ans] : [],
            allAnswers: Array.isArray(__allAns) ? [...__allAns] : [],
            ansUrl: __lastFetchedUrl || ""
        },
        domSignals,
        mediaSignals: collectSubtypeMediaSignals(domSignals),
        speakingSignals: collectSubtypeSpeakingSignals(domSignals),
        pageIdentity,
        nonQuestionKind: typeof getNonQuestionPageKind === "function" ? getNonQuestionPageKind() : null
    };
}

function createSubtypeResult(status, overrides = {}) {
    const context = overrides.context || __qSubtypeContext || buildSubtypeContext(overrides);
    return {
        status: status || "waiting",
        reason: overrides.reason || "",
        remaining: Number.isFinite(overrides.remaining) ? overrides.remaining : null,
        safeToNext: !!overrides.safeToNext,
        handled: !!overrides.handled,
        verified: !!overrides.verified,
        group: context.group,
        subtype: context.subtype,
        qType: context.qType,
        pageIdentity: context.pageIdentity
    };
}

function applySubtypeFallback(context, subtype, reason = "") {
    const base = context || buildSubtypeContext();
    const next = {
        ...base,
        subtype: subtype || "unknown",
        fallbackReason: reason || ""
    };
    __qGroup = next.group;
    __qSubtype = next.subtype;
    __qSubtypeContext = next;
    try {
        __EDX_STORE__.patch({
            pageType: next.pageType,
            questionType: next.qType,
            subtype: {
                group: next.group,
                subtype: next.subtype,
                pageSignature: next.pageSignature,
                nonQuestionKind: next.nonQuestionKind || "",
                fallbackReason: next.fallbackReason || "",
                detectedAt: Date.now()
            }
        });
    } catch (_) { }
    if (window.__EDX_CONTROL_PLANE__?.note) {
        window.__EDX_CONTROL_PLANE__.note("subtype.fallback", {
            group: next.group,
            subtype: next.subtype,
            reason: next.fallbackReason || "",
            pageType: next.pageType,
            questionType: next.qType
        });
    }
    return next;
}

function shouldHardWaitForUnknownSubtype(context) {
    const ctx = context || __qSubtypeContext;
    if (!ctx || ctx.subtype !== "unknown") return false;
    switch (ctx.group) {
        case "speaking":
        case "instruction_media":
        case "unknown":
            return true;
        default:
            return false;
    }
}

function resolveDndSubtypeFallback(context) {
    const ctx = context || buildSubtypeContext({ qType: "dnd" });
    if (!ctx || ctx.group !== "dnd") return "";
    const zones = getDndZones(true);
    if (ctx.qType === "dnd_classification" || ctx.domSignals.hasClassification) return "classification_grid";
    if (ctx.domSignals.hasMatchColumns) return "match_columns";
    if (ctx.domSignals.hasTextToPicture) return "ttp_text_to_picture";
    if (ctx.qType === "dnd_sequence" && ctx.domSignals.hasSequenceImage) return "sequence_image";
    if (ctx.qType === "dnd_sequence") return "sequence_text";
    if (ctx.domSignals.hasCloseWithBubbles) return "cloze_bubbles_bank";
    if (ctx.domSignals.hasCloseWithPicture) return "cloze_picture_bank";
    if (ctx.domSignals.hasClosePlain || ctx.domSignals.hasWordsBankTable || ctx.domSignals.hasTTpAnswerDiv || zones.length > 0) {
        return "cloze_text_bank";
    }
    return "";
}

function __genericSubtypeRun() {
    return null;
}

function __genericSubtypeVerify() {
    return false;
}

const __EDX_SUBTYPE_REGISTRY__ = [
    {
        group: "dnd",
        subtype: "classification_grid",
        detect: (ctx) => ctx.qType === "dnd_classification" || ctx.domSignals.hasClassification,
        run: () => null,
        verify: () => areAllDndZonesSatisfied(getDndZones(true)),
        canAutoNext: (ctx) => ctx.group === "dnd" && areAllDndZonesSatisfied(getDndZones(true))
    },
    {
        group: "dnd",
        subtype: "match_columns",
        detect: (ctx) => ctx.domSignals.hasMatchColumns,
        run: () => null,
        verify: () => areAllDndZonesSatisfied(getDndZones(true)),
        canAutoNext: () => areAllDndZonesSatisfied(getDndZones(true))
    },
    {
        group: "dnd",
        subtype: "ttp_text_to_picture",
        detect: (ctx) => ctx.domSignals.hasTextToPicture,
        run: () => null,
        verify: () => areAllDndZonesSatisfied(getDndZones(true)),
        canAutoNext: () => areAllDndZonesSatisfied(getDndZones(true))
    },
    {
        group: "dnd",
        subtype: "cloze_picture_bank",
        detect: (ctx) => ctx.qType === "dnd" && ctx.domSignals.hasCloseWithPicture,
        run: () => null,
        verify: () => areAllDndZonesSatisfied(getDndZones(true)),
        canAutoNext: () => areAllDndZonesSatisfied(getDndZones(true))
    },
    {
        group: "dnd",
        subtype: "cloze_bubbles_bank",
        detect: (ctx) => ctx.qType === "dnd" && ctx.domSignals.hasCloseWithBubbles,
        run: () => null,
        verify: () => areAllDndZonesSatisfied(getDndZones(true)),
        canAutoNext: () => areAllDndZonesSatisfied(getDndZones(true))
    },
    {
        group: "dnd",
        subtype: "cloze_text_bank",
        detect: (ctx) => {
            if (ctx.qType !== "dnd") return false;
            const hasBank = !!document.querySelector("#TTpTablePlaceHolder, .wordsBankTable, .wordsBankWrapper");
            const hasDragTiles = !!document.querySelector(".draggableContainer, .draggable.wordBankTile, .wordBankTile");
            const hasPotentialDropTargets = !!document.querySelector(
                ".TTpanswerDiv, .droptarget, .answerTd.empty, .answerTd.droptarget, " +
                ".SeqTxtImgMarkAnswerDiv, [ed-trackable-drop*='User_Answer'], [trackable-drop*='User_Answer']"
            );
            return (ctx.domSignals.hasClosePlain || hasBank) && hasDragTiles && hasPotentialDropTargets;
        },
        run: () => null,
        verify: () => areAllDndZonesSatisfied(getDndZones(true)),
        canAutoNext: () => areAllDndZonesSatisfied(getDndZones(true))
    },
    {
        group: "dnd",
        subtype: "sequence_image",
        detect: (ctx) => ctx.qType === "dnd_sequence" && ctx.domSignals.hasSequenceImage,
        run: () => null,
        verify: __genericSubtypeVerify,
        canAutoNext: () => true
    },
    {
        group: "dnd",
        subtype: "sequence_text",
        detect: (ctx) => ctx.qType === "dnd_sequence" && ctx.domSignals.hasSequenceText,
        run: () => null,
        verify: __genericSubtypeVerify,
        canAutoNext: () => true
    },
    {
        group: "speaking",
        subtype: "interact_choose_sequence",
        detect: (ctx) => ctx.speakingSignals.hasSpeakingInteract1,
        run: __genericSubtypeRun,
        verify: (ctx) => {
            const runtime = ctx.speakingSignals.runtime || getEdxSpeakingRuntimeSnapshot();
            return runtime.recognitionCompletedAt > 0 || ctx.speakingSignals.hasContinue;
        },
        canAutoNext: () => false
    },
    {
        group: "speaking",
        subtype: "speaking_choice_record_rtc",
        detect: (ctx) => ctx.speakingSignals.hasSpeakingChoiceRecord && ctx.speakingSignals.hasRtcStatusIcon,
        run: __genericSubtypeRun,
        verify: (ctx) => {
            const runtime = ctx.speakingSignals.runtime || getEdxSpeakingRuntimeSnapshot();
            return runtime.recognitionCompletedAt > 0;
        },
        canAutoNext: () => false
    },
    {
        group: "speaking",
        subtype: "speaking_choice_record",
        detect: (ctx) => ctx.speakingSignals.hasSpeakingChoiceRecord,
        run: __genericSubtypeRun,
        verify: (ctx) => {
            const runtime = ctx.speakingSignals.runtime || getEdxSpeakingRuntimeSnapshot();
            return runtime.recognitionCompletedAt > 0;
        },
        canAutoNext: () => false
    },
    {
        group: "speaking",
        subtype: "speaking_bubble_record_rtc",
        detect: (ctx) => ctx.speakingSignals.hasSpeakingBubbleRecord && ctx.speakingSignals.hasRtcStatusIcon,
        run: __genericSubtypeRun,
        verify: (ctx) => {
            const runtime = ctx.speakingSignals.runtime || getEdxSpeakingRuntimeSnapshot();
            return runtime.recognitionCompletedAt > 0;
        },
        canAutoNext: () => false
    },
    {
        group: "speaking",
        subtype: "speaking_bubble_record",
        detect: (ctx) => ctx.speakingSignals.hasSpeakingBubbleRecord,
        run: __genericSubtypeRun,
        verify: (ctx) => {
            const runtime = ctx.speakingSignals.runtime || getEdxSpeakingRuntimeSnapshot();
            return runtime.recognitionCompletedAt > 0;
        },
        canAutoNext: () => false
    },
    {
        group: "speaking",
        subtype: "open_speaking",
        detect: (ctx) => ctx.speakingSignals.hasOpenSpeaking,
        run: __genericSubtypeRun,
        verify: (ctx) => {
            const runtime = ctx.speakingSignals.runtime || getEdxSpeakingRuntimeSnapshot();
            return runtime.recognitionCompletedAt > 0;
        },
        canAutoNext: () => false
    },
    {
        group: "instruction_media",
        subtype: "start_test",
        detect: (ctx) => ctx.pageType === "start_test" || ctx.nonQuestionKind === "start_test",
        run: __genericSubtypeRun,
        verify: () => true,
        canAutoNext: () => true
    },
    {
        group: "instruction_media",
        subtype: "instruction_multi_resource",
        detect: (ctx) => ctx.pageType !== "question" && ctx.mediaSignals.hasMultiResourceTabs && ctx.mediaSignals.hasMediaControls,
        run: __genericSubtypeRun,
        verify: (ctx) => {
            const runtime = ctx.mediaSignals.runtime || getEdxMediaRuntimeSnapshot();
            return (runtime.currentTimeMs || 0) >= 700 || runtime.endedAt > 0;
        },
        canAutoNext: (ctx) => verifySubtypeContext(ctx)
    },
    {
        group: "instruction_media",
        subtype: "instruction_video_only",
        detect: (ctx) => ctx.pageType !== "question" && ctx.mediaSignals.hasMediaControls && ctx.mediaSignals.hasVideoElement,
        run: __genericSubtypeRun,
        verify: (ctx) => {
            const runtime = ctx.mediaSignals.runtime || getEdxMediaRuntimeSnapshot();
            return (runtime.currentTimeMs || 0) >= 700 || runtime.endedAt > 0;
        },
        canAutoNext: (ctx) => verifySubtypeContext(ctx)
    },
    {
        group: "instruction_media",
        subtype: "instruction_audio_only",
        detect: (ctx) => ctx.pageType !== "question" && ctx.mediaSignals.hasMediaControls && ctx.mediaSignals.hasAudioElement && !ctx.mediaSignals.hasVideoElement,
        run: __genericSubtypeRun,
        verify: (ctx) => {
            const runtime = ctx.mediaSignals.runtime || getEdxMediaRuntimeSnapshot();
            return (runtime.currentTimeMs || 0) >= 700 || runtime.endedAt > 0;
        },
        canAutoNext: (ctx) => verifySubtypeContext(ctx)
    },
    {
        group: "instruction_media",
        subtype: "instruction_text_only",
        detect: (ctx) => ctx.pageType !== "question" && ctx.nonQuestionKind === "instruction_text",
        run: __genericSubtypeRun,
        verify: () => true,
        canAutoNext: () => true
    },
    {
        group: "instruction_media",
        subtype: "prepare_custom",
        detect: (ctx) => ctx.pageType !== "question" && ctx.domSignals.pageTitle.includes("step 1 prepare"),
        run: __genericSubtypeRun,
        verify: (ctx) => {
            if (ctx.nonQuestionKind === "instruction_text" && !ctx.mediaSignals.hasMediaControls) return true;
            const runtime = ctx.mediaSignals.runtime || getEdxMediaRuntimeSnapshot();
            return (runtime.currentTimeMs || 0) >= 700 || runtime.endedAt > 0;
        },
        canAutoNext: (ctx) => verifySubtypeContext(ctx)
    },
    {
        group: "memory",
        subtype: "memory_flip_pairs",
        detect: (ctx) => ctx.domSignals.hasMemoryGame,
        run: __genericSubtypeRun,
        verify: __genericSubtypeVerify,
        canAutoNext: () => false
    },
    {
        group: "mcq",
        subtype: "mcq_basic",
        detect: (ctx) => ctx.qType === "mcq",
        run: __genericSubtypeRun,
        verify: __genericSubtypeVerify,
        canAutoNext: () => false
    },
    {
        group: "checkbox",
        subtype: "checkbox_basic",
        detect: (ctx) => ctx.qType === "checkbox",
        run: __genericSubtypeRun,
        verify: __genericSubtypeVerify,
        canAutoNext: () => false
    },
    {
        group: "ddl",
        subtype: "ddl_basic",
        detect: (ctx) => ctx.qType === "ddl",
        run: __genericSubtypeRun,
        verify: __genericSubtypeVerify,
        canAutoNext: () => false
    },
    {
        group: "text",
        subtype: "text_basic",
        detect: (ctx) => ctx.qType === "text",
        run: __genericSubtypeRun,
        verify: __genericSubtypeVerify,
        canAutoNext: () => false
    },
    {
        group: "sentence_fit",
        subtype: "sentence_fit_basic",
        detect: (ctx) => ctx.qType === "sentence_fit",
        run: __genericSubtypeRun,
        verify: __genericSubtypeVerify,
        canAutoNext: () => false
    },
    {
        group: "writing",
        subtype: "writing_editor",
        detect: (ctx) => ctx.group === "writing",
        run: __genericSubtypeRun,
        verify: __genericSubtypeVerify,
        canAutoNext: () => false
    }
];

function getSubtypeSpec(subtype, group) {
    return __EDX_SUBTYPE_REGISTRY__.find((entry) => entry.subtype === subtype && (!group || entry.group === group)) || null;
}

function detectQuestionSubtype(overrides = {}) {
    const context = buildSubtypeContext(overrides);
    const spec = __EDX_SUBTYPE_REGISTRY__.find((entry) => entry.group === context.group && entry.detect(context)) || null;
    context.subtype = spec?.subtype || "unknown";
    if (context.subtype === "unknown" && context.group === "dnd") {
        const fallbackSubtype = resolveDndSubtypeFallback(context);
        if (fallbackSubtype) {
            context.subtype = fallbackSubtype;
            context.fallbackReason = "dnd_family_fallback";
        }
    }
    __qGroup = context.group;
    __qSubtype = context.subtype;
    __qSubtypeContext = context;
    try {
        __EDX_STORE__.patch({
            pageType: context.pageType,
            questionType: context.qType,
            subtype: {
                group: context.group,
                subtype: context.subtype,
                pageSignature: context.pageSignature,
                nonQuestionKind: context.nonQuestionKind || "",
                fallbackReason: context.fallbackReason || "",
                detectedAt: Date.now()
            }
        });
    } catch (_) {}
    if (window.__EDX_CONTROL_PLANE__?.note) {
        window.__EDX_CONTROL_PLANE__.note("subtype.detected", {
            group: context.group,
            subtype: context.subtype,
            pageType: context.pageType,
            questionType: context.qType,
            nonQuestionKind: context.nonQuestionKind || "",
            fallbackReason: context.fallbackReason || ""
        });
    }
    return context;
}

function recordSubtypeResult(input, overrides = {}) {
    const result = {
        ...(createSubtypeResult(input?.status || "waiting", overrides)),
        ...(input || {})
    };
    __qSubtypeResult = result;
    try {
        __EDX_STORE__.patch({
            subtype: {
                group: result.group,
                subtype: result.subtype,
                status: result.status,
                reason: result.reason,
                safeToNext: !!result.safeToNext,
                remaining: result.remaining,
                updatedAt: Date.now()
            }
        });
    } catch (_) {}
    if (window.__EDX_CONTROL_PLANE__?.note) {
        window.__EDX_CONTROL_PLANE__.note("subtype.result", {
            group: result.group,
            subtype: result.subtype,
            status: result.status,
            reason: result.reason,
            safeToNext: !!result.safeToNext,
            remaining: result.remaining
        });
    }
    return result;
}

function verifySubtypeContext(context) {
    const ctx = context || __qSubtypeContext;
    if (!ctx || !ctx.subtype || ctx.subtype === "unknown") return false;
    const spec = getSubtypeSpec(ctx.subtype, ctx.group);
    if (!spec || typeof spec.verify !== "function") return false;
    try {
        return !!spec.verify(ctx);
    } catch (_) {
        return false;
    }
}

function canSubtypeAutoNext(context) {
    const ctx = context || __qSubtypeContext;
    if (!ctx || !ctx.subtype || ctx.subtype === "unknown") return false;
    const spec = getSubtypeSpec(ctx.subtype, ctx.group);
    if (!spec || typeof spec.canAutoNext !== "function") return false;
    try {
        return !!spec.canAutoNext(ctx);
    } catch (_) {
        return false;
    }
}
