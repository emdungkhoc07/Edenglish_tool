// ========================= AI WRITING SETTINGS + GROQ =========================
const __EDX_SETTINGS_KEY = 'edx_settings_v1';
const __EDX_DEFAULT_SETTINGS = Object.freeze({
    ai: {
        provider: 'groq',
        keys: {
            groq: ''
        }
    },
    writing: {
        enabled: true,
        insertMode: 'human_type',
        autoSaveDraft: false,
        autoSubmit: false
    }
});

window.__EDX_SETTINGS__ = normalizeEdxSettings(window.__EDX_SETTINGS__);
window.__EDX_WRITING_STATE__ = window.__EDX_WRITING_STATE__ || {
    busy: false,
    status: 'idle',
    lastAction: 'draft',
    lastResult: null,
    lastError: '',
    generatedAt: 0,
    pageKey: ''
};

function cloneDefaultEdxSettings() {
    return JSON.parse(JSON.stringify(__EDX_DEFAULT_SETTINGS));
}

function normalizeEdxSettings(input) {
    const defaults = cloneDefaultEdxSettings();
    const settings = input && typeof input === 'object' ? input : {};
    const next = {
        ai: {
            provider: String(settings.ai?.provider || defaults.ai.provider).toLowerCase() === 'groq' ? 'groq' : 'groq',
            keys: {
                groq: String(settings.ai?.keys?.groq || defaults.ai.keys.groq || '').trim()
            }
        },
        writing: {
            enabled: settings.writing?.enabled !== false,
            insertMode: String(settings.writing?.insertMode || defaults.writing.insertMode) === 'human_type'
                ? 'human_type'
                : defaults.writing.insertMode,
            autoSaveDraft: false,
            autoSubmit: false
        }
    };
    return next;
}

function __edxStorageGet(keys) {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get(keys, (result) => resolve(result || {}));
        } catch (_) {
            resolve({});
        }
    });
}

function __edxStorageSet(payload) {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.set(payload, () => resolve(true));
        } catch (_) {
            resolve(false);
        }
    });
}

async function loadEdxSettings() {
    const result = await __edxStorageGet([__EDX_SETTINGS_KEY]);
    window.__EDX_SETTINGS__ = normalizeEdxSettings(result?.[__EDX_SETTINGS_KEY]);
    try { window.__EDX_PANEL_SETTINGS_API__?.sync?.(window.__EDX_SETTINGS__); } catch (_) { }
    return window.__EDX_SETTINGS__;
}

async function saveEdxSettings(nextSettings) {
    const normalized = normalizeEdxSettings(nextSettings);
    await __edxStorageSet({ [__EDX_SETTINGS_KEY]: normalized });
    window.__EDX_SETTINGS__ = normalized;
    try { window.__EDX_PANEL_SETTINGS_API__?.sync?.(normalized); } catch (_) { }
    return normalized;
}

function getEdxSettings() {
    return normalizeEdxSettings(window.__EDX_SETTINGS__);
}

function sanitizeAiKeyInput(rawValue = '') {
    return String(rawValue || '').replace(/\s+/g, '').trim();
}

function isLikelyApiKey(provider, value = '') {
    const key = sanitizeAiKeyInput(value);
    if (provider === 'groq') return key.startsWith('gsk_');
    return false;
}

function getAiProviderConfig() {
    const settings = getEdxSettings();
    return {
        provider: 'groq',
        key: sanitizeAiKeyInput(settings.ai?.keys?.groq || '')
    };
}

function hasConfiguredAiKey() {
    const { provider, key } = getAiProviderConfig();
    return !!key && isLikelyApiKey(provider, key);
}

function getWritingState() {
    return window.__EDX_WRITING_STATE__;
}

function updateWritingState(patch) {
    Object.assign(window.__EDX_WRITING_STATE__, patch || {});
    return window.__EDX_WRITING_STATE__;
}

function __writingVisibleText(value, limit = 2400) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function __collectVisibleWritingText(selectors, limit = 2400) {
    const out = [];
    const seen = new Set();
    selectors.forEach((selector) => {
        try {
            document.querySelectorAll(selector).forEach((node) => {
                if (!node || !isElementVisible(node)) return;
                if (node.matches?.('textarea, input, iframe, script, style')) return;
                const text = __writingVisibleText(node.innerText || node.textContent || '', limit);
                if (!text) return;
                const key = text.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                out.push(text);
            });
        } catch (_) { }
    });
    return out.join('\n\n').slice(0, limit);
}

function extractWritingContext() {
    const lessonTitle = __writingVisibleText(
        document.querySelector('.learning__courseName, .learning__lessonName, .learning__title, .lpTitle, .prHeader__title, h1, h2')?.textContent || '',
        160
    );
    const stepTitle = __writingVisibleText(
        document.querySelector('.learning__PATC_stepName, .learning__PATC_currentTask, .learning__breadcrumb, .practice__title, .taskTitle')?.textContent || '',
        120
    );
    const prompt = __collectVisibleWritingText([
        '.prOpenEnded__qaItemText',
        '.prWriting__instruction',
        '.prWriting__question',
        '.prWriting__prompt',
        '.questionText',
        '.learning__instruction',
        '.learning__container h3',
        '.learning__container h4',
        '.writingEditHeader',
        '.integratedWriting__instruction'
    ], 3200);
    const resource = __collectVisibleWritingText([
        '.writingEditResourceSide',
        '.prOpenEnded__resourceText',
        '.prOpenEnded__readingText',
        '.learning__leftCol',
        '.learning__resource',
        '.prWriting__resource',
        '.prWriting__left',
        '.practice__resource',
        '.practice__container .left',
        '.lessonPlayArea'
    ], 4800);
    const bodyIntro = __writingVisibleText(document.body?.innerText || '', 1800);
    const pageKey = [location.pathname, lessonTitle, stepTitle, prompt.slice(0, 220), resource.slice(0, 220)]
        .filter(Boolean)
        .join('::')
        .toLowerCase();

    return {
        lessonTitle,
        stepTitle,
        prompt: prompt || bodyIntro,
        resource,
        pageKey
    };
}

function __writingActionLabel(action = 'draft') {
    if (action === 'rewrite') return 'rewrite the draft for better clarity';
    if (action === 'shorten') return 'shorten the draft while keeping the key meaning';
    if (action === 'improve') return 'improve the draft with better word choice and coherence';
    return 'write a strong first draft';
}

function __buildWritingMessages(action, context) {
    const system = [
        'You are an English writing assistant for English Discoveries learners.',
        'Return ONLY one valid JSON object.',
        'Do not wrap JSON in markdown or code fences.',
        'Write in natural student-friendly English.',
        'Respect the prompt and any visible instructions from the page.',
        'Output schema:',
        '{"type":"writing_assist","language":"en","draft":"...","tone":"natural","notes":["..."],"variants":{"short":"...","improved":"..."}}'
    ].join(' ');

    const user = [
        'Task:',
        __writingActionLabel(action),
        '',
        `Lesson: ${context.lessonTitle || 'unknown'}`,
        `Step: ${context.stepTitle || 'unknown'}`,
        '',
        'Prompt / instruction:',
        context.prompt || 'No prompt found.',
        '',
        'Reference text / reading material:',
        context.resource || 'No reference text found.',
        '',
        'Requirements:',
        '- "draft" is required and must contain the main answer.',
        '- "tone" must be one short label.',
        '- "notes" must be a short array of guidance points.',
        '- "variants.short" can be omitted or empty if not needed.',
        '- "variants.improved" can be omitted or empty if not needed.',
        '- Keep line breaks natural for a student writing response.'
    ].join('\n');

    return [
        { role: 'system', content: system },
        { role: 'user', content: user }
    ];
}

async function __fetchWithTimeout(url, options = {}, timeoutMs = 45000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    try {
        const response = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
        return response;
    } finally {
        clearTimeout(timer);
    }
}

function __stripJsonFence(text = '') {
    const raw = String(text || '').trim();
    if (!raw) return '';
    return raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

function parseWritingAiResult(rawText) {
    const text = __stripJsonFence(rawText);
    let parsed = {};
    try {
        parsed = JSON.parse(text);
    } catch (_) {
        throw new Error('AI trả về JSON không hợp lệ');
    }

    const draft = String(parsed?.draft || '').trim();
    if (!draft) throw new Error('AI không trả về draft');

    return {
        type: 'writing_assist',
        language: String(parsed?.language || 'en').trim() || 'en',
        draft,
        tone: String(parsed?.tone || 'natural').trim() || 'natural',
        notes: Array.isArray(parsed?.notes)
            ? parsed.notes.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
            : [],
        variants: {
            short: String(parsed?.variants?.short || '').trim(),
            improved: String(parsed?.variants?.improved || '').trim()
        }
    };
}

function resolveWritingVariantText(result, action = 'draft') {
    if (!result) return '';
    if (action === 'shorten' && result.variants?.short) return result.variants.short;
    if ((action === 'rewrite' || action === 'improve') && result.variants?.improved) return result.variants.improved;
    return String(result.draft || '').trim();
}

async function requestWritingDraft(action = 'draft') {
    const { provider, key } = getAiProviderConfig();
    if (!key) throw new Error('Thiếu Groq API key');
    if (!isLikelyApiKey(provider, key)) throw new Error('Groq API key không đúng định dạng');

    const context = extractWritingContext();
    if (!context.prompt && !context.resource) {
        throw new Error('Không lấy được ngữ cảnh writing từ trang');
    }

    updateWritingState({
        busy: true,
        status: 'loading',
        lastAction: action,
        lastError: '',
        pageKey: context.pageKey
    });

    try {
        const response = await __fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                temperature: action === 'draft' ? 0.7 : 0.5,
                max_tokens: 1800,
                response_format: { type: 'json_object' },
                messages: __buildWritingMessages(action, context)
            })
        }, 60000);

        const data = await response.json().catch(() => ({}));
        const providerError = data?.error?.message || '';
        if (!response.ok || providerError) {
            throw new Error(providerError || `Groq request failed (${response.status})`);
        }

        const content = String(data?.choices?.[0]?.message?.content || '').trim();
        if (!content) throw new Error('Groq không trả về nội dung');
        const result = parseWritingAiResult(content);
        result.pageKey = context.pageKey;
        result.context = context;
        updateWritingState({
            busy: false,
            status: 'ready',
            lastAction: action,
            lastResult: result,
            lastError: '',
            generatedAt: Date.now(),
            pageKey: context.pageKey
        });
        return result;
    } catch (error) {
        updateWritingState({
            busy: false,
            status: 'error',
            lastAction: action,
            lastError: error?.message || 'Lỗi Groq',
            lastResult: null
        });
        throw error;
    }
}

window.loadEdxSettings = loadEdxSettings;
window.saveEdxSettings = saveEdxSettings;
window.getEdxSettings = getEdxSettings;
window.getAiProviderConfig = getAiProviderConfig;
window.hasConfiguredAiKey = hasConfiguredAiKey;
window.extractWritingContext = extractWritingContext;
window.getWritingState = getWritingState;
window.updateWritingState = updateWritingState;
window.requestWritingDraft = requestWritingDraft;
window.resolveWritingVariantText = resolveWritingVariantText;

void loadEdxSettings();
