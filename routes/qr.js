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
/* Page HTML                                                           */
/* ------------------------------------------------------------------ */
function renderPage(id) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#05060f">
<title>KERM-MD-V1 | QR connect</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
@property --a{syntax:'<angle>';initial-value:0deg;inherits:false}
:root{--bg:#05060f;--c1:#22e4ff;--c2:#8b5cff;--c3:#ff4fd8;--ok:#3dffb0;--tx:#eaf0ff;--mu:#8d9ac0;--bd:rgba(255,255,255,.09)}
*{margin:0;padding:0;box-sizing:border-box}
[hidden]{display:none!important}
body{font-family:'Outfit',sans-serif;background:var(--bg);color:var(--tx);min-height:100vh;overflow-x:hidden;line-height:1.6;display:flex;align-items:center;justify-content:center;padding:20px}
a{color:inherit;text-decoration:none}
:focus-visible{outline:2px solid var(--c1);outline-offset:3px}
#fx{position:fixed;inset:0;z-index:-3}
.aura{position:fixed;inset:0;z-index:-2;background:radial-gradient(circle at 10% 0,rgba(139,92,255,.28),transparent 35%),radial-gradient(circle at 95% 100%,rgba(34,228,255,.18),transparent 38%)}
.floor{position:fixed;left:-50%;right:-50%;bottom:0;height:42vh;z-index:-1;pointer-events:none;background:repeating-linear-gradient(90deg,rgba(34,228,255,.22) 0 1px,transparent 1px 60px),repeating-linear-gradient(0deg,rgba(139,92,255,.22) 0 1px,transparent 1px 60px);background-position:0 0,0 0;transform:perspective(420px) rotateX(64deg);transform-origin:bottom;animation:flow 2.5s linear infinite;-webkit-mask-image:linear-gradient(transparent,#000 75%);mask-image:linear-gradient(transparent,#000 75%)}
@keyframes flow{to{background-position:0 0,0 60px}}
.wrap{width:100%;max-width:470px;animation:up .8s cubic-bezier(.2,.7,.2,1)}
@keyframes up{from{opacity:0;transform:translateY(30px)}}
.neon{position:relative;border-radius:28px;background:rgba(10,13,30,.74);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);padding:30px 24px;text-align:center}
.neon::before{content:'';position:absolute;inset:0;border-radius:inherit;padding:1.5px;background:conic-gradient(from var(--a),var(--c1),var(--c2),var(--c3),var(--c1));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:rot 6s linear infinite;pointer-events:none;opacity:.75}
@keyframes rot{to{--a:360deg}}
.ring{position:relative;width:92px;height:92px;margin:0 auto 20px}
.ring::before{content:'';position:absolute;inset:-5px;border-radius:50%;background:conic-gradient(var(--c1),var(--c2),var(--c3),var(--c1));animation:sp 4s linear infinite;filter:drop-shadow(0 0 14px rgba(139,92,255,.6))}
.ring::after{content:'';position:absolute;inset:3px;border-radius:50%;background:#0a0d1e}
@keyframes sp{to{transform:rotate(360deg)}}
.ring img{position:relative;z-index:2;width:100%;height:100%;border-radius:50%;object-fit:cover;padding:7px}
.chip{display:inline-flex;align-items:center;gap:10px;padding:8px 16px;border-radius:99px;background:rgba(255,255,255,.05);border:1px solid var(--bd);font-size:.88rem;font-weight:500;margin-bottom:16px;transition:.4s}
.dot{width:9px;height:9px;border-radius:50%;background:var(--c1);box-shadow:0 0 12px var(--c1);animation:pl 1.4s infinite}
.chip.ok .dot{background:var(--ok);box-shadow:0 0 12px var(--ok)}
.chip.bad .dot{background:var(--c3);box-shadow:0 0 12px var(--c3);animation:none}
@keyframes pl{50%{transform:scale(1.5);opacity:.6}}
h1{font-size:1.9rem;font-weight:800;letter-spacing:-.5px;margin-bottom:6px;background:linear-gradient(110deg,var(--c1),#fff 50%,var(--c2));background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:gm 5s linear infinite}
@keyframes gm{to{background-position:250% 0}}
.sub{color:var(--mu);font-weight:300;margin-bottom:26px}

.qrw{position:relative;width:min(100%,270px);margin:0 auto}
.qrw::before{content:'';position:absolute;inset:6%;border-radius:30px;background:linear-gradient(135deg,var(--c1),var(--c2));filter:blur(42px);opacity:.3;animation:gp 2.6s ease-in-out infinite}
@keyframes gp{50%{opacity:.5;transform:scale(1.08)}}
.qr{position:relative;aspect-ratio:1;border-radius:26px;background:#fff;padding:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.45);animation:fq 4.5s ease-in-out infinite}
@keyframes fq{50%{transform:translateY(-8px)}}
.qr img{width:100%;height:100%;display:block;border-radius:14px;opacity:0;transition:opacity .5s}
.qr.ready img{opacity:1}
.sk{position:absolute;inset:14px;border-radius:14px;background:linear-gradient(110deg,#eef1fa 30%,#fff 50%,#eef1fa 70%);background-size:220% 100%;animation:sh 1.4s linear infinite}
@keyframes sh{to{background-position:-220% 0}}
.qr.ready .sk,.qr.done .sk,.qr.dead .sk{display:none}
.ln{position:absolute;left:14px;right:14px;top:14px;height:3px;border-radius:9px;background:linear-gradient(90deg,transparent,var(--c1),transparent);box-shadow:0 0 16px var(--c1);animation:sc 2.4s ease-in-out infinite;display:none}
.qr.ready .ln{display:block}
@keyframes sc{0%,100%{top:14px}50%{top:calc(100% - 17px)}}
.ov{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(5,6,15,.9);color:#fff;font-weight:600;padding:14px}
.ov i{font-size:3rem}
.qr.done .ov.d,.qr.dead .ov.x,.qr.link .ov.l{display:flex;animation:up .5s}
.ov.d i{color:var(--ok);filter:drop-shadow(0 0 16px var(--ok))}
.ov.x i{color:var(--c3);filter:drop-shadow(0 0 16px var(--c3))}
.ov.l i{color:var(--c1);animation:sp 1.2s linear infinite}
.note{margin-top:24px;color:var(--mu);font-size:.92rem;font-weight:300}
.acts{display:grid;gap:12px;margin-top:22px}
.abtn{display:flex;align-items:center;justify-content:center;gap:10px;height:54px;border:0;border-radius:16px;cursor:pointer;font:600 .98rem 'Outfit',sans-serif;transition:.3s}
.abtn:hover{transform:translateY(-3px)}
.main{background:linear-gradient(135deg,var(--c2),var(--c1));color:#fff;box-shadow:0 12px 34px rgba(139,92,255,.38)}
.glass{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff}
.glass:hover{background:rgba(255,255,255,.1)}
.foot{margin-top:22px;text-align:center;color:var(--mu);font-size:.88rem}
.soc{display:flex;justify-content:center;gap:12px;margin-top:12px}
.soc a{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:rgba(255,255,255,.04);border:1px solid var(--bd);transition:.3s}
.soc a:hover{transform:translateY(-4px);color:var(--c1);background:rgba(34,228,255,.08)}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<canvas id="fx"></canvas>
<div class="aura"></div>
<div class="floor"></div>

<div class="wrap">
  <main class="neon">
    <div class="ring"><img src="https://raw.githubusercontent.com/kermtech6/logo/refs/heads/main/56C67450-A2D2-468E-B0CB-A76D4D48AE37.png" alt="KERM-MD logo"></div>
    <div class="chip" id="chip"><i class="dot"></i><span id="st">Generating your QR code…</span></div>
    <h1>KERM-MD QR</h1>
    <p class="sub">Scan with WhatsApp to link your session.</p>

    <div class="qrw">
      <div class="qr" id="qr">
        <div class="sk"></div>
        <img id="img" alt="WhatsApp QR code">
        <i class="ln"></i>
        <div class="ov d"><i class="fas fa-circle-check"></i><span>Session sent to your WhatsApp</span></div>
        <div class="ov x"><i class="fas fa-triangle-exclamation"></i><span id="xm">QR expired</span></div>
        <div class="ov l"><i class="fas fa-circle-notch"></i><span>Linking your device…</span></div>
      </div>
    </div>

    <p class="note" id="note">WhatsApp → Linked devices → Link a device → Scan. The QR refreshes by itself, keep this page open.</p>

    <div class="acts">
      <button class="abtn main" id="rl" type="button" hidden><i class="fas fa-rotate-right"></i>Get a new QR code</button>
      <a class="abtn glass" href="./pair"><i class="fas fa-link"></i>Use a pair code instead</a>
      <a class="abtn glass" href="./"><i class="fas fa-house"></i>Back to home</a>
    </div>
  </main>

  <div class="foot">
    <p>Powered by Kerm Tech © <span id="yr"></span></p>
    <div class="soc">
      <a href="https://github.com/kermtech6/KERM-MD-V1" target="_blank" rel="noopener" aria-label="GitHub"><i class="fab fa-github"></i></a>
      <a href="https://t.me/lord_kerm" target="_blank" rel="noopener" aria-label="Telegram"><i class="fab fa-telegram"></i></a>
      <a href="https://whatsapp.com/channel/0029VbCgEqc0bIdmRMLots12" target="_blank" rel="noopener" aria-label="WhatsApp channel"><i class="fab fa-whatsapp"></i></a>
    </div>
  </div>
</div>

<script>
(function(){
  var c=document.getElementById('fx'),x=c.getContext('2d'),w,h,p=[];
  function R(){w=c.width=innerWidth;h=c.height=innerHeight;p=[];var n=Math.min(70,(w*h/16000)|0);for(var i=0;i<n;i++)p.push({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.45,vy:(Math.random()-.5)*.45})}
  R();addEventListener('resize',R);
  (function L(){x.clearRect(0,0,w,h);
    for(var i=0;i<p.length;i++){var a=p[i];a.x=(a.x+a.vx+w)%w;a.y=(a.y+a.vy+h)%h;x.fillStyle='rgba(34,228,255,.85)';x.fillRect(a.x,a.y,2,2);
      for(var j=i+1;j<p.length;j++){var b=p[j],d=Math.hypot(a.x-b.x,a.y-b.y);if(d<130){x.strokeStyle='rgba(139,92,255,'+(1-d/130)*.35+')';x.beginPath();x.moveTo(a.x,a.y);x.lineTo(b.x,b.y);x.stroke()}}}
    requestAnimationFrame(L)})();
})();

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
      set('Connected','ok','done');note.textContent='Open WhatsApp: your session ID is waiting in your chat with yourself.';return;
    }else if(d.status==='error'){
      set('Connection failed','bad','dead');end('Connection failed');note.textContent='Something went wrong. Get a new QR code and try again.';return;
    }else if(d.status==='expired'){
      set('QR expired','bad','dead');end('QR expired');note.textContent='This session timed out. Get a new QR code to continue.';return;
    }else{
      set('Generating your QR code…','','');
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
