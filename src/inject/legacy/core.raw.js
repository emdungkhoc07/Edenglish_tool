// ========================= CONSOLE FILTER =========================
// Suppress noisy page logs to keep DevTools clean
(function () {
    'use strict';
    if (window.__EDX_INJECT_CONSOLE_HOOKED__) return;
    window.__EDX_INJECT_CONSOLE_HOOKED__ = true;
    const FILTER_PAGE_CONSOLE = (() => {
        try {
            return window.localStorage?.getItem('edx_filter_page_console') === '1' ||
                window.__EDX_FILTER_PAGE_CONSOLE === true;
        } catch (_) {
            return window.__EDX_FILTER_PAGE_CONSOLE === true;
        }
    })();
    if (!FILTER_PAGE_CONSOLE) return;

    const _origLog = console.log;
    const _origWarn = console.warn;
    const NOISE = [
        /^\[?SP:/i, /^Loading\.\.\.$/i, /^Checking for missing/i,
        /SCRIPT\s+https?:\/\//i, /^SR\s*=>/i, /^true$/,
        /^psc$/, /^totalTime$/, /^rsch$/, /^eos$/, /^timeUpdate$/,
        /syncAudioPlayer/i, /^Skill-/i, /^Course name-/i,
        /InitSP/i, /Initializing/i
    ];
    const isNoisy = (args) => {
        if (!args.length) return false;
        const first = String(args[0]);
        return NOISE.some(rx => rx.test(first));
    };
    console.log = function (...args) { if (!isNoisy(args)) _origLog.apply(console, args); };
    console.warn = function (...args) { if (!isNoisy(args)) _origWarn.apply(console, args); };
})();

// ========================= EVENT OBFUSCATION BRIDGE =========================
(function () {
    'use strict';
    if (window.__EDX_PAGE_OBF_HOOKED__) return;
    window.__EDX_PAGE_OBF_HOOKED__ = true;

    const __EDX_HASH = sessionStorage.getItem('__edx_eh') || '';
    const __EDX_BRIDGE_TOKEN = sessionStorage.getItem('__edx_bt') || '';
    const NativeCustomEvent = window.CustomEvent;
    const obfEvent = (type) => {
        if (!__EDX_HASH || typeof type !== 'string') return type;
        return type.startsWith('__edx_') ? `_${__EDX_HASH}_${type}` : type;
    };

    window.__edxBridgeDetail = (detail) => {
        const next = (detail && typeof detail === 'object') ? { ...detail } : {};
        if (__EDX_BRIDGE_TOKEN) next.__edxToken = __EDX_BRIDGE_TOKEN;
        return next;
    };
    window.__edxValidBridgeEvent = (e) => !__EDX_BRIDGE_TOKEN || e?.detail?.__edxToken === __EDX_BRIDGE_TOKEN;
    window.__edxBridgeEventName = obfEvent;
    window.__edxCreateBridgeEvent = (type, params) => {
        const nextParams = (() => {
            if (!__EDX_BRIDGE_TOKEN || typeof type !== 'string' || !type.startsWith('__edx_')) return params;
            const cloned = params ? { ...params } : {};
            const detail = (params?.detail && typeof params.detail === 'object') ? { ...params.detail } : {};
            detail.__edxToken = __EDX_BRIDGE_TOKEN;
            cloned.detail = detail;
            return cloned;
        })();
        return new NativeCustomEvent(obfEvent(type), nextParams);
    };
})();

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

// ========================= edx PAGE-CONTEXT BRIDGE =========================
// This script runs in the PAGE's JavaScript context (not the content script).
// It can access window.angular, Dragula drakes, and perform real drag simulations.

(function () {
    'use strict';
    if (window.__EDX_PAGE_BRIDGE_HOOKED__) return;
    window.__EDX_PAGE_BRIDGE_HOOKED__ = true;

    const __JDEBUG = false; // set true khi debug inject bridge
    const _log = (...a) => { if (__JDEBUG) console.log('[edx-inject]', ...a); };
    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    // ─── Capture drake instances by hooking dragula constructor ───
    const __capturedDrakes = [];
    try {
        if (typeof window.dragula === 'function') {
            const origDragula = window.dragula;
            window.dragula = function (...args) {
                const drake = origDragula.apply(this, args);
                if (drake && typeof drake.on === 'function') {
                    __capturedDrakes.push(drake);
                    _log('Captured drake from constructor hook, total:', __capturedDrakes.length);
                }
                return drake;
            };
            Object.assign(window.dragula, origDragula);
        }
    } catch (_) { }

    // ─── Find drake by walking up from a container ───
    function findDrake(startEl) {
        // First check captured drakes (most reliable)
        for (const drake of __capturedDrakes) {
            if (drake && Array.isArray(drake.containers) && drake.containers.length > 0) {
                // Check if the element or any ancestor is in a drake container
                let el = startEl;
                for (let d = 0; d < 8 && el; d++) {
                    if (drake.containers.includes(el)) return drake;
                    el = el.parentElement;
                }
            }
        }
        // Return any captured drake as fallback (usually only 1 per page)
        if (__capturedDrakes.length === 1 && __capturedDrakes[0]?.containers?.length > 0) {
            return __capturedDrakes[0];
        }

        if (!window.angular) return null;

        let el = startEl;
        for (let depth = 0; depth < 10 && el; depth++) {
            try {
                const ngEl = window.angular.element(el);
                if (!ngEl || !ngEl.length) { el = el.parentElement; continue; }

                // Check scope hierarchy
                let scope = ngEl.scope?.();
                for (let sd = 0; sd < 6 && scope; sd++) {
                    for (const k in scope) {
                        if (k.startsWith('$') || k.startsWith('_')) continue;
                        try {
                            const v = scope[k];
                            if (v && typeof v === 'object' && typeof v.emit === 'function' &&
                                typeof v.destroy === 'function' && Array.isArray(v.containers)) {
                                _log('Found drake via scope key:', k, 'on depth:', depth, 'scope-depth:', sd);
                                return v;
                            }
                            // nested .drake property (dragulaService bag)
                            if (v && typeof v === 'object' && v.drake &&
                                typeof v.drake.emit === 'function' && Array.isArray(v.drake.containers)) {
                                _log('Found drake.drake via scope key:', k);
                                return v.drake;
                            }
                        } catch (_) { }
                    }
                    scope = scope.$parent;
                }

                // Check jQuery/jqLite data for drake
                const data = ngEl.data?.();
                if (data) {
                    for (const key in data) {
                        try {
                            const val = data[key];
                            if (val && typeof val.emit === 'function' && Array.isArray(val.containers)) {
                                _log('Found drake via jqLite data:', key);
                                return val;
                            }
                        } catch (_) { }
                    }
                }

                // Try injector for dragulaService
                const injector = ngEl.injector?.();
                if (injector) {
                    for (const svcName of ['dragulaService', 'dragula', 'DragulaService']) {
                        try {
                            const svc = injector.get(svcName);
                            if (svc) {
                                const bags = svc._bags || svc.bags || svc._groups;
                                if (bags) {
                                    const bagList = Array.isArray(bags) ? bags : Object.values(bags);
                                    for (const bag of bagList) {
                                        if (bag?.drake) {
                                            _log('Found drake via', svcName);
                                            return bag.drake;
                                        }
                                    }
                                }
                                // Try dragulaService.find(scope, name)
                                if (typeof svc.find === 'function') {
                                    const bagNames = [];
                                    // Collect bag names from dragula/dg-* attributes
                                    const attrEl = el.closest('[dragula], [dg_name], [data-dragula]') || el;
                                    const bagName = attrEl.getAttribute('dragula') || attrEl.getAttribute('dg_name') || attrEl.getAttribute('data-dragula');
                                    if (bagName) bagNames.push(bagName.replace(/['"]/g, ''));
                                    // Also try common names
                                    bagNames.push('bag', 'dnd', 'items', 'bank');
                                    for (const name of bagNames) {
                                        try {
                                            let scope2 = ngEl.scope?.();
                                            for (let sd2 = 0; sd2 < 4 && scope2; sd2++) {
                                                const bag = svc.find(scope2, name);
                                                if (bag?.drake) {
                                                    _log('Found drake via find(' + name + ')');
                                                    return bag.drake;
                                                }
                                                scope2 = scope2.$parent;
                                            }
                                        } catch (_) { }
                                    }
                                }
                            }
                        } catch (_) { }
                    }
                }
            } catch (_) { }
            el = el.parentElement;
        }

        // ── Global fallback: scan all dragula-attributed elements ──
        try {
            const allDragContainers = document.querySelectorAll('[dragula], [dg_name], [data-dragula], .gu-container, .drag-container, .dnd-container, .bank-items');
            for (const dc of allDragContainers) {
                try {
                    const ngDc = window.angular?.element(dc);
                    if (!ngDc) continue;
                    for (const prop of ['drake', 'dragula', '$dragula', '__drake', '_drake']) {
                        const d = ngDc.data?.(prop) || ngDc.scope?.()?.[prop] || ngDc.controller?.()?.[prop];
                        if (d && typeof d.on === 'function') {
                            _log('Found drake via global scan on', dc.tagName, dc.className);
                            return d;
                        }
                    }
                    // Check scope for arrays that look like drake
                    const sc = ngDc.scope?.();
                    if (sc) {
                        for (const k of Object.keys(sc)) {
                            if (k.startsWith('$') || k.startsWith('__')) continue;
                            const v = sc[k];
                            if (v && typeof v === 'object' && typeof v.on === 'function' && typeof v.destroy === 'function' && Array.isArray(v.containers)) {
                                _log('Found drake-like object via global scan, key:', k);
                                return v;
                            }
                        }
                    }
                    // Check injector
                    const inj = ngDc.injector?.();
                    if (inj) {
                        for (const svcName of ['dragulaService', 'dragula']) {
                            try {
                                const svc = inj.get(svcName);
                                const bags = svc?._bags || svc?.bags || svc?._groups;
                                if (bags) {
                                    const bagList = Array.isArray(bags) ? bags : Object.values(bags);
                                    for (const bag of bagList) {
                                        if (bag?.drake) {
                                            _log('Found drake via global', svcName);
                                            return bag.drake;
                                        }
                                    }
                                }
                            } catch (_) { }
                        }
                    }
                } catch (_) { }
            }
        } catch (_) { }

        return null;
    }

    // ─── Dispatch pointer + mouse event pair ───
    function fireEvents(node, type, x, y) {
        const opts = {
            bubbles: true, cancelable: true, composed: true,
            clientX: x, clientY: y, screenX: x, screenY: y + window.screenY,
            pageX: x + window.scrollX, pageY: y + window.scrollY,
            button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse',
            view: window, detail: 1,
            isPrimary: true, width: 1, height: 1, pressure: 0.5,
        };

        const pointerTypes = {
            mousedown: 'pointerdown', mousemove: 'pointermove', mouseup: 'pointerup'
        };

        // Fire pointer event first (modern browsers)
        if (pointerTypes[type]) {
            try { node.dispatchEvent(new PointerEvent(pointerTypes[type], opts)); } catch (_) { }
        }
        // Then mouse event (fallback)
        node.dispatchEvent(new MouseEvent(type, opts));
    }

    // ─── Full drag simulation within page context ───
    async function simulateDragInPage(itemEl, targetEl, sourceEl) {
        const sRect = itemEl.getBoundingClientRect();
        const tRect = targetEl.getBoundingClientRect();

        const sx = sRect.left + sRect.width / 2;
        const sy = sRect.top + sRect.height / 2;
        const tx = tRect.left + tRect.width / 2;
        const ty = tRect.top + tRect.height / 2;

        // CRITICAL: Dragula listens on document.documentElement, NOT document.
        // Events on document never bubble DOWN to documentElement.
        const evtRoot = document.documentElement;

        // Step 1: mousedown on the draggable (bubbles to container → Dragula's grab())
        _log('Drag sim: mousedown at', sx.toFixed(0), sy.toFixed(0));
        fireEvents(itemEl, 'mousedown', sx, sy);
        await delay(80);

        // Step 2: small move to trigger drag start (must reach documentElement)
        fireEvents(evtRoot, 'mousemove', sx + 3, sy + 3);
        await delay(40);
        fireEvents(evtRoot, 'mousemove', sx + 8, sy + 8);
        await delay(40);

        // Step 3: gradual move toward target (5 intermediate steps)
        const steps = 5;
        for (let i = 1; i <= steps; i++) {
            const progress = i / steps;
            const cx = sx + (tx - sx) * progress;
            const cy = sy + (ty - sy) * progress;
            fireEvents(evtRoot, 'mousemove', cx, cy);
            await delay(30);
        }

        // Step 4: final position + mouseup at target
        fireEvents(evtRoot, 'mousemove', tx, ty);
        await delay(20);
        _log('Drag sim: mouseup at', tx.toFixed(0), ty.toFixed(0));
        fireEvents(targetEl, 'mouseup', tx, ty);
        await delay(50);

        return true;
    }

    // ─── Sync drop via Drake or Angular ───
    function syncViaAngular(itemEl, targetEl, sourceEl) {
        if (!window.angular) { _log('No Angular on page'); return false; }

        let success = false;
        let drakeFired = false;

        // Try drake
        const drake = findDrake(targetEl) || findDrake(sourceEl) || findDrake(itemEl);
        if (drake) {
            try {
                const sibling = itemEl.nextSibling;
                // Important: many angular-dragula versions handle the model update automatically 
                // when 'drop' is emitted if the bags are configured with models.
                drake.emit('drop', itemEl, targetEl, sourceEl, sibling);
                drake.emit('dragend', itemEl);
                _log('✓ drake.emit(drop) fired');
                drakeFired = true;
                success = true;
            } catch (e) { _log('Drake emit error:', e.message); }
        } else {
            _log('No drake found, trying scope arrays');
        }

        // Scope array splice (Manual fallback)
        try {
            const srcScope = window.angular.element(sourceEl)?.scope?.();
            const tgtScope = window.angular.element(targetEl)?.scope?.();

            if (srcScope && tgtScope) {
                const itemText = (itemEl.innerText || '').toLowerCase().trim();

                // ng-repeat parsing
                const repeatEl = itemEl.querySelector('[ng-repeat]') || itemEl.closest('[ng-repeat]') || itemEl;
                const repeatAttr = repeatEl?.getAttribute?.('ng-repeat') || '';
                const arrMatch = repeatAttr.match(/(\w+)\s+in\s+(\$?\w[\w.$]*)/);

                let modelUpdated = false;

                if (arrMatch) {
                    const itemScope = window.angular.element(itemEl)?.scope?.();
                    const itemData = itemScope?.$eval?.(arrMatch[1]);
                    const srcArr = srcScope.$eval?.(arrMatch[2]);
                    const tgtArr = tgtScope.$eval?.(arrMatch[2]);

                    if (Array.isArray(srcArr) && Array.isArray(tgtArr) && itemData) {
                        const idx = srcArr.indexOf(itemData);
                        const alreadyInTgt = tgtArr.indexOf(itemData) >= 0;

                        if (idx >= 0 && !alreadyInTgt) {
                            // Only splice manually if drake didn't handle it or if item is missing from target model
                            srcArr.splice(idx, 1);
                            tgtArr.push(itemData);
                            modelUpdated = true;
                            _log('✓ Splice via ng-repeat:', arrMatch[2]);
                        } else if (alreadyInTgt) {
                            _log('! Item already in target model, skipping manual splice');
                            modelUpdated = true;
                        }
                    }
                }

                // Crawl all scope arrays (fallback if ng-repeat detection fails)
                if (!modelUpdated) {
                    const crawl = (src, tgt, label) => {
                        for (const key in src) {
                            if (key.startsWith('$') || key.startsWith('_') || key === 'this') continue;
                            try {
                                const sArr = src[key], tArr = tgt?.[key];
                                if (!Array.isArray(sArr) || !Array.isArray(tArr) || sArr === tArr || !sArr.length) continue;

                                const idx = sArr.findIndex(it => {
                                    if (!it) return false;
                                    const t = (typeof it === 'string' ? it :
                                        (it.text || it.txt || it.label || it.value || it.content ||
                                            it.t || it.name || it.title || it.optionText || it.answer ||
                                            it.display || it.displayText || it.str || '')).toLowerCase().trim();
                                    return t && (t === itemText || t.includes(itemText) || itemText.includes(t));
                                });

                                if (idx >= 0) {
                                    const itemData = sArr[idx];
                                    const alreadyInTgt = tArr.indexOf(itemData) >= 0;

                                    if (!alreadyInTgt) {
                                        tArr.push(sArr.splice(idx, 1)[0]);
                                        _log('✓ Splice via', label, 'key:', key);
                                        return true;
                                    } else {
                                        _log('! Item already in target via', label, 'key:', key);
                                        return true;
                                    }
                                }
                            } catch (_) { }
                        }
                        return false;
                    };

                    modelUpdated = crawl(srcScope, tgtScope, 'scope') ||
                        crawl(srcScope.$parent || {}, tgtScope.$parent || {}, '$parent') ||
                        crawl(srcScope.$root || {}, tgtScope.$root || {}, '$root');
                }

                // Cross-key crawl: source array key ≠ target array key
                // E.g., bank has "bankItems" and zone has "droppedItems"
                if (!modelUpdated) {
                    const crossCrawl = (src, tgt, label) => {
                        // Find source array containing the item text
                        let srcKey = null, srcArr = null, srcIdx = -1, srcItemData = null;
                        for (const key in src) {
                            if (key.startsWith('$') || key.startsWith('_') || key === 'this') continue;
                            try {
                                const arr = src[key];
                                if (!Array.isArray(arr) || !arr.length) continue;
                                const idx = arr.findIndex(it => {
                                    if (!it) return false;
                                    const t = (typeof it === 'string' ? it :
                                        (it.text || it.txt || it.label || it.value || it.content ||
                                            it.t || it.name || it.title || it.optionText || it.answer ||
                                            it.display || it.displayText || it.str || '')).toLowerCase().trim();
                                    return t && (t === itemText || t.includes(itemText) || itemText.includes(t));
                                });
                                if (idx >= 0) { srcKey = key; srcArr = arr; srcIdx = idx; srcItemData = arr[idx]; break; }
                            } catch (_) { }
                        }
                        if (!srcArr) return false;

                        // Find target array (any array, different from srcArr) on the target scope
                        for (const key in tgt) {
                            if (key.startsWith('$') || key.startsWith('_') || key === 'this') continue;
                            try {
                                const arr = tgt[key];
                                if (!Array.isArray(arr) || arr === srcArr) continue;
                                // Prefer empty arrays or arrays whose items look similar (same shape)
                                const sameShape = arr.length === 0 || (srcItemData && arr.length > 0 &&
                                    typeof arr[0] === typeof srcItemData);
                                if (!sameShape) continue;
                                const alreadyInTgt = arr.indexOf(srcItemData) >= 0;
                                if (alreadyInTgt) {
                                    _log('! Cross-key: already in target', label, srcKey, '→', key);
                                    return true;
                                }
                                arr.push(srcArr.splice(srcIdx, 1)[0]);
                                _log('✓ Cross-key splice', label, srcKey, '→', key);
                                return true;
                            } catch (_) { }
                        }
                        return false;
                    };
                    modelUpdated = crossCrawl(srcScope, tgtScope, 'scope') ||
                        crossCrawl(srcScope.$parent || {}, tgtScope.$parent || {}, '$parent');
                }

                // If Drake fired, we usually shouldn't call apply/handlers manually as they might be bound to the drop event
                // but if model was updated manually, we MUST digest.
                if (modelUpdated && !drakeFired) {
                    try {
                        const root = srcScope.$root || tgtScope.$root;
                        if (root && !root.$$phase) root.$apply();
                    } catch (_) { }

                    [srcScope, tgtScope].forEach(s => {
                        if (!s) return;
                        ['saveData', 'checkAnswer', 'save', 'onDrop', 'dropCallback'].forEach(fn => {
                            if (typeof s[fn] === 'function') try { s[fn](); } catch (_) { }
                        });
                    });
                }

                success = success || modelUpdated;
            }
        } catch (e) { _log('Angular error:', e.message); }

        return success;
    }

    // ─── Check if target now contains item (by text match, not just node identity) ───
    function targetHasItemByText(targetEl, itemEl) {
        if (targetEl.contains(itemEl)) return true;
        const itemText = (itemEl.innerText || itemEl.textContent || '').trim().toLowerCase();
        if (!itemText || itemText.length < 2) return false;
        return [...targetEl.querySelectorAll('.dnditem, [class*="dnd"]')].some(it => {
            const t = (it.innerText || it.textContent || '').trim().toLowerCase();
            return t && (t === itemText || (t.length >= 3 && (t.includes(itemText) || itemText.includes(t))));
        });
    }

    // ─── HTML5 DragEvent simulation ───
    async function simulateHTML5Drag(itemEl, targetEl) {
        try {
            const dt = new DataTransfer();
            dt.setData('text/plain', (itemEl.textContent || '').trim());
            dt.effectAllowed = 'move';

            itemEl.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true, cancelable: true }));
            await delay(50);
            targetEl.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
            await delay(20);
            targetEl.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
            await delay(20);
            targetEl.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
            await delay(20);
            itemEl.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true }));
            await delay(100);
            return true;
        } catch (e) {
            _log('HTML5 drag error:', e.message);
            return false;
        }
    }

    // ─── Main handler: content.js sends commands here ───
    addBridgeListener('__edx_sync_drop', async (e) => {
        try {
            const { itemSelector, targetSelector, sourceSelector, mode } = e.detail || {};
            const itemEl = document.querySelector(itemSelector);
            const targetEl = document.querySelector(targetSelector);
            const sourceEl = sourceSelector ? document.querySelector(sourceSelector) : null;

            if (!itemEl || !targetEl) {
                _log('Elements not found');
                dispatchBridge('__edx_sync_result', { success: false });
                return;
            }

            let success = false;

            // Strategy 1: Angular/Drake model sync
            // NOTE: No mouse simulation here — content.js handles mouse events.
            // Running mouse events from both inject.js and content.js causes double-fire
            // that confuses the DnD library ("pick up then drop back").
            _log('=== Strategy 1: Angular/Drake sync ===');
            const angularOk = syncViaAngular(itemEl, targetEl, sourceEl || itemEl.parentElement);
            success = angularOk;

            // Strategy 2: HTML5 DragEvent (for angular-drag-and-drop-lists, native DnD directives)
            // Skip on Dragula sites — HTML5 DragEvent never works with Dragula
            const isDragulaPage = !!document.querySelector('[dragula], [dg_name], [data-dragula], .gu-container');
            if (!success && !isDragulaPage) {
                _log('=== Strategy 2: HTML5 DragEvent ===');
                await simulateHTML5Drag(itemEl, targetEl);
                await delay(150);
                if (targetHasItemByText(targetEl, itemEl)) {
                    _log('✓ HTML5 drag moved item');
                    success = true;
                }
            }

            dispatchBridge('__edx_sync_result', { success });
        } catch (e) {
            _log('Handler error:', e.message);
            dispatchBridge('__edx_sync_result', { success: false });
        }
    });

    // ─── Debug helper ───
    addBridgeListener('__edx_debug_scope', (e) => {
        try {
            const el = document.querySelector(e.detail?.selector || '.dndZone, .dnd-target');
            const info = { hasAngular: !!window.angular, hasDrake: false, arrays: {}, parentArrays: {} };
            if (!el || !window.angular) {
                dispatchBridge('__edx_debug_result', info);
                return;
            }
            info.hasDrake = !!findDrake(el);
            const scope = window.angular.element(el).scope?.();
            if (scope) {
                for (const k in scope) {
                    if (!k.startsWith('$') && !k.startsWith('_') && Array.isArray(scope[k]))
                        info.arrays[k] = scope[k].length;
                }
                if (scope.$parent) {
                    for (const k in scope.$parent) {
                        if (!k.startsWith('$') && !k.startsWith('_') && Array.isArray(scope.$parent[k]))
                            info.parentArrays[k] = scope.$parent[k].length;
                    }
                }
            }
            dispatchBridge('__edx_debug_result', info);
        } catch (e) {
            dispatchBridge('__edx_debug_result', { error: e.message });
        }
    });

    addBridgeListener('__edx_sync_element', (e) => {
        try {
            const tag = e.detail?.tag;
            if (!tag) return;
            const el = document.querySelector(`[data-edx-sync="${tag}"]`);
            if (el && window.angular) {
                const ngEl = window.angular.element(el);
                if (ngEl) {
                    const scope = ngEl.scope?.();
                    if (scope && !scope.$$phase && !scope.$root?.$$phase) {
                        scope.$apply();
                    } else {
                        // Fallback: button has no own scope (e.g. Start Test) → kick rootScope
                        const rootEl = document.querySelector('ed-la-taskspager, .learning__container, .practice__container, [ng-app], body');
                        if (rootEl && window.angular) {
                            const rs = window.angular.element(rootEl).scope?.call?.(window.angular.element(rootEl))?.$root;
                            if (rs && !rs.$$phase) rs.$apply();
                        }
                    }
                }
            }
        } catch (_) { }
    });

    addBridgeListener('__edx_click_start_test', () => {
        try {
            const btn = document.querySelector('.btnStartTest') ||
                [...document.querySelectorAll('button, a, [role="button"]')]
                    .find(el => /start\s*test/i.test(el.textContent || ''));
            if (!btn) return;
            btn.click();
            if (window.angular) {
                const rootEl = document.querySelector('[ng-app]') || document.body;
                const scope = window.angular.element(rootEl).scope?.call?.(window.angular.element(rootEl))?.$root;
                if (scope && !scope.$$phase) scope.$apply();
            }
        } catch (_) {}
    });

    // ─── DnD Sync (Force Angular Digest after manual Drop) ───
    addBridgeListener('__edx_sync_drop_request', (e) => {
        let success = false;
        try {
            const { sourceIdx, targetIdx, sourceText } = e.detail || {};
            // Attempt broad scope digest
            if (window.angular) {
                const zones = document.querySelectorAll('[drop-zone], .dndDropZone, ed-la-dndzone');
                if (targetIdx >= 0 && targetIdx < zones.length) {
                    const ngEl = window.angular.element(zones[targetIdx]);
                    const scope = ngEl?.scope?.();
                    if (scope) {
                        try {
                            // Let dragula or custom ng-drop handles it, we just kick the digest cycle
                            scope.$broadcast('dragula.drop');
                            if (!scope.$$phase && !scope.$root?.$$phase) scope.$apply();
                            success = true;
                        } catch (_) { }
                    }
                }
                // Global fallback digest just in case
                if (!success) {
                    const rootEl = document.querySelector('.lessonPlayArea, .practice__container, ed-la-taskspager');
                    if (rootEl) {
                        const rootScope = window.angular.element(rootEl).scope?.();
                        if (rootScope && !rootScope.$$phase && !rootScope.$root?.$$phase) {
                            rootScope.$apply();
                            success = true;
                        }
                    }
                }
            }
        } catch (_) { }

        dispatchBridge('__edx_sync_drop_ok', { ok: success });
    });

    addBridgeListener('__edx_sync_input', (e) => {
        try {
            const tag = e.detail?.tag;
            const value = e.detail?.value || '';
            if (!tag) return;
            const el = document.querySelector(`[data-edx-input-sync="${tag}"]`);
            if (!el) return;

            const invokeFns = (scopeObj) => {
                if (!scopeObj) return;
                ['saveData', 'checkAnswer', 'save', 'validate', 'onInput', 'onChange', 'updateAnswer', 'submit'].forEach(fn => {
                    if (typeof scopeObj[fn] === 'function') {
                        try { scopeObj[fn](value); } catch (_) { }
                    }
                });
            };

            if (window.angular) {
                const ngEl = window.angular.element(el);
                const ctrl = ngEl?.controller?.('ngModel');
                if (ctrl && typeof ctrl.$setViewValue === 'function') {
                    try {
                        ctrl.$setViewValue(value);
                        ctrl.$render?.();
                    } catch (_) { }
                } else if (el.isContentEditable) {
                    // Fallback for span.et contenteditable without explicit ngModel
                    try { ngEl.html(value); } catch (_) { }
                }

                const scope = ngEl?.scope?.();
                const parent = scope?.$parent;
                const root = scope?.$root;

                [scope, parent, root].forEach(invokeFns);

                [scope, parent, root].forEach(s => {
                    try {
                        if (s && !s.$$phase && !s.$root?.$$phase) s.$apply();
                    } catch (_) { }
                });
            }

            try {
                const form = el.closest('form');
                if (form) {
                    form.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    form.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                }
            } catch (_) { }
        } catch (_) { }
    });

    addBridgeListener('__edx_force_commit', () => {
        try {
            const runFns = (obj) => {
                if (!obj) return;
                ['saveData', 'checkAnswer', 'save', 'validate', 'markAsComplete', 'completeTask', 'submit', 'onSubmit'].forEach(fn => {
                    if (typeof obj[fn] === 'function') {
                        try { obj[fn](); } catch (_) { }
                    }
                });

                // Trigger pm.setUserAnswer if available (for practice manager integration)
                if (obj.pm && typeof obj.pm.setUserAnswer === 'function') {
                    try {
                        const editor = document.querySelector('.tox-edit-area iframe, .mce-content-body, [contenteditable="true"]');
                        const answerText = editor?.innerText || editor?.textContent || '';
                        obj.pm.setUserAnswer(answerText);
                        _ilog('[EDX] force_commit: pm.setUserAnswer called');
                    } catch (_) { }
                }

                // Trigger pmNotify:itemDone if pm.notify exists
                if (obj.pm && typeof obj.pm.notify === 'function') {
                    try {
                        obj.pm.notify('itemDone');
                        _ilog('[EDX] force_commit: pm.notify(itemDone) called');
                    } catch (_) { }
                }

                ['isDirty', 'isTouched', 'isAnswered', 'isTaskCompleted', 'disabled', 'isReadOnly'].forEach(flag => {
                    try {
                        if (!(flag in obj)) return;
                        if (flag === 'disabled' || flag === 'isReadOnly') obj[flag] = false;
                        else obj[flag] = true;
                    } catch (_) { }
                });
            };

            if (!window.angular) return;

            const probes = Array.from(document.querySelectorAll('ed-la-taskspager, .learning__container, .practice__container, form, [ng-controller], [ng-form]'));
            probes.forEach((node) => {
                try {
                    const ngEl = window.angular.element(node);
                    const scope = ngEl?.scope?.();
                    const parent = scope?.$parent;
                    const root = scope?.$root;
                    [scope, parent, root].forEach(runFns);
                    [scope, parent, root].forEach(s => {
                        try {
                            if (s && !s.$$phase && !s.$root?.$$phase) s.$apply();
                        } catch (_) { }
                    });
                } catch (_) { }
            });

            // Also try to find and trigger pm on window or global scope
            if (window.pm) {
                runFns({ pm: window.pm });
                _ilog('[EDX] force_commit: window.pm found and triggered');
            }
        } catch (_) { }
    });

    addBridgeListener('__edx_recover_writing', async () => {
        try {
            let success = false;
            const delay = (ms) => new Promise(r => setTimeout(r, ms));

            const clickByText = (texts) => {
                const all = Array.from(document.querySelectorAll('button, a, span, div[role="button"], li'));
                const candidate = all.find(el => {
                    const text = (el.textContent || '').trim().toLowerCase();
                    return texts.some(t => text === t || text.includes(t));
                });
                if (candidate) {
                    try { candidate.click(); } catch (_) { }
                    success = true;
                    return true;
                }
                return false;
            };

            const unlockScopeFlags = () => {
                if (!window.angular) return;
                const roots = Array.from(document.querySelectorAll('ed-la-integrated-writing, ed-la-taskspager, .learning__container, .practice__container, [ng-controller], [ng-form]'));
                roots.forEach((node) => {
                    try {
                        const ngEl = window.angular.element(node);
                        const scope = ngEl?.scope?.();
                        const parent = scope?.$parent;
                        const root = scope?.$root;
                        [scope, parent, root].forEach((obj) => {
                            if (!obj) return;
                            ['isTaskCompleted', 'isCompleted', 'disabled', 'readOnly', 'isReadOnly', 'isLocked'].forEach((flag) => {
                                if (!(flag in obj)) return;
                                try {
                                    if (flag === 'disabled' || flag === 'readOnly' || flag === 'isReadOnly' || flag === 'isLocked') obj[flag] = false;
                                    else obj[flag] = false;
                                } catch (_) { }
                            });
                            ['editText', 'startEdit', 'enableEdit', 'resume', 'retry', 'onEdit'].forEach(fn => {
                                if (typeof obj[fn] === 'function') {
                                    try { obj[fn](); success = true; } catch (_) { }
                                }
                            });
                            try {
                                if (!obj.$$phase && !obj.$root?.$$phase) obj.$apply();
                            } catch (_) { }
                        });
                    } catch (_) { }
                });
            };

            const unlockTinyMce = () => {
                const tmce = window.tinymce || window.tinyMCE;
                if (tmce?.editors?.length) {
                    for (const editor of tmce.editors) {
                        try {
                            if (typeof editor.setMode === 'function') editor.setMode('design');
                            if (typeof editor.mode?.set === 'function') editor.mode.set('design');
                            if (editor.settings) editor.settings.readonly = 0;

                            const body = editor.getBody?.();
                            if (body) {
                                body.classList.remove('disabled');
                                body.removeAttribute('aria-disabled');
                                body.setAttribute('contenteditable', 'true');
                                body.spellcheck = true;
                                body.style.pointerEvents = 'auto';
                                try { body.ownerDocument.designMode = 'on'; } catch (_) { }
                                body.dispatchEvent(new Event('focus', { bubbles: true }));
                                body.dispatchEvent(new Event('input', { bubbles: true }));
                                body.dispatchEvent(new Event('change', { bubbles: true }));
                                success = true;
                            }

                            if (typeof editor.focus === 'function') editor.focus();
                            if (typeof editor.fire === 'function') {
                                editor.fire('input');
                                editor.fire('change');
                                editor.fire('keyup');
                            }
                        } catch (_) { }
                    }
                }

                const iframes = document.querySelectorAll('iframe[id$="_ifr"], iframe[title*="Rich Text" i], iframe[title*="Text AreaPress" i]');
                iframes.forEach((frame) => {
                    try {
                        const body = frame.contentDocument?.body;
                        if (!body) return;
                        body.classList.remove('disabled');
                        body.removeAttribute('aria-disabled');
                        body.setAttribute('contenteditable', 'true');
                        body.spellcheck = true;
                        body.style.pointerEvents = 'auto';
                        try { frame.contentDocument.designMode = 'on'; } catch (_) { }
                        body.dispatchEvent(new Event('focus', { bubbles: true }));
                        body.dispatchEvent(new Event('input', { bubbles: true }));
                        body.dispatchEvent(new Event('change', { bubbles: true }));
                        success = true;
                    } catch (_) { }
                });
            };

            for (let attempt = 0; attempt < 6; attempt++) {
                clickByText(['edit text', 'integrated writing']);
                unlockScopeFlags();
                unlockTinyMce();

                document.querySelectorAll('[disabled], [readonly], .disabled').forEach((el) => {
                    try {
                        const area = el.closest('.rich-text-editor-selector, ed-la-integrated-writing, .learning__container, .practice__container');
                        if (!area) return;
                        el.removeAttribute('disabled');
                        el.removeAttribute('readonly');
                        el.classList.remove('disabled');
                        if (el.style) el.style.pointerEvents = 'auto';
                        success = true;
                    } catch (_) { }
                });

                if (success) break;
                await delay(220);
            }

            dispatchBridge('__edx_recover_writing_result', { success });
        } catch (_) {
            dispatchBridge('__edx_recover_writing_result', { success: false });
        }
    });

    addBridgeListener('__edx_writing_insert_text', async (e) => {
        try {
            const raw = (e.detail?.text || '').trim();
            if (!raw) return;

            const delay = (ms) => new Promise(r => setTimeout(r, ms));
            const tmce = window.tinymce || window.tinyMCE;
            const ed = tmce?.activeEditor || tmce?.editors?.[0];
            const iframeDoc = document.querySelector('iframe[id$="_ifr"], iframe[title*="Rich Text" i]')?.contentDocument;

            if (ed && iframeDoc) {
                // Clear nội dung cũ
                ed.execCommand('selectAll');
                ed.execCommand('delete');
                // Gõ từng ký tự với animation tự nhiên
                for (const char of raw) {
                    iframeDoc.execCommand('insertText', false, char);
                    await delay(18);
                }
                ed.fire('input');
                ed.fire('change');
                await delay(100);
            } else if (ed) {
                ed.execCommand('selectAll');
                ed.execCommand('delete');
                for (const char of raw) {
                    ed.execCommand('mceInsertContent', false, char);
                    await delay(18);
                }
                ed.fire('input');
                ed.fire('change');
                await delay(100);
            }

            // Trigger wordCountFn qua iframe body (TinyMCE 3 dùng onKeyUp.add)
            try {
                const _iframe = document.querySelector('iframe[id$="_ifr"], iframe[title*="Rich Text" i]');
                const _iBody = _iframe?.contentDocument?.body;
                if (_iBody) {
                    _iBody.dispatchEvent(new KeyboardEvent('keyup', {
                        bubbles: true, cancelable: true, key: 'a', keyCode: 65
                    }));
                }
            } catch (_) {}

            // Bypass paste block trong TinyMCE iframe
            const iframes = document.querySelectorAll('iframe[id$="_ifr"], iframe[title*="Rich Text" i]');
            iframes.forEach(frame => {
                try {
                    const doc = frame.contentDocument;
                    if (!doc) return;
                    ['paste', 'copy', 'cut'].forEach(evt => {
                        doc.addEventListener(evt, e => e.stopImmediatePropagation(), true);
                    });
                } catch (_) {}
            });

            dispatchBridge('__edx_writing_insert_result', { success: true });
        } catch (_) {
            dispatchBridge('__edx_writing_insert_result', { success: false });
        }
    });

    _log('✓ Bridge v2 loaded (drag sim + angular sync + commit sync)');
})();
