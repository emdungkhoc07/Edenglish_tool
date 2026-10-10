// ========================= SHOW ANSWER FALLBACK =========================
async function scrapeCorrectViaShowAnswer(qType) {
    try {
        const showBtnSels = [
            '.learning__showAnswerLink', '#learning__showAnswer',
            'a[title*="Show"]', 'button[title*="Show"]',
            'a[title*="show"]', 'button[title*="show"]',
        ];
        let showBtn = document.querySelector(showBtnSels.join(','));
        if (!showBtn) {
            showBtn = [...document.querySelectorAll('a, button')].find(el => {
                const t = (el.innerText || '').toLowerCase();
                return t.includes('show answer') || t.includes('see answer');
            });
        }
        if (!showBtn || !isElementVisible(showBtn)) return null;

        // Snapshot current state
        const isMCQ = qType === 'mcq';
        const labels = isMCQ
            ? [...document.querySelectorAll('.prMCQ__answerLabel')]
            : [
                ...document.querySelectorAll('.lessonMultipleAnswer'),
                ...(hasMcqCheckboxInputs() ? [...document.querySelectorAll('.prMCQ__answerLabel')] : [])
            ];
        if (!labels.length) return null;

        const before = labels.map(l => {
            const container = l.closest('.prMCQ__answer, .prMCQ__answerContainer, .prMCQ__answerWrapper') || l.parentElement;
            return {
                el: l,
                container,
                text: (l.innerText || l.textContent || '').trim(),
                classes: new Set([...l.classList, ...(container?.classList || [])]),
                checked: !!(container?.querySelector('input')?.checked)
            };
        });

        // Click Show Answer
        advancedClick(showBtn);


        const detectCorrectNow = () => {
            const result = [];
            labels.forEach((l, i) => {
                const b = before[i];
                if (!b) return;
                const container = l.closest('.prMCQ__answer, .prMCQ__answerContainer, .prMCQ__answerWrapper') || b.container || l.parentElement;

                const allCurrent = [...l.classList, ...(container?.classList || [])];
                const newClasses = allCurrent.filter(c => !b.classes.has(c));
                const newStr = newClasses.join(' ').toLowerCase();
                const allClassStr = allCurrent.join(' ').toLowerCase();
                const hasCorrectClass = allClassStr.includes('correct') || allClassStr.includes('right') ||
                    allClassStr.includes('success') || allClassStr.includes('green') || allClassStr.includes('show-answer') ||
                    (allClassStr.includes('check') && !allClassStr.includes('checkbox')) ||
                    newStr.includes('correct') || newStr.includes('right') ||
                    newStr.includes('success') || newStr.includes('green') || newStr.includes('show-answer');

                const input = container?.querySelector('input') || l.querySelector('input') || l.previousElementSibling;
                const nowChecked = !!input?.checked;
                const wasChecked = b.checked;
                const ariaChecked = (input?.getAttribute?.('aria-checked') || l.getAttribute?.('aria-checked') || container?.getAttribute?.('aria-checked') || '').toLowerCase() === 'true';

                const style = container ? window.getComputedStyle(container) : null;
                const labelStyle = window.getComputedStyle(l);
                const hasGreenBg = Boolean(
                    (style && style.backgroundColor.includes('rgb(') && !style.backgroundColor.includes('255, 255, 255')) ||
                    (labelStyle && labelStyle.backgroundColor.includes('rgb(') && !labelStyle.backgroundColor.includes('255, 255, 255'))
                );

                const selectedByShowAnswer = qType === 'checkbox'
                    ? ((nowChecked && !wasChecked) || ariaChecked || hasCorrectClass || hasGreenBg)
                    : (hasCorrectClass || (nowChecked && !wasChecked) || hasGreenBg);

                if (selectedByShowAnswer && b.text) result.push(b.text);
            });
            return result;
        };

        // Use try/finally to ALWAYS click Redo even if detection throws
        let correct = [];
        try {

            for (const waitMs of [1000, 400, 400, 400]) {
                await delay(waitMs);
                correct = detectCorrectNow();
                if (correct.length > 0) break;
            }
        } finally {

            const redoSels = [
                '.learning__retryLink', '#learning__retry',
                'a[title*="Redo"]', 'a[title*="redo"]',
                'a[title*="Reset"]', 'a[title*="reset"]',
                'button[title*="Redo"]', 'button[title*="Reset"]',
            ];
            let redoBtn = document.querySelector(redoSels.join(','));
            if (!redoBtn) {
                redoBtn = [...document.querySelectorAll('a, button')].find(el => {
                    const t = (el.innerText || '').toLowerCase();
                    return t.includes('redo') || t.includes('reset') || t.includes('try again');
                });
            }
            if (redoBtn) {
                advancedClick(redoBtn);
                await delay(600);
            }
        }

        return correct.length > 0 ? correct : null;
    } catch (e) {
        _warn('[EDX] scrapeCorrectViaShowAnswer error:', e.message);
        return null;
    }
}

async function scrapeCategorizedDndViaShowAnswer() {
    try {
        const showBtnSels = [
            '.learning__showAnswerLink', '#learning__showAnswer',
            'a[title*="Show"]', 'button[title*="Show"]',
            'a[title*="show"]', 'button[title*="show"]',
        ];
        let showBtn = document.querySelector(showBtnSels.join(','));
        if (!showBtn) {
            showBtn = [...document.querySelectorAll('a, button')].find(el => {
                const t = (el.innerText || '').toLowerCase();
                return t.includes('show answer') || t.includes('see answer');
            });
        }
        if (!showBtn || !isElementVisible(showBtn)) return null;

        advancedClick(showBtn);
        await delay(900);

        let categoryZones = getDndZones(true);
        if (!categoryZones.length) {
            categoryZones = Array.from(document.querySelectorAll('.prCLZ__regContainer .dndZone, .prCl__container.regContainer .dndZone, [class*="category"] .dndZone, .dnd-target.flex-1'));
        }
        if (!categoryZones.length) return null;

        const categories = [];
        categoryZones.forEach((zone, idx) => {
            let headerText = '';
            const container = zone.closest('.prCl__col, .col, .flex-1, [class*="column"], td, .prCLZ__regContainer > div, .dnd-column') || zone.parentElement;
            if (container) {
                const titleNode = container.querySelector('.prCLZ__regTitle, .title, .header, [class*="title"], [class*="header"], strong, b, h3, h4') || container.firstElementChild;
                if (titleNode && titleNode !== zone) {
                    headerText = (titleNode.innerText || titleNode.textContent || '').trim();
                }
            }
            const items = queryVisibleAll('.dnditem', zone)
                .map(el => (el.innerText || el.textContent || '').trim())
                .filter(Boolean);
            if (items.length) {
                categories.push({ catName: headerText || `Group ${idx + 1}`, allItems: items });
            }
        });

        const redoSels = [
            '.learning__retryLink', '#learning__retry',
            'a[title*="Redo"]', 'a[title*="redo"]',
            'a[title*="Reset"]', 'a[title*="reset"]',
            'button[title*="Redo"]', 'button[title*="Reset"]',
        ];
        let redoBtn = document.querySelector(redoSels.join(','));
        if (!redoBtn) {
            redoBtn = [...document.querySelectorAll('a, button')].find(el => {
                const t = (el.innerText || '').toLowerCase();
                return t.includes('redo') || t.includes('reset') || t.includes('try again');
            });
        }
        if (redoBtn) {
            advancedClick(redoBtn);
            await delay(700);
        }

        if (categories.length < 2) return null;

        const ans = [];
        categories.forEach(cat => {
            ans.push(cat.catName);
            cat.allItems.forEach(item => ans.push(item));
        });

        return { ans, dndCategories: categories };
    } catch (e) {
        _warn('[EDX] scrapeCategorizedDndViaShowAnswer error:', e.message);
        return null;
    }
}

