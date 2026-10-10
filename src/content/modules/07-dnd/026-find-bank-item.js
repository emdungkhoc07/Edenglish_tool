// ========================= FIND BANK ITEM =========================
function findBankItem(bank, expectedText) {
    const targetZones = getDndZones();
    const allDndItems = [...document.querySelectorAll(".dnditem, .draggable.wordBankTile, .draggableContainer > .draggable, .wordBankTile")];
    const items = allDndItems.filter(el => !targetZones.some(zone => zone.contains(el)));
    if (!items.length) return null;
    let matched = null;
    if (!expectedText) {
        matched = items[0];
    } else {
        const target = norm(expectedText);
        matched = items.find(it => norm(it.innerText || "") === target);
        if (!matched && target.length >= 4) {
            matched = items.find(it => {
                const t = norm(it.innerText || "");
                if (t.length < 4) return false;
                return t.includes(target) || target.includes(t);
            });
        }
        if (!matched && target.length >= 4 && !/\s/.test(target)) {
            matched = items.find(it => {
                const t = norm(it.innerText || "");
                if (t.length < 4) return false;
                if (/\s/.test(t)) return false;
                return t.includes(target) || target.includes(t);
            });
        }
        if (!matched && target.length >= 12) {
            matched = items.find(it => _fuzzyOverlap(norm(it.innerText || ""), target) > 0.6);
        }
        if (!matched && items.length === 1) matched = items[0];
    }
    if (!matched) return null;
    return matched.closest(".draggableContainer") || matched.closest("ed-la-dnditem") || matched;
}

function resolveZoneAnswer(zone, fallbackIndex = -1) {
    try {
        if (!zone) return fallbackIndex >= 0 ? (__ans[fallbackIndex] || "") : "";

        const candidateKeys = new Set();
        const addKey = (v) => {
            if (v === null || v === undefined) return;
            const s = String(v).trim();
            if (!s) return;
            candidateKeys.add(s);
        };

        addKey(zone.id);
        ["id", "name", "data-id", "data-zone-id", "data-question-id", "data-answer-id", "data-target-id", "dg_id"]
            .forEach((attr) => addKey(zone.getAttribute?.(attr)));

        if (zone.dataset) Object.values(zone.dataset).forEach(addKey);

        const owner = zone.closest?.("[id], [data-id], [data-zone-id], [data-question-id], [data-answer-id], [dg_id], [name]");
        if (owner && owner !== zone) {
            addKey(owner.id);
            ["id", "name", "data-id", "data-zone-id", "data-question-id", "data-answer-id", "data-target-id", "dg_id"]
                .forEach((attr) => addKey(owner.getAttribute?.(attr)));
            if (owner.dataset) Object.values(owner.dataset).forEach(addKey);
        }

        for (const key of candidateKeys) {
            if (__apiZoneMap.has(key)) return __apiZoneMap.get(key);
            const num = Number(key);
            if (!Number.isNaN(num) && __apiZoneMap.has(num)) return __apiZoneMap.get(num);

            for (const [k, v] of __apiZoneMap.entries()) {
                if (String(k) === key) return v;
            }
        }

        if (fallbackIndex >= 0) return __ans[fallbackIndex] || "";
        return "";
    } catch (_) {
        return fallbackIndex >= 0 ? (__ans[fallbackIndex] || "") : "";
    }
}

function getMatchZoneDefinition(zone, idx) {
    let defText = `Slot ${idx + 1}`;
    const row = zone?.closest?.(".prMT_T2T__row, tr, .matching__row, .lessonPlayArea > div > div");
    if (row) {
        const leftEl = row.querySelector(".prMT_T2T__leftLabel, .matching__left_item, td:first-child, th, [class*='left'], [class*='Left']");
        if (leftEl && !leftEl.contains(zone)) defText = leftEl.innerText?.trim() || defText;
        else if (row.firstElementChild && !row.firstElementChild.contains(zone)) defText = row.firstElementChild.innerText?.trim() || defText;
    } else {
        const prev = zone?.previousElementSibling || zone?.parentElement?.previousElementSibling;
        if (prev && !prev.contains(zone)) defText = prev.innerText?.trim() || defText;
    }
    return defText;
}

function getMatchAnswerPool(zones) {
    const defsSet = new Set(["definition", "word"]);
    const zoneDefs = zones.map((zone, idx) => {
        const text = getMatchZoneDefinition(zone, idx);
        defsSet.add(norm(text));
        return text;
    });

    const optionTexts = Array.from(document.querySelectorAll(".dnditem, .dnd-item, .dndItem, [draggable='true']"))
        .map(el => (el.innerText || el.textContent || "").trim())
        .filter(Boolean);
    const optionNorms = new Set(optionTexts.map(norm).filter(Boolean));

    let pool = __ans.filter((a) => {
        const n = norm(a);
        if (!n || defsSet.has(n)) return false;
        if (!optionNorms.size) return true;
        return optionNorms.has(n);
    });

    if (pool.length < zones.length) {
        const fallback = __ans.filter((a) => {
            const n = norm(a);
            return n && !defsSet.has(n);
        });
        if (fallback.length) pool = fallback;
    }

    if (!pool.length && optionTexts.length) {
        pool = optionTexts.filter((a) => !defsSet.has(norm(a)));
    }

    return { zoneDefs, defsSet, filteredx: pool, optionNorms };
}

