// ========================= PAGE-CONTEXT DATA SOURCES =========================
// Bridge functions extracted to js/runtime/bridge.js
// Build answers from scope mining result.
// Kept in content.js because it still depends on local parser helpers/state.
function buildAnswersFromScope(scopeData, qType, signals) {
    if (!scopeData) return null;
    const correct = scopeData.correct || [];
    const all = scopeData.all || [];
    if (!all.length) return null;
    if (correct.length > 0) {
        const optionSet = signals?.optionTexts?.length ? new Set(signals.optionTexts) : null;
        const validCorrect = optionSet
            ? correct.filter(t => optionSet.has(norm(t)))
            : correct;
        if (validCorrect.length > 0) {
            return {
                ans: validCorrect,
                allAns: all,
                apiZoneMap: new Map(),
                ansQs: [],
                questionTexts: [],
                dndCategories: null,
                _source: 'scope-direct',
            };
        }
    }
    if (scopeData.rawItems?.length) {
        const fakeQuestion = {
            al: [{
                a: scopeData.rawItems.map(item => {
                    const copy = { ...item };
                    if (!('txt' in copy) && ('text' in copy)) copy.txt = copy.text;
                    if (!('txt' in copy) && ('t' in copy)) copy.txt = copy.t;
                    return copy;
                })
            }]
        };
        const fakeJson = { i: { q: [fakeQuestion] } };
        const parsed = parseAnswerPayload(fakeJson, qType, false);
        if (parsed.ans.length > 0) {
            parsed._source = 'scope-rawItems';
            return parsed;
        }
    }
    return null;
}

function isContextValid() {
    try { return !!chrome.runtime?.id; } catch (_) { return false; }
}

