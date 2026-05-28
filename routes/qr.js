const { 
    princeId,
    removeFile
} = require('../mayel');

const QRCode = require('qrcode');
const express = require('express');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const pino = require("pino");

const { sendButtons } = require('gifted-btns');

const {
    default: princeConnect,
    useMultiFileAuthState,
    Browsers,
    delay,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

let router = express.Router();

const princeChannelId = '120363424806421640@newsletter';
const sessionDir = path.join(__dirname, "session");

router.get('/', async (req, res) => {

    const id = princeId();

    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {

        if (!sessionCleanedUp) {

            await removeFile(path.join(sessionDir, id));

            sessionCleanedUp = true;
        }
    }

    async function PRINCE_QR_CODE() {

        const { version } = await fetchLatestBaileysVersion();

        const { state, saveCreds } = await useMultiFileAuthState(
            path.join(sessionDir, id)
        );

        try {

            let Prince = princeConnect({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS("Desktop"),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            Prince.ev.on('creds.update', saveCreds);

            Prince.ev.on("connection.update", async (s) => {

                const { connection, lastDisconnect, qr } = s;

                if (qr && !responseSent) {

                    const qrImage = await QRCode.toDataURL(qr);

                    if (!res.headersSent) {

                        res.send(`
<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>KERM-MD-V1 | QR CONNECT</title>

<link rel="preconnect" href="https://fonts.googleapis.com">

<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;800&family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet">

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"/>

<style>

:root{
    --primary:#00d4ff;
    --secondary:#7a5cff;
    --bg:#070b17;
    --card:#10182c;
    --text:#ffffff;
    --muted:#98a2c5;
}

*{
    margin:0;
    padding:0;
    box-sizing:border-box;
}

html,
body{
    width:100%;
    min-height:100%;
    overflow-x:hidden;
    overflow-y:auto;
    scroll-behavior:smooth;
}

body{
    font-family:'Rajdhani',sans-serif;
    background:
    radial-gradient(circle at top left, rgba(0,212,255,.15), transparent 30%),
    radial-gradient(circle at bottom right, rgba(122,92,255,.18), transparent 30%),
    var(--bg);
    color:var(--text);
    padding:20px 15px 40px;
    position:relative;
}

/* Background */

.bg-grid{
    position:fixed;
    inset:0;
    background-image:
    linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px);
    background-size:40px 40px;
    z-index:-2;
}

.glow{
    position:fixed;
    width:350px;
    height:350px;
    border-radius:50%;
    background:rgba(0,212,255,.12);
    filter:blur(100px);
    top:-100px;
    left:-100px;
    z-index:-1;
}

/* Container */

.container{
    width:100%;
    max-width:480px;
    margin:0 auto;
    background:rgba(16,24,44,.82);
    backdrop-filter:blur(14px);
    border:1px solid rgba(255,255,255,.08);
    border-radius:28px;
    padding:28px 20px;
    text-align:center;
    box-shadow:0 20px 50px rgba(0,0,0,.45);
}

/* Logo */

.logo{
    width:95px;
    height:95px;
    border-radius:50%;
    margin:0 auto 18px;
    padding:4px;
    background:linear-gradient(135deg,var(--primary),var(--secondary));
    animation: spinGlow 6s linear infinite;
}

@keyframes spinGlow{
    0%{
        filter:hue-rotate(0deg);
    }
    100%{
        filter:hue-rotate(360deg);
    }
}

.logo img{
    width:100%;
    height:100%;
    object-fit:cover;
    border-radius:50%;
    border:3px solid #0c1220;
}

/* Text */

.badge{
    display:inline-flex;
    align-items:center;
    gap:8px;
    background:rgba(255,255,255,.05);
    border:1px solid rgba(255,255,255,.08);
    padding:8px 14px;
    border-radius:999px;
    margin-bottom:18px;
    font-size:.85rem;
    font-weight:700;
    color:var(--primary);
}

.badge-dot{
    width:10px;
    height:10px;
    border-radius:50%;
    background:#00ff99;
    box-shadow:0 0 12px #00ff99;
    animation:pulse 1.5s infinite;
}

@keyframes pulse{
    0%{
        transform:scale(1);
    }
    50%{
        transform:scale(1.3);
    }
    100%{
        transform:scale(1);
    }
}

h1{
    font-family:'Orbitron',sans-serif;
    font-size:2rem;
    line-height:1.2;
    margin-bottom:12px;
    background:linear-gradient(135deg,#fff,var(--primary));
    -webkit-background-clip:text;
    -webkit-text-fill-color:transparent;
}

.desc{
    color:var(--muted);
    font-size:1rem;
    line-height:1.7;
    margin-bottom:28px;
}

/* QR */

.qr-section{
    position:relative;
    margin-bottom:28px;
}

.qr-glow{
    position:absolute;
    inset:0;
    margin:auto;
    width:250px;
    height:250px;
    background:linear-gradient(135deg,var(--primary),var(--secondary));
    border-radius:30px;
    filter:blur(45px);
    opacity:.28;
    animation: glowPulse 2.5s ease infinite;
}

@keyframes glowPulse{
    0%{
        transform:scale(1);
        opacity:.22;
    }
    50%{
        transform:scale(1.06);
        opacity:.35;
    }
    100%{
        transform:scale(1);
        opacity:.22;
    }
}

.qr-box{
    position:relative;
    width:260px;
    height:260px;
    margin:0 auto;
    background:#fff;
    border-radius:28px;
    padding:16px;
    animation: floatQR 4s ease-in-out infinite;
    box-shadow:
    0 20px 60px rgba(0,0,0,.4),
    0 0 30px rgba(255,255,255,.15);
}

@keyframes floatQR{
    0%{
        transform:translateY(0px);
    }
    50%{
        transform:translateY(-10px);
    }
    100%{
        transform:translateY(0px);
    }
}

.qr-box img{
    width:100%;
    height:100%;
    border-radius:18px;
}

/* Scan Line */

.scan-line{
    position:absolute;
    top:16px;
    left:16px;
    width:calc(100% - 32px);
    height:4px;
    background:linear-gradient(
        90deg,
        transparent,
        rgba(0,212,255,.9),
        transparent
    );
    border-radius:999px;
    box-shadow:0 0 15px rgba(0,212,255,.9);
    animation: scan 2.2s linear infinite;
}

@keyframes scan{
    0%{
        transform:translateY(0);
    }
    100%{
        transform:translateY(220px);
    }
}

.scan-text{
    margin-top:20px;
    color:var(--muted);
    line-height:1.7;
    font-size:.98rem;
}

/* Buttons */

.actions{
    display:flex;
    flex-direction:column;
    gap:14px;
    margin-top:26px;
}

.btn{
    width:100%;
    padding:16px;
    border:none;
    border-radius:16px;
    text-decoration:none;
    font-family:'Orbitron',sans-serif;
    font-size:.9rem;
    font-weight:700;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:10px;
    cursor:pointer;
    transition:.3s ease;
}

.primary-btn{
    background:linear-gradient(135deg,var(--primary),var(--secondary));
    color:#fff;
    box-shadow:0 10px 30px rgba(0,0,0,.35);
}

.primary-btn:hover{
    transform:translateY(-3px);
}

.secondary-btn{
    background:rgba(255,255,255,.05);
    color:#fff;
    border:1px solid rgba(255,255,255,.08);
}

.secondary-btn:hover{
    background:rgba(255,255,255,.08);
}

/* Footer */

.footer{
    margin-top:28px;
    color:var(--muted);
    font-size:.92rem;
}

.footer-links{
    display:flex;
    justify-content:center;
    gap:14px;
    margin-top:18px;
}

.footer-links a{
    width:44px;
    height:44px;
    border-radius:14px;
    background:rgba(255,255,255,.05);
    border:1px solid rgba(255,255,255,.08);
    color:#fff;
    text-decoration:none;
    display:flex;
    align-items:center;
    justify-content:center;
    transition:.3s ease;
}

.footer-links a:hover{
    transform:translateY(-4px);
    background:linear-gradient(135deg,var(--primary),var(--secondary));
}

/* Mobile */

@media(max-width:480px){

    .container{
        padding:24px 16px;
        border-radius:24px;
    }

    h1{
        font-size:1.6rem;
    }

    .qr-box{
        width:220px;
        height:220px;
        padding:14px;
    }

    .qr-glow{
        width:220px;
        height:220px;
    }

    @keyframes scan{
        0%{
            transform:translateY(0);
        }
        100%{
            transform:translateY(185px);
        }
    }

}

</style>

</head>

<body>

<div class="bg-grid"></div>

<div class="glow"></div>

<div class="container">

    <div class="logo">
        <img src="https://raw.githubusercontent.com/kermtech6/logo/refs/heads/main/56C67450-A2D2-468E-B0CB-A76D4D48AE37.png">
    </div>

    <div class="badge">
        <span class="badge-dot"></span>
        QR READY
    </div>

    <h1>KERM-MD QR CONNECT</h1>

    <p class="desc">
        Scan this animated QR code with WhatsApp linked devices to connect your session securely.
    </p>

    <div class="qr-section">

        <div class="qr-glow"></div>

        <div class="qr-box">

            <div class="scan-line"></div>

            <img src="${qrImage}" alt="QR CODE">

        </div>

        <p class="scan-text">
            WhatsApp → Linked Devices → Link A Device → Scan QR
        </p>

    </div>

    <div class="actions">

        <a href="./" class="btn primary-btn">
            <i class="fas fa-house"></i>
            BACK HOME
        </a>

        <a 
            href="https://github.com/kermtech6/KERM-MD-V1"
            target="_blank"
            class="btn secondary-btn"
        >
            <i class="fab fa-github"></i>
            GITHUB REPOSITORY
        </a>

    </div>

    <div class="footer">

        <p>
            Powered By Kerm Tech © <span id="year"></span>
        </p>

        <div class="footer-links">

            <a href="https://github.com/kermtech6/KERM-MD-V1" target="_blank">
                <i class="fab fa-github"></i>
            </a>

            <a href="https://t.me/lord_kerm" target="_blank">
                <i class="fab fa-telegram"></i>
            </a>

            <a href="https://whatsapp.com/channel/0029VbCgEqc0bIdmRMLots12" target="_blank">
                <i class="fab fa-whatsapp"></i>
            </a>

        </div>

    </div>

</div>

<script>

document.getElementById('year').textContent = new Date().getFullYear();

</script>

</body>
</html>
                        `);

                        responseSent = true;
                    }
                }

                if (connection === "open") {

                    //await Prince.groupAcceptInvite("KJQNQ1RkuImChXtXfnq84X");

                    //await Prince.newsletterFollow(princeChannelId);

                    await delay(10000);

                    let sessionData = null;

                    let attempts = 0;

                    const maxAttempts = 10;

                    while (attempts < maxAttempts && !sessionData) {

                        try {

                            const credsPath = path.join(
                                sessionDir,
                                id,
                                "creds.json"
                            );

                            if (fs.existsSync(credsPath)) {

                                const data = fs.readFileSync(credsPath);

                                if (data && data.length > 100) {

                                    sessionData = data;

                                    break;
                                }
                            }

                            await delay(2000);

                            attempts++;

                        } catch (readError) {

                            console.error("Read error:", readError);

                            await delay(2000);

                            attempts++;
                        }
                    }

                    if (!sessionData) {

                        await cleanUpSession();

                        return;
                    }

                    try {

                        let compressedData = zlib.gzipSync(sessionData);

                        let b64data = compressedData.toString('base64');

                        await sendButtons(
                            Prince,
                            Prince.user.id,
                            {
                                title: '',
                                text: 'KERM-MD-V1~' + b64data,
                                footer: `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ Kerm Tech*`,
                                buttons: [
                                    {
                                        name: 'cta_copy',
                                        buttonParamsJson: JSON.stringify({
                                            display_text: 'Copy Session',
                                            copy_code: 'KERM-MD-V1~' + b64data
                                        })
                                    },
                                    {
                                        name: 'cta_url',
                                        buttonParamsJson: JSON.stringify({
                                            display_text: 'Visit Bot Repo',
                                            url: 'https://github.com/kermtech6/KERM-MD-V1/fork'
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
                            }
                        );

                        await delay(2000);

                        await Prince.ws.close();

                    } catch (sendError) {

                        console.error(
                            "Error sending session:",
                            sendError
                        );

                    } finally {

                        await cleanUpSession();
                    }

                } else if (
                    connection === "close" &&
                    lastDisconnect &&
                    lastDisconnect.error &&
                    lastDisconnect.error.output.statusCode != 401
                ) {

                    await delay(10000);

                    PRINCE_QR_CODE();
                }
            });

        } catch (err) {

            console.error("Main error:", err);

            if (!responseSent) {

                res.status(500).json({
                    code: "QR Service is Currently Unavailable"
                });

                responseSent = true;
            }

            await cleanUpSession();
        }
    }

    try {

        await PRINCE_QR_CODE();

    } catch (finalError) {

        console.error("Final error:", finalError);

        await cleanUpSession();

        if (!responseSent) {

            res.status(500).json({
                code: "Service Error"
            });
        }
    }
});

module.exports = router;
