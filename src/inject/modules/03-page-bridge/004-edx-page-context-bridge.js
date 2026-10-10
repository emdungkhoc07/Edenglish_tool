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
    const isValidBridgeEvent = window.__edxValidBridgeEvent || (() => true);
    const createBridgeEvent = window.__edxCreateBridgeEvent ||
        ((type, params) => new CustomEvent(window.__edxBridgeEventName ? window.__edxBridgeEventName(type) : type, params));
    const dispatchBridge = (type, detail) => {
        document.dispatchEvent(createBridgeEvent(type, {
            detail: window.__edxBridgeDetail ? window.__edxBridgeDetail(detail) : detail
        }));
    };
    const addBridgeListener = (type, handler) => {
        document.addEventListener(window.__edxBridgeEventName ? window.__edxBridgeEventName(type) : type, (e) => {
            if (!isValidBridgeEvent(e)) return;
            handler(e);
        });
    };

    const __edxHostState = {
        source: 'page',
        topic: 'boot',
        action: 'boot',
        currentStepIndex: null,
        currentTaskIndex: null,
        inTest: null,
        hasLeftSideResource: null,
        lastEventAt: Date.now()
    };

    function readHostIndices() {
        const state = {};
        try {
            if (typeof window.currStepInd === 'number') state.currentStepIndex = window.currStepInd;
        } catch (_) { }
        try {
            const taskText = (document.querySelector('.learning__PATC_currentTask')?.textContent || '').trim();
            const taskNum = parseInt(taskText, 10);
            if (!Number.isNaN(taskNum) && taskNum > 0) state.currentTaskIndex = taskNum - 1;
        } catch (_) { }
        return state;
    }

    function emitHostSignal(source, topic, payload) {
        const action = payload?.action || payload?.name || '';
        const detail = Object.assign(
            {},
            __edxHostState,
            readHostIndices(),
            {
                source,
                topic,
                action,
                lastEventAt: Date.now()
            }
        );

        if (payload?.data && typeof payload.data === 'object') {
            if (typeof payload.data.inTest === 'boolean') detail.inTest = payload.data.inTest;
            if (typeof payload.data.hasResource === 'boolean') detail.hasLeftSideResource = payload.data.hasResource;
            if (typeof payload.data.nodeIndex === 'number') detail.currentTaskIndex = payload.data.nodeIndex;
        }
        if (typeof payload?.inTest === 'boolean') detail.inTest = payload.inTest;
        if (typeof payload?.hasResource === 'boolean') detail.hasLeftSideResource = payload.hasResource;
        if (typeof payload?.nodeIndex === 'number') detail.currentTaskIndex = payload.nodeIndex;

        Object.assign(__edxHostState, detail);
        dispatchBridge('__edx_host_signal', detail);
    }

    function shouldTrackHostAction(topic, payload) {
        const action = String(payload?.action || payload?.name || '').trim();
        if (!action) return false;
        const trackedTopics = new Set(['lpNotify', 'la-lpNavigate', 'pmNotify', 'itemNotify', 'prepareNotify']);
        if (!trackedTopics.has(topic)) return false;
        const trackedActions = new Set([
            'startTest', 'submitTest', 'submitTestSuccess', 'testReviewMessage',
            'stepLoaded', 'stepsLoaded', 'taskLoaded', 'itemLoaded',
            'itemDone', 'itemUnloaded', 'emptyItemLoaded', 'dummyItemLoaded',
            'canGoPrevNext', 'hasLeftSideResource', 'navigateNext'
        ]);
        return trackedActions.has(action);
    }

    function installHostEventHooks() {
        if (window.__EDX_HOST_EVENTS_HOOKED__) return;
        const hasPublish = typeof window.jQuery?.publish === 'function';
        const hasNotify = typeof window.notify === 'function';
        if (!hasPublish && !hasNotify) return;

        if (hasPublish && !window.jQuery.publish.__edxWrapped) {
            const originalPublish = window.jQuery.publish;
            const wrappedPublish = function (topic, payload) {
                try {
                    if (typeof topic === 'string' && shouldTrackHostAction(topic, payload)) {
                        emitHostSignal('jquery.publish', topic, payload || {});
                    }
                } catch (_) { }
                return originalPublish.apply(this, arguments);
            };
            wrappedPublish.__edxWrapped = true;
            window.jQuery.publish = wrappedPublish;
        }

        if (hasNotify && !window.notify.__edxWrapped) {
            const originalNotify = window.notify;
            const wrappedNotify = function (topic, action, data) {
                try {
                    const payload = { action, data };
                    if (typeof topic === 'string' && shouldTrackHostAction(topic, payload)) {
                        emitHostSignal('notify', topic, payload);
                    }
                } catch (_) { }
                return originalNotify.apply(this, arguments);
            };
            wrappedNotify.__edxWrapped = true;
            window.notify = wrappedNotify;
        }

        window.__EDX_HOST_EVENTS_HOOKED__ = true;
        emitHostSignal('page', 'hostHooksReady', { action: 'hostHooksReady' });
    }

    installHostEventHooks();
    const __hostHookTimer = setInterval(() => {
        installHostEventHooks();
        if (window.__EDX_HOST_EVENTS_HOOKED__) {
            clearInterval(__hostHookTimer);
        }
    }, 500);
    setTimeout(() => {
        try { clearInterval(__hostHookTimer); } catch (_) { }
    }, 15000);

    addBridgeListener('__edx_get_host_state', (e) => {
        try {
            const requestId = e.detail?.requestId;
            dispatchBridge('__edx_host_state_response', { requestId, state: JSON.stringify(__edxHostState) });
        } catch (_) {
            dispatchBridge('__edx_host_state_response', { requestId: e.detail?.requestId, state: '{}' });
        }
    });

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

    addBridgeListener('__edx_check_answers', (e) => {
        const requestId = e.detail?.requestId;
        const respond = (ok, method = '', error = '') => {
            dispatchBridge('__edx_check_answers_result', { requestId, ok: !!ok, method, error });
        };
        try {
            const clickCandidate = (el) => {
                if (!el) return false;
                try { el.removeAttribute?.('disabled'); } catch (_) { }
                try { el.classList?.remove?.('disabled'); } catch (_) { }
                try { el.click?.(); return true; } catch (_) { }
                return false;
            };

            if (window.pm && typeof window.pm.checkAnswers === 'function') {
                try {
                    window.pm.checkAnswers();
                    respond(true, 'window.pm.checkAnswers');
                    return;
                } catch (_) { }
            }

            try {
                if (window.jQuery && typeof window.jQuery.publish === 'function') {
                    window.jQuery.publish('LApmNotification', { action: 'checkAnswers' });
                    respond(true, 'jquery.publish.LApmNotification');
                    return;
                }
            } catch (_) { }

            const selectors = [
                '[title*="CheckAnswer"]',
                '[title*="Check Answer"]',
                '[data-action="CheckAnswer"]',
                '[id*="CheckAnswer"]',
                '[class*="CheckAnswer"]',
                'button[aria-label*="Check"]',
                'a[aria-label*="Check"]'
            ];
            for (const selector of selectors) {
                const btn = document.querySelector(selector);
                if (clickCandidate(btn)) {
                    respond(true, `click:${selector}`);
                    return;
                }
            }

            const textCandidate = Array.from(document.querySelectorAll('button, a, span, div[role="button"], li')).find((el) => {
                const text = (el.textContent || '').trim().toLowerCase();
                return text === 'check answer' || text.includes('check answer');
            });
            if (clickCandidate(textCandidate)) {
                respond(true, 'click:text');
                return;
            }

            respond(false, '', 'check_answers_not_found');
        } catch (error) {
            respond(false, '', error?.message || 'check_answers_error');
        }
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
            const humanPauseForChar = (char) => {
                const base = 20 + Math.random() * 25;
                if (char === '\n') return base + 90 + Math.random() * 120;
                if (/[.,!?;:]/.test(char)) return base + 60 + Math.random() * 80;
                return base;
            };
            const typeIntoDoc = async (doc, text) => {
                for (const char of text) {
                    if (char === '\n') {
                        try { doc.execCommand('insertLineBreak', false); }
                        catch (_) { doc.execCommand('insertHTML', false, '<br>'); }
                    } else {
                        doc.execCommand('insertText', false, char);
                    }
                    await delay(humanPauseForChar(char));
                }
            };
            const typeIntoEditor = async (editor, text) => {
                for (const char of text) {
                    if (char === '\n') {
                        editor.execCommand('mceInsertContent', false, '<br>');
                    } else {
                        editor.execCommand('mceInsertContent', false, char);
                    }
                    await delay(humanPauseForChar(char));
                }
            };
            const tmce = window.tinymce || window.tinyMCE;
            const ed = tmce?.activeEditor || tmce?.editors?.[0];
            const iframeDoc = document.querySelector('iframe[id$="_ifr"], iframe[title*="Rich Text" i]')?.contentDocument;
            const editable = document.querySelector('[contenteditable="true"], .prWriting__editorW [contenteditable], .prOpenEnded__editor [contenteditable], textarea');

            if (ed && iframeDoc) {
                ed.execCommand('selectAll');
                ed.execCommand('delete');
                await typeIntoDoc(iframeDoc, raw);
                ed.fire('input');
                ed.fire('change');
                ed.fire('keyup');
                await delay(100);
            } else if (ed) {
                ed.execCommand('selectAll');
                ed.execCommand('delete');
                await typeIntoEditor(ed, raw);
                ed.fire('input');
                ed.fire('change');
                ed.fire('keyup');
                await delay(100);
            } else if (editable) {
                try {
                    editable.focus();
                    if (editable.tagName?.toLowerCase() === 'textarea') {
                        editable.value = '';
                        for (const char of raw) {
                            editable.value += char;
                            editable.dispatchEvent(new Event('input', { bubbles: true }));
                            editable.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: char }));
                            await delay(humanPauseForChar(char));
                        }
                    } else {
                        editable.innerHTML = '';
                        for (const char of raw) {
                            if (char === '\n') {
                                document.execCommand('insertLineBreak', false);
                            } else {
                                document.execCommand('insertText', false, char);
                            }
                            editable.dispatchEvent(new Event('input', { bubbles: true }));
                            editable.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: char }));
                            await delay(humanPauseForChar(char));
                        }
                    }
                    editable.dispatchEvent(new Event('change', { bubbles: true }));
                } catch (_) { }
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
