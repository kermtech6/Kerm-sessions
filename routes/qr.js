const {
    princeId,
    removeFile
} = require('../mayel');

const QRCode = require('qrcode');
const express = require('express');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const pino = require('pino');

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

        const { state, saveCreds } =
            await useMultiFileAuthState(path.join(sessionDir, id));

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

                const {
                    connection,
                    lastDisconnect,
                    qr
                } = s;

                /* ================= QR PAGE ================= */

                if (qr && !responseSent) {

                    const qrImage = await QRCode.toDataURL(qr);

                    if (!res.headersSent) {

                        res.send(`
<!DOCTYPE html>
<html lang="en">
<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">

<title>KERM-MD-V1 | QR CODE</title>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">

<link rel="stylesheet"
href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

<style>

:root{
    --primary:#00e5ff;
    --secondary:#7b61ff;
    --accent:#00ffb7;
    --dark:#050816;
    --dark2:#0b1020;
    --card:rgba(12,18,35,.72);
    --border:rgba(255,255,255,.08);
    --text:#ffffff;
    --muted:#94a3b8;
    --transition:all .4s cubic-bezier(.4,0,.2,1);
}

*{
    margin:0;
    padding:0;
    box-sizing:border-box;
}

body{
    min-height:100vh;
    overflow:hidden;
    font-family:'Inter',sans-serif;
    background:
    radial-gradient(circle at top left,
    rgba(0,229,255,.16),
    transparent 35%),

    radial-gradient(circle at bottom right,
    rgba(123,97,255,.18),
    transparent 35%),

    linear-gradient(145deg,var(--dark),var(--dark2));

    display:flex;
    justify-content:center;
    align-items:center;
    padding:20px;
    color:var(--text);
    position:relative;
}

/* GRID */

.grid{
    position:fixed;
    inset:0;
    background-image:
    linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px);
    background-size:45px 45px;
    z-index:-2;
}

/* GLOW */

.glow{
    position:fixed;
    width:500px;
    height:500px;
    border-radius:50%;
    filter:blur(120px);
    opacity:.4;
    animation:pulse 8s infinite alternate ease-in-out;
    z-index:-1;
}

.glow.one{
    top:-120px;
    left:-120px;
    background:#00e5ff;
}

.glow.two{
    bottom:-120px;
    right:-120px;
    background:#7b61ff;
    animation-delay:2s;
}

@keyframes pulse{
    from{
        transform:scale(1);
    }
    to{
        transform:scale(1.2);
    }
}

/* PARTICLES */

.particles{
    position:fixed;
    inset:0;
    overflow:hidden;
    z-index:-1;
}

.particle{
    position:absolute;
    width:3px;
    height:3px;
    border-radius:50%;
    background:rgba(255,255,255,.8);
    animation:float linear infinite;
}

@keyframes float{
    0%{
        transform:translateY(100vh);
        opacity:0;
    }
    10%{
        opacity:1;
    }
    90%{
        opacity:1;
    }
    100%{
        transform:translateY(-100vh);
        opacity:0;
    }
}

/* CARD */

.container{
    width:100%;
    max-width:520px;
    padding:40px 30px;
    border-radius:30px;
    background:var(--card);
    backdrop-filter:blur(25px);
    border:1px solid var(--border);
    box-shadow:
    0 20px 60px rgba(0,0,0,.5),
    0 0 40px rgba(0,229,255,.12);
    position:relative;
    overflow:hidden;
    animation:entry .8s ease;
}

.container::before{
    content:'';
    position:absolute;
    inset:0;
    border-radius:30px;
    padding:1px;
    background:
    linear-gradient(
        135deg,
        rgba(0,229,255,.4),
        rgba(123,97,255,.4),
        rgba(0,255,183,.4)
    );
    -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
    -webkit-mask-composite:xor;
    mask-composite:exclude;
}

@keyframes entry{
    from{
        opacity:0;
        transform:translateY(25px) scale(.95);
    }
    to{
        opacity:1;
        transform:translateY(0) scale(1);
    }
}

/* BADGE */

.badge{
    width:75px;
    height:75px;
    border-radius:24px;
    margin:auto;
    display:flex;
    justify-content:center;
    align-items:center;
    font-size:30px;
    background:
    linear-gradient(
        135deg,
        rgba(0,229,255,.25),
        rgba(123,97,255,.25)
    );
    border:1px solid rgba(255,255,255,.08);
    box-shadow:0 0 35px rgba(0,229,255,.2);
    margin-bottom:22px;
}

/* TITLE */

h1{
    font-family:'Orbitron',sans-serif;
    text-align:center;
    font-size:2rem;
    font-weight:800;
    margin-bottom:12px;
    line-height:1.4;
    background:
    linear-gradient(
        135deg,
        #fff,
        #00e5ff,
        #7b61ff
    );
    -webkit-background-clip:text;
    color:transparent;
}

.subtitle{
    text-align:center;
    color:var(--muted);
    font-size:15px;
    line-height:1.7;
    margin-bottom:35px;
}

/* QR BOX */

.qr-wrapper{
    position:relative;
    width:100%;
    display:flex;
    justify-content:center;
    margin-bottom:35px;
}

.qr-box{
    width:300px;
    height:300px;
    padding:16px;
    border-radius:28px;
    background:#fff;
    position:relative;
    overflow:hidden;
    box-shadow:
    0 0 40px rgba(0,229,255,.18),
    0 20px 50px rgba(0,0,0,.45);
}

.qr-box::before{
    content:'';
    position:absolute;
    inset:0;
    border-radius:28px;
    padding:2px;
    background:
    linear-gradient(
        135deg,
        #00e5ff,
        #7b61ff,
        #00ffb7
    );

    -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);

    -webkit-mask-composite:xor;
    mask-composite:exclude;
}

.qr-box img{
    width:100%;
    height:100%;
    border-radius:18px;
    position:relative;
    z-index:1;
}

/* STATUS */

.status{
    display:flex;
    justify-content:center;
    align-items:center;
    gap:10px;
    margin-bottom:30px;
    color:#00ffb7;
    font-size:14px;
    font-weight:600;
}

.dot{
    width:10px;
    height:10px;
    border-radius:50%;
    background:#00ffb7;
    box-shadow:0 0 15px #00ffb7;
    animation:blink 1.5s infinite;
}

@keyframes blink{
    0%,100%{
        opacity:1;
    }
    50%{
        opacity:.3;
    }
}

/* INFO */

.info{
    display:grid;
    grid-template-columns:repeat(2,1fr);
    gap:14px;
    margin-bottom:28px;
}

.info-card{
    background:rgba(255,255,255,.04);
    border:1px solid rgba(255,255,255,.05);
    border-radius:18px;
    padding:16px;
    text-align:center;
    transition:var(--transition);
}

.info-card:hover{
    transform:translateY(-4px);
    border-color:rgba(0,229,255,.25);
    box-shadow:0 0 25px rgba(0,229,255,.12);
}

.info-card i{
    font-size:22px;
    margin-bottom:10px;
    color:#00e5ff;
}

.info-card h3{
    font-size:13px;
    margin-bottom:6px;
    font-weight:700;
}

.info-card p{
    color:var(--muted);
    font-size:12px;
    line-height:1.5;
}

/* BUTTONS */

.actions{
    display:flex;
    gap:14px;
    flex-wrap:wrap;
}

.btn{
    flex:1;
    min-width:150px;
    padding:16px 20px;
    border-radius:16px;
    border:none;
    text-decoration:none;
    font-weight:700;
    font-size:14px;
    transition:var(--transition);
    display:flex;
    justify-content:center;
    align-items:center;
    gap:10px;
    cursor:pointer;
}

.btn-primary{
    background:
    linear-gradient(
        135deg,
        #00e5ff,
        #7b61ff
    );
    color:#fff;
    box-shadow:
    0 10px 30px rgba(0,229,255,.25);
}

.btn-primary:hover{
    transform:translateY(-3px);
    box-shadow:
    0 20px 40px rgba(0,229,255,.35);
}

.btn-secondary{
    background:rgba(255,255,255,.05);
    color:#fff;
    border:1px solid rgba(255,255,255,.08);
}

.btn-secondary:hover{
    transform:translateY(-3px);
    background:rgba(255,255,255,.08);
    border-color:rgba(0,229,255,.2);
}

/* FOOTER */

.footer{
    margin-top:28px;
    text-align:center;
    color:var(--muted);
    font-size:13px;
}

.footer span{
    color:#00e5ff;
    font-weight:700;
}

/* MOBILE */

@media(max-width:600px){

    .container{
        padding:28px 20px;
        border-radius:24px;
    }

    h1{
        font-size:1.5rem;
    }

    .qr-box{
        width:240px;
        height:240px;
    }

    .info{
        grid-template-columns:1fr;
    }

    .actions{
        flex-direction:column;
    }

    .btn{
        width:100%;
    }

}

</style>
</head>

<body>

<div class="grid"></div>

<div class="glow one"></div>
<div class="glow two"></div>

<div class="particles" id="particles"></div>

<div class="container">

    <div class="badge">
        <i class="fas fa-qrcode"></i>
    </div>

    <h1>KERM-MD-V1<br>QR CONNECT</h1>

    <p class="subtitle">
        Scan this QR Code using WhatsApp linked devices
        to securely connect your session instantly.
    </p>

    <div class="qr-wrapper">
        <div class="qr-box">
            <img src="${qrImage}" alt="QR CODE">
        </div>
    </div>

    <div class="status">
        <div class="dot"></div>
        Waiting for device connection...
    </div>

    <div class="info">

        <div class="info-card">
            <i class="fas fa-shield-alt"></i>
            <h3>Secure Login</h3>
            <p>Encrypted authentication system.</p>
        </div>

        <div class="info-card">
            <i class="fas fa-bolt"></i>
            <h3>Fast Pairing</h3>
            <p>Connect your bot in seconds.</p>
        </div>

    </div>

    <div class="actions">

        <a href="./" class="btn btn-primary">
            <i class="fas fa-home"></i>
            Home
        </a>

        <a href="https://github.com/kermtech6/KERM-MD-V1"
        target="_blank"
        class="btn btn-secondary">

            <i class="fab fa-github"></i>
            GitHub

        </a>

    </div>

    <div class="footer">
        Powered by <span>Kerm Tech</span>
    </div>

</div>

<script>

/* PARTICLES */

function createParticles(){

    const particles =
    document.getElementById('particles');

    const count =
    window.innerWidth < 768 ? 18 : 35;

    for(let i = 0; i < count; i++){

        const particle =
        document.createElement('div');

        particle.classList.add('particle');

        const size =
        Math.random() * 4 + 1;

        particle.style.width =
        size + 'px';

        particle.style.height =
        size + 'px';

        particle.style.left =
        Math.random() * 100 + '%';

        particle.style.animationDuration =
        (Math.random() * 12 + 8) + 's';

        particle.style.animationDelay =
        Math.random() * 10 + 's';

        particle.style.opacity =
        Math.random();

        particles.appendChild(particle);

    }

}

createParticles();

/* AUTO REFRESH */

setTimeout(() => {
    location.reload();
}, 60000);

</script>

</body>
</html>
                        `);

                        responseSent = true;
                    }
                }

                /* ================= CONNECTED ================= */

                if (connection === "open") {

                    await delay(10000);

                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 10;

                    while (attempts < maxAttempts && !sessionData) {

                        try {

                            const credsPath =
                                path.join(sessionDir, id, "creds.json");

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

                        let compressedData =
                            zlib.gzipSync(sessionData);

                        let b64data =
                            compressedData.toString('base64');

                        await sendButtons(
                            Prince,
                            Prince.user.id,
                            {
                                title: '',
                                text: 'KERM-MD-V1~' + b64data,

                                footer: '> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ Kerm Tech*',

                                buttons: [

                                    {
                                        name: 'cta_copy',

                                        buttonParamsJson:
                                        JSON.stringify({
                                            display_text: 'Copy Session',
                                            copy_code:
                                            'KERM-MD-V1~' + b64data
                                        })
                                    },

                                    {
                                        name: 'cta_url',

                                        buttonParamsJson:
                                        JSON.stringify({
                                            display_text: 'Visit Bot Repo',
                                            url: 'https://github.com/kermtech6/KERM-MD-V1/fork'
                                        })
                                    },

                                    {
                                        name: 'cta_url',

                                        buttonParamsJson:
                                        JSON.stringify({
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

                }

                /* ================= RECONNECT ================= */

                else if (
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
