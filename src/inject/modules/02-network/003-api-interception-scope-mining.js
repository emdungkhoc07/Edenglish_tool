// ========================= API INTERCEPTION + SCOPE MINING =========================
// Runs BEFORE everything else to hook XHR/fetch as early as possible.
// Captures the EXACT API responses the page receives — no URL normalization issues.
(function () {
    'use strict';
    if (window.__EDX_API_HOOKED__) return;
    window.__EDX_API_HOOKED__ = true;
    const __IDEBUG = false; // set true khi debug inject.js
    const _ilog = (...a) => { if (__IDEBUG) console.log('[edx-intercept]', ...a); };
    const isValidBridgeEvent = window.__edxValidBridgeEvent || (() => true);
    const obfEvent = window.__edxBridgeEventName || ((type) => type);
    const createBridgeEvent = window.__edxCreateBridgeEvent ||
        ((type, params) => new CustomEvent(obfEvent(type), params));
    const dispatchBridge = (type, detail) => {
        document.dispatchEvent(createBridgeEvent(type, {
            detail: window.__edxBridgeDetail ? window.__edxBridgeDetail(detail) : detail
        }));
    };
    const addBridgeListener = (type, handler) => {
        document.addEventListener(obfEvent(type), (e) => {
            if (!isValidBridgeEvent(e)) return;
            handler(e);
        });
    };

    const __captured = [];
    const MAX_CAP = 30;
    const API_PATTERN = /practiceManager|Assessments|GetItem/i;

    function storeCapture(url, data, status) {
        __captured.unshift({ url, data, at: Date.now(), status });
        if (__captured.length > MAX_CAP) __captured.length = MAX_CAP;
    }

    // ─── Hook XMLHttpRequest ───
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = new Proxy(origOpen, {
        apply(target, xhr, args) {
            const [, url] = args;
            xhr.__edx_url = typeof url === 'string' ? url : String(url);
        // Capture itemId from GetItem URL for speaking bypass
        try {
            const _u = xhr.__edx_url;
            if (_u && _u.includes('GetItem')) {
                const parts = new URL(_u, location.origin).pathname.split('/').filter(Boolean);
                const idx = parts.indexOf('GetItem');
                if (idx >= 0 && idx + 1 < parts.length) {
                    const candidate = parts[idx + 1];
                    if (/^\d+$/.test(candidate)) {
                        Object.defineProperty(window, '__edx_lastItemId', {
                            value: candidate, writable: true, configurable: true, enumerable: false
                        });
                    }
                }
            }
        } catch (_) {}
            return Reflect.apply(target, xhr, args);
        }
    });

    XMLHttpRequest.prototype.send = new Proxy(origSend, {
        apply(target, xhr, args) {
            const url = xhr.__edx_url || '';
            if (API_PATTERN.test(url)) {
                xhr.addEventListener('load', function () {
                try {
                    if (this.status < 200 || this.status >= 400) return;
                    const text = this.responseText;
                    if (!text || text.length < 50 || (text[0] !== '{' && text[0] !== '[')) return;
                    const data = JSON.parse(text);
                    storeCapture(url, data, this.status);
                    _ilog('Captured XHR:', url.substring(0, 100));
                } catch (_) { }
            });
        }
            return Reflect.apply(target, xhr, args);
        }
    });

    // ─── Hook fetch ───
    const origFetch = window.fetch;
    if (origFetch) {
        window.fetch = new Proxy(origFetch, {
            apply(target, thisArg, args) {
                const [input] = args;
                const url = typeof input === 'string' ? input : input?.url || '';
                const result = Reflect.apply(target, thisArg, args);
                if (API_PATTERN.test(url)) {
                    result.then(resp => {
                        if (!resp.ok) return;
                        resp.clone().text().then(text => {
                            try {
                                if (!text || text.length < 50 || (text[0] !== '{' && text[0] !== '[')) return;
                                const data = JSON.parse(text);
                                storeCapture(url, data, resp.status);
                                _ilog('Captured fetch:', url.substring(0, 100));
                            } catch (_) { }
                        }).catch(() => { });
                    }).catch(() => { });
                }
                return result;
            }
        });
    }

    // ─── Content script requests captured payloads ───
    addBridgeListener('__edx_get_captures', (e) => {
        const requestId = typeof e?.detail?.requestId === 'string' ? e.detail.requestId : '';
        try {
            const payload = __captured.map(c => ({ url: c.url, data: c.data, at: c.at }));
            dispatchBridge('__edx_captures_response', { requestId, captures: JSON.stringify(payload) });
        } catch (e) {
            dispatchBridge('__edx_captures_response', { requestId, captures: '[]' });
        }
    });

    // ─── Angular Scope Mining ───
    addBridgeListener('__edx_mine_scope', (e) => {
        const requestId = typeof e?.detail?.requestId === 'string' ? e.detail.requestId : '';
        try {
            const result = mineScope();
            dispatchBridge('__edx_scope_result', { requestId, result: JSON.stringify(result) });
        } catch (e) {
            _ilog('Scope mining error:', e.message);
            dispatchBridge('__edx_scope_result', { requestId, result: JSON.stringify({ correct: [], all: [], source: 'error' }) });
        }
    });

    function mineScope() {
        const result = { correct: [], all: [], source: 'scope', rawItems: [] };
        if (!window.angular) { result.source = 'no-angular'; return result; }

        const visited = new WeakSet();
        const answerArrays = [];

        function findAnswerArrays(obj, depth, path) {
            if (!obj || typeof obj !== 'object' || depth > 5) return;
            try { if (visited.has(obj)) return; visited.add(obj); } catch (_) { return; }

            if (Array.isArray(obj)) {
                if (obj.length >= 2 && obj.length <= 30) {
                    const withC = obj.filter(item => item && typeof item === 'object' && 'c' in item);
                    const withTxt = obj.filter(item => item && typeof item === 'object' && ('txt' in item || 'text' in item || 't' in item));
                    if (withC.length >= 2 && withTxt.length >= 2) {
                        answerArrays.push({ path, arr: obj });
                    }
                }
                for (let i = 0; i < Math.min(obj.length, 20); i++) {
                    if (obj[i] && typeof obj[i] === 'object') findAnswerArrays(obj[i], depth + 1, path + '[' + i + ']');
                }
                return;
            }

            for (const key of Object.keys(obj)) {
                if (key.startsWith('$') || key.startsWith('_') || key === 'constructor' || key === 'prototype') continue;
                try {
                    const val = obj[key];
                    if (val && typeof val === 'object') findAnswerArrays(val, depth + 1, path + '.' + key);
                } catch (_) { }
            }
        }

        const roots = document.querySelectorAll(
            '.lessonPlayArea, .practice__container, .prMCQ, ' +
            '.lessonMultipleAnswers, [ng-controller], ' +
            'ed-la-taskspager, .learning__container, main, #app'
        );

        const scopes = new WeakSet();
        for (const el of roots) {
            try {
                let scope = window.angular.element(el).scope?.();
                for (let d = 0; d < 6 && scope; d++) {
                    if (scopes.has(scope)) break;
                    scopes.add(scope);
                    for (const key of Object.keys(scope)) {
                        if (key.startsWith('$') || key.startsWith('_')) continue;
                        try {
                            const val = scope[key];
                            if (!val || typeof val !== 'object') continue;
                            findAnswerArrays(val, 0, 'scope.' + key);
                        } catch (_) { }
                    }
                    scope = scope.$parent;
                }
            } catch (_) { }
        }

        const seenCorrect = new Set();
        const seenAll = new Set();

        for (const { path, arr } of answerArrays) {
            _ilog('Found answer array at', path, 'length:', arr.length);
            for (const item of arr) {
                if (!item || typeof item !== 'object') continue;
                const txt = (item.txt || item.text || item.t || '').toString().trim();
                if (!txt) continue;
                const n = txt.toLowerCase().replace(/\s+/g, ' ').trim();

                if (!seenAll.has(n)) { seenAll.add(n); result.all.push(txt); }
                if ((item.c === 1 || item.c === '1' || item.c === true) && !seenCorrect.has(n)) {
                    seenCorrect.add(n);
                    result.correct.push(txt);
                }
            }
            // Store raw items for content.js to analyze
            result.rawItems.push(...arr.map(item => {
                if (!item || typeof item !== 'object') return null;
                const copy = {};
                for (const k of Object.keys(item)) {
                    try { const v = item[k]; if (typeof v !== 'function' && typeof v !== 'object') copy[k] = v; } catch (_) { }
                }
                return copy;
            }).filter(Boolean));
        }

        // Also search for "right answer" properties in scopes
        const raKeys = ['ra', 'ri', 'rightAnswer', 'correctAnswer', 'correctAnswers', 'right_answer', 'ca', 'cr'];
        for (const el of roots) {
            try {
                let scope = window.angular.element(el).scope?.();
                for (let d = 0; d < 4 && scope; d++) {
                    for (const key of Object.keys(scope)) {
                        if (key.startsWith('$') || key.startsWith('_')) continue;
                        const val = scope[key];
                        if (!val || typeof val !== 'object') continue;

                        for (const raKey of raKeys) {
                            try {
                                const raVal = val[raKey];
                                if (raVal !== undefined && raVal !== null && raVal !== '') {
                                    result['scope_' + key + '_' + raKey] = raVal;
                                }
                            } catch (_) { }
                        }

                        // One level deeper (val.i, val.item, val.q, val.question)
                        for (const inner of [val.i, val.item, val.q, val.question]) {
                            if (!inner || typeof inner !== 'object') continue;
                            for (const raKey of raKeys) {
                                try {
                                    const raVal = inner[raKey];
                                    if (raVal !== undefined && raVal !== null && raVal !== '') {
                                        result['scope_' + key + '_inner_' + raKey] = raVal;
                                    }
                                } catch (_) { }
                            }
                        }
                    }
                    scope = scope.$parent;
                }
            } catch (_) { }
        }

        return result;
    }

    // ─── Card Match Scope Mining ───
    addBridgeListener('__edx_mine_cards', (e) => {
        const requestId = typeof e?.detail?.requestId === 'string' ? e.detail.requestId : '';
        try {
            const result = mineCardScopes();
            dispatchBridge('__edx_cards_result', { requestId, result: JSON.stringify(result) });
        } catch (e) {
            _ilog('Card mining error:', e.message);
            dispatchBridge('__edx_cards_result', { requestId, result: JSON.stringify({ cards: [], error: e.message }) });
        }
    });

    function mineCardScopes() {
        const cards = [];
        if (!window.angular) return { cards, error: 'no-angular' };

        const playArea = document.querySelector('.lessonPlayArea') ||
            document.querySelector('.practice__container') ||
            document.querySelector('.learning__container') ||
            document.querySelector('ed-la-taskspager') ||
            document.querySelector('[ng-controller]') ||
            document.querySelector('main') ||
            document.body;
        if (!playArea) return { cards, error: 'no-play-area' };

        const clickables = playArea.querySelectorAll('[ng-click]');
        clickables.forEach((el, elIndex) => {
            try {
                const scope = window.angular.element(el).scope();
                if (!scope) return;

                const entry = { _elIndex: elIndex };
                let found = false;

                // Deep search for card-related data in scope
                for (const key of Object.keys(scope)) {
                    if (key.startsWith('$') || key.startsWith('_')) continue;
                    const val = scope[key];
                    if (val == null) continue;

                    // Primitive that looks like a resource id
                    if (typeof val === 'number' && key.toLowerCase().includes('id')) {
                        entry[key] = val;
                        continue;
                    }

                    if (typeof val !== 'object') continue;

                    // Search object for rid, src, txt, id, answerId, mId
                    const searchObj = (obj, prefix) => {
                        if (!obj || typeof obj !== 'object') return;
                        for (const k of Object.keys(obj)) {
                            try {
                                const v = obj[k];
                                if (v == null || typeof v === 'function') continue;
                                const lk = k.toLowerCase();
                                if (typeof v === 'number' || typeof v === 'string') {
                                    // Capture resource IDs, sources, text, answer IDs
                                    if (lk === 'rid' || lk === 'resourceid' || lk === 'res_id') entry.rid = v;
                                    else if (lk === 'src' || lk === 'imgsrc' || lk === 'image' || lk === 'resource' || lk === 'img') {
                                        if (typeof v === 'string' && v.length > 3 && !String(v).includes('cardBack')) entry.src = v;
                                    }
                                    else if (lk === 'txt' || lk === 'text' || lk === 'label' || lk === 'word') {
                                        if (typeof v === 'string' && v.length > 0) entry.txt = v;
                                    }
                                    else if (lk === 'id' && typeof v === 'number') {
                                        if (!entry.cardId) entry.cardId = v;
                                    }
                                    else if (lk === 'answerid' || lk === 'answer_id' || lk === 'aid') entry.answerId = v;
                                    else if (lk === 'mid' || lk === 'mediaid') entry.mId = v;
                                    else if (lk === 't' && typeof v === 'string' && v.length <= 2) entry.cardType = v;
                                }
                                // One level deeper for nested objects (but not arrays)
                                if (typeof v === 'object' && !Array.isArray(v) && prefix.length < 2) {
                                    searchObj(v, prefix + k + '.');
                                }
                                // Check array[0] for resource refs
                                if (Array.isArray(v) && v.length > 0 && v.length <= 4 && typeof v[0] === 'object') {
                                    searchObj(v[0], prefix + k + '[0].');
                                }
                            } catch (_) { }
                        }
                    };

                    searchObj(val, key + '.');
                }

                // Only add if we found some identifying info
                if (entry.rid != null || entry.src || entry.txt || entry.cardId != null || entry.answerId != null || entry.mId) {
                    cards.push(entry);
                }
            } catch (_) { }
        });

        _ilog('Card mining found', cards.length, 'card entries');
        return { cards };
    }

    _ilog('✓ API interception + scope mining active');
})();

