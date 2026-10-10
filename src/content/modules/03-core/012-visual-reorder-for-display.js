// ========================= VISUAL REORDER FOR DISPLAY =========================
// Reorder __ans to match the visual (top-to-bottom, left-to-right) order of
// the interactive elements on the page. This makes the panel display match what
// the user sees. Filling logic already uses zone-ID mapping, so this is purely
// cosmetic for the panel.

function reorderAnsByVisualOrder(qType) {
    if (!__ans?.length) return;

    const hasSameAnswerMultiset = (left, right) => {
        if (!Array.isArray(left) || !Array.isArray(right)) return false;
        if (left.length !== right.length) return false;

        const count = (arr) => {
            const map = new Map();
            arr.forEach((item) => {
                const key = norm(item);
                if (!key) return;
                map.set(key, (map.get(key) || 0) + 1);
            });
            return map;
        };

        const a = count(left);
        const b = count(right);
        if (a.size !== b.size) return false;
        for (const [key, value] of a.entries()) {
            if (b.get(key) !== value) return false;
        }
        return true;
    };

    // Collect all interactive slots on the page based on question type
    let slots = [];
    try {
        if (qType === 'ddl') {
            slots = sortVisually([...document.querySelectorAll(".prFITB__DDLOptionsW")]);
        } else if (qType === 'text') {
            slots = findTextInputs(); // already sorted visually
        } else if (qType === 'dnd' || qType === 'dnd_sequence' || qType === 'dnd_classification') {
            slots = getDndZones();    // already sorted visually
        }
        // MCQ/checkbox: answers are unordered options, visual order of labels
        // doesn't correspond 1:1 to __ans entries, so skip reorder for those.
    } catch (_) { return; }

    if (!slots.length || slots.length < __ans.length) return;

    // For each visual slot, resolve its answer.

    const orderedx = [];
    const usedIndices = new Set();

    for (let i = 0; i < Math.min(slots.length, __ans.length); i++) {
        let ans = null;
        try {
            if (qType === 'ddl') {
                ans = resolveDdlAnswer(slots[i], i);
            } else if (qType === 'text') {
                ans = resolveInputAnswer(slots[i], i);
            } else if (qType === 'dnd' || qType === 'dnd_sequence' || qType === 'dnd_classification') {
                ans = resolveZoneAnswer(slots[i], i);
            }
        } catch (_) { }

        if (ans && norm(ans)) {
            orderedx.push(ans);
            const idx = __ans.findIndex((a, j) => !usedIndices.has(j) && norm(a) === norm(ans));
            if (idx >= 0) usedIndices.add(idx);
        }
    }

    if (hasSameAnswerMultiset(__ans, orderedx)) {
        _log('[EDX] Reordered __ans by visual order:', orderedx);
        __ans = orderedx;
    } else {
        _warn('[EDX] Skip unsafe visual reorder:', { before: __ans, after: orderedx });
    }
}

