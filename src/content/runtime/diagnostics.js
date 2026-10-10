function __edxCaptureNorm(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
}

function __edxCaptureNodeAttrs(node, keys = []) {
    const out = {};
    if (!node || typeof node.getAttribute !== "function") return out;
    keys.forEach((key) => {
        const value = node.getAttribute(key);
        if (value !== null && value !== "") out[key] = value;
    });
    return out;
}

function __edxCaptureRect(node) {
    if (!node || typeof node.getBoundingClientRect !== "function") return null;
    const rect = node.getBoundingClientRect();
    return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
    };
}

function __edxCaptureQuestionTexts() {
    const nodes = [...document.querySelectorAll(".TextDiv, .bubbleItem, .learning__stepInstructionsText, .learning__stepInstructionsTitle, .learning__dropDownListTitle, .question, .prompt")];
    const unique = [];
    nodes.forEach((node) => {
        const text = __edxCaptureNorm(node.innerText || node.textContent || "");
        if (!text) return;
        if (unique.includes(text)) return;
        unique.push(text);
    });
    return unique.slice(0, 8);
}

function __edxCaptureHtmlSnippet(node, maxLen = 600) {
    if (!node) return "";
    const html = String(node.outerHTML || "").replace(/\s+/g, " ").trim();
    if (!html) return "";
    return html.length > maxLen ? `${html.slice(0, maxLen)}...` : html;
}

function __edxCaptureElementSummary(node, attrs = []) {
    if (!node) return null;
    return {
        tag: String(node.tagName || "").toLowerCase(),
        className: node.className || "",
        text: __edxCaptureNorm(node.innerText || node.textContent || "").slice(0, 240),
        attrs: __edxCaptureNodeAttrs(node, attrs),
        rect: __edxCaptureRect(node),
        html: __edxCaptureHtmlSnippet(node)
    };
}

function __edxCaptureRuntimeFlags() {
    return {
        autoNext: typeof __autoNext !== "undefined" ? __autoNext : "",
        qType: typeof __qType !== "undefined" ? __qType : "",
        ansCount: Array.isArray(window.__ans) ? window.__ans.length : 0,
        dndInProgress: !!window.__dndInProgress,
        dndDone: !!window.__dndDone,
        dndUserDrag: !!window.__dndUserDrag,
        typingInProgress: Number(window.__typingInProgress || 0),
        videoPlaying: !!window.__videoPlaying,
        speakingInProgress: !!window.__speakingInProgress,
        bridgeReady: !!window.edxBridge,
        authHasContext: !!__EDX_STORE__.getState()?.auth?.hasContext
    };
}

function __edxCaptureVisibleControls() {
    const controls = {
        nextButton: document.querySelector(".learning__nextItem, .nextItem, [class*='nextItem'], .learning__nextBtn, .nextBtn"),
        checkButton: typeof _findVisibleCheckAnswerButton === "function" ? _findVisibleCheckAnswerButton() : null,
        redoButton: document.querySelector(".redo, .redoBtn, [class*='redo'], .learning__redoBtn"),
        startTestButton: document.querySelector(".startTest, .start-test, [class*='startTest'], [class*='start-test']"),
        mediaPlayButton: document.querySelector("#play-pause, .learning__RAMRButton--play, [class*='RAMRButton--play']"),
        modal: document.querySelector(".modal, .modal-dialog, .BSModal, #BSModal")
    };
    return Object.fromEntries(
        Object.entries(controls).map(([key, node]) => [
            key,
            __edxCaptureElementSummary(node, ["id", "class", "aria-label", "data-id"])
        ])
    );
}

function __edxCaptureDomSnippets() {
    const questionRoot =
        document.querySelector("#rightDiv, .learning__practiceArea, .question, .pmContainer, .lessonAnswersWrapper") ||
        document.body;
    const bankRoot =
        document.querySelector("#TTpTablePlaceHolder, .wordsBankTable, .wordsBankWrapper, .dndBank, [class*='wordBank'], [class*='word-bank']") ||
        null;
    const zone = document.querySelector(".TTpanswerDiv, .droptarget, .answerTd.empty, .answerTd.droptarget, .SeqTxtImgMarkAnswerDiv");
    const mappedTile = zone && zone.getAttribute?.("ans")
        ? document.querySelector(`.draggable[data-id="${zone.getAttribute("ans")}"], .wordBankTile[data-id="${zone.getAttribute("ans")}"]`)
        : document.querySelector(".wordBankTilePlaced, .draggable.wordBankTilePlaced, .vCheck, .xCheck");
    return {
        questionRoot: __edxCaptureElementSummary(questionRoot, ["id", "class"]),
        bankRoot: __edxCaptureElementSummary(bankRoot, ["id", "class"]),
        firstZone: __edxCaptureElementSummary(zone, ["ans", "div", "qnum", "data-id", "ed-trackable-drop"]),
        firstMappedTile: __edxCaptureElementSummary(mappedTile, ["data-id", "data-qnum", "class"])
    };
}

function __edxCaptureDndZones() {
    const fallbackZones = [...document.querySelectorAll(".TTpanswerDiv, .droptarget, .answerTd.empty, .answerTd.droptarget, .SeqTxtImgMarkAnswerDiv")];
    const zones = typeof getDndZones === "function" ? (getDndZones(true) || []) : fallbackZones;
    return zones.map((zone, index) => {
        const expectedText = typeof getDndZoneExpectedText === "function"
            ? getDndZoneExpectedText(zone, index) || ""
            : "";
        const ans = zone.getAttribute?.("ans") || "";
        const tile = ans
            ? document.querySelector(`.draggable[data-id="${ans}"], .wordBankTile[data-id="${ans}"]`)
            : null;
        const checkedState = tile?.classList?.contains("vCheck")
            ? "correct"
            : tile?.classList?.contains("xCheck")
                ? "wrong"
                : "";
        const satisfied = typeof dndZoneIsSatisfied === "function"
            ? !!dndZoneIsSatisfied(zone, index)
            : false;
        return {
            index,
            tag: String(zone.tagName || "").toLowerCase(),
            className: zone.className || "",
            text: __edxCaptureNorm(zone.innerText || zone.textContent || ""),
            expectedText,
            satisfied,
            checkedState,
            attrs: __edxCaptureNodeAttrs(zone, ["ans", "div", "qnum", "data-id", "ed-trackable-drop"]),
            rect: __edxCaptureRect(zone),
            tile: tile ? {
                className: tile.className || "",
                text: __edxCaptureNorm(tile.innerText || tile.textContent || ""),
                attrs: __edxCaptureNodeAttrs(tile, ["data-id", "data-qnum"]),
                rect: __edxCaptureRect(tile)
            } : null
        };
    });
}

function __edxCaptureMarkerSummary() {
    const markers = {
        vCheck: document.querySelectorAll(".vCheck").length,
        xCheck: document.querySelectorAll(".xCheck").length,
        hotspot: document.querySelectorAll(".hotspot").length,
        noLine: document.querySelectorAll(".noLine").length,
        wordBankTilePlaced: document.querySelectorAll(".wordBankTilePlaced").length,
        reminderModal: !!document.querySelector(".modal, .modal-dialog, .BSModal, #BSModal")
    };
    const reminderText = document.querySelector(".modal, .modal-dialog, .BSModal, #BSModal")?.innerText || "";
    return {
        ...markers,
        reminderText: __edxCaptureNorm(reminderText).slice(0, 240)
    };
}

function __edxCaptureSubtypeState() {
    const runtime = __EDX_STORE__.getState();
    const context = typeof __qSubtypeContext !== "undefined" ? __qSubtypeContext : null;
    const result = typeof __qSubtypeResult !== "undefined" ? __qSubtypeResult : null;
    return {
        group: runtime?.subtype?.group || context?.group || "unknown",
        subtype: runtime?.subtype?.subtype || context?.subtype || "unknown",
        status: runtime?.subtype?.status || result?.status || "",
        reason: runtime?.subtype?.reason || result?.reason || "",
        safeToNext: !!(runtime?.subtype?.safeToNext || result?.safeToNext),
        remaining: Number.isFinite(runtime?.subtype?.remaining) ? runtime.subtype.remaining : (result?.remaining ?? null),
        fallbackReason: runtime?.subtype?.fallbackReason || context?.fallbackReason || "",
        pageSignature: runtime?.subtype?.pageSignature || context?.pageSignature || ""
    };
}

function __edxBuildCaptureBundle() {
    const snapshot = __EDX_DIAGNOSTICS__.getSnapshot();
    const runtime = snapshot.runtime || {};
    const subtype = __edxCaptureSubtypeState();
    const qType = runtime.questionType || "unknown";
    const group = subtype.group || "unknown";
    const dndZoneNodes = group === "dnd"
        ? (typeof getDndZones === "function"
            ? (getDndZones(true) || [])
            : [...document.querySelectorAll(".TTpanswerDiv, .droptarget, .answerTd.empty, .answerTd.droptarget, .SeqTxtImgMarkAnswerDiv")])
        : [];
    const dndZones = group === "dnd" ? __edxCaptureDndZones() : [];
    return {
        meta: {
            capturedAt: Date.now(),
            capturedIso: new Date().toISOString(),
            url: location.href,
            title: document.title || ""
        },
        arch: snapshot.arch,
        page: {
            pageType: runtime.pageType || "unknown",
            questionType: qType,
            pageIdentity: runtime.pageIdentity || {},
            currentAnswerSession: runtime.currentAnswerSession || {},
            subtype
        },
        runtimeFlags: __edxCaptureRuntimeFlags(),
        questionTexts: __edxCaptureQuestionTexts(),
        markers: __edxCaptureMarkerSummary(),
        controls: __edxCaptureVisibleControls(),
        dom: __edxCaptureDomSnippets(),
        dnd: group === "dnd" ? {
            zoneCount: dndZones.length,
            unsatisfiedCount: typeof countUnsatisfiedDndZones === "function" ? countUnsatisfiedDndZones(dndZoneNodes) : null,
            zones: dndZones
        } : null,
        logs: __EDX_LOGGER__.getEntries().slice(-40),
        consoleMirror: __EDX_LOGGER__.getConsoleEntries().slice(-50),
        tracePack: (__EDX_CONTROL_PLANE__?.getTracePack?.() || []).slice(-20),
        background: snapshot.background
    };
}

function __edxBuildCaptureMarkdown(bundle) {
    const data = bundle || __edxBuildCaptureBundle();
    const subtype = data?.page?.subtype || {};
    const header = [
        `## Subtype: ${subtype.subtype || "unknown"}`,
        "",
        "### Summary",
        `- URL: ${data?.meta?.url || ""}`,
        `- pageType: ${data?.page?.pageType || "unknown"}`,
        `- qType: ${data?.page?.questionType || "unknown"}`,
        `- group: ${subtype.group || "unknown"}`,
        `- subtype: ${subtype.subtype || "unknown"}`,
        `- status: ${subtype.status || ""}`,
        `- reason: ${subtype.reason || ""}`,
        `- safeToNext: ${String(!!subtype.safeToNext)}`,
        `- remaining: ${subtype.remaining ?? ""}`,
        "",
        "### Question Texts",
        "```text",
        ...(data.questionTexts || []),
        "```",
        "",
        "### Marker Summary",
        "```json",
        JSON.stringify(data.markers || {}, null, 2),
        "```",
        "",
        "### Runtime Flags",
        "```json",
        JSON.stringify(data.runtimeFlags || {}, null, 2),
        "```",
        "",
        "### Visible Controls",
        "```json",
        JSON.stringify(data.controls || {}, null, 2),
        "```",
        "",
        "### DOM Snippets",
        "```json",
        JSON.stringify(data.dom || {}, null, 2),
        "```",
        "",
        "### DnD Zones",
        "```json",
        JSON.stringify(data.dnd || null, null, 2),
        "```",
        "",
        "### Trace Pack",
        "```json",
        JSON.stringify(data.tracePack || [], null, 2),
        "```",
        "",
        "### Logs",
        "```json",
        JSON.stringify(data.logs || [], null, 2),
        "```",
        "",
        "### Console Mirror",
        "```json",
        JSON.stringify(data.consoleMirror || [], null, 2),
        "```"
    ];
    return header.join("\n");
}

function __edxDownloadCaptureBundle() {
    const bundle = __edxBuildCaptureBundle();
    const subtype = bundle?.page?.subtype?.subtype || "unknown";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `edx-capture-${subtype}-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
        URL.revokeObjectURL(link.href);
        link.remove();
    }, 0);
    return bundle;
}

const __EDX_DIAGNOSTICS__ = {
    background: null,
    lastBackgroundPollAt: 0,
    async pollBackground() {
        const snapshot = await __EDX_BACKGROUND_API__.getDiagnosticsSnapshot();
        if (!snapshot) return null;
        __EDX_DIAGNOSTICS__.background = snapshot;
        __EDX_DIAGNOSTICS__.lastBackgroundPollAt = Date.now();
        if (snapshot?.auth) {
            __EDX_STORE__.patch({
                auth: {
                    hasContext: !!snapshot.auth.hasContext,
                    requestUrl: snapshot.auth.requestUrl || "",
                    capturedAt: snapshot.auth.capturedAt || 0
                }
            });
        }
        return __EDX_DIAGNOSTICS__.background;
    },
    getSnapshot() {
        return {
            arch: {
                version: __EDX_ARCH__.version,
                buildMode: __EDX_ARCH__.buildMode,
                bootedAt: __EDX_ARCH__.bootedAt
            },
            runtime: __EDX_STORE__.getState(),
            background: __EDX_DIAGNOSTICS__.background,
            logs: __EDX_LOGGER__.getEntries().slice(-50),
            tracePack: __EDX_CONTROL_PLANE__?.getTracePack?.().slice(-15) || []
        };
    },
    getCaptureBundle() {
        return __edxBuildCaptureBundle();
    },
    getCaptureMarkdown() {
        return __edxBuildCaptureMarkdown(__edxBuildCaptureBundle());
    },
    downloadCaptureBundle() {
        return __edxDownloadCaptureBundle();
    }
};

window.__EDX_DIAGNOSTICS__ = __EDX_DIAGNOSTICS__;
__EDX_ARCH__.diagnostics = __EDX_DIAGNOSTICS__;
