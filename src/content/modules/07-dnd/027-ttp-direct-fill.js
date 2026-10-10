// ========================= TTp DIRECT FILL =========================
function fillSingleBlank(text) {
    const blank = document.querySelector('[contenteditable], input[type=text], textarea');
    if (!blank) return;
    blank.focus();
    const sel = document.getSelection?.();
    if (sel) {
        sel.selectAllChildren?.(blank);
        if (blank.tagName === 'INPUT' || blank.tagName === 'TEXTAREA') {
            blank.select?.();
        }
    }
    blank.textContent = text;
    if (blank.tagName === 'INPUT' || blank.tagName === 'TEXTAREA') blank.value = text;
    blank.dispatchEvent(new InputEvent('input', { bubbles: true }));
    blank.dispatchEvent(new Event('change', { bubbles: true }));
    triggerAngularSync(blank);
}

function findTTpBankItem(expectedText) {
    const target = norm(expectedText || "");
    if (!target) return null;
    const targetZones = getDndZones(true);
    const candidates = [...document.querySelectorAll(
        '#TTpTablePlaceHolder .draggable, ' +
        '#TTpTablePlaceHolder .wordBankTile, ' +
        '.wordsBankTable .draggable, ' +
        '.wordsBankTable .wordBankTile'
    )].filter((el, i, arr) => {
        if (arr.indexOf(el) !== i) return false;
        return !targetZones.some((zone) => zone.contains(el));
    });
    if (!candidates.length) return null;

    const exact = candidates.find((el) => norm(el.innerText || el.textContent || "") === target);
    if (exact) return exact.closest('.draggableContainer') || exact;

    const scoreCandidate = (text) => {
        const n = norm(text || "");
        if (!n) return -1;
        const targetWords = target.split(/\s+/).filter(Boolean);
        const candidateWords = n.split(/\s+/).filter(Boolean);
        let overlap = 0;
        for (const word of targetWords) {
            if (candidateWords.includes(word)) overlap++;
        }
        const prefixPenalty = n.startsWith(target) || target.startsWith(n) ? 0.15 : 0;
        const lengthPenalty = Math.abs(candidateWords.length - targetWords.length) * 0.2;
        return overlap - prefixPenalty - lengthPenalty;
    };

    const ranked = candidates
        .map((el) => ({ el, score: scoreCandidate(el.innerText || el.textContent || "") }))
        .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < 0.8) return null;
    return best.el.closest('.draggableContainer') || best.el;
}

async function animateTTpGesture(wrapper, zone) {
    const liveItem = wrapper?.matches?.('.draggable, .wordBankTile')
        ? wrapper
        : (wrapper?.querySelector?.('.draggable, .wordBankTile') || wrapper);
    if (!liveItem || !zone) return;
    const sourceRect = liveItem.getBoundingClientRect?.();
    const zoneRect = zone.getBoundingClientRect?.();
    if (!sourceRect || !zoneRect || sourceRect.width < 10 || sourceRect.height < 10 || zoneRect.width < 10 || zoneRect.height < 10) return;

    const ghost = liveItem.cloneNode(true);
    ghost.style.position = 'fixed';
    ghost.style.left = `${Math.round(sourceRect.left)}px`;
    ghost.style.top = `${Math.round(sourceRect.top)}px`;
    ghost.style.width = `${Math.round(sourceRect.width)}px`;
    ghost.style.height = `${Math.round(sourceRect.height)}px`;
    ghost.style.margin = '0';
    ghost.style.zIndex = '2147483000';
    ghost.style.pointerEvents = 'none';
    ghost.style.transition = 'transform 220ms ease, opacity 220ms ease';
    ghost.style.opacity = '0.96';
    ghost.style.boxShadow = '0 10px 26px rgba(0,0,0,0.25)';
    ghost.classList.add('wordBankTileDragged');
    document.body.appendChild(ghost);

    const deltaX = (zoneRect.left + Math.min(zoneRect.width * 0.15, 18)) - sourceRect.left;
    const deltaY = (zoneRect.top + Math.min(zoneRect.height * 0.1, 8)) - sourceRect.top;
    await delay(16);
    ghost.style.transform = `translate(${Math.round(deltaX)}px, ${Math.round(deltaY)}px)`;
    await delay(240);
    ghost.style.opacity = '0';
    await delay(40);
    ghost.remove();
}

function getTtpLiveItem(wrapper) {
    return wrapper?.matches?.('.draggable, .wordBankTile')
        ? wrapper
        : (wrapper?.querySelector?.('.draggable, .wordBankTile') || wrapper);
}

function rememberTTpTileOrigin(item) {
    if (!item || item.__edxTtpOriginParent) return;
    item.__edxTtpOriginParent = item.parentElement || null;
    item.__edxTtpOriginNextSibling = item.nextElementSibling || null;
    item.__edxTtpOriginIndex = item.parentElement
        ? Array.prototype.indexOf.call(item.parentElement.children, item)
        : -1;
}

function restoreTTpTileToOrigin(item) {
    if (!item) return false;
    const originParent = item.__edxTtpOriginParent || null;
    if (!originParent || !originParent.isConnected) {
        item.removeAttribute('style');
        item.classList.remove('wordBankTilePlaced', 'wordBankTileDragged', 'vCheck', 'xCheck');
        item.classList.add('wordBankTile');
        delete item.dataset.left;
        return false;
    }

    item.removeAttribute('style');
    delete item.dataset.left;
    item.classList.remove('wordBankTilePlaced', 'wordBankTileDragged', 'vCheck', 'xCheck');
    item.classList.add('wordBankTile');

    const nextSibling = item.__edxTtpOriginNextSibling;
    if (nextSibling && nextSibling.parentElement === originParent) {
        originParent.insertBefore(item, nextSibling);
        return true;
    }
    originParent.appendChild(item);
    return true;
}

function clearTTpZonePlacement(zone) {
    if (!zone) return;
    zone.removeAttribute('ans');
    zone.removeAttribute('div');
    zone.classList.remove('noLine');
    zone.classList.add('hotspot');
    zone.dispatchEvent(new Event('change', { bubbles: true }));
    triggerAngularSync(zone);
}

function findTTpZoneByAnswerId(itemId, excludeZone = null) {
    const targetId = String(itemId || '').trim();
    if (!targetId) return null;
    return getDndZones(true).find((zone) => {
        if (!zone || zone === excludeZone) return false;
        return String(zone.getAttribute?.('ans') || '').trim() === targetId;
    }) || null;
}

function getTTpPlacementAncestors(zone, liveItem) {
    return [
        zone?.closest?.('.bubbleItem, .bubbleLeft, .bubbleRight, .wrapBubbleLeft, .wrapBubbleRight'),
        zone?.closest?.('.answerTd, .SeqTxtImgMarkAnswerDiv'),
        zone?.closest?.('.closeInnerWrapper, .closeFrame, .lessonAnswersWrapper, .pmContainer'),
        zone?.closest?.('.TextDiv'),
        zone?.parentElement || null,
        liveItem?.closest?.('.bubbleItem, .bubbleLeft, .bubbleRight, .wrapBubbleLeft, .wrapBubbleRight'),
        liveItem?.closest?.('.answerTd, .SeqTxtImgMarkAnswerDiv'),
        liveItem?.closest?.('.closeInnerWrapper, .closeFrame, .lessonAnswersWrapper, .pmContainer'),
        liveItem?.closest?.('.TextDiv'),
        liveItem?.parentElement || null,
        document.querySelector('#rightDiv, .learning__practiceArea, .pmContainer, .lessonAnswersWrapper'),
        document.body
    ].filter((node, index, arr) => node && arr.indexOf(node) === index);
}

function chooseTTpPlacementAncestor(zone, liveItem) {
    const zoneRect = zone?.getBoundingClientRect?.();
    if (!zoneRect) return document.body;
    const candidates = getTTpPlacementAncestors(zone, liveItem);
    for (const candidate of candidates) {
        try {
            const rect = candidate.getBoundingClientRect?.();
            if (!rect) continue;
            const left = Math.round(zoneRect.left - rect.left);
            const top = Math.round(zoneRect.top - rect.top + 1);
            const fitsHorizontally = left >= -6 && left <= Math.max((rect.width || 0) - 20, 0);
            const fitsVertically = top >= -6 && top <= Math.max((rect.height || 0) - 20, 0);
            if (fitsHorizontally && fitsVertically) return candidate;
        } catch (_) { }
    }
    return candidates[0] || document.body;
}

function placeTTpTileLocally(zone, wrapper, itemId, expectedText = "") {
    if (!zone || !wrapper) return false;
    const liveItem = getTtpLiveItem(wrapper);
    if (!liveItem) return false;
    rememberTTpTileOrigin(liveItem);

    const oldZoneForLiveItem = findTTpZoneByAnswerId(itemId, zone);
    if (oldZoneForLiveItem) clearTTpZonePlacement(oldZoneForLiveItem);

    const previousAns = String(zone.getAttribute('ans') || '').trim();
    if (previousAns && previousAns !== String(itemId || '')) {
        const prevItem = document.querySelector(`.draggable[data-id="${previousAns}"], .wordBankTile[data-id="${previousAns}"]`);
        if (prevItem) {
            rememberTTpTileOrigin(prevItem);
            restoreTTpTileToOrigin(prevItem);
        }
    }

    const positionedAncestor = chooseTTpPlacementAncestor(zone, liveItem);
    try {
        const pos = window.getComputedStyle?.(positionedAncestor)?.position;
        if (!pos || pos === 'static') positionedAncestor.style.position = 'relative';
        if (positionedAncestor !== document.body && positionedAncestor !== document.documentElement) {
            const overflow = window.getComputedStyle?.(positionedAncestor)?.overflow;
            if (overflow === 'hidden') positionedAncestor.style.overflow = 'visible';
        }
    } catch (_) { }
    const zoneRect = zone.getBoundingClientRect();
    const parentRect = positionedAncestor.getBoundingClientRect ? positionedAncestor.getBoundingClientRect() : { left: 0, top: 0 };

    if (liveItem.parentElement !== positionedAncestor) {
        try { positionedAncestor.appendChild(liveItem); } catch (_) {}
    }

    liveItem.classList.remove('wordBankTile', 'wordBankTileDragged', 'vCheck', 'xCheck');
    liveItem.classList.add('wordBankTilePlaced');
    liveItem.style.position = 'absolute';
    liveItem.style.left = `${Math.round(zoneRect.left - parentRect.left)}px`;
    liveItem.style.top = `${Math.round(zoneRect.top - parentRect.top + 1)}px`;
    liveItem.dataset.left = `${Math.round(zoneRect.left - parentRect.left)}`;

    zone.setAttribute('ans', String(itemId || ''));
    const divId = String(zone.getAttribute('data-id') || zone.getAttribute('div') || zone.id || '').trim();
    if (divId) zone.setAttribute('div', divId);
    zone.classList.add('noLine');
    zone.classList.remove('hotspot');
    zone.dispatchEvent(new Event('change', { bubbles: true }));
    triggerAngularSync(zone);
    return dndZoneHasAnswer(zone, expectedText);
}

async function requestPageCheckAnswers(timeoutMs = 1800) {
    try {
        const result = await window.edxBridge?.pageCheckAnswers?.(timeoutMs);
        return !!result?.ok;
    } catch (_) { }
    return false;
}

async function requestVisibleCheckAnswer(timeoutMs = 1800) {
    try {
        const btn = typeof _findVisibleCheckAnswerButton === 'function' ? _findVisibleCheckAnswerButton() : null;
        if (!btn) return false;
        advancedClick(btn);
        btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
        btn.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
        await delay(Math.min(timeoutMs, 300));
        return true;
    } catch (_) { }
    return false;
}

function getTtpZonesCheckedResolved(zones) {
    return (Array.isArray(zones) ? zones : []).every((zone) => {
        const tile = getTtpZoneMappedTile(zone);
        return !!tile && (tile.classList.contains('vCheck') || tile.classList.contains('xCheck'));
    });
}

async function waitForTtpCheckResolution(zones, timeoutMs = 2200) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (getTtpZonesCheckedResolved(zones)) return true;
        await delay(100);
    }
    return getTtpZonesCheckedResolved(zones);
}

async function autoFillTTp(allZones, options = {}) {

    if (__ans.length === 1 && !allZones.length) {
        fillSingleBlank(__ans[0]);
        return;
    }
    let filled = 0;
    setDndProgress(0, allZones.length);
    for (let i = 0; i < allZones.length; i++) {
        const zone = allZones[i];
        let expectedx = resolveZoneAnswer(zone, i) || __ans[i];
        if (!expectedx) continue;
        if (dndZoneHasAnswer(zone, expectedx)) {
            filled++;
            setDndProgress(filled, allZones.length);
            continue;
        }
        const expectedNorm = norm(expectedx);
        const liveBank = document.querySelector(bankSelector) || document.querySelector(dndBankSel) || document.body;
        const wrapper = findTTpBankItem(expectedx) || findBankItem(liveBank, expectedx);
        if (!wrapper) {
            _warn(`[TTp] Not found: "${expectedx}"`);
            continue;
        }

        const item = wrapper.matches?.('.wordBankTile, .draggable') ? wrapper : (wrapper.querySelector('.wordBankTile, .draggable') || wrapper);
        const itemId = item?.getAttribute?.('data-id') || item?.querySelector?.('[data-id]')?.getAttribute?.('data-id');
        const isTTpBubbleZone = zone.classList?.contains('TTpanswerDiv') || zone.classList?.contains('droptarget');

        let placedOk = false;
        if (isTTpBubbleZone) {
            await animateTTpGesture(wrapper, zone);
            placedOk = placeTTpTileLocally(zone, wrapper, itemId, expectedx);
        } else {
            placedOk = await simulateDragDrop(wrapper, zone);
            if (!placedOk) {
                const liveItem = wrapper.matches?.('.draggable') ? wrapper : (wrapper.querySelector('.draggable') || wrapper);
                try { await pageSyncDrop(liveItem, zone, liveBank); } catch (_) { }
                await delay(180);
                placedOk = dndZoneHasAnswer(zone, expectedx) || placeTTpTileLocally(zone, wrapper, itemId, expectedx);
            } else {
                await delay(120);
                placedOk = dndZoneHasAnswer(zone, expectedx);
                if (!placedOk) {
                    placedOk = placeTTpTileLocally(zone, wrapper, itemId, expectedx);
                }
            }
        }

        if (placedOk) {
            filled++;
            setDndProgress(filled, allZones.length);
        } else {
            _warn(`[TTp] Drop verify failed: "${expectedx}"`);
        }
    }

    return;
}

