// ========================= LEGACY CLICK OPTIONS =========================
function handleLegacyClickOptions() {
    if (!__ans?.length) return false;
    const ansSet = new Set(__ans.map(norm));

    // Collect clickable option elements from various legacy selectors
    const candidateSelectors = [
        '[id^="question-"][id*="_answer-"]',  // #question-1_answer-1, etc.
        '.learning__selectTxt_st',
        '.multiRadio',
        '.multiBtnText',
        '.answerBtn',
        '.option-item',
        '.questionOptions .option',
    ];
    const candidates = [];
    for (const sel of candidateSelectors) {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
            if (!candidates.some(c => c.el === el)) {
                candidates.push({ el, text: norm(el.innerText || el.textContent || '') });
            }
        });
    }

    if (!candidates.length) return false;

    let clicked = false;
    for (const { el, text } of candidates) {
        if (ansSet.has(text)) {
            _log('[EDX Legacy] Clicking matching option:', text);
            advancedClick(el);
            clicked = true;
            break;
        }
    }

    // Fuzzy fallback: partial match
    if (!clicked) {
        for (const { el, text } of candidates) {
            for (const ans of __ans) {
                const na = norm(ans);
                if (text && na && (text.includes(na) || na.includes(text))) {
                    _log('[EDX Legacy] Fuzzy clicking option:', text, '~', na);
                    advancedClick(el);
                    clicked = true;
                    break;
                }
            }
            if (clicked) break;
        }
    }

    return clicked;
}

