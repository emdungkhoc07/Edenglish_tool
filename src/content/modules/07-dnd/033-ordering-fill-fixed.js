// ========================= ORDERING FILL (FIXED) =========================
// Fix: removed double __dndInProgress management, fixed Angular swap verify
async function autoFillOrdering() {
    let filledCount = 0;
    const totalToFill = __ans.length;
    setDndProgress(0, totalToFill);

    for (let i = 0; i < __ans.length; i++) {
        const expectedx = norm(__ans[i]);
        if (!expectedx) continue;

        // Always re-read current item list from DOM
        const getItems = () => {
            const container = document.querySelector("ed-la-sorting-text, ed-la-ordering, .prSO__container");
            if (container) {
                const lists = Array.from(container.querySelectorAll("ul, ol, div"))
                    .filter(c => c.children.length === __ans.length && c.children.length > 0);
                if (lists.length > 0) {
                    const deepest = lists.reduce((a, b) => (b.contains(a) ? b : a));
                    return Array.from(deepest.children);
                }
                const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
                const items = Array.from(container.querySelectorAll(itemSelectors));
                if (items.length) return items;
            }
            const itemSelectorsGlobal = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
            return Array.from(document.querySelectorAll(itemSelectorsGlobal));
        };

        const currentItems = getItems();
        if (!currentItems.length) break;


        // This prevents picking an already-placed duplicate at an earlier position
        let targetItemIndex = -1;
        for (let j = i; j < currentItems.length; j++) {
            const t = norm(currentItems[j].innerText || currentItems[j].textContent || "");
            if (t === expectedx || t.includes(expectedx) || expectedx.includes(t)) {
                targetItemIndex = j;
                break;
            }
        }
        if (targetItemIndex === -1) continue;
        if (targetItemIndex === i) {
            filledCount++;
            setDndProgress(filledCount, totalToFill);
            continue;
        }

        if (__dndUserDrag) break;
        while (document.querySelector(".gu-mirror, .gu-transit")) await delay(50);

        const itemNode = currentItems[targetItemIndex];
        const dropSpotNode = currentItems[i];


        let angularSwapped = false;
        try {
            if (window.angular) {
                const itemNg = window.angular.element(itemNode);
                const scope = itemNg.scope ? itemNg.scope() : null;
                const scopesToCheck = [scope, scope?.$parent, scope?.$root];
                const arrNames = ['answers', 'items', 'words', 'options', 'sentences', 'list', 'data'];
                for (const sc of scopesToCheck) {
                    if (!sc || angularSwapped) break;
                    for (const arrName of arrNames) {
                        if (Array.isArray(sc[arrName]) && sc[arrName].length === __ans.length) {
                            const temp = sc[arrName][i];
                            sc[arrName][i] = sc[arrName][targetItemIndex];
                            sc[arrName][targetItemIndex] = temp;
                            try { if (!sc.$$phase && !sc.$root?.$$phase) sc.$apply(); } catch (_) { }
                            await delay(200);
                            angularSwapped = true;
                            _log(`[edx] Ordering: Angular swap via scope.${arrName}`);
                            break;
                        }
                    }
                }
            }
        } catch (e) { }

        if (!angularSwapped) {
            await simulateDragDrop(itemNode, dropSpotNode);
            await delay(500);
        }


        const newItems = getItems();
        const verifyText = norm(newItems[i]?.innerText || newItems[i]?.textContent || "");
        const verified = verifyText === expectedx || verifyText.includes(expectedx) || expectedx.includes(verifyText);

        if (verified) {
            filledCount++;
            setDndProgress(filledCount, totalToFill);
        } else if (!angularSwapped) {
            // Retry drag
            await delay(400);
            await simulateDragDrop(itemNode, newItems[i] || dropSpotNode);
            await delay(500);
            // Verify retry
            const retryItems = getItems();
            const retryText = norm(retryItems[i]?.innerText || retryItems[i]?.textContent || "");
            const retryOk = retryText === expectedx || retryText.includes(expectedx) || expectedx.includes(retryText);
            if (retryOk) {
                filledCount++;
                setDndProgress(filledCount, totalToFill);
            }
        }
    }

    return filledCount > 0;
}

