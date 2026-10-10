// ========================= MATCH COLUMNS FILL (FIXED) =========================
// Root cause of 1/5: After each drag, the bank re-renders and item positions change.
// Fix: re-read bank items fresh each iteration, re-scroll both source and target,
// use multiple verification methods, and increase inter-drag delay.
async function autoFillMatchColumns(allZones) {
    const totalToFill = allZones.filter(z => !z.querySelector(".dnditem")).length;
    let filledCount = 0;
    // Count-based tracker so duplicate answers work correctly
    const answerBudget = new Map();
    for (const a of __ans) { const n = norm(a); answerBudget.set(n, (answerBudget.get(n) || 0) + 1); }
    const usedCounts = new Map();
    const _useAns = (n) => usedCounts.set(n, (usedCounts.get(n) || 0) + 1);
    const _isAvailable = (n) => (usedCounts.get(n) || 0) < (answerBudget.get(n) || 0);
    const { defsSet, filteredx, optionNorms } = getMatchAnswerPool(allZones);
    setDndProgress(0, totalToFill);

    for (let i = 0; i < allZones.length; i++) {
        if (__dndUserDrag) break;

        const zone = allZones[i];
        let expectedx = resolveZoneAnswer(zone, -1);
        let expectedNorm = norm(expectedx);

        if (!expectedx || defsSet.has(expectedNorm) || (optionNorms.size && !optionNorms.has(expectedNorm))) {
            expectedx = "";
            expectedNorm = "";
        }

        if (!expectedx) {
            const alt = filteredx.find((a) => {
                const n = norm(a);
                return n && _isAvailable(n) && !!findBankItem(null, a);
            });
            if (alt) {
                expectedx = alt;
                expectedNorm = norm(alt);
            }
        }

        if (expectedNorm && !_isAvailable(expectedNorm)) {
            const alt = filteredx.find((a) => {
                const n = norm(a);
                return n && _isAvailable(n) && !!findBankItem(null, a);
            });
            if (alt) {
                expectedx = alt;
                expectedNorm = norm(alt);
            }
        }

        if (!expectedx) continue;
        if (expectedNorm) _useAns(expectedNorm);

        // Check if already correctly filled
        const existingItem = zone.querySelector(".dnditem");
        if (existingItem) {
            const existingText = norm(existingItem.innerText || existingItem.textContent || "");
            const curExpectedNorm = norm(expectedx);
            const isCorrect = existingText === curExpectedNorm ||
                existingText.includes(curExpectedNorm) || curExpectedNorm.includes(existingText);
            if (isCorrect) {
                filledCount++;
                setDndProgress(filledCount, totalToFill);
                continue;
            }
            // Evict wrong item back to bank
            _log(`[edx] Match[${i}]: Evicting wrong item "${existingText}"`);
            const bankTarget = document.querySelector(bankSelector) ||
                document.querySelector(".prMT_T2T__wordsBankWrapper") || document.body;
            const evictEl = existingItem.closest("ed-la-dnditem") || existingItem;
            await simulateDragDrop(evictEl, bankTarget);
            await delay(400);
            // Poll confirm eviction
            for (let p = 0; p < 8 && zone.querySelector(".dnditem"); p++) await delay(100);
            if (zone.querySelector(".dnditem")) {
                _warn(`[edx] Match[${i}]: Evict failed, skipping`);
                continue;
            }
        }

        // Wait for any ongoing animation
        while (document.querySelector(".gu-mirror, .gu-transit")) await delay(50);

        // Re-read bank item FRESH each iteration (critical fix for 1/5 bug)
        // The bank re-renders after each drop, so stale references fail
        let placed = false;
        let attempts = 0;
        const MAX_ATTEMPTS = 3;

        while (!placed && attempts < MAX_ATTEMPTS) {
            attempts++;

            // Fresh item lookup each attempt
            const liveBank = document.querySelector(bankSelector) ||
                document.querySelector(".prMT_T2T__wordsBankWrapper") || document.body;
            const itemNode = findBankItem(liveBank, expectedx);
            if (!itemNode) {
                _warn(`[edx] Match[${i}]: Item "${expectedx}" not found in bank (attempt ${attempts})`);
                await delay(300);
                continue;
            }

            _log(`[edx] Match[${i}]: Placing "${expectedx}" into zone (attempt ${attempts})`);

            const beforeCount = zone.querySelectorAll(".dnditem").length;
            const success = await simulateDragDrop(itemNode, zone);
            await delay(180 + attempts * 70);

            const afterCount = zone.querySelectorAll(".dnditem").length;
            placed = afterCount > beforeCount || success;

            if (!placed && attempts < MAX_ATTEMPTS) {
                _warn(`[edx] Match[${i}]: Attempt ${attempts} failed, retrying in ${400 + attempts * 200}ms`);
                await delay(260 + attempts * 120);
                // Re-poll zones in case DOM shifted
                while (document.querySelector(".gu-mirror, .gu-transit")) await delay(50);
            }
        }

        if (placed) {
            filledCount++;
            setDndProgress(filledCount, totalToFill);
            _log(`[edx] Match[${i}]: Placed "${expectedx}"`);
        } else {
            _warn(`[edx] Match[${i}]: All attempts failed for "${expectedx}"`);
        }


        await delay(90);
    }

    _log(`[edx] Match Columns: ${filledCount}/${totalToFill} filled`);
}

