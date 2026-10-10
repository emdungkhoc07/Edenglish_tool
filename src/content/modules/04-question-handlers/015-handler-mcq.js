// ========================= HANDLER: MCQ =========================
async function handleMCQ() {
    try {
        if (!__ans?.length) return false;
        const set = new Set(__ans.map(norm));
        const labels = queryVisibleAll(".prMCQ__answerLabel");
        if (!labels.length) return false;
        let applied = 0;
        let isAnyCorrectSelected = false;
        const isSelected = (label, input) => {
            if (input) return !!input.checked;
            return !!(label.classList.contains("checked") || label.classList.contains("selected") || label.classList.contains("active"));
        };
        for (const l of labels) {
            const t = norm(l.innerText || l.textContent || "");
            let input = l.querySelector('input[type="radio"], input[type="checkbox"]');
            if (!input) {
                const prev = l.previousElementSibling;
                if (prev?.matches?.('input[type="radio"], input[type="checkbox"]')) input = prev;
            }
            if (!input) {
                const container = l.closest?.('.prMCQ__answer, .prMCQ__answerContainer, .prMCQ__answerWrapper');
                if (container) input = container.querySelector('input[type="radio"], input[type="checkbox"]');
            }
            const isMatched = set.has(t);
            const isChecked = isSelected(l, input);

            if (isMatched !== Boolean(isChecked)) {
                const clickTargets = [input, l].filter(Boolean);
                let matchedAfterClick = false;
                for (const target of clickTargets) {
                    advancedClick(target);
                    triggerAngularSync(input || l);
                    await delay(80 + Math.floor(Math.random() * 60));
                    matchedAfterClick = isSelected(l, input) === isMatched;
                    if (matchedAfterClick) break;
                }
                if (matchedAfterClick) {
                    applied++;
                } else {
                    _warn("[EDX] MCQ verify failed for option:", t);
                }
            }
            if (isMatched) {
                const matchedNow = isSelected(l, input);
                if (matchedNow) isAnyCorrectSelected = true;
            }
        }
        // Only succeed if the click was actually reflected in the DOM state.
        return applied > 0 || isAnyCorrectSelected;
    } catch (e) { _warn("[edx] MCQ error:", e.message); return false; }
}

