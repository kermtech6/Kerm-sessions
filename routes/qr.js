const { princeId, removeFile } = require('../mayel');

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
} = require('@whiskeysockets/baileys');

const router = express.Router();

const sessionDir = path.join(__dirname, 'session');
const SESSION_TTL = 3 * 60 * 1000;
const MAX_RETRIES = 6;

// id -> { status: waiting | qr | linking | connected | error | expired, qr: dataURL | null }
const sessions = new Map();

/* ------------------------------------------------------------------ */
/* Lecture de creds.json puis envoi de la session sur WhatsApp         */
/* ------------------------------------------------------------------ */
async function sendSession(sock, dir) {
    await delay(10000);

    const credsPath = path.join(dir, 'creds.json');
    let sessionData = null;

    for (let i = 0; i < 10 && !sessionData; i++) {
        try {
            if (fs.existsSync(credsPath)) {
                const data = fs.readFileSync(credsPath);
                if (data && data.length > 100) {
                    sessionData = data;
                    break;
                }
            }
        } catch (e) {
            console.error('Read error:', e);
        }
        await delay(2000);
    }

    if (!sessionData) return false;

    const b64data = zlib.gzipSync(sessionData).toString('base64');
    const sessionId = 'KERM-MD-V1~' + b64data;

    await sendButtons(sock, sock.user.id, {
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
    });

    await delay(2000);
    return true;
}

/* ------------------------------------------------------------------ */
/* Cycle de vie d'une session QR                                       */
/* ------------------------------------------------------------------ */
async function startSession(id, state) {
    const dir = path.join(sessionDir, id);
    let sock = null;
    let done = false;
    let opened = false;
    let retries = 0;

    const timer = setTimeout(() => finish('expired'), SESSION_TTL);

    async function finish(status) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        state.status = status;
        state.qr = null;
        try { sock && sock.ws && sock.ws.close(); } catch (_) {}
        try { await removeFile(dir); } catch (_) {}
        setTimeout(() => sessions.delete(id), 60 * 1000);
    }

    async function connect() {
        if (done) return;

        try {
            const { version } = await fetchLatestBaileysVersion();
            const { state: auth, saveCreds } = await useMultiFileAuthState(dir);

            sock = princeConnect({
                version,
                auth,
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }),
                browser: Browsers.macOS('Desktop'),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !done) {
                    try {
                        state.qr = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
                        state.status = 'qr';
                    } catch (e) {
                        console.error('QR error:', e);
                    }
                }

                if (connection === 'open' && !opened && !done) {
                    opened = true;
                    clearTimeout(timer);
                    state.status = 'linking';
                    state.qr = null;

                    try {
                        const ok = await sendSession(sock, dir);
                        await finish(ok ? 'connected' : 'error');
                    } catch (e) {
                        console.error('Error sending session:', e);
                        await finish('error');
                    }
                    return;
                }

                if (connection === 'close' && !done) {
                    const code = lastDisconnect && lastDisconnect.error &&
                        lastDisconnect.error.output &&
                        lastDisconnect.error.output.statusCode;

                    // 401 = déconnecté, 403 = banni/interdit : inutile de réessayer
                    if (code === 401 || code === 403 || ++retries > MAX_RETRIES) {
                        return finish('error');
                    }

                    // 515 = redémarrage demandé juste après le scan du QR
                    if (code === 515) {
                        state.status = 'linking';
                        state.qr = null;
                    }

                    await delay(code === 515 ? 1500 : 3000);
                    connect();
                }
            });
        } catch (err) {
            console.error('Main error:', err);
            finish('error');
        }
    }

    connect();
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */
router.get('/data', (req, res) => {
    const s = sessions.get(String(req.query.id || ''));
    res.set('Cache-Control', 'no-store');
    res.json(s ? { status: s.status, qr: s.qr } : { status: 'expired' });
});

router.get('/', (req, res) => {
    const id = princeId();
    const state = { status: 'waiting', qr: null };
    sessions.set(id, state);

    res.set('Cache-Control', 'no-store');
    res.send(renderPage(id));

    startSession(id, state);
});

/* ------------------------------------------------------------------ */
/* Page HTML (style carton)                                            */
/* ------------------------------------------------------------------ */
function renderPage(id) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#c9a26b">
<title>KERM-MD-V1 | QR connect</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Caveat:wght@600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
:root{--k1:#c9a26b;--k2:#b27f45;--k3:#e6c995;--ink:#2e2216;--paper:#fff8e8;--red:#d9432f;--grn:#2f9e5b;--blu:#2c5fd1;--tape:rgba(247,224,140,.88)}
*{margin:0;padding:0;box-sizing:border-box}
[hidden]{display:none!important}
body{font-family:'Fredoka',sans-serif;background:var(--k1);color:var(--ink);min-height:100vh;overflow-x:hidden;line-height:1.55;display:flex;align-items:center;justify-content:center;padding:26px 18px}
body::before{content:'';position:fixed;inset:0;z-index:-1;background:radial-gradient(ellipse at center,transparent 50%,rgba(70,40,10,.35)),url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 .35 0 0 0 0 .22 0 0 0 0 .1 0 0 0 .6 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E"),repeating-linear-gradient(90deg,rgba(90,55,20,.07) 0 3px,transparent 3px 9px)}
a{color:inherit;text-decoration:none}
:focus-visible{outline:3px solid var(--blu);outline-offset:3px}
.wrap{width:100%;max-width:470px;animation:in .8s cubic-bezier(.3,1.2,.5,1) both}
@keyframes in{from{opacity:0;transform:translateY(60px) rotate(2deg)}}
.label{position:relative;background:var(--paper);border-radius:8px;padding:40px 26px 26px;text-align:center;box-shadow:0 3px 0 rgba(90,55,20,.3),0 18px 34px rgba(60,35,10,.3)}
.label::after{content:'';position:absolute;inset:9px;border:2px dashed rgba(46,34,22,.22);border-radius:5px;pointer-events:none}
.tape{position:absolute;top:-15px;left:50%;width:120px;height:34px;margin-left:-60px;transform:rotate(-3deg);background:linear-gradient(90deg,rgba(255,255,255,.3),transparent 35%,rgba(255,255,255,.18)),var(--tape);clip-path:polygon(0 0,100% 0,98% 25%,100% 50%,98% 75%,100% 100%,0 100%,2% 75%,0 50%,2% 25%);z-index:3}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;height:54px;padding:0 18px;border:3px solid var(--ink);border-radius:16px;background:var(--red);color:#fff;font:600 1rem 'Fredoka',sans-serif;line-height:1;cursor:pointer;box-shadow:0 6px 0 var(--ink);transition:transform .15s,box-shadow .15s}
.btn:hover{transform:translateY(-3px);box-shadow:0 9px 0 var(--ink)}
.btn:active{transform:translateY(5px);box-shadow:0 1px 0 var(--ink)}
.btn.alt{background:var(--paper);color:var(--ink)}
.stamp{display:inline-block;border:4px double var(--red);color:var(--red);font:700 1.25rem 'Fredoka',sans-serif;letter-spacing:2px;text-transform:uppercase;padding:3px 14px;border-radius:8px;transform:rotate(-8deg);animation:slam .6s cubic-bezier(.2,.9,.3,1.3) both}
.stamp.g{color:var(--grn);border-color:var(--grn)}
@keyframes slam{from{transform:scale(3) rotate(-30deg);opacity:0}to{transform:rotate(-8deg);opacity:.95}}
@keyframes sp{to{transform:rotate(360deg)}}

.sticker{width:88px;height:88px;margin:0 auto 14px;border-radius:50%;background:var(--paper);border:4px solid var(--ink);box-shadow:4px 4px 0 var(--ink);padding:6px;transform:rotate(-6deg);animation:wob 4s ease-in-out infinite}
@keyframes wob{50%{transform:rotate(5deg) translateY(-4px)}}
.sticker img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}
.chip{display:inline-flex;align-items:center;gap:9px;padding:7px 16px;border:3px solid var(--ink);border-radius:99px;background:var(--k3);font-weight:600;font-size:.92rem;margin-bottom:12px;transform:rotate(-2deg);transition:.3s}
.dot{width:10px;height:10px;border-radius:50%;background:var(--ink);animation:bl 1s steps(1) infinite}
@keyframes bl{50%{opacity:.2}}
.chip.ok{background:#c9efd6}
.chip.bad{background:#ffd5cc}
.chip.bad .dot{animation:none}
h1{font-size:1.9rem;font-weight:700;letter-spacing:-.5px;line-height:1.15}
.sub{font:700 1.55rem 'Caveat',cursive;color:var(--blu);transform:rotate(-2deg);margin:2px 0 26px}

.qrw{position:relative;width:min(100%,270px);margin:0 auto}
.qr{position:relative;aspect-ratio:1;background:#fff;border:4px solid var(--ink);border-radius:14px;padding:12px;box-shadow:6px 6px 0 var(--ink);overflow:hidden;animation:tilt 5s ease-in-out infinite}
@keyframes tilt{0%,100%{transform:rotate(-1.2deg)}50%{transform:rotate(1.2deg) translateY(-5px)}}
.qrw .tape{width:84px;height:28px;margin:0}
.t1{left:-24px;top:8px;transform:rotate(-40deg)}
.t2{left:auto;right:-24px;top:auto;bottom:8px;transform:rotate(-40deg)}
.qr img{width:100%;height:100%;display:block;opacity:0;transition:opacity .5s}
.qr.ready img{opacity:1}
.sk{position:absolute;inset:12px;border-radius:6px;background:repeating-linear-gradient(45deg,#f3e5c8 0 12px,#e9d5ad 12px 24px);background-size:34px 34px;animation:mv 1s linear infinite;display:grid;place-items:center;font-size:3rem}
.sk span{animation:hop 1.4s ease-in-out infinite}
@keyframes mv{to{background-position:34px 0}}
@keyframes hop{50%{transform:translateY(-14px) rotate(-8deg)}}
.qr.ready .sk,.qr.done .sk,.qr.dead .sk,.qr.link .sk{display:none}
.ln{position:absolute;left:0;right:0;top:12px;height:3px;background:var(--red);box-shadow:0 0 12px 3px rgba(217,67,47,.65);animation:sc 2s ease-in-out infinite;display:none}
.qr.ready .ln{display:block}
@keyframes sc{0%,100%{top:12px}50%{top:calc(100% - 15px)}}
.ov{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(255,248,232,.97);padding:14px;font-weight:600}
.qr.done .ov.d,.qr.dead .ov.x,.qr.link .ov.l{display:flex}
.ov.l span.b{font-size:3rem;animation:hop 1s ease-in-out infinite}

.note{margin-top:26px;color:#5b4630;font-size:.92rem}
.acts{display:grid;gap:14px;margin-top:22px}
.foot{margin-top:28px;text-align:center;font-weight:500;font-size:.9rem}
.soc{display:flex;justify-content:center;gap:12px;margin-top:12px}
.soc a{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--paper);border:3px solid var(--ink);box-shadow:0 4px 0 var(--ink);transition:.15s}
.soc a:hover{transform:translateY(-3px) rotate(-5deg)}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
</style>
</head>
<body>

<div class="wrap">
  <main class="label">
    <i class="tape"></i>
    <div class="sticker"><img src="https://raw.githubusercontent.com/kermtech6/logo/refs/heads/main/56C67450-A2D2-468E-B0CB-A76D4D48AE37.png" alt="KERM-MD logo"></div>
    <div class="chip" id="chip"><i class="dot"></i><span id="st">Packing your QR code…</span></div>
    <h1>Scan to link</h1>
    <p class="sub">one scan, one delivery!</p>

    <div class="qrw">
      <i class="tape t1"></i><i class="tape t2"></i>
      <div class="qr" id="qr">
        <div class="sk"><span>📦</span></div>
        <img id="img" alt="WhatsApp QR code">
        <i class="ln"></i>
        <div class="ov d"><span class="stamp g">Delivered</span><span>Session sent to your WhatsApp</span></div>
        <div class="ov x"><span class="stamp">Expired</span><span id="xm">QR expired</span></div>
        <div class="ov l"><span class="b">📦</span><span>Linking your device…</span></div>
      </div>
    </div>

    <p class="note" id="note">WhatsApp → Linked devices → Link a device → Scan. The QR refreshes by itself, keep this page open.</p>

    <div class="acts">
      <button class="btn" id="rl" type="button" hidden><i class="fas fa-rotate-right"></i>Get a new QR code</button>
      <a class="btn alt" href="./pair"><i class="fas fa-link"></i>Use a pair code instead</a>
      <a class="btn alt" href="./"><i class="fas fa-house"></i>Back to home</a>
    </div>
  </main>

  <div class="foot">
    <p>♻️ Powered by Kerm Tech © <span id="yr"></span></p>
    <div class="soc">
      <a href="https://github.com/kermtech6/KERM-MD-V1" target="_blank" rel="noopener" aria-label="GitHub"><i class="fab fa-github"></i></a>
      <a href="https://t.me/lord_kerm" target="_blank" rel="noopener" aria-label="Telegram"><i class="fab fa-telegram"></i></a>
      <a href="https://whatsapp.com/channel/0029VbCgEqc0bIdmRMLots12" target="_blank" rel="noopener" aria-label="WhatsApp channel"><i class="fab fa-whatsapp"></i></a>
    </div>
  </div>
</div>

<script>
var id=${JSON.stringify(id)};
var base=location.pathname;if(base.endsWith('/'))base=base.slice(0,-1);
var qr=document.getElementById('qr'),img=document.getElementById('img'),chip=document.getElementById('chip'),
    st=document.getElementById('st'),note=document.getElementById('note'),rl=document.getElementById('rl'),xm=document.getElementById('xm');
var last='';
document.getElementById('yr').textContent=new Date().getFullYear();
rl.onclick=function(){location.reload()};

function set(text,kind,cls){st.textContent=text;chip.className='chip '+(kind||'');qr.className='qr '+(cls||'')}
function end(msg){rl.hidden=false;xm.textContent=msg}

async function poll(){
  try{
    var r=await fetch(base+'/data?id='+encodeURIComponent(id),{cache:'no-store'});
    var d=await r.json();
    if(d.status==='qr'&&d.qr){
      if(d.qr!==last){img.src=d.qr;last=d.qr}
      set('QR ready, scan it now','ok','ready');
    }else if(d.status==='linking'){
      set('Linking your device…','ok','link');
    }else if(d.status==='connected'){
      set('Delivered','ok','done');note.textContent='Open WhatsApp: your session ID is waiting in your chat with yourself.';return;
    }else if(d.status==='error'){
      set('Delivery failed','bad','dead');end('Connection failed');note.textContent='Something went wrong. Get a new QR code and try again.';return;
    }else if(d.status==='expired'){
      set('QR expired','bad','dead');end('QR expired');note.textContent='This session timed out. Get a new QR code to continue.';return;
    }else{
      set('Packing your QR code…','','');
    }
  }catch(e){}
  setTimeout(poll,1500);
}
poll();
</script>
</body>
</html>`;
}

module.exports = router;
