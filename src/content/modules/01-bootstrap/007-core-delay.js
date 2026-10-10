// ========================= CORE DELAY =========================
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const delayFetchJitter = () => delay(50 + Math.random() * 150);

