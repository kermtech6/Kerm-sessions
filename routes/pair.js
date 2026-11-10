const {
    SESSION_ROOT, princeId, removeFile, generateRandomCode, delay,
    getBaileysVersion, readValidCreds, acquireSlot, releaseSlot, rateLimited
} = require('../mayel');

const express = require('express');
const path = require('path');
const pino = require('pino');

const { sendButtons } = require('gifted-btns');
const { buildSessionId } = require('../mayel/mega');

const baileys = require('@whiskeysockets/baileys');
const {
    default: princeConnect,
    useMultiFileAuthState,
    jidNormalizedUser,
    Browsers
} = baileys;

// Le fork utilisé par le bot peut ne pas exposer makeCacheableSignalKeyStore
const wrapKeys = (keys, logger) =>
    typeof baileys.makeCacheableSignalKeyStore === 'function'
        ? baileys.makeCacheableSignalKeyStore(keys, logger)
        : keys;

const router = express.Router();

// Heroku coupe toute requête HTTP après 30 s : on répond avant (H12)
const RESPONSE_TIMEOUT = 25 * 1000;
const PAIR_TTL = 4 * 60 * 1000;       // temps pour saisir le code dans WhatsApp
const DELIVERY_TTL = 3 * 60 * 1000;   // temps max pour livrer la session après connexion
const SETTLE_DELAY = 8 * 1000;        // pause après connexion pour que les creds soient complètes
const MAX_RECONNECTS = 8;

function sendSessionMessage(sock, sessionId, withButtons) {
    const jid = jidNormalizedUser(sock.user.id);

    if (!withButtons) return sock.sendMessage(jid, { text: sessionId });

    return sendButtons(sock, jid, {
        title: '',
        text: sessionId,
        footer: '> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ Kerm Tech*',
        buttons: [
            {
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({ display_text: 'Copy Session', copy_code: sessionId })
            },
            {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Visit Bot Repo',
                    url: 'https://github.com/kermtech6/KERM-MD-V1'
                })
            },
            {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Join WaChannel',
                    url: 'https://whatsapp.com/channel/0029VbCgEqc0bIdmRMLots12'
                })
            }
        ]
    });
}

/* ------------------------------------------------------------------ */
/* GET /code?number=237xxxxxxxx                                        */
/* ------------------------------------------------------------------ */
router.get('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');

    const num = String(req.query.number || '').replace(/[^0-9]/g, '');
    if (num.length < 8 || num.length > 15) {
        return res.status(400).json({ code: 'Invalid number' });
    }

    if (rateLimited(req.ip)) {
        return res.status(429).json({ code: 'Too many attempts, wait a few minutes' });
    }

    if (!acquireSlot()) {
        return res.status(503).json({ code: 'Server busy, try again in a minute' });
    }

    const id = princeId();
    const dir = path.join(SESSION_ROOT, id);

    let sock = null;
    let done = false;
    let delivering = false;
    let responded = false;
    let reconnects = 0;

    let timer = setTimeout(() => finish(), PAIR_TTL);
    const respTimer = setTimeout(() => {
        if (!responded) {
            reply(504, { code: 'Timeout, try again' });
            finish();
        }
    }, RESPONSE_TIMEOUT);

    function reply(status, body) {
        if (responded || res.headersSent) return;
        responded = true;
        clearTimeout(respTimer);
        res.status(status).json(body);
    }

    function killSocket(s) {
        if (!s) return;
        try { s.ev.removeAllListeners('connection.update'); } catch (_) {}
        try { s.ev.removeAllListeners('creds.update'); } catch (_) {}
        try { s.end(undefined); } catch (_) {}
        try { s.ws && s.ws.close(); } catch (_) {}
    }

    async function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(respTimer);
        killSocket(sock);
        await removeFile(dir);
        releaseSlot();
        reply(500, { code: 'Service Error' });
    }

    async function deliver(s, alive) {
        if (delivering || done) return;
        delivering = true;

        clearTimeout(timer);
        timer = setTimeout(() => finish(), DELIVERY_TTL);

        try {
            await delay(SETTLE_DELAY);
            if (done || !alive()) return;

            const data = await readValidCreds(dir);
            if (done || !alive()) return;
            if (!data) return await finish();

            const sessionId = await buildSessionId(data);

            // 4 essais avec boutons, puis 2 en texte simple
            for (let attempt = 0; attempt < 6; attempt++) {
                if (done || !alive()) return;

                try {
                    await sendSessionMessage(s, sessionId, attempt < 4);
                    await delay(3000);
                    return await finish();
                } catch (e) {
                    console.error('Send error (attempt ' + (attempt + 1) + '):', e && e.message);
                    await delay(3000);
                }
            }

            if (alive()) await finish();
        } catch (e) {
            console.error('Session processing error:', e);
        } finally {
            delivering = false;
        }
    }

    async function connect() {
        if (done) return;

        try {
            const { state, saveCreds } = await useMultiFileAuthState(dir);
            const logger = pino({ level: 'fatal' });
            const version = await getBaileysVersion();

            const s = princeConnect({
                ...(version ? { version } : {}),
                auth: {
                    creds: state.creds,
                    keys: wrapKeys(state.keys, logger)
                },
                printQRInTerminal: false,
                logger,
                browser: Browsers.macOS('Safari'),
                syncFullHistory: false,
                generateHighQualityLinkPreview: false,
                shouldIgnoreJid: (jid) => !!jid && jid.endsWith('@g.us'),
                getMessage: async () => undefined,
                markOnlineOnConnect: false,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            sock = s;
            let alive = true;

            s.ev.on('creds.update', async () => {
                if (done || sock !== s) return;
                try { await saveCreds(); } catch (e) { console.error('saveCreds error:', e && e.message); }
            });

            s.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    reconnects = 0;
                    deliver(s, () => alive && sock === s && !done).catch(() => {});
                    return;
                }

                if (connection === 'close') {
                    alive = false;
                    if (done || sock !== s) return;

                    const code = lastDisconnect && lastDisconnect.error &&
                        lastDisconnect.error.output &&
                        lastDisconnect.error.output.statusCode;

                    // 401 déconnecté, 403 interdit, 440 session remplacée : inutile de réessayer
                    if (code === 401 || code === 403 || code === 440 || ++reconnects > MAX_RECONNECTS) {
                        return finish();
                    }

                    killSocket(s);
                    // 515 = redémarrage demandé par WhatsApp juste après le pairing
                    await delay(code === 515 ? 1500 : 4000);
                    connect();
                }
            });

            if (!s.authState.creds.registered && !responded) {
                await delay(1500);
                if (done) return;
                const code = await s.requestPairingCode(num, generateRandomCode());
                reply(200, { code });
            }
        } catch (err) {
            console.error('Main error:', err && err.message);
            reply(500, { code: 'Service is Currently Unavailable' });
            await finish();
        }
    }

    // Si le client ferme la page avant la fin du pairing, on garde la session active
    // (l'utilisateur peut encore saisir le code) : le TTL se charge du nettoyage.
    connect();
});

module.exports = router;
