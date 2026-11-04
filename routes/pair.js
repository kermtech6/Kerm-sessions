const { princeId, removeFile, generateRandomCode } = require('../mayel');

const zlib = require('zlib');
const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

const { sendButtons } = require('gifted-btns');

const {
    default: princeConnect,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidNormalizedUser,
    Browsers
} = require('@whiskeysockets/baileys');

const router = express.Router();

const sessionDir = path.join(__dirname, 'session');

const RESPONSE_TIMEOUT = 45 * 1000;   // délai max pour obtenir le code de pairing
const PAIR_TTL = 4 * 60 * 1000;       // temps laissé pour saisir le code dans WhatsApp
const DELIVERY_TTL = 3 * 60 * 1000;   // temps max pour livrer la session après connexion
const SETTLE_DELAY = 10 * 1000;       // pause après connexion pour que les creds soient complètes
const MAX_RECONNECTS = 8;

/* ------------------------------------------------------------------ */
/* Lecture de creds.json                                               */
/* ------------------------------------------------------------------ */
async function readCreds(dir) {
    const credsPath = path.join(dir, 'creds.json');

    for (let i = 0; i < 10; i++) {
        try {
            if (fs.existsSync(credsPath)) {
                const data = fs.readFileSync(credsPath);
                if (data && data.length > 100) return data;
            }
        } catch (e) {
            console.error('Read error:', e);
        }
        await delay(2000);
    }
    return null;
}

/* ------------------------------------------------------------------ */
/* Envoi du message de session (boutons, ou texte simple en secours)   */
/* ------------------------------------------------------------------ */
function sendSessionMessage(sock, sessionId, withButtons) {
    const jid = jidNormalizedUser(sock.user.id);

    if (!withButtons) {
        return sock.sendMessage(jid, { text: sessionId });
    }

    return sendButtons(sock, jid, {
        title: '',
        text: sessionId,
        footer: '> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ Kerm Tech*',
        buttons: [
            {
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Copy Session',
                    copy_code: sessionId
                })
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
/* Route : GET /code?number=237xxxxxxxx                                */
/* ------------------------------------------------------------------ */
router.get('/', async (req, res) => {
    const num = String(req.query.number || '').replace(/[^0-9]/g, '');

    if (num.length < 8 || num.length > 15) {
        return res.status(400).json({ code: 'Invalid number' });
    }

    const id = princeId();
    const dir = path.join(sessionDir, id);

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

    async function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(respTimer);
        try { sock && sock.ws && sock.ws.close(); } catch (_) {}
        try { await removeFile(dir); } catch (e) { console.error('Cleanup error:', e); }
        reply(500, { code: 'Service Error' });
    }

    // Livraison de la session. Peut être relancée si la connexion retombe puis revient.
    async function deliver(s, alive) {
        if (delivering || done) return;
        delivering = true;

        clearTimeout(timer);
        timer = setTimeout(() => finish(), DELIVERY_TTL);

        try {
            await delay(SETTLE_DELAY);
            if (done || !alive()) return;

            const data = await readCreds(dir);
            if (done || !alive()) return;
            if (!data) return await finish();

            const sessionId = 'KERM-MD-V1~' + zlib.gzipSync(data).toString('base64');

            // 4 essais avec boutons, puis 2 en texte simple
            for (let attempt = 0; attempt < 6; attempt++) {
                if (done || !alive()) return;

                try {
                    await sendSessionMessage(s, sessionId, attempt < 4);
                    await delay(3000);
                    return await finish();
                } catch (e) {
                    console.error('Send error (attempt ' + (attempt + 1) + '):', e);
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

            let version;
            try {
                ({ version } = await fetchLatestBaileysVersion());
            } catch (e) {
                console.error('Version fetch failed, using default:', e.message);
            }

            const s = princeConnect({
                ...(version ? { version } : {}),
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger)
                },
                printQRInTerminal: false,
                logger,
                browser: Browsers.macOS('Safari'),
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                shouldIgnoreJid: jid => !!jid?.endsWith('@g.us'),
                getMessage: async () => undefined,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            sock = s;
            let alive = true;

            s.ev.on('creds.update', async () => {
                if (done) return;
                try { await saveCreds(); } catch (e) { console.error('saveCreds error:', e); }
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
                    if (done) return;

                    const code = lastDisconnect && lastDisconnect.error &&
                        lastDisconnect.error.output &&
                        lastDisconnect.error.output.statusCode;

                    // 401 déconnecté, 403 interdit, 440 session remplacée : inutile de réessayer
                    if (code === 401 || code === 403 || code === 440 || ++reconnects > MAX_RECONNECTS) {
                        return finish();
                    }

                    // 515 = redémarrage demandé par WhatsApp juste après le pairing
                    await delay(code === 515 ? 1500 : 4000);
                    connect();
                }
            });

            if (!s.authState.creds.registered && !responded) {
                await delay(1500);
                const code = await s.requestPairingCode(num, generateRandomCode());
                reply(200, { code });
            }
        } catch (err) {
            console.error('Main error:', err);
            reply(500, { code: 'Service is Currently Unavailable' });
            await finish();
        }
    }

    connect();
});

module.exports = router;
