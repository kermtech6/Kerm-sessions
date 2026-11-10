const express = require('express');
const path = require('path');

const { cleanSessionRoot } = require('./mayel');
const { qrRoute, pairRoute } = require('./routes');

const app = express();

global.__path = process.cwd();

const PORT = process.env.PORT || 5000;

require('events').EventEmitter.defaultMaxListeners = 200;

// Derrière le routeur Heroku : nécessaire pour avoir la vraie IP (limite par IP)
app.set('trust proxy', 1);
app.disable('x-powered-by');

// /pair/ -> /pair et /qr/ -> /qr, pour que les liens relatifs (./pair, ./qr, ./) restent corrects
app.use((req, res, next) => {
    if (req.path.length > 1 && req.path.endsWith('/')) {
        const query = req.url.slice(req.path.length);
        const clean = '/' + req.path.replace(/^\/+|\/+$/g, '');
        return res.redirect(301, clean + query);
    }
    next();
});

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/qr', qrRoute);
app.use('/code', pairRoute);

app.get('/pair', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
        status: 200,
        success: true,
        service: 'KERM-MD-V1 Session',
        uptime: Math.round(process.uptime()),
        rssMB: Math.round(mem.rss / 1048576),
        timestamp: new Date().toISOString()
    });
});

// Routes inconnues -> accueil
app.use((req, res) => {
    res.redirect(302, '/');
});

app.use((err, req, res, next) => {
    console.error('Route error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

// Une erreur Baileys asynchrone ne doit pas faire tomber tout le serveur
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

// Sessions temporaires d'un précédent démarrage : on repart propre
cleanSessionRoot();

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\nKERM-MD-V1 Session Server running on port ${PORT}\n`);
});

server.keepAliveTimeout = 65 * 1000;
server.headersTimeout = 66 * 1000;

// Heroku envoie SIGTERM à chaque redémarrage : arrêt propre
function shutdown(signal) {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
