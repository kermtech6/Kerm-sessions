const crypto = require('crypto');

/*
 * Garde le SESSION_ID quelques minutes pour l'afficher aussi sur la page web.
 * Ainsi l'utilisateur récupère sa session même si le message WhatsApp n'arrive pas
 * (par exemple sur WhatsApp Messenger).
 */
const TTL_MS = 10 * 60 * 1000;
const store = new Map(); // token -> { id, exp }

function newToken() {
    return crypto.randomBytes(16).toString('hex');
}

function put(token, id) {
    store.set(token, { id, exp: Date.now() + TTL_MS });
}

function get(token) {
    const e = store.get(String(token || ''));
    if (!e) return null;
    if (e.exp < Date.now()) {
        store.delete(token);
        return null;
    }
    return e.id;
}

setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) if (v.exp < now) store.delete(k);
}, 60 * 1000).unref();

module.exports = { newToken, put, get };
