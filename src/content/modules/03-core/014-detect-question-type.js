// ========================= DETECT QUESTION TYPE =========================
function detectQuestionType() {
    if (isReviewSummaryScreen()) return "unknown";
    if (queryVisible("ed-la-sorting-text, ed-la-ordering, .prSO__container")) return "dnd_sequence";

    // Explicit cloze check
    if (queryVisible("ed-la-dndcloze, .prFITB__fieldBlanck.dnd-target")) return "dnd";

    const itemSelectors = ".dnditem, .dnd-item, .dndItem, [draggable='true'], cdk-drag, .dragItem, .drag-item, [class*='dragItem'], [class*='drag-item'], .draggable.wordBankTile, .draggableContainer";
    const dndItems = queryVisibleAll(itemSelectors);
    if (dndItems.length > 0 && !queryVisible(dndBankSel)) {
        const isCategorized = queryVisibleAll(
            ".prCLZ__regContainer .dndZone, .prCl__container.regContainer .dndZone, [class*='category'] .dndZone"
        ).length > 0;
        if (!isCategorized) return "dnd_sequence";
    }
    if (hasRealSpeakingUi()) return 'speaking';
    // Check for MCQ/Checkbox BEFORE checking classification to avoid misdetection
    // (Angular containers like .prCLZ__regContainer can appear on checkbox pages)
    if (hasMcqCheckboxInputs()) return "checkbox";
    if (queryVisible(".prMCQ__answerLabel")) return "mcq";
    if (queryVisible(".lessonMultipleAnswer")) return "checkbox";

    // Classification DnD (type 1) - table with multiple columns
    // Only if we confirmed there are REAL drag items AND no MCQ/checkbox inputs
    if (queryVisible('.prCLZ__regContainer, .prCl__container') && dndItems.length > 0) {
        return "dnd_classification";
    }
    if (queryVisible(dndBankSel) && dndItems.length > 0) return "dnd";

    const pageText = norm(document.body?.textContent || '');
    if (
        pageText.includes('click on the boxes to match') ||
        pageText.includes('click on the box to match') ||
        pageText.includes('click on the cards to match') ||
        pageText.includes('match the words and pictures') ||
        pageText.includes('match the electrical appliances') ||
        queryVisible('.card-back') || queryVisible('.card-front')
    ) return 'card_match';
    if (pageText.includes('select the place in the text') || pageText.includes('select where these sentences best fit')) {
        return 'sentence_fit';
    }
    if (pageText.includes('select the sentence in the text') || pageText.includes('click on the sentence in the text')) {
        return 'text';
    }
    
    // (MCQ/checkbox checks moved above dnd_classification)
    if (queryVisible(".prFITB__DDLOptionsW")) return "ddl";

    // Explicitly unsupported types for now
    if (queryVisible('ed-la-writing, .tox-tinymce, iframe[id*="tiny"], .prWriting__editorW, .prWriting__editorSaveBtn, .mceEditor') || pageText.includes('write a short paragraph')) return "writing";
    if (queryVisible('ed-la-memory-game, ed-la-matching-game, .backSide, .memory-card')) return "unsupported_memory";

    const hasText = queryVisible(
        '.prOpenEnded__qaItemText, input[type="text"], input:not([type]), input[type="field"], textarea, span.et[contenteditable]:not([contenteditable="false"]),' +
        '.prFITB__fieldBlanck input, ed-la-dictation input, ed-la-fitb input,' +
        '.practice__container input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="button"]):not([type="submit"]),' +
        '.lessonPlayArea input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="button"]):not([type="submit"])'
    );
    if (hasText) return "text";
    return "unknown";
}

