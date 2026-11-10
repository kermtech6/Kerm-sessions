const zlib = require('zlib');

const PREFIX = 'KERM-MD-V1~';
const FOLDER_NAME = 'KERM-MD-V1-SESSIONS';

function megaEnabled() {
    return !!(process.env.MEGA_EMAIL && process.env.MEGA_PASSWORD);
}

function withTimeout(promise, ms, label) {
    let t;
    const timeout = new Promise((_, reject) => {
        t = setTimeout(() => reject(new Error((label || 'operation') + ' timed out')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

/* Une seule connexion MEGA réutilisée (les logins répétés sont limités par MEGA) */
let storage = null;
let storagePromise = null;

async function getStorage() {
    if (storage) return storage;
    if (!storagePromise) {
        const { Storage } = require('megajs');
        storagePromise = new Storage({
            email: process.env.MEGA_EMAIL,
            password: process.env.MEGA_PASSWORD,
            userAgent: 'KERM-MD-V1-Session'
        }).ready.then((s) => {
            storage = s;
            return s;
        }).catch((e) => {
            storagePromise = null;
            throw e;
        });
    }
    return storagePromise;
}

function resetStorage() {
    storage = null;
    storagePromise = null;
}

async function getFolder() {
    const s = await getStorage();
    let folder = (s.root.children || []).find((c) => c.directory && c.name === FOLDER_NAME);
    if (!folder) folder = await s.mkdir(FOLDER_NAME);
    return folder;
}

/* Envoie creds.json sur MEGA et renvoie le lien https://mega.nz/file/ID#KEY */
async function uploadToMega(data, name) {
    const folder = await getFolder();
    const file = await folder.upload({ name, allowUploadBuffering: true }, data).complete;
    return file.link();
}

/*
 * Construit le SESSION_ID :
 *   KERM-MD-V1~<gzip base64>     par défaut (session longue, format d'origine)
 *   KERM-MD-V1~mega:<id>:<clé>   seulement si SESSION_FORMAT=mega et MEGA configuré
 */
async function buildSessionId(data) {
    // Format court sur MEGA uniquement si SESSION_FORMAT=mega ; par défaut : session longue (gzip base64)
    if (megaEnabled() && String(process.env.SESSION_FORMAT || '').toLowerCase() === 'mega') {
        try {
            const name = 'creds-' + Date.now().toString(36) + '.json';
            const link = await withTimeout(uploadToMega(data, name), 40000, 'MEGA upload');
            const m = /\/file\/([A-Za-z0-9_-]+)#([A-Za-z0-9_-]+)/.exec(String(link));
            if (m) return PREFIX + 'mega:' + m[1] + ':' + m[2];
            console.error('MEGA returned an unexpected link, using inline session');
        } catch (e) {
            console.error('MEGA upload failed, using inline session:', e && e.message);
            resetStorage();
        }
    }
    return PREFIX + zlib.gzipSync(data).toString('base64');
}

module.exports = { megaEnabled, buildSessionId };
