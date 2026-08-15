import express from 'express';
import { ws, pendingCaptcha, setPendingCaptcha } from '../config/state.js';

const router = express.Router();

router.get('/captcha', (req, res) => {
    if (!pendingCaptcha) {
        return res.send('<h2>No captcha pending. Login may already be complete.</h2>');
    }
    res.send(`
        <html><body style="background:#111;color:#fff;font-family:sans-serif;text-align:center;padding:40px">
        <h2>Eufy Login - Captcha Required</h2>
        <p>Enter the text you see in the image below:</p>
        <img src="${pendingCaptcha.captcha}" style="margin:20px auto;display:block;border:2px solid #fff"/>
        <form method="POST" action="/api/captcha" style="margin-top:20px">
            <input type="text" name="code" placeholder="Enter captcha text" style="padding:10px;font-size:18px;width:200px" autofocus/>
            <button type="submit" style="padding:10px 20px;font-size:18px;cursor:pointer">Submit</button>
        </form>
        </body></html>
    `);
});

router.use(express.urlencoded({ extended: true }));

router.post('/captcha', (req, res) => {
    if (!pendingCaptcha) {
        return res.status(400).send({ error: 'No captcha pending' });
    }
    const code = req.body.code;
    if (!code) {
        return res.status(400).send({ error: 'Missing "code" in request body' });
    }
    const message = {
        messageId: 'captcha_' + Date.now(),
        command: 'driver.set_captcha',
        captchaId: pendingCaptcha.captchaId,
        captcha: code
    };
    ws.send(JSON.stringify(message));
    res.send('<html><body style="background:#111;color:#fff;font-family:sans-serif;text-align:center;padding:40px"><h2>Captcha submitted! Waiting for Eufy to verify...</h2><p>Check server logs for result. Refresh /api/captcha to see status.</p></body></html>');
});

export default router;
