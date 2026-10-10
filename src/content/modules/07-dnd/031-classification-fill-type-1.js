// ========================= CLASSIFICATION FILL (Type 1) =========================
// Classification DnD: table with multiple columns, each cell can receive multiple items
async function autoFillClassification(dragTexts) {
    _log("[edx] Starting Classification Fill (Type 1)");
    const ensureVisible = async (el, block = "center") => {
        if (!el) return;
        try {
            if (typeof scrollToElement === "function") {
                await scrollToElement(el);
                return;
            }
        } catch (_) { }
        try { el.scrollIntoView({ block, inline: "nearest" }); } catch (_) { }
        await delay(80);
    };
    
    // Get all category columns/zones
    let categoryZones = getDndZones(true);
    if (!categoryZones.length) {
        categoryZones = Array.from(document.querySelectorAll(
            ".prCLZ__regContainer .dndZone, .prCl__container .dndZone, .prCl__col .dndZone, .dnd-target.flex-1, [class*='classification'] .dndZone"
        ));
    }
    if (!categoryZones.length) {
        _warn("[edx] Classification: No zones found");
        return false;
    }
    
    // Get zone headers
    const zoneHeaders = [];
    categoryZones.forEach((zone, idx) => {
        let headerText = "";
        const container = zone.closest('.prCl__col, .col, .flex-1, [class*="column"], td, .prCLZ__regContainer > div, .dnd-column') || zone.parentElement;
        if (container) {
            const titleNode = container.querySelector('.prCLZ__regTitle, .title, .header, [class*="title"], [class*="header"], strong, b, h3, h4') || container.firstElementChild;
            if (titleNode && titleNode !== zone) {
                headerText = norm(titleNode.innerText || titleNode.textContent);
            }
        }
        zoneHeaders.push(headerText || `column_${idx}`);
    });
    
    _log("[edx] Classification zones:", zoneHeaders.length, "headers:", zoneHeaders);
    
    // Build assignments from __ans
    // Format: [CatName1, item1, item2, CatName2, item3, item4] or from __dndCategories
    const assignments = [];
    const parsedSeen = new Set();
    
    if (__dndCategories && __dndCategories.length >= 2) {
        // Use API-provided categories
        __dndCategories.forEach(cat => {
            const catName = norm(cat.catName);
            cat.allItems.forEach(item => {
                const itemText = norm(item);
                const key = `${catName}||${itemText}`;
                if (!parsedSeen.has(key)) {
                    parsedSeen.add(key);
                    assignments.push({ groupName: catName, itemText });
                }
            });
        });
    } else {
        // Parse from __ans array
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
                    assignments.push({ groupName: currentCat, itemText: t });
                }
            }
        });
    }
    
    if (!assignments.length) {
        _warn("[edx] Classification: No assignments parsed");
        return false;
    }
    
    _log("[edx] Classification assignments:", assignments.length);
    
    // Match categories to zones
    const catToZone = new Map();
    zoneHeaders.forEach((header, idx) => {
        assignments.forEach(ass => {
            if (!catToZone.has(ass.groupName)) {
                const gn = ass.groupName;
                if (header === gn || header.includes(gn) || gn.includes(header) || _fuzzyOverlap(header, gn) > 0.5) {
                    catToZone.set(gn, idx);
                }
            }
        });
    });
    
    // Fill unmapped categories to remaining zones
    let zoneIdx = 0;
    assignments.forEach(ass => {
        if (!catToZone.has(ass.groupName)) {
            while (zoneIdx < categoryZones.length && [...catToZone.values()].includes(zoneIdx)) {
                zoneIdx++;
            }
            if (zoneIdx < categoryZones.length) {
                catToZone.set(ass.groupName, zoneIdx);
            }
        }
    });
    
    // Perform drags
    const bank = document.querySelector(bankSelector) || document.querySelector(".dndBank") || document.body;
    let filledCount = 0;
    const MAX_ATTEMPTS = 3;
    
    for (const ass of assignments) {
        const zoneIndex = catToZone.get(ass.groupName);
        if (zoneIndex === undefined) continue;
        
        const zone = categoryZones[zoneIndex];
        const itemText = ass.itemText;
        
        // Find item in bank
        const itemEl = findBankItem(bank, itemText);
        if (!itemEl) {
            _warn(`[edx] Classification: Item not found "${itemText}"`);
            continue;
        }
        
        // Check if already placed
        const existing = Array.from(zone.querySelectorAll('.dnditem, .dnd-item, .draggable, [draggable="true"]'))
            .find(el => norm(el.innerText || el.textContent).includes(itemText));
        if (existing) {
            filledCount++;
            continue;
        }
        
        // Attempt drag
        let placed = false;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS && !placed; attempt++) {
            try {
                const liveBank = document.querySelector(bankSelector) || document.querySelector(".dndBank") || document.body;
                const liveItem = findBankItem(liveBank, itemText) || itemEl;
                await ensureVisible(zone);
                await ensureVisible(liveItem);
                await simulateDragDrop(liveItem, zone);
                await delay(150 + Math.random() * 100);
                
                // Verify
                const afterDrag = Array.from(zone.querySelectorAll('.dnditem, .dnd-item, .draggable, [draggable="true"]'))
                    .find(el => {
                        const text = norm(el.innerText || el.textContent || "");
                        return text === itemText || text.includes(itemText) || itemText.includes(text);
                    });
                if (afterDrag) {
                    placed = true;
                    filledCount++;
                }
            } catch (e) {
                _warn(`[edx] Classification: Drag failed "${itemText}" attempt ${attempt}`);
                await delay(200 + attempt * 100);
            }
        }
        
        if (!placed) {
            _warn(`[edx] Classification: Failed to place "${itemText}" after ${MAX_ATTEMPTS} attempts`);
        }
    }
    
    _log("[edx] Classification completed:", filledCount, "/", assignments.length);
    return filledCount > 0;
}

