// ========================= MAIN DND ENTRY POINT =========================
async function autoPlaceDndFirst(subtypeContext) {
    if (__dndInProgress || __dndUserDrag || __dndDone) {
        return { status: "waiting", reason: "dnd_busy", context: subtypeContext || __qSubtypeContext };
    }
    if (!__ans || __ans.length === 0) {
        return { status: "failed", reason: "missing_answers", context: subtypeContext || __qSubtypeContext };
    }

    // Set IMMEDIATELY to prevent observer from clearing __ans during zone detection
    __dndInProgress = true;
    try {
        const ctx = subtypeContext?.subtype ? subtypeContext : detectQuestionSubtype({ qType: __qType });
        if (!ctx || ctx.group !== "dnd") {
            _warn("[edx] DnD route rejected: invalid group", ctx?.group, ctx?.subtype);
            return { status: "failed", reason: "invalid_dnd_group", context: ctx };
        }
        let routeContext = ctx;
        if (routeContext.subtype === "unknown") {
            const fallbackSubtype = resolveDndSubtypeFallback(routeContext);
            if (!fallbackSubtype) {
                _warn("[edx] DnD subtype unresolved and no family fallback matched", routeContext?.group, routeContext?.domSignals);
                return { status: "failed", reason: "unresolved_dnd_fallback", context: routeContext };
            }
            routeContext = applySubtypeFallback(routeContext, fallbackSubtype, "dnd_family_fallback");
            _warn("[edx] DnD subtype unresolved, using family fallback", fallbackSubtype);
        }
        let allZones = getDndZones();
        if (!allZones.length) {
            for (let poll = 0; poll < 15 && !allZones.length; poll++) {
                await delay(200);
                allZones = getDndZones();
            }
        }
        if (!allZones.length) {
            _warn("[edx] DnD subtype detected but no zones found", routeContext.subtype);
            return { status: "failed", reason: "missing_dnd_zones", context: routeContext };
        }

        switch (routeContext.subtype) {
            case "classification_grid": {
                const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
                const dragTexts = Array.from(document.querySelectorAll(itemSelectors)).map((el) => norm(el.innerText || el.textContent));
                const ok = await autoFillClassification(dragTexts);
                if (ok) __dndDone = true;
                return { status: ok ? "handled" : "failed", reason: "classification_grid", context: routeContext };
            }
            case "match_columns":
                _log("[edx] DnD subtype route: match_columns");
                await autoFillMatchColumns(allZones);
                __dndDone = true;
                return { status: "handled", reason: "match_columns", context: routeContext };
            case "ttp_text_to_picture":
            case "cloze_text_bank":
            case "cloze_picture_bank":
            case "cloze_bubbles_bank": {
                const zonesForTTp = allZones.filter((z) =>
                    z.classList.contains("TTpanswerDiv") ||
                    z.classList.contains("droptarget") ||
                    z.hasAttribute("ed-trackable-drop") ||
                    z.hasAttribute("trackable-drop")
                );
                _log("[edx] DnD subtype route:", routeContext.subtype, "| zones:", zonesForTTp.length || allZones.length);
                await autoFillTTp(zonesForTTp.length ? zonesForTTp : allZones, { subtype: routeContext.subtype });
                __dndDone = true;
                return { status: "handled", reason: routeContext.subtype, context: routeContext };
            }
            case "sequence_text":
            case "sequence_image":
                _log("[edx] DnD subtype route deferred to sequence handler:", routeContext.subtype);
                return { status: "unsupported", reason: "sequence_routed_elsewhere", context: routeContext };
            default:
                _warn("[edx] DnD subtype unsupported in entry point:", routeContext.subtype);
                return { status: "unsupported", reason: "unsupported_dnd_subtype", context: routeContext };
        }
    } finally {
        __dndInProgress = false;
        try { _panelRestoreAfterDnD?.(); } catch (_) { }
    }
}

