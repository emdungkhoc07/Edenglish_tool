// ========================= SEQUENCE ORDER SCRAPE (FIXED) =========================
// Fix: better container detection, poll for stable render after Show Answer,
// fallback to multiple scraping strategies
async function scrapeSequenceOrder() {
    try {
        // Find Show Answer button
        const showBtnSelectors = [
            '.learning__showAnswerLink', '#learning__showAnswer',
            'a[title*="Show"]', 'button[title*="Show"]',
            'a[title*="show"]', 'button[title*="show"]',
            'a[title*="See"]', 'button[title*="See"]'
        ];
        let showBtn = document.querySelector(showBtnSelectors.join(','));
        if (!showBtn) {
            showBtn = Array.from(document.querySelectorAll("a, button")).find(el => {
                const text = (el.innerText || el.textContent || "").toLowerCase();
                return text.includes("show answer") || text.includes("see answer");
            });
        }
        if (!showBtn) {
            _warn("[edx] Show Answer button not found");
            return null;
        }

        // Snapshot current order before clicking Show Answer
        const getItemTexts = () => {
            const container = document.querySelector("ed-la-sorting-text, ed-la-ordering, .prSO__container");
            let items = [];
            if (container) {
                // Strategy 1: find the list with exactly __ans.length children
                const lists = Array.from(container.querySelectorAll("ul, ol, div"))
                    .filter(c => c.children.length === __ans.length && c.children.length > 0);
                if (lists.length > 0) {
                    // Pick the deepest matching list (most specific)
                    const deepest = lists.reduce((a, b) => (b.contains(a) ? b : a));
                    items = Array.from(deepest.children);
                }
                // Strategy 2: all .dnditem inside container
                const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
                if (!items.length) items = Array.from(container.querySelectorAll(itemSelectors));
                // Strategy 3: direct children
                if (!items.length) items = Array.from(container.children);
            }
            const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
            // Strategy 4: global .dnditem
            if (!items.length) items = Array.from(document.querySelectorAll(itemSelectors));
            return items.map(el => (el.innerText || el.textContent || "").trim()).filter(Boolean);
        };

        const beforeOrder = getItemTexts();
        _log("[edx] Sequence before Show Answer:", beforeOrder);

        showBtn.click();


        let afterOrder = [];
        const pollStart = Date.now();
        const POLL_TIMEOUT = 3000;
        const STABLE_THRESHOLD = 2; // require 2 consecutive identical reads

        let stableCount = 0;
        let lastRead = "";

        while (Date.now() - pollStart < POLL_TIMEOUT) {
            await delay(200);
            const current = getItemTexts();
            const currentStr = current.join("|");

            // Check if order has changed from before (Show Answer applied)
            const changed = currentStr !== beforeOrder.join("|") && current.length === __ans.length;

            if (changed && currentStr === lastRead) {
                stableCount++;
                if (stableCount >= STABLE_THRESHOLD) {
                    afterOrder = current;
                    _log("[edx] Sequence stable after Show Answer:", afterOrder);
                    break;
                }
            } else {
                stableCount = changed ? 1 : 0;
                lastRead = currentStr;
            }
        }

        // Fallback: just take whatever we have after timeout
        if (!afterOrder.length) {
            afterOrder = getItemTexts();
            _log("[edx] Sequence (timeout fallback):", afterOrder);
        }

        // Click Redo/Reset
        const redoBtnSelectors = [
            '.learning__retryLink', '#learning__retry',
            'a[title*="Redo"]', 'a[title*="Reset"]',
            'a[title*="redo"]', 'a[title*="reset"]'
        ];
        const redoBtn = document.querySelector(redoBtnSelectors.join(','));
        if (redoBtn) {
            redoBtn.click();
            await delay(800);
        } else {
            _warn("[edx] Redo button not found");
        }

        if (afterOrder.length > 0) return afterOrder;
        return null;
    } catch (e) {
        _warn("[edx] scrapeSequenceOrder error:", e.message);
        return null;
    }
}

