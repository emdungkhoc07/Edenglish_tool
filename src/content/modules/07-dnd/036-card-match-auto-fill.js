// ========================= CARD MATCH AUTO-FILL =========================
function _cardFn(src) {
    if (!src) return '';
    return src.split('/').pop().split('?')[0].split('#')[0].toLowerCase();
}

// Request inject.js to mine Angular scopes for card data
async function _mineCardScopes(timeoutMs) {
    return new Promise((resolve) => {
        const requestId = makeBridgeRequestId('cards');
        const handler = (e) => {
            if (!isValidBridgeEvent(e)) return;
            if (e?.detail?.requestId !== requestId) return;
            __removeBridgeListener(document, '__edx_cards_result', handler);
            try {
                const raw = typeof e.detail?.result === 'string' ? e.detail.result : '{}';
                if (raw.length > 1500000) {
                    resolve({});
                    return;
                }
                resolve(JSON.parse(raw || '{}'));
            }
            catch (_) { resolve({}); }
        };
        __addBridgeListener(document, '__edx_cards_result', handler);
        __dispatchBridgeEvent(document, '__edx_mine_cards', { detail: { requestId } });
        setTimeout(() => { __removeBridgeListener(document, '__edx_cards_result', handler); resolve({}); }, timeoutMs || 3000);
    });
}


function _overlayBadge(cardEl, num) {
    cardEl.querySelector(__obfSelector('.eds-card-badge'))?.remove();
    const badge = document.createElement('div');
    badge.className = __obfClassList('eds-card-badge');
    badge.textContent = String(num);
    badge.style.cssText = [
        'position:absolute', 'top:2px', 'left:2px', 'z-index:9999',
        'min-width:20px', 'height:20px', 'line-height:20px',
        'padding:0 5px', 'border-radius:4px',
        'background:rgba(0,0,0,0.75)', 'color:#fff',
        'font-size:12px', 'font-weight:700', 'text-align:center',
        'pointer-events:none', 'box-shadow:0 1px 3px rgba(0,0,0,0.4)',
        'font-family:system-ui,sans-serif',
    ].join(';');
    const cs = getComputedStyle(cardEl);
    if (cs.position === 'static') cardEl.style.position = 'relative';
    cardEl.appendChild(badge);
}

function _removeAllBadges(container) {
    container.querySelectorAll(__obfSelector('.eds-card-badge')).forEach(b => b.remove());
}

// Cache for badge mapping
let __cardBadgeCache = null;

// Standalone: mine scopes, map cards, overlay numbered badges
async function overlayCardBadges() {
    __cardBadgeCache = null;
    _log('[EDX CardBadge] overlayCardBadges called, __cardPairs:', !!__cardPairs, 'pairLabels:', __cardPairs?.pairLabels?.length);
    if (!__cardPairs?.pairLabels?.length) return;

    // Block MutationObserver-triggered scheduleRefresh while we mutate DOM
    __fetching = true;

    try {
        const container = document.querySelector('.lessonPlayArea') ||
            document.querySelector('.practice__container') ||
            document.querySelector('.learning__container') ||
            document.querySelector('ed-la-taskspager') ||
            document.querySelector('[ng-controller]') ||
            document.querySelector('main') ||
            document.body;
        _log('[EDX CardBadge] container:', !!container, container?.tagName, container?.className?.substring?.(0, 60));
        if (!container) return;

        _removeAllBadges(container);

        const numPairs = __cardPairs.pairLabels.length;
        const setStatus = (text, type) => {
            try {
                const el = __shadow?.getElementById?.('eds-card-status');
                if (!el) return;
                el.textContent = text;
                el.className = __obfClassList('eds-card-status' + (type ? ' eds-card-status--' + type : ''));
            } catch (_) { }
        };

        const allClickables = [...container.querySelectorAll('[ng-click]')];

        // Collect all documents to search (top + same-origin iframes)
        const searchDocs = [document];
        try {
            for (const ifr of document.querySelectorAll('iframe')) {
                try { const d = ifr.contentDocument || ifr.contentWindow?.document; if (d) searchDocs.push(d); } catch (_) { }
            }
        } catch (_) { }

        let cardEls = [];
        let cardFrontBgMap = new Map(); // cardEl -> front bg-image URL


        for (const doc of searchDocs) {
            try {
                // Find all card-back elements by class or computed bg
                const backSides = [...doc.querySelectorAll('.memoG__cardSideBack, [class*="cardSide"][class*="Back"], [class*="card-back"], [class*="card_back"]')];
                // Also find via computed style if class-based search finds nothing
                if (backSides.length === 0) {
                    const candidates = doc.querySelectorAll('[class*="card"], [class*="Card"], [class*="memo"], [class*="Memo"], [class*="match"], [class*="Match"]');
                    for (const el of candidates) {
                        try {
                            const bg = getComputedStyle(el).backgroundImage || '';
                            if (bg.includes('cardBack') || bg.includes('card_back')) backSides.push(el);
                        } catch (_) { }
                    }
                }
                _log('[EDX CardBadge] Strategy 1: backSides found:', backSides.length, 'in doc', searchDocs.indexOf(doc));

                for (const backEl of backSides) {
                    // Card wrapper = parent of the back/front sides
                    const cardEl = backEl.parentElement;
                    if (!cardEl || cardEls.includes(cardEl)) continue;

                    // Find the front side sibling
                    const frontEl = cardEl.querySelector('.memoG__cardSideFront, [class*="cardSide"][class*="Front"]');
                    let frontBg = '';
                    if (frontEl) {
                        try { frontBg = getComputedStyle(frontEl).backgroundImage || ''; } catch (_) { }
                    }
                    // Also check other children for front images
                    if (!frontBg || frontBg === 'none') {
                        for (const child of cardEl.children) {
                            if (child === backEl) continue;
                            try {
                                const bg = getComputedStyle(child).backgroundImage || '';
                                if (bg && bg !== 'none' && !bg.includes('cardBack')) { frontBg = bg; break; }
                            } catch (_) { }
                        }
                    }

                    cardEls.push(cardEl);
                    if (frontBg && frontBg !== 'none') {
                        cardFrontBgMap.set(cardEl, frontBg);
                    }
                }
            } catch (_) { }
        }
        _log('[EDX CardBadge] Strategy 1 total cards:', cardEls.length, '| with front bg:', cardFrontBgMap.size);


        if (cardEls.length < 2) {
            cardEls = allClickables.filter(el => {
                for (const img of el.querySelectorAll('img')) {
                    const s = img.getAttribute('src') || img.getAttribute('ng-src') || '';
                    if (s.includes('cardBack') || s.includes('card_back')) return true;
                }
                return false;
            });
            _log('[EDX CardBadge] Strategy 2 (ng-click):', cardEls.length);
        }


        if (cardEls.length < 2) {
            const backImgs = searchDocs.flatMap(doc => {
                try { return [...doc.querySelectorAll('img[src*="cardBack"], img[src*="card_back"]')]; } catch (_) { return []; }
            });
            if (backImgs.length >= 2) {
                const cardElSet = new WeakSet();
                cardEls = [];
                for (const img of backImgs) {
                    const el = img.parentElement;
                    if (el && !cardElSet.has(el)) { cardElSet.add(el); cardEls.push(el); }
                }
            }
            _log('[EDX CardBadge] Strategy 3 (img tag):', cardEls.length);
        }


        // This ensures card 1 = top-left, card N = bottom-right as user sees on screen
        cardEls.sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            const rowThreshold = Math.min(ra.height, rb.height) * 0.4;
            const dy = ra.top - rb.top;
            if (Math.abs(dy) > rowThreshold) return dy; // different row
            return ra.left - rb.left;
        });
        _log('[EDX CardBadge] Cards:', cardEls.length, '| Pairs:', numPairs);

        if (cardEls.length < 2) {
            setStatus('Kh\u00f4ng t\u00ecm th\u1ea5y th\u1ebb', 'error');
            return;
        }

        setStatus('\u0110ang ph\u00e2n t\u00edch th\u1ebb...', 'loading');
        const cardToPairIdx = new Map();

        // Build lookup maps from API data
        const ridToPair = __cardPairs.ridToPairIdx || new Map();
        const fnToPair = new Map();
        for (const [rid, pIdx] of ridToPair) {
            const src = __cardPairs.resMap?.get(rid);
            if (src) fnToPair.set(_cardFn(src), pIdx);
        }
        const textToPair = new Map();
        __cardPairs.pairLabels.forEach((p, i) => {
            if (p.label) textToPair.set(p.label.toLowerCase().trim(), i);
        });
        _log('[EDX CardBadge] fnToPair:', [...fnToPair.entries()].map(([k, v]) => k + '=' + v).join(', '));


        for (const el of cardEls) {
            if (cardToPairIdx.has(el)) continue;

            // A1: CSS background-image from cardFrontBgMap (Strategy 1 results)
            const frontBg = cardFrontBgMap.get(el) || '';
            if (frontBg && frontBg !== 'none') {
                // Extract filename from url("https://...path/filename.jpg")
                const urlMatch = frontBg.match(/url\(["']?([^"')]+)["']?\)/);
                if (urlMatch) {
                    const fn = _cardFn(urlMatch[1]);
                    if (fn && fnToPair.has(fn)) {
                        cardToPairIdx.set(el, fnToPair.get(fn));
                    }
                    // Partial match
                    if (!cardToPairIdx.has(el)) {
                        for (const [mapFn, pIdx] of fnToPair) {
                            if (fn.includes(mapFn) || mapFn.includes(fn)) {
                                cardToPairIdx.set(el, pIdx);
                                break;
                            }
                        }
                    }
                }
            }

            // A2: <img> tags inside card
            if (!cardToPairIdx.has(el)) {
                for (const img of el.querySelectorAll('img')) {
                    const src = img.getAttribute('src') || img.getAttribute('ng-src') || img.getAttribute('data-src') || '';
                    if (!src || src.includes('cardBack') || src.includes('card_back') || src.includes('Hover')) continue;
                    const fn = _cardFn(src);
                    if (fn && fnToPair.has(fn)) {
                        cardToPairIdx.set(el, fnToPair.get(fn));
                        break;
                    }
                    for (const [mapFn, pIdx] of fnToPair) {
                        if (fn.includes(mapFn) || mapFn.includes(fn)) {
                            cardToPairIdx.set(el, pIdx);
                            break;
                        }
                    }
                    if (cardToPairIdx.has(el)) break;
                }
            }

            // A3: Text content
            if (!cardToPairIdx.has(el)) {
                const text = (el.innerText || el.textContent || '').trim().toLowerCase();
                if (text && text.length >= 2 && textToPair.has(text)) {
                    cardToPairIdx.set(el, textToPair.get(text));
                }
            }
        }
        _log('[EDX CardBadge] After DOM scan:', cardToPairIdx.size, 'mapped');


        if (cardToPairIdx.size < cardEls.length) {
            const mined = await _mineCardScopes(3000);
            _log('[EDX CardBadge] Mined result:', JSON.stringify(mined).substring(0, 500));

            if (mined.cards?.length) {
                _log('[EDX CardBadge] Mined', mined.cards.length, 'scope entries');

                const mIdToPair = new Map();
                __cardPairs.pairLabels.forEach((p, i) => {
                    if (p.mId) mIdToPair.set(p.mId, i);
                });

                for (const entry of mined.cards) {
                    const elIdx = entry._elIndex;
                    if (elIdx == null) continue;
                    const domEl = allClickables[elIdx];
                    if (!domEl || !cardEls.includes(domEl) || cardToPairIdx.has(domEl)) continue;

                    let pairIdx = -1;

                    if (entry.rid != null && ridToPair.has(entry.rid)) {
                        pairIdx = ridToPair.get(entry.rid);
                    }
                    if (pairIdx < 0) {
                        const src = entry.src || entry.imgSrc || entry.image || entry.resource || '';
                        if (src) {
                            const fn = _cardFn(src);
                            if (fnToPair.has(fn)) pairIdx = fnToPair.get(fn);
                        }
                    }
                    if (pairIdx < 0 && entry.txt) {
                        const t = String(entry.txt).toLowerCase().trim();
                        if (textToPair.has(t)) pairIdx = textToPair.get(t);
                    }
                    if (pairIdx < 0 && entry.mId) {
                        if (mIdToPair.has(entry.mId)) pairIdx = mIdToPair.get(entry.mId);
                    }
                    if (pairIdx < 0 && entry.answerId != null) {
                        for (let pi = 0; pi < __cardPairs.pairLabels.length; pi++) {
                            const p = __cardPairs.pairLabels[pi];
                            if (p.textId === entry.answerId || p.rid === entry.answerId) {
                                pairIdx = pi; break;
                            }
                        }
                    }

                    if (pairIdx >= 0) {
                        cardToPairIdx.set(domEl, pairIdx);
                    }
                }
            }
        }

        const mapped = cardToPairIdx.size;
        _log('[EDX CardBadge] Mapped', mapped, '/', cardEls.length, 'cards');

        for (const [el, pairIdx] of cardToPairIdx) {
            _overlayBadge(el, pairIdx + 1);
        }

        __cardBadgeCache = { cardToPairIdx, cardEls, allClickables };

        // Update panel: fill "V\u1ecb tr\u00ed th\u1ebb" column
        const pairToPositions = new Map();
        for (const [el, pIdx] of cardToPairIdx) {
            const pos = cardEls.indexOf(el);
            if (pos < 0) continue;
            if (!pairToPositions.has(pIdx)) pairToPositions.set(pIdx, []);
            pairToPositions.get(pIdx).push(pos);
        }
        try {
            const mapCells = __shadow?.querySelectorAll?.(__obfSelector('.eds-match-map[data-pair-idx]'));
            _log('[EDX CardBadge] mapCells found:', mapCells?.length, '| pairToPositions:', pairToPositions.size);
            if (mapCells) {
                mapCells.forEach(cell => {
                    const pi = parseInt(cell.getAttribute('data-pair-idx'), 10);
                    const positions = pairToPositions.get(pi);
                    if (positions?.length >= 2) {

                        cell.textContent = 'card ' + (positions[0] + 1) + ' \u2194 card ' + (positions[1] + 1);
                    } else if (positions?.length === 1) {
                        cell.textContent = 'card ' + (positions[0] + 1) + ' \u2194 ?';
                    } else {
                        cell.textContent = '\u2014';
                    }
                });
            }
        } catch (_) { }

        if (mapped >= numPairs * 2) {
            setStatus('\u0110\u00e3 nh\u1eadn di\u1ec7n ' + mapped + ' th\u1ebb \u2014 l\u1eadt th\u1ebb theo s\u1ed1 tr\u00ean', 'success');
        } else if (mapped > 0) {
            setStatus('Nh\u1eadn di\u1ec7n ' + mapped + '/' + cardEls.length + ' th\u1ebb', 'warning');
        } else {
            setStatus('Ch\u01b0a nh\u1eadn di\u1ec7n \u0111\u01b0\u1ee3c th\u1ebb', 'warning');
        }
    } finally {
        __fetching = false;
    }
}

async function autoFillCardMatch() {
    if (!__cardPairs?.pairLabels?.length) return false;

    const container = document.querySelector('.lessonPlayArea') ||
        document.querySelector('.practice__container') ||
        document.querySelector('.learning__container') ||
        document.querySelector('ed-la-taskspager') ||
        document.querySelector('[ng-controller]') ||
        document.querySelector('main') ||
        document.body;
    if (!container) return false;

    const numPairs = __cardPairs.pairLabels.length;
    const setStatus = (text, type) => {
        try {
            const el = __shadow?.getElementById?.('eds-card-status');
            if (!el) return;
            el.textContent = text;
            el.className = __obfClassList('eds-card-status' + (type ? ' eds-card-status--' + type : ''));
        } catch (_) { }
    };

    // Use cached badge data or run fresh overlay
    if (!__cardBadgeCache) await overlayCardBadges();
    const cache = __cardBadgeCache;

    if (!cache?.cardEls?.length) {
        setStatus('Kh\u00f4ng t\u00ecm th\u1ea5y th\u1ebb', 'error');
        return false;
    }

    const { cardToPairIdx, cardEls } = cache;
    _log('[EDX CardMatch] Auto-fill with', cardToPairIdx.size, 'mapped,', cardEls.length, 'cards');

    // Auto-click: pair by pair (if fully mapped)
    if (cardToPairIdx.size >= numPairs * 2) {
        setStatus('\u0110ang gh\u00e9p...', 'loading');
        let matchedCount = 0;
        const clicked = new Set();

        for (let pairIdx = 0; pairIdx < numPairs; pairIdx++) {
            const pairCards = [];
            for (const [el, pi] of cardToPairIdx) {
                if (pi === pairIdx && !clicked.has(el)) pairCards.push(el);
            }
            if (pairCards.length < 2) {
                _warn('[EDX CardMatch] Pair', pairIdx + 1, 'has only', pairCards.length, 'cards');
                continue;
            }
            advancedClick(pairCards[0]);
            await delay(700);
            advancedClick(pairCards[1]);
            await delay(1000);
            clicked.add(pairCards[0]);
            clicked.add(pairCards[1]);
            matchedCount++;
            setStatus('\u0110ang gh\u00e9p... ' + matchedCount + '/' + numPairs, 'loading');
            _log('[EDX CardMatch] Pair', matchedCount, ':', __cardPairs.pairLabels[pairIdx]?.label);
            await delay(300);
        }

        _removeAllBadges(container);
        if (matchedCount >= numPairs) {
            setStatus('\u0110\u00e3 gh\u00e9p xong ' + numPairs + '/' + numPairs + ' c\u1eb7p', 'success');
        } else if (matchedCount > 0) {
            setStatus('Gh\u00e9p \u0111\u01b0\u1ee3c ' + matchedCount + '/' + numPairs + ' c\u1eb7p', 'warning');
        } else {
            setStatus('Kh\u00f4ng gh\u00e9p \u0111\u01b0\u1ee3c', 'error');
        }
        return matchedCount > 0;
    }

    // Fallback: Memory solver - flip cards to discover content
    _log('[EDX CardMatch] Scope mapping incomplete, falling back to flip discovery');
    setStatus('\u0110ang l\u1eadt th\u1ebb...', 'loading');

    const discovered = new Map();
    const matched = new Set();
    let matchedCount = 0;
    const queue = [...Array(cardEls.length).keys()];

    const DEADLINE = Date.now() + 30_000;
    const isExpired = () => Date.now() > DEADLINE;

    const identifyCard = async (el) => {
        for (let attempt = 0; attempt < 5; attempt++) {
            // Check CSS background-image on child elements (Angular 2+ cards)
            for (const child of el.querySelectorAll('*')) {
                try {
                    const bg = getComputedStyle(child).backgroundImage || '';
                    if (!bg || bg === 'none' || bg.includes('cardBack')) continue;
                    const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
                    if (m) {
                        const fn = _cardFn(m[1]);
                        for (let i = 0; i < __cardPairs.pairLabels.length; i++) {
                            const p = __cardPairs.pairLabels[i];
                            const checkFn = p.imgSrc ? _cardFn(p.imgSrc) : (p.srcA ? _cardFn(p.srcA) : '');
                            const checkFn2 = p.srcB ? _cardFn(p.srcB) : '';
                            if ((checkFn && (fn === checkFn || fn.includes(checkFn) || checkFn.includes(fn))) ||
                                (checkFn2 && (fn === checkFn2 || fn.includes(checkFn2) || checkFn2.includes(fn)))) {
                                return i;
                            }
                        }
                        // Also check fnToPair from resMap
                        const ridToPair = __cardPairs.ridToPairIdx || new Map();
                        const fnMap = new Map();
                        for (const [rid, pIdx] of ridToPair) {
                            const src = __cardPairs.resMap?.get(rid);
                            if (src) fnMap.set(_cardFn(src), pIdx);
                        }
                        if (fnMap.has(fn)) return fnMap.get(fn);
                        for (const [mapFn, pIdx] of fnMap) {
                            if (fn.includes(mapFn) || mapFn.includes(fn)) return pIdx;
                        }
                    }
                } catch (_) { }
            }
            // Check <img> tags
            for (const img of el.querySelectorAll('img')) {
                const src = img.getAttribute('src') || img.getAttribute('ng-src') || '';
                if (!src || src.includes('cardBack')) continue;
                const fn = _cardFn(src);
                for (let i = 0; i < __cardPairs.pairLabels.length; i++) {
                    const p = __cardPairs.pairLabels[i];
                    const checkFn = p.imgSrc ? _cardFn(p.imgSrc) : (p.srcA ? _cardFn(p.srcA) : '');
                    const checkFn2 = p.srcB ? _cardFn(p.srcB) : '';
                    if ((checkFn && (fn === checkFn || fn.includes(checkFn) || checkFn.includes(fn))) ||
                        (checkFn2 && (fn === checkFn2 || fn.includes(checkFn2) || checkFn2.includes(fn)))) {
                        return i;
                    }
                }
            }
            const text = (el.innerText || el.textContent || '').trim().toLowerCase();
            if (text && text.length >= 2) {
                for (let i = 0; i < __cardPairs.pairLabels.length; i++) {
                    const lab = __cardPairs.pairLabels[i].label.toLowerCase().trim();
                    if (text === lab || text.includes(lab) || lab.includes(text)) return i;
                }
            }
            await delay(200);
        }
        return -1;
    };

    while (queue.length > 0 && matchedCount < numPairs) {
        if (isExpired()) {
            _warn('[EDX CardMatch] Timeout 30s, dừng');
            setStatus('Hết giờ - thử lại thủ công', 'error');
            break;
        }

        let firstIdx = -1;
        while (queue.length > 0) {
            const c = queue.shift();
            if (!matched.has(c)) { firstIdx = c; break; }
        }
        if (firstIdx < 0) break;

        advancedClick(cardEls[firstIdx]);
        await delay(650);
        const pair1 = await identifyCard(cardEls[firstIdx]);
        if (pair1 >= 0) discovered.set(firstIdx, pair1);

        let partnerIdx = -1;
        if (pair1 >= 0) {
            for (const [j, jPair] of discovered) {
                if (j !== firstIdx && !matched.has(j) && jPair === pair1) {
                    partnerIdx = j; break;
                }
            }
        }

        if (partnerIdx >= 0) {
            advancedClick(cardEls[partnerIdx]);
            await delay(1000);
            matched.add(firstIdx); matched.add(partnerIdx);
            matchedCount++;
            setStatus('\u0110ang gh\u00e9p... ' + matchedCount + '/' + numPairs, 'loading');
        } else {
            let secondIdx = -1;
            while (queue.length > 0) {
                const c = queue.shift();
                if (!matched.has(c)) { secondIdx = c; break; }
            }
            if (secondIdx >= 0) {
                advancedClick(cardEls[secondIdx]);
                await delay(650);
                const pair2 = await identifyCard(cardEls[secondIdx]);
                if (pair2 >= 0) discovered.set(secondIdx, pair2);
                if (pair1 >= 0 && pair2 >= 0 && pair1 === pair2) {
                    matched.add(firstIdx); matched.add(secondIdx);
                    matchedCount++;
                    setStatus('\u0110ang gh\u00e9p... ' + matchedCount + '/' + numPairs, 'loading');
                } else {
                    await delay(1300);
                }
            }
        }
        await delay(300);
    }

    // Phase 2: match remaining discovered pairs
    if (matchedCount < numPairs) {
        const byPair = new Map();
        for (const [idx, pIdx] of discovered) {
            if (matched.has(idx)) continue;
            if (!byPair.has(pIdx)) byPair.set(pIdx, []);
            byPair.get(pIdx).push(idx);
        }
        for (const [pIdx, indices] of byPair) {
            if (indices.length >= 2 && matchedCount < numPairs) {
                advancedClick(cardEls[indices[0]]); await delay(650);
                advancedClick(cardEls[indices[1]]); await delay(1000);
                matched.add(indices[0]); matched.add(indices[1]);
                matchedCount++;
                setStatus('\u0110ang gh\u00e9p... ' + matchedCount + '/' + numPairs, 'loading');
                await delay(300);
            }
        }
    }

    _removeAllBadges(container);
    if (matchedCount >= numPairs) {
        setStatus('\u0110\u00e3 gh\u00e9p xong ' + numPairs + '/' + numPairs + ' c\u1eb7p', 'success');
    } else if (matchedCount > 0) {
        setStatus('Gh\u00e9p \u0111\u01b0\u1ee3c ' + matchedCount + '/' + numPairs + ' c\u1eb7p', 'warning');
    } else {
        setStatus('Kh\u00f4ng gh\u00e9p \u0111\u01b0\u1ee3c \u2014 th\u1eed l\u1ea1i', 'error');
    }
    return matchedCount > 0;
}

// Clamp to safe viewport area (avoid elementFromPoint returning null at edges)
function safeXY(x, y) {
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return [Math.max(2, Math.min(vw - 2, x)), Math.max(2, Math.min(vh - 2, y))];
}

function dispatchMouseOnly(node, type, x, y) {

    // Dragula only listens for mouse events. Dispatching PointerEvent too
    // causes Zone.js double-processing and Dragula internal errors.
    const [cx, cy] = safeXY(x, y);
    node.dispatchEvent(new MouseEvent(type, mkEventOpts(cx, cy)));
}



async function simulateDragDrop(draggable, target) {
    __dndAutomating = true;
    try {
        try { _panelHideForDnD?.(); } catch (_) { }
        if (!draggable || !target) return false;

        // Phase 1: page-context sync first (Angular/Dragula aware)
        if (draggable.isConnected && target.isConnected) {
            try {
                const sourceEl = draggable.parentElement || null;
                const syncOk = await pageSyncDrop(draggable, target, sourceEl);
                if (syncOk) return true;
                // Don't wait needlessly if sync succeeded, but if not we proceed to simulation
                await delay(80);
            } catch (_) { }
        }

        // Resolve the ACTUAL drag element (.dnditem inside Angular wrapper if present)
        const innerItem = draggable.querySelector('.dnditem') || draggable;
        const clamp = (v, mn, mx) => Math.min(mx, Math.max(mn, v));
        const viewport = () => ({
            width: Math.max(document.documentElement?.clientWidth || 0, window.innerWidth || 0),
            height: Math.max(document.documentElement?.clientHeight || 0, window.innerHeight || 0)
        });
        const isUsableRect = (rect) => {
            if (!rect) return false;
            if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)) return false;
            if (rect.width < 12 || rect.height < 12) return false;
            const vp = viewport();
            return rect.bottom > 8 && rect.right > 8 && rect.top < (vp.height - 8) && rect.left < (vp.width - 8);
        };
        const rectToPoint = (rect, pad = 8) => {
            const vp = viewport();
            const safePadX = Math.max(2, Math.min(pad, Math.max(2, rect.width / 3)));
            const safePadY = Math.max(2, Math.min(pad, Math.max(2, rect.height / 3)));
            const rawX = rect.left + clamp(rect.width / 2, safePadX, Math.max(safePadX, rect.width - safePadX));
            const rawY = rect.top + clamp(rect.height / 2, safePadY, Math.max(safePadY, rect.height - safePadY));
            return {
                x: clamp(rawX, 6, Math.max(6, vp.width - 6)),
                y: clamp(rawY, 6, Math.max(6, vp.height - 6))
            };
        };
        const resolveDropCandidate = (node) => {
            if (!node) return null;
            const seen = new Set();
            const candidates = [];
            const push = (el) => {
                if (!el || seen.has(el)) return;
                seen.add(el);
                candidates.push(el);
            };

            push(node);
            node.parentElement && push(node.parentElement);
            node.closest?.('.dndZone, .droptarget, [ed-trackable-drop], [class*="drop"], [class*="zone"]') && push(node.closest('.dndZone, .droptarget, [ed-trackable-drop], [class*="drop"], [class*="zone"]'));
            try {
                node.querySelectorAll?.('.dndZone, .droptarget, [ed-trackable-drop], [class*="drop"], [class*="zone"], [class*="target"], [data-zone-id], [data-target-id], div, span')
                    ?.forEach?.((el) => {
                        if (candidates.length < 40) push(el);
                    });
            } catch (_) { }

            let best = null;
            let bestScore = -1;
            for (const candidate of candidates) {
                let rect = null;
                try { rect = candidate.getBoundingClientRect(); } catch (_) { }
                if (!isUsableRect(rect)) continue;
                const area = rect.width * rect.height;
                const preferred = candidate === node ? 500000 : 0;
                const score = preferred + Math.min(area, 400000);
                if (score > bestScore) {
                    bestScore = score;
                    best = { element: candidate, rect };
                }
            }
            return best;
        };



        target.scrollIntoView({ block: "nearest", inline: "nearest" });
        await delay(50);
        innerItem.scrollIntoView({ block: "center", inline: "center" });
        await delay(80);

        // Read source rect AFTER scrolling it into view
        const s = innerItem.getBoundingClientRect();
        if (s.width === 0 && s.height === 0) {
            _warn("[edx] Draggable has zero size, skipping");
            return false;
        }

        const sourcePoint = rectToPoint(s, 4);
        const sx = sourcePoint.x;
        const sy = sourcePoint.y;


        dispatchMouseOnly(innerItem, "mouseover", sx, sy);
        dispatchMouseOnly(innerItem, "mousedown", sx, sy);
        await delay(150); // Dragula needs time to initialize grab state

        // Kick moves on document.body
        dispatchMouseOnly(document.body, "mousemove", sx + 3, sy + 3);
        await delay(60);
        dispatchMouseOnly(document.body, "mousemove", sx + 8, sy + 8);
        await delay(60);

        // Wait for mirror to appear
        for (let mw = 0; mw < 10; mw++) {
            if (document.querySelector(".gu-mirror")) break;
            await delay(30);
        }

        const mirrorCreated = !!document.querySelector(".gu-mirror");
        if (mirrorCreated) _log('[edx] Drag started (mirror created)');


        // Scroll target into view only AFTER holding the item
        target.scrollIntoView({ block: "center", inline: "center" });
        await delay(80);

        let dropCandidate = null;
        for (let attempt = 0; attempt < 4 && !dropCandidate; attempt++) {
            target.scrollIntoView({ block: "center", inline: "center" });
            await delay(60 + (attempt * 30));
            dropCandidate = resolveDropCandidate(target);
        }
        if (!dropCandidate) {
            _warn("[edx] Drag simulation: target has no usable rect");
            return false;
        }

        const dropTarget = dropCandidate.element;
        const dropPoint = rectToPoint(dropCandidate.rect, 8);
        const tx = dropPoint.x;
        const ty = dropPoint.y;

        // Update sx, sy to be the CURRENT position of the mirror to simulate dragged item moving
        let currentX = sx;
        let currentY = sy;
        const mirrorEl = document.querySelector(".gu-mirror");
        if (mirrorCreated && mirrorEl) {
            const mRect = mirrorEl.getBoundingClientRect();
            if (isUsableRect(mRect)) {
                const mirrorPoint = rectToPoint(mRect, 4);
                currentX = mirrorPoint.x;
                currentY = mirrorPoint.y;
            }
        }

        _log('[edx] Drag sim: from', currentX.toFixed(0), currentY.toFixed(0), 'to', tx.toFixed(0), ty.toFixed(0));


        const steps = 6;
        for (let i = 1; i <= steps; i++) {
            const x = currentX + ((tx - currentX) * i) / steps;
            const y = currentY + ((ty - currentY) * i) / steps;
            dispatchMouseOnly(document.body, "mousemove", x, y);
            await delay(30 + Math.floor(Math.random() * 50));
        }

        // Final hover: fire directly on the target element so Dragula's
        // elementFromPoint lands exactly on it
        dispatchMouseOnly(dropTarget, "mouseover", tx, ty);
        dispatchMouseOnly(dropTarget, "mousemove", tx, ty);
        await delay(60);

        // Release on the target
        dispatchMouseOnly(dropTarget, "mouseup", tx, ty);

        // Wait for mirror removal (confirms drop processed)
        for (let w = 0; w < 15 && document.querySelector(".gu-mirror"); w++) await delay(20);
        await delay(50);

        // Verify placement
        const dragText = norm(innerItem.innerText || innerItem.textContent || draggable.innerText || draggable.textContent || '');
        const placed = dndZoneHasAnswer(target, dragText);

        if (placed) return true;


        // If mouse simulation failed, try moving the DOM node directly,
        // then ask inject.js to sync the Angular model.
        if (!placed && innerItem.isConnected && target.isConnected) {
            try {
                const wrapper = draggable.closest('ed-la-dnditem') || draggable;
                target.appendChild(wrapper);
                await delay(50);
                // Ask inject.js to trigger Angular digest on the target
                try { await pageSyncDrop(wrapper, target, null); } catch (_) { }
                await delay(50);
                // Verify DOM fallback worked
                const fallbackOk = dndZoneHasAnswer(target, dragText);
                if (fallbackOk) {
                    _log('[edx] DOM fallback placed item successfully');
                    return true;
                }
            } catch (_) { }
        }

        _warn("[edx] Drag simulation: item not in target after drop");
        return false;
    } catch (e) {
        _warn("[edx] Drag simulation error:", e.message);
        return false;
    } finally {
        __dndAutomating = false;
    }
}

