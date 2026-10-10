// ========================= HANDLER: CHECKBOX =========================
async function handleCheckbox() {
    try {
        if (!__ans?.length) return false;
        const set = new Set(__ans.map(norm));
        const conts = queryVisibleAll(".lessonMultipleAnswer");
        const mcqLike = hasMcqCheckboxInputs() ? queryVisibleAll('.prMCQ__answerLabel') : [];
        const allOptions = [...conts, ...mcqLike];
        if (!allOptions.length) return false;
        let applied = 0;
        let isAnyCorrectSelected = false;
        const isSelected = (container, input) => {
            return !!(input?.checked || container.classList.contains("check") || container.classList.contains("checked"));
        };
        for (const c of allOptions) {
            const txtEl = c.querySelector(".multiTextInline, .multiText, .radioTextWrapper") || c;
            const t = norm(txtEl?.innerText || txtEl?.textContent || "");
            let match = set.has(t);
            if (!match) {
                const tS = t.replace(/[.!?,;]+$/, "");
                for (const a of set) {
                    const aS = a.replace(/[.!?,;]+$/, "");
                    if (tS === aS) { match = true; break; }
                }
            }
            let inp = c.querySelector("input.lessonMultipleCheck, input[type='checkbox']");
            if (!inp) {
                const prev = c.previousElementSibling;
                if (prev?.matches?.("input[type='checkbox']")) inp = prev;
            }
            if (!inp) {
                const container = c.closest?.('.prMCQ__answer, .prMCQ__answerContainer, .prMCQ__answerWrapper');
                if (container) inp = container.querySelector("input.lessonMultipleCheck, input[type='checkbox']");
            }
            const isChecked = isSelected(c, inp);
            if (match !== isChecked) {
                const clickTargets = [];
                if (inp) clickTargets.push(inp);
                const label = c.querySelector("label.overlayCheckbox, label");
                if (label) clickTargets.push(label);
                clickTargets.push(c);

                let matchedAfterClick = false;
                for (const target of clickTargets) {
                    advancedClick(target);
                    triggerAngularSync(inp || c);
                    await delay(80 + Math.floor(Math.random() * 60));
                    matchedAfterClick = isSelected(c, inp) === match;
                    if (matchedAfterClick) break;
                }
                if (matchedAfterClick) {
                    applied++;
                } else {
                    _warn("[EDX] Checkbox verify failed for option:", t);
                }
            }
            if (match) {
                const matchedNow = isSelected(c, inp);
                if (matchedNow) isAnyCorrectSelected = true;
            }
        }
        return applied > 0 || isAnyCorrectSelected;
    } catch (e) { _warn("[edx] Checkbox error:", e.message); return false; }
}

