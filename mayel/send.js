const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const { sendButtons } = require('gifted-btns');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Envoie le SESSION_ID dans la discussion « Moi-même » du compte lié.
 *
 * 1. Message TEXTE simple : affiché par tous les WhatsApp (Messenger et Business).
 * 2. Message à boutons (Copy / liens) : facultatif. Les boutons interactifs ne
 *    s'affichent que sur WhatsApp Business ; un échec ici n'empêche jamais la livraison.
 *
 * Renvoie true si le texte a bien été envoyé.
 */
async function deliverSession(sock, sessionId, isAlive, repoUrl) {
    const jid = jidNormalizedUser(sock.user.id);

    let sent = false;
    for (let attempt = 1; attempt <= 4 && !sent; attempt++) {
        if (!isAlive()) return false;
        try {
            await sock.sendMessage(jid, { text: sessionId });
            sent = true;
        } catch (e) {
            console.error('Send error (attempt ' + attempt + '):', e && e.message);
            await delay(3000);
        }
    }
    if (!sent) return false;
    console.log('✅ Session envoyée sur WhatsApp (texte)');

    try {
        await delay(1500);
        if (isAlive()) {
            await sendButtons(sock, jid, {
                title: '',
                text: 'Copie le message ci-dessus ou appuie sur le bouton.',
                footer: '> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ Kerm Tech*',
                buttons: [
                    {
                        name: 'cta_copy',
                        buttonParamsJson: JSON.stringify({ display_text: 'Copy Session', copy_code: sessionId })
                    },
                    {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({ display_text: 'Visit Bot Repo', url: repoUrl })
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
    } catch (e) {
        console.error('Buttons message skipped:', e && e.message);
    }

    return true;
}

module.exports = { deliverSession };
