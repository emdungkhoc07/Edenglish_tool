// ========================= HANDLER: DDL (async) =========================
function resolveDdlAnswer(ddlEl, fallbackIndex) {





    return __ans[fallbackIndex] || "";
}

let __ddlRunning = false;
async function handleDDL() {
    if (__ddlRunning) return false;
    __ddlRunning = true;
    const myRequestId = __currentRequestId;
    try {
        if (!__ans?.length) return false;
        const ddls = [...document.querySelectorAll(".prFITB__DDLOptionsW")];
        if (!ddls.length) return false;
        const sortedDdls = sortVisually(ddls);
        let changed = 0;

        // Build count-based tracker so duplicate answers (e.g. "calm","calm") work correctly
        const answerBudget = new Map();
        for (const a of __ans) { const n = norm(a); answerBudget.set(n, (answerBudget.get(n) || 0) + 1); }
        const usedCounts = new Map();
        const _useAns = (n) => usedCounts.set(n, (usedCounts.get(n) || 0) + 1);
        const _isAvailable = (n) => (usedCounts.get(n) || 0) < (answerBudget.get(n) || 0);
        const _safeCloseDropdown = async () => {
            try {
                if (document.body) {
                    advancedClick(document.body);
                } else {
                    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
                }
            } catch (_) { }
            await delay(60);
        };
        const _openDropdown = async (wrapper, selectedEl) => {
            const getList = () => (wrapper.parentElement || wrapper).querySelector(".DDLOptions__list");
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    advancedClick(selectedEl);
                } catch (_) {
                    selectedEl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
                }
                await delay(120 + attempt * 40);
                const list = getList();
                if (list) return list;
            }
            return null;
        };

        for (let i = 0; i < sortedDdls.length; i++) {
            if (__currentRequestId !== myRequestId) {
                _warn('[EDX] handleDDL: question changed, aborting');
                return false;
            }

            const w = sortedDdls[i];
            const sel = w.querySelector(".DDLOptions__selected");
            if (!sel) continue;

            // Resolve correct answer: try zone ID mapping first, then sequential fallback
            let correctAns = norm(resolveDdlAnswer(w, i));

            // If this answer's budget is exhausted, find next available from __ans
            if (correctAns && !_isAvailable(correctAns)) {
                const alt = __ans.find(a => _isAvailable(norm(a)));
                if (alt) correctAns = norm(alt);
            }

            if (!correctAns) continue;

            // Check if already correct BEFORE opening dropdown
            const curBefore = norm(sel.innerText || sel.textContent || "");
            if (curBefore === correctAns) {
                _useAns(correctAns);
                changed++;
                continue;
            }

            if (__currentRequestId !== myRequestId) return false;
            const openList = await _openDropdown(w, sel);
            if (!openList) continue;

            const listItems = [...openList.querySelectorAll(".DDLOptions__listItem")];
            const optionTexts = listItems.map(it => norm(it.innerText || it.textContent || ""));

            // Check if our mapped answer exists in this dropdown
            let targetAns = correctAns;
            if (!optionTexts.includes(targetAns)) {

                const available = __ans.find(a => {
                    const n = norm(a);
                    return n && optionTexts.includes(n) && _isAvailable(n);
                });
                if (available) targetAns = norm(available);
                else {
                    await _safeCloseDropdown();
                    continue;
                }
            }

            const cur = norm(sel.innerText || sel.textContent || "");
            if (cur === targetAns) {
                await _safeCloseDropdown();
                _useAns(targetAns);
                changed++;
                continue;
            }

            let found = false;
            for (const it of listItems) {
                const t = norm(it.innerText || it.textContent || "");
                if (t === targetAns) {
                    try {
                        advancedClick(it);
                    } catch (_) {
                        it.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    }
                    await delay(120);
                    if (__currentRequestId !== myRequestId) return false;
                    await _safeCloseDropdown();
                    const selectedAfter = norm(sel.innerText || sel.textContent || "");
                    if (selectedAfter !== targetAns) {
                        _warn("[EDX] DDL verify failed for answer:", targetAns);
                        break;
                    }
                    if (__currentRequestId !== myRequestId) return false;
                    _useAns(targetAns);
                    changed++;
                    found = true;
                    break;
                }
            }
            if (!found) {
                await _safeCloseDropdown();
            }
        }
        return changed > 0;
    } catch (e) { _warn("[edx] DDL error:", e.message); return false; }
    finally { __ddlRunning = false; }
}

