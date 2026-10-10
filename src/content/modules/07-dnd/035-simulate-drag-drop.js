// ========================= SIMULATE DRAG DROP =========================
const mkEventOpts = (x, y) => ({
    bubbles: true, cancelable: true, composed: true,
    clientX: x, clientY: y,
    screenX: x + (window.screenX || 0), screenY: y + (window.screenY || 0),
    pageX: x + window.scrollX, pageY: y + window.scrollY,
    button: 0, buttons: 1, view: window, detail: 1,
});

