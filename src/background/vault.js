const STORAGE_KEYS = ["aRequest", "autho"];
const STORAGE_SCHEMA_VERSION = 3;

const CryptoUtils = {
    async generateKey() {
        return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    },
    async encrypt(data, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(data);
        const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
        return { iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
    },
    async decrypt(encryptedObj, key) {
        const iv = new Uint8Array(encryptedObj.iv);
        const data = new Uint8Array(encryptedObj.data);
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
        return new TextDecoder().decode(decrypted);
    }
};

class EphemeralSessionVault {
    constructor() {
        this.key = null;
        this.data = new Map();
    }

    async ensureKey() {
        if (!this.key) this.key = await CryptoUtils.generateKey();
    }

    async set(name, value) {
        await this.ensureKey();
        const encrypted = await CryptoUtils.encrypt(JSON.stringify(value), this.key);
        this.data.set(name, encrypted);
    }

    async get(name) {
        if (!this.key) return null;
        const encrypted = this.data.get(name);
        if (!encrypted) return null;
        try {
            return JSON.parse(await CryptoUtils.decrypt(encrypted, this.key));
        } catch (_) {
            return null;
        }
    }

    async delete(name) {
        this.data.delete(name);
    }

    clear() {
        this.data.clear();
        this.key = null;
    }
}

const sessionVault = new EphemeralSessionVault();

function sessionStorageGet(keys) {
    return new Promise((resolve) => {
        try {
            chrome.storage.session.get(keys, (result) => resolve(result || {}));
        } catch (_) {
            resolve({});
        }
    });
}

function sessionStorageSet(payload) {
    return new Promise((resolve) => {
        try {
            chrome.storage.session.set(payload, () => resolve());
        } catch (_) {
            resolve();
        }
    });
}

function sessionStorageRemove(keys) {
    return new Promise((resolve) => {
        try {
            chrome.storage.session.remove(keys, () => resolve());
        } catch (_) {
            resolve();
        }
    });
}

chrome.storage.local.get(["_edx_storage_version"], (result) => {
    if (result?._edx_storage_version === STORAGE_SCHEMA_VERSION) return;
    chrome.storage.local.set({ _edx_storage_version: STORAGE_SCHEMA_VERSION });
});
