// ========================= SEQUENTIAL FILL =========================
async function autoFillSequential(bank, allZones) {

    const bankTarget = document.querySelector(bankSelector) || document.querySelector(".dndBank, [id^='bank_'], .prCl__container--bank");
    if (bankTarget) {
        const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
        for (let zi = 0; zi < allZones.length; zi++) {
            const zone = allZones[zi];
            const existingItem = zone.querySelector(itemSelectors);
            if (!existingItem) continue;

            // Check if this item is the CORRECT answer for this zone
            let expectedx = resolveZoneAnswer(zone, zi);
            if (!expectedx) expectedx = __ans[zi] || null;
            if (expectedx) {
                const existingText = norm(existingItem.innerText || existingItem.textContent || "");
                const expectedNorm = norm(expectedx);
                if (dndTextsMatch(existingText, expectedNorm)) {
                    _log(`[edx] Seq[${zi}]: Already correct "${existingText}", keeping`);
                    continue;
                }
            }

            const evictEl = existingItem.closest("ed-la-dnditem") || existingItem;
            _log(`[edx] Seq[${zi}]: Evicting wrong item "${norm(existingItem.textContent)}"`);
            await simulateDragDrop(evictEl, bankTarget);
            await delay(300);
            // Verify eviction
            for (let p = 0; p < 8 && dndZoneHasAnswer(zone); p++) await delay(100);
        }
        await delay(200);
    }


    const totalToFill = allZones.length;
    let filledCount = 0;
    setDndProgress(0, totalToFill);
    // Count-based tracker so duplicate answers work correctly
    const answerBudget = new Map();
    for (const a of __ans) { const n = norm(a); answerBudget.set(n, (answerBudget.get(n) || 0) + 1); }
    const usedCounts = new Map();
    const _useAns = (n) => usedCounts.set(n, (usedCounts.get(n) || 0) + 1);
    const _isAvailable = (n) => (usedCounts.get(n) || 0) < (answerBudget.get(n) || 0);

    for (let i = 0; i < allZones.length; i++) {
        const zone = allZones[i];
        // Use resolveZoneAnswer (checks all attributes) instead of only zone.id
        let expectedx = resolveZoneAnswer(zone, i);
        if (!expectedx) expectedx = __ans[i] || null;

        // Dedup: if this answer's budget is exhausted, find next available
        if (expectedx && !_isAvailable(norm(expectedx))) {
            const alt = __ans.find(a => _isAvailable(norm(a)));
            if (alt) expectedx = alt;
        }

        if (!expectedx) continue;

        // Skip if zone somehow already has the correct item (edge case)
        const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
        const existingItem = zone.querySelector(itemSelectors);
        if (existingItem || dndZoneHasAnswer(zone, expectedx)) {
            const existingText = norm(existingItem?.innerText || existingItem?.textContent || zone.innerText || zone.textContent || "");
            const expectedNorm = norm(expectedx);
            if (dndTextsMatch(existingText, expectedNorm) || dndZoneHasAnswer(zone, expectedx)) {
                _useAns(expectedNorm);
                filledCount++;
                setDndProgress(filledCount, totalToFill);
                continue;
            }
        }

        if (__dndUserDrag) break;
        while (document.querySelector(".gu-mirror, .gu-transit")) await delay(50);

        // Re-read bank FRESH each iteration (bank re-renders after each drop)
        const liveBank = document.querySelector(bankSelector) || bank || document.body;
        const item = findBankItem(liveBank, expectedx);
        if (!item) {
            _warn(`[edx] Seq[${i}]: "${expectedx}" not found in bank`);
            continue;
        }

        _log(`[edx] Seq[${i}]: Placing "${expectedx}"`);
        const before = zone.querySelectorAll(itemSelectors).length;
        await simulateDragDrop(item, zone);
        await delay(350);

        // Verify placement by checking if zone now contains an item with correct text
        const expectedNorm = norm(expectedx);
        const placedOk = dndZoneHasAnswer(zone, expectedNorm);

        if (placedOk) {
            _useAns(expectedNorm);
            filledCount++;
            setDndProgress(filledCount, totalToFill);
        } else {
            // Retry once
            await delay(400);
            const retryBank = document.querySelector(bankSelector) || bank || document.body;
            let retryItem = findBankItem(retryBank, expectedx);
            if (retryItem) {
                await simulateDragDrop(retryItem, zone);
                await delay(400);
                const retryOk = dndZoneHasAnswer(zone, expectedNorm);
                if (retryOk) {
                    _useAns(expectedNorm);
                    filledCount++;
                    setDndProgress(filledCount, totalToFill);
                }
            }
        }
        await delay(100);
    }

    if (filledCount === 0 && totalToFill > 0) __dndFailCount++;
    else __dndFailCount = 0;
}

