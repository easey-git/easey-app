import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export const config = {
    maxDuration: 60,
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    let browser = null;
    let debugInfo = { logs: [] };

    const log = (msg) => {
        console.log(msg);
        debugInfo.logs.push({ time: new Date().toISOString(), msg });
    };

    try {
        log("Launching Browser...");

        browser = await puppeteer.launch({
            args: [...chromium.args, '--hide-scrollbars', '--disable-web-security'],
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();

        // --- Intercept Token ---
        let capturedToken = null;

        await page.setRequestInterception(true);
        page.on('request', request => request.continue());

        page.on('response', async response => {
            const url = response.url();
            // Broader capture: Any API call to 'api'
            if (url.includes('/api/') && !url.includes('.js') && !url.includes('.css')) {
                const headers = response.request().headers();
                const auth = headers['authorization'] || headers['Authorization'];
                if (auth && auth.startsWith('Bearer')) {
                    if (url.includes('delhivery.com')) {
                        capturedToken = auth;
                        // log(`Token Captured from: ${url}`);
                    }
                }


            }
        });

        // --- Navigation Steps ---

        // 1. Login Page
        log("Goto Login...");
        await page.goto('https://one.delhivery.com/v2/login', { waitUntil: 'networkidle2', timeout: 20000 });

        // 2. Email
        const email = process.env.DELHIVERY_EMAIL;
        const password = process.env.DELHIVERY_PASSWORD;
        if (!email || !password) throw new Error("Missing Credentials in Env");

        log("Typing Email...");
        await page.waitForSelector('input[type="email"]');
        await page.type('input[type="email"]', email);
        await page.keyboard.press('Enter');

        // 3. Password
        log("Waiting for Password Field...");
        await page.waitForSelector('input[type="password"]', { timeout: 15000 });
        log("Typing Password...");
        await page.type('input[type="password"]', password);
        await page.keyboard.press('Enter');

        // 4. Wait for Dashboard
        log("Waiting for Dashboard Load...");
        try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
        } catch (e) {
            log("Navigation timeout - checking state...");
        }



        // --- Result Check ---
        const finalUrl = page.url();
        const title = await page.title();

        if (capturedToken) {
            log("Success.");
            return res.status(200).json({ success: true, token: capturedToken });
        } else {
            // Failed
            return res.status(500).json({
                success: false,
                error: "Token Not Captured",
                debug: {
                    url: finalUrl,
                    title: title,
                    envEmail: !!email,
                    logs: debugInfo.logs
                }
            });
        }

    } catch (error) {
        return res.status(500).json({
            error: error.message,
            stack: error.stack,
            debug: debugInfo
        });
    } finally {
        if (browser) await browser.close();
    }
}
