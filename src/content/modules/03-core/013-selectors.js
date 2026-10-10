// ========================= SELECTORS =========================
const dndBankSel =
    ".dndBank, [id^='bank_'], ed-la-dndcloze, [dg_name='TTpTablePlaceHolder'], " +
    "#bankContainer .dndZone, .prCl__container--bank .dndZone, " +
    ".prMT_T2T__wordsBankWrapper .dndZone, .prCl__container--bank, " +
    "#TTpTablePlaceHolder, .wordsBankTable, " +
    "[class*='wordBank'], [class*='word-bank'], [class*='WordBank']";

const bankSelector =
    ".dndBank, [id^='bank_'], [dg_name='TTpTablePlaceHolder'], " +
    "#bankContainer .dndZone, .prCl__container--bank .dndZone, " +
    ".prMT_T2T__wordsBankWrapper .dndZone, .prCl__container--bank, " +
    "#TTpTablePlaceHolder, .wordsBankTable";

function getDndZones(includeMultiItem = false) {
    const selectors = ".dndZone, .dnd-target, [class*='dropZone'], [class*='drop-zone'], cdk-drop-list, [class*='droppable'], .prFITB__fieldBlanck.dnd-target, ed-la-dndcloze .dnd-target, .droptarget, .TTpanswerDiv, .TTpanswerDiv.droptarget";
    const zones = queryVisibleAll(selectors).filter(z => {
        if (z.closest(".prCl__container--bank")) return false;
        if (z.closest(".prMT_T2T__wordsBankWrapper")) return false;
        if (z.closest("[class*='wordBank']")) return false;
        if (z.closest("[class*='word-bank']")) return false;
        if (z.closest("[class*='WordBank']")) return false;
        if (z.closest("#bankContainer")) return false;
        if (z.closest("#TTpTablePlaceHolder")) return false;
        if (!includeMultiItem) {
            const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
            const dndItems = z.querySelectorAll(itemSelectors);
            if (dndItems.length > 1) return false;
        }
        return true;
    });
    return sortVisually(zones);
}

function dndTextsMatch(actualText, expectedText) {
    const actualNorm = norm(actualText || "");
    const expectedNorm = norm(expectedText || "");
    if (!actualNorm || !expectedNorm) return false;
    return actualNorm === expectedNorm;
}

function getDndZoneExpectedText(zone, fallbackIndex = -1) {
    try {
        if (typeof resolveZoneAnswer === "function") {
            const resolved = resolveZoneAnswer(zone, fallbackIndex);
            if (resolved) return resolved;
        }
    } catch (_) { }
    if (fallbackIndex >= 0 && Array.isArray(__ans)) return __ans[fallbackIndex] || "";
    return "";
}

function dndZoneIsSatisfied(zone, fallbackIndex = -1) {
    const expectedText = getDndZoneExpectedText(zone, fallbackIndex);
    if (expectedText) return dndZoneHasAnswer(zone, expectedText);
    return dndZoneHasAnswer(zone);
}

function countUnsatisfiedDndZones(zones) {
    const allZones = Array.isArray(zones) ? zones : getDndZones();
    return allZones.filter((zone, idx) => !dndZoneIsSatisfied(zone, idx)).length;
}

function areAllDndZonesSatisfied(zones) {
    const allZones = Array.isArray(zones) ? zones : getDndZones(true);
    return allZones.length > 0 && allZones.every((zone, idx) => dndZoneIsSatisfied(zone, idx));
}

function getTtpZoneMappedTile(zone) {
    if (!zone) return null;
    const zoneAns = String(zone.getAttribute?.('ans') || '').trim();
    if (!zoneAns) return null;
    return document.querySelector(
        `.draggable[data-id="${zoneAns}"], .wordBankTile[data-id="${zoneAns}"], ` +
        `.draggableContainer > .draggable[data-id="${zoneAns}"], [data-id="${zoneAns}"].draggable`
    );
}

function ttpZoneHasCheckedCorrectAnswer(zone, expectedText = "") {
    if (!zone) return false;
    const expectedNorm = norm(expectedText || "");
    const mappedTile = getTtpZoneMappedTile(zone);
    if (!mappedTile) return false;
    if (mappedTile.classList.contains('xCheck')) return false;
    if (!mappedTile.classList.contains('vCheck')) return false;
    if (!expectedNorm) return true;
    const tileText = norm(mappedTile.innerText || mappedTile.textContent || "");
    return dndTextsMatch(tileText, expectedNorm);
}

function areAllTtpZonesCheckedCorrectly(zones) {
    const allZones = (Array.isArray(zones) ? zones : getDndZones(true)).filter((zone) =>
        zone?.classList?.contains('TTpanswerDiv') || zone?.classList?.contains('droptarget')
    );
    return allZones.length > 0 && allZones.every((zone, idx) =>
        ttpZoneHasCheckedCorrectAnswer(zone, getDndZoneExpectedText(zone, idx))
    );
}

function dndZoneHasAnswer(zone, expectedText = "") {
    if (!zone) return false;
    const expectedNorm = norm(expectedText || "");
    const zoneAns = String(zone.getAttribute?.('ans') || '').trim();
    if (zoneAns) {
        const isTTpZone = zone.classList?.contains('TTpanswerDiv') || zone.classList?.contains('droptarget');
        if (!expectedNorm) return true;
        const ansNode = document.querySelector(
            `.draggable[data-id="${zoneAns}"], .wordBankTile[data-id="${zoneAns}"], ` +
            `.draggableContainer > .draggable[data-id="${zoneAns}"], [data-id="${zoneAns}"].draggable`
        );
        if (isTTpZone) {
            const placementState =
                zone.classList.contains('noLine') ||
                zone.classList.contains('hotspot') ||
                !!(ansNode && (
                    ansNode.classList.contains('wordBankTilePlaced') ||
                    ansNode.classList.contains('vCheck') ||
                    ansNode.classList.contains('xCheck')
                ));
            if (!placementState) return false;
        }
        const ansText = norm(ansNode?.innerText || ansNode?.textContent || "");
        if (!expectedNorm) return !!ansText || true;
        if (!ansText) return false;
        return dndTextsMatch(ansText, expectedNorm);
    }
    const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer, .wordBankTile, .show-answer-text, [class*='user-answer'], [class*='answerText']";
    const placedItems = [...zone.querySelectorAll(itemSelectors)].filter(el => isElementVisible(el) || zone.contains(el));
    if (placedItems.length > 0) {
        if (!expectedNorm) return true;
        return placedItems.some((it) => {
            const t = norm(it.innerText || it.textContent || "");
            return dndTextsMatch(t, expectedNorm);
        });
    }
    if (zone.childElementCount === 0) {
        const zoneText = norm(zone.textContent || "");
        if (!zoneText) return false;
        const blankish = /^[_\s.\-]+$/.test(zoneText) || zoneText.length <= 1;
        if (blankish) return false;
        if (!expectedNorm) return true;
        return dndTextsMatch(zoneText, expectedNorm);
    }
    return false;
}

