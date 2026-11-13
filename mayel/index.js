const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

/* ------------------------------------------------------------------ */
/* Dossier temporaire des sessions (hors du dépôt, nettoyé au boot)    */
/* ------------------------------------------------------------------ */
const SESSION_ROOT = path.join(os.tmpdir(), 'kerm-sessions');

function ensureSessionRoot() {
    fs.mkdirSync(SESSION_ROOT, { recursive: true });
}

function cleanSessionRoot() {
    try { fs.rmSync(SESSION_ROOT, { recursive: true, force: true }); } catch (_) {}
    ensureSessionRoot();
}

/* ------------------------------------------------------------------ */
/* Générateurs                                                         */
/* ------------------------------------------------------------------ */
function princeId(num = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < num; i++) result += chars[crypto.randomInt(chars.length)];
    return result;
}

function generateRandomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) result += chars[crypto.randomInt(chars.length)];
    return result;
}

async function removeFile(FilePath) {
    try {
        await fs.promises.rm(FilePath, { recursive: true, force: true });
        return true;
    } catch (_) {
        return false;
    }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Version WhatsApp Web : mise en cache (évite un appel réseau par      */
/* session, et un échec si le fetch tombe)                              */
/* ------------------------------------------------------------------ */
let versionCache = null;
let versionAt = 0;
const VERSION_TTL = 6 * 60 * 60 * 1000;

async function getBaileysVersion() {
    const { fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

    if (versionCache && Date.now() - versionAt < VERSION_TTL) return versionCache;

    try {
        // 8 s maximum : si le réseau bloque, on ne reste pas coincé sur « Packing your QR code... »
        const { version } = await Promise.race([
            fetchLatestBaileysVersion(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('version fetch timed out')), 8000))
        ]);
        if (Array.isArray(version) && version.length === 3) {
            versionCache = version;
            versionAt = Date.now();
        }
    } catch (e) {
        console.error('Version fetch failed:', e && e.message);
    }

    // En cas d'échec : dernière version connue, sinon la version par défaut de Baileys
    return versionCache || undefined;
}

/* ------------------------------------------------------------------ */
/* Lecture sûre de creds.json : le fichier doit être complet, en JSON  */
/* valide et appartenir à un appareil réellement lié                   */
/* ------------------------------------------------------------------ */
async function readValidCreds(dir, tries = 12) {
    const credsPath = path.join(dir, 'creds.json');
    let fallback = null;   // fichier lisible mais pas « parfait » : comme l'ancien code, on s'en contente à la fin

    for (let i = 0; i < tries; i++) {
        try {
            if (fs.existsSync(credsPath)) {
                const raw = fs.readFileSync(credsPath);
                if (raw.length > 100) {
                    try {
                        const json = JSON.parse(raw.toString('utf8'));
                        // le compte lié doit être présent (le champ « registered » n'est pas fiable)
                        if (json && json.me && json.me.id) return raw;
                        fallback = raw;
                    } catch (_) {
                        // fichier en cours d'écriture : on réessaie
                    }
                }
            }
        } catch (_) {}
        await delay(1500);
    }

    if (fallback) console.log('⚠️ creds.json sans me.id : envoi tel quel (comportement d\'origine)');
    else console.log('⚠️ creds.json introuvable ou illisible après ' + tries + ' essais');
    return fallback;
}

/* ------------------------------------------------------------------ */
/* Limite de sessions simultanées (protège la RAM d'un dyno Heroku)     */
/* ------------------------------------------------------------------ */
const MAX_ACTIVE = parseInt(process.env.MAX_SESSIONS, 10) || 10;
let active = 0;

function acquireSlot() {
    if (active >= MAX_ACTIVE) return false;
    active++;
    return true;
}

function releaseSlot() {
    if (active > 0) active--;
}

/* ------------------------------------------------------------------ */
/* Limite par IP : 20 démarrages / 10 minutes                           */
/* ------------------------------------------------------------------ */
const hits = new Map();
const RATE_WINDOW = 10 * 60 * 1000;
const RATE_MAX = 20;

function rateLimited(ip) {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
    if (list.length >= RATE_MAX) {
        hits.set(ip, list);
        return true;
    }
    list.push(now);
    hits.set(ip, list);
    return false;
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, list] of hits) {
        const kept = list.filter((t) => now - t < RATE_WINDOW);
        if (kept.length) hits.set(ip, kept); else hits.delete(ip);
    }
}, 5 * 60 * 1000).unref();

module.exports = {
    SESSION_ROOT,
    ensureSessionRoot,
    cleanSessionRoot,
    princeId,
    generateRandomCode,
    removeFile,
    delay,
    getBaileysVersion,
    readValidCreds,
    acquireSlot,
    releaseSlot,
    rateLimited
};
