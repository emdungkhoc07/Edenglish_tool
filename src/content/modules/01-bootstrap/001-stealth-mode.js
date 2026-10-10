// ========================= STEALTH MODE =========================
(function () {
    let __edsIntervalBypass = null;
    let __edsIntervalPageChange = null;
    let __edsIntervalActivityModal = null;
    let __speakingInProgress = false;
    let __videoPlaying = false;
    let __userAutoNext = 'disable';
    let __spaTimer = null;
    const __DEBUG = (() => {
        try { return localStorage.getItem('edx_debug') === '1'; } catch (_) { return false; }
    })();  // set localStorage.edx_debug = '1' when debugging
    const _log = (...a) => { if (__DEBUG) console.log(...a); };
    const _warn = (...a) => { if (__DEBUG) console.warn(...a); };
    const {
        __obfEvent, __bridgeToken, withBridgeDetail, isValidBridgeEvent, makeBridgeRequestId,
        __bridgeEventName, __dispatchBridgeEvent, __addBridgeListener, __removeBridgeListener,
        requestCapturedPayloads, requestScopeMining, pageSyncDrop
    } = window.edxBridge;
    const _trace = (stage, details) => {
        if (!__DEBUG) return;
        try {
            console.log(`[EDX TRACE] ${stage}`, details || {});
        } catch (_) {
            console.log(`[EDX TRACE] ${stage}`);
        }
    };
    const __obfClassToken = (token) => {
        if (typeof token !== 'string' || !token) return token;
        if (token.startsWith('eds-') || token === 'edx' || token === 'edx-speaking-status') {
            return (typeof window._O === 'function' ? window._O(token) : token);
        }
        return token;
    };
    const __obfClassList = (classes) => {
        if (typeof classes !== 'string' || !classes) return classes;
        return classes.split(/\s+/).map(__obfClassToken).join(' ');
    };
    const __obfSelector = (selector) => {
        if (typeof selector !== 'string' || !selector) return selector;
        return selector.replace(/\.((?:eds-[a-zA-Z0-9_-]+)|edx|edx-speaking-status)\b/g, (_, cls) => `.${__obfClassToken(cls)}`);
    };
    const __addObfClass = (el, ...tokens) => {
        if (!el?.classList) return;
        el.classList.add(...tokens.map(__obfClassToken).filter(Boolean));
    };
    const __removeObfClass = (el, ...tokens) => {
        if (!el?.classList) return;
        el.classList.remove(...tokens.map(__obfClassToken).filter(Boolean));
    };
    const __toggleObfClass = (el, token, force) => {
        if (!el?.classList) return false;
        const nextToken = __obfClassToken(token);
        return arguments.length > 2
            ? el.classList.toggle(nextToken, force)
            : el.classList.toggle(nextToken);
    };
    const __containsObfClass = (el, token) => !!el?.classList?.contains(__obfClassToken(token));
    let __bypassEnabled = true;
    const MODE_WATCH = 'disable';
    const MODE_RUN = 'off';
    const MODE_AUTO = 'full';
    const MODE_OFF = 'turn_off';

    const UI_TEXT = Object.freeze({
        status: {
            loadingAnswers: 'Đang tải đáp án...',
            waitingNext: 'Đang chờ câu mới...',
            skippingPage: 'Đang bỏ qua trang...',
            waitingFreshQuestion: 'Đang chờ câu hỏi mới...',
            reusingStaleUrl: 'Đang dùng lại URL cũ để tải...',
            checkingPage: 'Đang kiểm tra trang...',
            retryingAnswers: 'Đang lấy lại đáp án...',
            changingPage: 'Đang chuyển trang...',
            playingVideo: 'Đang phát video...',
            playingAudio: 'Đang phát audio...',
            waitingMedia: 'Đang chờ media chạy...',
            dndFilling: 'Đang kéo thả đáp án...',
            dndDone: 'Kéo thả xong, đang chuyển câu...',
            submittingTest: 'Đang nộp bài...',
            speakingPreparing: 'Speaking: đang chuẩn bị...',
            speakingChoosingSentence: 'Đang chọn câu để ghi âm...',
            speakingWaitingStart: 'Đang chờ nút Start...',
            speakingStarting: 'Đang bắt đầu ghi âm...',
            speakingRecording: 'Đang ghi âm...',
            speakingRecorded: 'Đã ghi âm xong',
            speakingManual: 'Speaking chưa hoàn tất. Vui lòng nói rồi bấm Next thủ công.',
            speakingStartMissing: 'Không thấy nút Start. Vui lòng làm thủ công hoặc bấm Next.',
            speakingError: 'Lỗi xử lý speaking',
        },
        mode: {
            watch: { label: 'WATCH', desc: 'Chỉ hiển thị đáp án, không tự điền, không tự chuyển' },
            run: { label: 'RUN', desc: 'Tự động điền đáp án, nhưng không tự chuyển câu' },
            auto: { label: 'AUTO', desc: 'Tự động điền và tự chuyển câu' },
            stopped: 'Đã dừng tự động',
            autoToast: 'Chế độ AUTO - câu sẽ tự chuyển sau khi điền xong',
        },
        actions: {
            refreshAnswers: 'Lấy lại đáp án',
            pinPanel: 'Ghim/thả panel',
            minimizePanel: 'Thu gọn panel',
        },
        recovery: {
            refetchAnswers: 'Lấy lại đáp án',
            pressF5: 'F5 để tải lại',
            unsupportedManual: 'Dạng bài này cần làm thủ công. Hoàn thiện rồi bấm Space để tiếp tục.',
        }
    });

    const STATUS_MESSAGES = new Set(Object.values(UI_TEXT.status));

    const isWatchMode = () => __autoNext === MODE_WATCH;
    const isRunMode = () => __autoNext === MODE_RUN;
    const isAutoMode = () => __autoNext === MODE_AUTO;
    const isOffMode = () => __autoNext === MODE_OFF;
    const shouldAutoFill = () => !isWatchMode() && !isOffMode();
    const shouldAutoAdvance = () => isAutoMode();

    function isEditableNode(el) {
        if (!el) return false;
        if (el.isContentEditable) return true;
        const tag = el.tagName?.toUpperCase();
        if (tag === "TEXTAREA") return true;
        if (tag !== "INPUT") return false;
        const type = (el.type || "text").toLowerCase();
        return !["checkbox", "radio", "button", "submit", "range", "color", "file", "image", "reset", "hidden"].includes(type);
    }

    function setElementValue(el, val) {
        try {
            if (!el) return false;
            if (el.isContentEditable) {
                el.textContent = val;
                return true;
            }
            if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
                let setOk = false;
                try {
                    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
                    const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
                    if (setter) {
                        setter.call(el, val);
                        setOk = true;
                    }
                } catch (_) { }
                if (!setOk) el.value = val;
                return true;
            }
            return false;
        } catch (_) { return false; }
    }

    function insertTextIntoEditable(el, text) {
        try {
            if (!el || !text) return false;
            if (el.isContentEditable) {
                try {
                    document.execCommand("insertText", false, text);
                    return true;
                } catch (_) {
                    el.textContent = (el.textContent || "") + text;
                    return true;
                }
            }
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                const start = Number.isInteger(el.selectionStart) ? el.selectionStart : (el.value || "").length;
                const end = Number.isInteger(el.selectionEnd) ? el.selectionEnd : start;
                const oldVal = el.value || "";
                const nextVal = oldVal.slice(0, start) + text + oldVal.slice(end);
                if (!setElementValue(el, nextVal)) return false;
                const cursor = start + text.length;
                try { el.setSelectionRange(cursor, cursor); } catch (_) { }
                return true;
            }
            return false;
        } catch (_) { return false; }
    }

    async function typeTextIntoEditable(el, text, baseDelay = 50) {
        if (!el || !text) return false;
        const chars = text.split('');
        const randomDelay = () => baseDelay + Math.random() * 40;
        __typingInProgress++;

        try {
            try {
                if (el.focus) el.focus({ preventScroll: true });
                else el.dispatchEvent(new Event('focus', { bubbles: true }));
            } catch (_) { }

            let startPos = 0;
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                startPos = el.selectionStart ?? (el.value || '').length;
            }

            for (let i = 0; i < chars.length; i++) {
                const char = chars[i];
                const keyCode = char.length === 1 ? char.toUpperCase().charCodeAt(0) : 0;
                const opts = { bubbles: true, cancelable: true };

                try {
                    el.dispatchEvent(new KeyboardEvent('keydown', { ...opts, key: char, code: keyCode ? `Key${char.toUpperCase()}` : '' }));
                    el.dispatchEvent(new KeyboardEvent('keypress', { ...opts, key: char, charCode: char.charCodeAt(0) || 0 }));
                } catch (_) { }

                if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                    const currentVal = el.value || '';
                    const newVal = currentVal.slice(0, startPos + i) + char + currentVal.slice(startPos + i);
                    if (!setElementValue(el, newVal)) return false;
                    const newCursor = startPos + i + 1;
                    try { el.setSelectionRange(newCursor, newCursor); } catch (_) { }
                } else {
                    if (!insertTextIntoEditable(el, char)) {
                        el.textContent = (el.textContent || '') + char;
                    }
                }

                try {
                    el.dispatchEvent(new InputEvent('input', { ...opts, data: char, inputType: 'insertText' }));
                } catch (_) {
                    el.dispatchEvent(new Event('input', opts));
                }
                try {
                    el.dispatchEvent(new KeyboardEvent('keyup', { ...opts, key: char }));
                } catch (_) { }

                await delay(randomDelay());
            }

            el.dispatchEvent(new Event('change', { bubbles: true }));
            if (el.blur) el.blur();
            else el.dispatchEvent(new Event('blur', { bubbles: true }));

            syncInputState(el, (el.value || el.textContent || '').trim(), "autofill");
            triggerAngularSync(el);
            return true;
        } finally {
            __typingInProgress = Math.max(0, __typingInProgress - 1);
        }
    }

    function syncInputState(el, val, source) {
        try {
            if (!el) return;
            const opts = { bubbles: true, cancelable: true };
            if (val?.length > 0) {
                el.dispatchEvent(new KeyboardEvent("keydown", { ...opts, key: val[0] }));
            }
            try {
                el.dispatchEvent(new InputEvent("beforeinput", {
                    bubbles: true,
                    cancelable: true,
                    inputType: source === "paste" ? "insertFromPaste" : "insertText",
                    data: val || ""
                }));
            } catch (_) { }
            el.dispatchEvent(new Event("input", opts));
            if (val?.length > 0) {
                el.dispatchEvent(new KeyboardEvent("keyup", { ...opts, key: val[val.length - 1] }));
            }
            el.dispatchEvent(new Event("change", opts));
            el.dispatchEvent(new Event("blur", opts));

            const tag = '__edx_input_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            el.setAttribute('data-edx-input-sync', tag);
            __dispatchBridgeEvent(document, '__edx_sync_input', {
                detail: { tag, value: val || "", source: source || "manual" }
            });
            setTimeout(() => {
                try { el.removeAttribute('data-edx-input-sync'); } catch (_) { }
            }, 1400);
        } catch (_) { }
    }

    function commitAnswerState() {
        try {
            __dispatchBridgeEvent(document, '__edx_force_commit', {
                detail: { reason: 'pre-submit' }
            });
        } catch (_) { }
    }

    function injectWritingText(text) {
        return new Promise((resolve) => {
            __dispatchBridgeEvent(document, '__edx_writing_insert_text', { detail: { text } });

            setTimeout(() => {
                try {
                    const tmce = window.tinymce || window.tinyMCE;
                    const iframe = document.querySelector('iframe[id$="_ifr"], iframe[title*="Rich Text" i]');
                    const body = iframe?.contentDocument?.body;
                    const hasContent = (body?.innerText?.trim().length > 0) ||
                        (tmce?.activeEditor?.getContent()?.length > 0);
                    resolve(hasContent);
                } catch (_) {
                    resolve(true);
                }
            }, 800);
        });
    }

