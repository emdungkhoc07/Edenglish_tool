const __EDX_HASH = sessionStorage.getItem('__edx_eh') || Math.random().toString(36).substring(2, 8);
sessionStorage.setItem('__edx_eh', __EDX_HASH);
const __EDX_BRIDGE_TOKEN = sessionStorage.getItem('__edx_bt') || Math.random().toString(36).slice(2) + Date.now().toString(36);
sessionStorage.setItem('__edx_bt', __EDX_BRIDGE_TOKEN);

// Obfuscates a single class or a space-separated list of classes
function _O(cls) {
    if (!cls) return cls;
    return cls.split(' ').map(c => {
        // Only obfuscate our own prefixed classes
        if (c.startsWith('eds-') || c === 'edx' || c === 'edx-speaking-status') {
            return `_${__EDX_HASH}_${c}`;
        }
        return c;
    }).join(' ');
}

// Obfuscates an event name
function _E(evt) {
    if (!evt) return evt;
    if (evt.startsWith('__edx_')) {
        return `_${__EDX_HASH}_${evt}`;
    }
    return evt;
}

// Rewrites raw CSS text with randomized class names
function _O_css(cssText) {
    return cssText.replace(/\.(eds-[a-zA-Z0-9_-]+|edx|edx-speaking-status)/g, match => {
        return `._${__EDX_HASH}_${match.substring(1)}`;
    });
}

// Expose to window (Isolated World) so content.js can use them.
// SPA re-entry can execute this file more than once, so skip re-defining frozen props.
['_O', '_O_css', '_E', '__EDX_HASH', '__EDX_BRIDGE_TOKEN'].forEach((key) => {
    if (Object.getOwnPropertyDescriptor(window, key)) return;
    const val = { _O, _O_css, _E, __EDX_HASH, __EDX_BRIDGE_TOKEN }[key];
    Object.defineProperty(window, key, {
        value: val,
        enumerable: false,
        configurable: false,
        writable: false
    });
});
