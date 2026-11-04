const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();

// Variable globale conservée car d'autres fichiers (routes) peuvent l'utiliser
global.__path = process.cwd();

const PORT = process.env.PORT || 5000;

const { qrRoute, pairRoute } = require('./routes');

require('events').EventEmitter.defaultMaxListeners = 2000;

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

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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
    res.json({
        status: 200,
        success: true,
        service: 'KERM-MD-V1 Session',
        timestamp: new Date().toISOString()
    });
});

// Routes inconnues -> accueil
app.use((req, res) => {
    res.redirect(302, '/');
});

// Erreurs non gérées dans les routes (Express 5 y envoie aussi les promesses rejetées)
app.use((err, req, res, next) => {
    console.error('Route error:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

// Évite qu'une erreur Baileys asynchrone ne fasse tomber tout le serveur
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

app.listen(PORT, '0.0.0.0', (err) => {
    if (err) {
        console.error('Server failed to start:', err);
        process.exit(1);
    }
    console.log(`
Deployment Successful!

KERM-MD-V1 Session Server running on http://localhost:${PORT}
`);
});

module.exports = app;
