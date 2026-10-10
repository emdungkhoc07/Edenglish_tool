// ========================= HANDLER: TEXT INPUT =========================
function findTextInputs() {
    const exclude = '[type="checkbox"],[type="radio"],[type="hidden"],[type="button"],[type="submit"],[type="range"],[type="color"],[type="file"],[type="image"]';
    const selectors = [
        `.prOpenEnded__qaItemText`,
        `input[type="text"], input:not([type]), input[type="field"], textarea`,
        `.prFITB__fieldBlanck input`,
        `[placeholder*="Type"], [placeholder*="type"], [placeholder*="word"], [placeholder*="sentence"]`,
        `ed-la-dictation input, ed-la-dictation textarea`,
        `ed-la-fitb input, ed-la-write input, ed-la-sentence-completion input`,
        `.practice__container input:not(${exclude}), .practice__container textarea`,
        `.lessonPlayArea input:not(${exclude}), .lessonPlayArea textarea`,
        `main input:not(${exclude}), main textarea`,
        `#app input:not(${exclude}), #app textarea`,
        `span.et[contenteditable]:not([contenteditable="false"])` // Only editable spans in email exercises
    ];
    const seen = new Set();
    const all = [];
    for (const sel of selectors) {
        try {
            document.querySelectorAll(sel).forEach(el => {
                if (seen.has(el)) return;
                seen.add(el);
                if (el.readOnly || el.disabled) return;
                if (el.closest?.(".carry, .header, .nav")) return;
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) all.push(el);
            });
        } catch (_) { }
    }
    return sortVisually(all);
}

async function fillInput(inp, val, typing = false) {
    try {
        if (!val) return false;
        if (typing && val.length > 0) {
            return await typeTextIntoEditable(inp, val);
        }

        if (inp.focus) inp.focus({ preventScroll: true });
        
        // Handle non-input elements (like span.et)
        if (inp.tagName && inp.tagName.toLowerCase() !== 'input' && inp.tagName.toLowerCase() !== 'textarea') {
            inp.dispatchEvent(new Event('focus', { bubbles: true }));
            inp.innerText = val;
            inp.textContent = val;
            syncInputState(inp, val, "autofill");
            inp.dispatchEvent(new Event('blur', { bubbles: true }));
        } else {
            if (!setElementValue(inp, val)) return false;
            syncInputState(inp, val, "autofill");
        }

        try {
            const ngEl = window.angular?.element?.(inp);
            const ctrl = ngEl?.controller?.("ngModel");
            if (ctrl) { ctrl.$setViewValue(val); ctrl.$render(); }
            ngEl?.scope?.()?.$apply?.();
        } catch (_) { }
        triggerAngularSync(inp);
        if (inp.blur) inp.blur();
        return true;
    } catch (_) { return false; }
}

function getSmartAnswer() {
    if (!__ans?.length) return "";
    const inputs = findTextInputs();
    if (!inputs.length) return __ans[0];
    for (let i = 0; i < inputs.length; i++) {
        const cur = (inputs[i].value || inputs[i].textContent || "").trim();
        if (!cur) return __ans[i] || __ans[0];
    }
    return __ans[Math.max(0, inputs.length - 1)] || __ans[0];
}

async function smartFillFocused() {
    const active = document.activeElement;
    const value = getSmartAnswer();
    if (!value) return false;

    if (isEditableNode(active)) {
        return await fillInput(active, value);
    }

    const inputs = findTextInputs();
    const empty = inputs.find(inp => !(inp.value || inp.textContent || "").trim()) || inputs[0];
    if (!empty) return false;
    return await fillInput(empty, value);
}

function resolveInputAnswer(inputEl, fallbackIndex) {
    // Try to match input to API zone by ID/attributes, similar to DDL
    const candidateKeys = new Set();
    const addKey = (v) => {
        if (v === null || v === undefined) return;
        const s = String(v).trim();
        if (s) candidateKeys.add(s);
    };

    const searchEls = [inputEl];
    const parent = inputEl.closest?.('[id], [data-id], [data-zone-id], [data-question-id], [name]');
    if (parent && parent !== inputEl) searchEls.push(parent);
    const blankContainer = inputEl.closest?.('.prFITB__fieldBlanck, .prFITB__field, [class*="field"]');
    if (blankContainer && !searchEls.includes(blankContainer)) searchEls.push(blankContainer);

    for (const el of searchEls) {
        addKey(el.id);
        ['id', 'name', 'data-id', 'data-zone-id', 'data-question-id', 'data-answer-id', 'dg_id']
            .forEach(attr => addKey(el.getAttribute?.(attr)));
        if (el.dataset) Object.values(el.dataset).forEach(addKey);
    }

    for (const el of searchEls) {
        if (el.id) {
            const numMatch = el.id.match(/(\d+)/);
            if (numMatch) addKey(numMatch[1]);
        }
    }

    for (const key of candidateKeys) {
        if (__apiZoneMap.has(key)) return __apiZoneMap.get(key);
        const num = Number(key);
        if (!Number.isNaN(num) && __apiZoneMap.has(num)) return __apiZoneMap.get(num);
        for (const [k, v] of __apiZoneMap.entries()) {
            if (String(k) === key) return v;
        }
    }

    return __ans[fallbackIndex] || "";
}

async function handleTextInput() {
    try {
        if (!__ans?.length) return false;
        const inputs = findTextInputs();
        if (!inputs.length) return handleSentenceSelection();
        const useTyping = shouldAutoAdvance();
        let filled = 0;
        // Count-based tracker so duplicate answers work correctly
        const answerBudget = new Map();
        for (const a of __ans) { const n = norm(a); answerBudget.set(n, (answerBudget.get(n) || 0) + 1); }
        const usedCounts = new Map();
        const _useAns = (n) => usedCounts.set(n, (usedCounts.get(n) || 0) + 1);
        const _isAvailable = (n) => (usedCounts.get(n) || 0) < (answerBudget.get(n) || 0);
        for (let i = 0; i < inputs.length; i++) {
            let answer = resolveInputAnswer(inputs[i], i);
            // Dedup: if answer budget exhausted, find next available
            if (answer && !_isAvailable(norm(answer))) {
                const alt = __ans.find(a => _isAvailable(norm(a)));
                if (alt) answer = alt;
            }
            if (!answer) continue;
            _useAns(norm(answer));
            if (await fillInput(inputs[i], answer, useTyping)) filled++;
            if (!useTyping) await delay(120 + Math.floor(Math.random() * 100));
        }
        return filled > 0;
    } catch (e) { _warn("[edx] TextInput error:", e.message); return false; }
}

