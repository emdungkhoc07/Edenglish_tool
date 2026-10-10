// ========================= CATEGORIZED FILL =========================
async function autoFillCategorized(dragTexts, hasExplicitTF) {
    _log("[edx] Starting Categorized Fill (Enhanced)");
    const bank = document.querySelector(bankSelector) || document.querySelector(".dndBank") || document.body;
    let categoryZones = getDndZones(true);
    if (categoryZones.length === 0) {
        categoryZones = Array.from(document.querySelectorAll(".prCLZ__regContainer .dndZone, .prCl__container.regContainer .dndZone, [class*='category'] .dndZone, .dnd-target.flex-1"));
    }

    if (!categoryZones.length) {
        _warn("[edx] No category zones found");
        return false;
    }

    // 1. Build Category Map (Header Text -> Zone) and Assignments
    let catMap = [];
    let parsedAssignments = [];
    const parsedSeen = new Set();

    // Read zone headers directly from DOM
    const zoneHeaders = [];
    categoryZones.forEach((zone, idx) => {
        let headerText = "";
        const container = zone.closest('.prCl__col, .col, .flex-1, [class*="column"], td, .prCLZ__regContainer > div, .dnd-column') || zone.parentElement;
        if (container) {
            const titleNode = container.querySelector('.prCLZ__regTitle, .title, .header, [class*="title"], [class*="header"], strong, b, h3, h4') || container.firstElementChild;
            if (titleNode && titleNode !== zone) {
                headerText = norm(titleNode.innerText || titleNode.textContent);
            } else {
                const clone = container.cloneNode(true);
                const zNode = clone.querySelector('.dndZone, .dnd-target');
                if (zNode) zNode.remove();
                headerText = norm(clone.innerText || clone.textContent);
            }
        }
        if (!headerText && hasExplicitTF && categoryZones.length === 2)
            headerText = idx === 0 ? "true" : "false";
        zoneHeaders.push(headerText || "unknown");
    });


    if (__dndCategories && __dndCategories.length >= 2) {
        // Match each API category to a zone by comparing names to zone headers
        const usedZoneIndexes = new Set();
        __dndCategories.forEach(cat => {
            const cn = norm(cat.catName);
            let bestIdx = -1;
            let bestScore = 0;
            zoneHeaders.forEach((h, idx) => {
                if (usedZoneIndexes.has(idx)) return;
                let score = 0;
                if (h === cn) score = 3;
                else if (h.includes(cn) || cn.includes(h)) score = 2;
                else if (_fuzzyOverlap(h, cn) > 0.5) score = 1;
                if (score > bestScore) { bestScore = score; bestIdx = idx; }
            });
            if (bestIdx === -1) {
                bestIdx = zoneHeaders.findIndex((_h, idx) => !usedZoneIndexes.has(idx));
            }
            if (bestIdx >= 0) {
                usedZoneIndexes.add(bestIdx);
                catMap.push({ zoneIndex: bestIdx, catName: cn });
                cat.allItems.forEach(item => {
                    const t = norm(item);
                    const key = `${cn}||${t}`;
                    if (!parsedSeen.has(key)) {
                        parsedSeen.add(key);
                        parsedAssignments.push({ groupName: cn, itemText: t });
                    }
                });
            }
        });
        _log("[edx] Using API dndCategories:", catMap.map(c => c.catName).join(', '),
            "assignments:", parsedAssignments.length);
    } else {

        const inferredCategories = __ans.filter(a => {
            const t = norm(a);
            return !dragTexts.some(dt => dt.includes(t) || t.includes(dt));
        });

        if (inferredCategories.length === categoryZones.length && inferredCategories.length > 0) {
            categoryZones.forEach((zone, idx) => {
                catMap.push({ zoneIndex: idx, catName: norm(inferredCategories[idx]) });
            });
        } else {
            categoryZones.forEach((zone, idx) => {
                catMap.push({ zoneIndex: idx, catName: zoneHeaders[idx] });
            });
        }

        // Parse Assignments from __ans
        let currentCat = null;
        __ans.forEach(a => {
            const t = norm(a);
            const isAnswerItem = dragTexts.some(dt => dt.includes(t) || t.includes(dt));
            if (!isAnswerItem) {
                currentCat = t;
            } else if (currentCat) {
                const key = `${currentCat}||${t}`;
                if (!parsedSeen.has(key)) {
                    parsedSeen.add(key);
                    parsedAssignments.push({ groupName: currentCat, itemText: t });
                }
            }
        });

        // Fallback for True/False sets
        if (parsedAssignments.length === 0 && hasExplicitTF) {
            currentCat = null;
            __ans.forEach(a => {
                const t = norm(a);
                if (/^true$/i.test(t)) { currentCat = "true"; return; }
                if (/^false$/i.test(t)) { currentCat = "false"; return; }
                if (currentCat && dragTexts.some(dt => dt.includes(t) || t.includes(dt))) {
                    const key = `${currentCat}||${t}`;
                    if (!parsedSeen.has(key)) {
                        parsedSeen.add(key);
                        parsedAssignments.push({ groupName: currentCat, itemText: t });
                    }
                }
            });
        }
    }

    _log("[edx] Parsed assignments:", parsedAssignments.length);

    // 3. Process assignments with FRESH bank lookup each iteration
    // Bank re-renders after each drag; stale element refs cause "Elements not found".
    let filledCount = 0;
    for (let idx = 0; idx < parsedAssignments.length; idx++) {
        if (__dndUserDrag) break;
        const assignment = parsedAssignments[idx];
        if (!assignment || assignment.used) continue;

        const itemText = norm(assignment.itemText || "");
        if (!itemText) continue;

        // Find the correct zone(s) for this category
        // In activities like the screenshot, there might be multiple distinct slots (zones) per category.
        const liveZones = getDndZones(true);
        let targetZones = catMap.filter(c =>
            c.catName === assignment.groupName ||
            (c.catName.length >= 3 && c.catName.includes(assignment.groupName)) ||
            (assignment.groupName.length >= 3 && assignment.groupName.includes(c.catName))
        ).map(c => liveZones[c.zoneIndex]).filter(Boolean);

        if (!targetZones.length && hasExplicitTF && liveZones.length >= 2) {
            if (assignment.groupName === 'true') targetZones = [liveZones[0]];
            if (assignment.groupName === 'false') targetZones = [liveZones[1]];
            targetZones = targetZones.filter(Boolean);
        }

        if (!targetZones.length) continue;

        // Find an empty or available slot in those target zones
        let targetZone = null;
        for (const zone of targetZones) {
            if (!zone.querySelector(".dnditem")) {
                targetZone = zone;
                break;
            }
        }

        // Fallback: if all targeted slots are "full" but we have an assignment, pick the first one 
        // (maybe it's a multi-item container zone)
        if (!targetZone) targetZone = targetZones[0];

        // De-duplication: skip if a matching item already exists in the target zone
        const alreadyInZone = [...targetZone.querySelectorAll(".dnditem")].some(el => {
            const t = norm(el.innerText || el.textContent || "");
            return t === itemText || t.includes(itemText) || itemText.includes(t);
        });
        if (alreadyInZone) {
            assignment.used = true;
            _log(`[edx] Categorized: "${itemText}" already in zone, skipping`);
            continue;
        }

        const liveBank = document.querySelector(bankSelector) || document.querySelector(".dndBank") || document.body;
        let itemWrapper = findBankItem(liveBank, assignment.itemText);
        if (!itemWrapper) {
            _warn(`[edx] Categorized: item not found in bank: "${assignment.itemText}"`);
            continue;
        }
        itemWrapper = itemWrapper.closest("ed-la-dnditem") || itemWrapper;

        _log(`[edx] Categorized: Placing "${itemText}" -> "${assignment.groupName}"`);
        const before = targetZone.querySelectorAll(".dnditem").length;

        let placed = false;
        let attempts = 0;
        const MAX_ATTEMPTS = 3;

        while (!placed && attempts < MAX_ATTEMPTS) {
            attempts++;

            const currentBank = document.querySelector(bankSelector) || document.querySelector(".dndBank") || document.body;
            let currentItem = findBankItem(currentBank, assignment.itemText);
            
            if (!currentItem) {
                _warn(`[edx] Categorized: Item "${assignment.itemText}" lost from bank on attempt ${attempts}`);
                await delay(300);
                continue;
            }

            currentItem = currentItem.closest("ed-la-dnditem") || currentItem;
            await simulateDragDrop(currentItem, targetZone);
            await delay(180 + attempts * 70);

            // Verify if placement succeeded
            const nowHasItem = [...targetZone.querySelectorAll(".dnditem")].some(el => {
                const t = norm(el.innerText || el.textContent || "");
                return t === itemText || t.includes(itemText) || itemText.includes(t);
            }) || targetZone.contains(currentItem);

            if (targetZone.querySelectorAll(".dnditem").length > before || nowHasItem) {
                placed = true;
            } else if (attempts < MAX_ATTEMPTS) {
                _warn(`[edx] Categorized: Drop failed for "${itemText}", retrying (${attempts}/${MAX_ATTEMPTS})`);
                await delay(200 + attempts * 100);
            }
        }

        if (placed) {
            assignment.used = true; // Match succeeded
            filledCount++;
            setDndProgress(filledCount, parsedAssignments.length);
        } else {
            _warn(`[edx] Categorized: Failed to place "${itemText}" after ${MAX_ATTEMPTS} attempts`);
        }
    }

    return filledCount > 0;
}

