import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * POST /webhook/telegram
 * Handle incoming Telegram updates
 */
export const handleWebhook = asyncHandler(async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(200).send('OK');
    }

    const chatId = message.chat.id;
    const text = message.text;

    console.log(`[Telegram] Received message from ${chatId}: ${text}`);

    // Handle /start command
    if (text === '/start') {
        await sendTelegramMessage(chatId, {
            text: "Welcome to DeVPN! 🛡️\n\nSecure, decentralized, and fast VPN powered by TON.\n\nClick below to start browsing securely.",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "🚀 Open DeVPN",
                            web_app: {
                                url: process.env.FRONTEND_URL || "https://mini-app-e694.vercel.app"
                            }
                        }
                    ],
                    [
                        {
                            text: "🌐 Visit Website",
                            url: "https://devpn.net" // Placeholder
                        }
                    ]
                ]
            }
        });
    }

    res.status(200).send('OK');
});

/**
 * Helper to send messages to Telegram API
 */
async function sendTelegramMessage(chatId, content) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.error('[Telegram] Missing TELEGRAM_BOT_TOKEN');
        return;
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: chatId,
                ...content
            })
        });

        const data = await response.json();
        if (!data.ok) {
            console.error('[Telegram] Failed to send message:', data.description);
        }
    } catch (error) {
        console.error('[Telegram] Error sending message:', error);
    }
}
