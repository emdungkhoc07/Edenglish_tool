// ========================= DIAGNOSTIC OVERLAY =========================
let __diagActive = false;
const __diagOverlays = [];
let debugBtn = null;

const DIAG_COLORS = {
    bank: "#f59e0b", zone: "#3b82f6", input: "#10b981",
    mcq: "#8b5cf6", cb: "#ec4899", ddl: "#06b6d4",
};

function clearDiagOverlays() {
    __diagOverlays.forEach(o => o.remove());
    __diagOverlays.length = 0;
    __diagActive = false;
    if (debugBtn) {
        __removeObfClass(debugBtn, "eds-btn--active");
        debugBtn.title = "Diagnostic";
    }
}

function createOverlay(el, label, color) {
    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const ov = document.createElement("div");
    ov.className = __obfClassList("eds-diag-overlay");
    ov.style.cssText = `position:absolute;left:${rect.left + scrollX}px;top:${rect.top + scrollY}px;width:${Math.max(rect.width, 30)}px;height:${Math.max(rect.height, 20)}px;border:2px solid ${color};border-radius:4px;z-index:999998;pointer-events:none;box-sizing:border-box;`;
    const badge = document.createElement("span");
    badge.style.cssText = `position:absolute;top:-18px;left:0;background:${color};color:#fff;font:600 10px/16px -apple-system,system-ui,sans-serif;padding:0 5px;border-radius:3px 3px 0 0;white-space:nowrap;pointer-events:none;`;
    badge.textContent = label;
    ov.appendChild(badge);
    document.body.appendChild(ov);
    __diagOverlays.push(ov);
}

function runDiagnostic() {
    if (__diagActive) { clearDiagOverlays(); return; }
    console.group("[edx] --- DIAGNOSTIC ---");
    const type = detectQuestionType();
    console.log("Type:", type, "| __ans:", __ans);
    const banks = document.querySelectorAll(dndBankSel);
    const zones = getDndZones();
    console.log(`Banks: ${banks.length}, Zones: ${zones.length}`);
    zones.forEach((z, i) => console.log(`  zone[${i}] #${z.id} ${z.querySelector(".dnditem") ? "FILLED" : "EMPTY"}`));
    console.groupEnd();
    banks.forEach((b, i) => createOverlay(b, `BANK[${i}]`, DIAG_COLORS.bank));
    zones.forEach((z, i) => {
        const filled = !!z.querySelector(".dnditem");
        createOverlay(z, `ZONE[${i}]${filled ? " OK" : ""}`, filled ? "#64748b" : DIAG_COLORS.zone);
    });
    findTextInputs().forEach((el, i) => createOverlay(el, `INPUT[${i}]`, DIAG_COLORS.input));
    document.querySelectorAll(".prMCQ__answerLabel").forEach((el, i) => createOverlay(el, `MCQ[${i}]`, DIAG_COLORS.mcq));
    document.querySelectorAll(".lessonMultipleAnswer").forEach((el, i) => createOverlay(el, `CB[${i}]`, DIAG_COLORS.cb));
    document.querySelectorAll(".prFITB__DDLOptionsW").forEach((el, i) => createOverlay(el, `DDL[${i}]`, DIAG_COLORS.ddl));
    __diagActive = true;
    if (debugBtn) { __addObfClass(debugBtn, "eds-btn--active"); debugBtn.title = "Click để tắt"; }
}
