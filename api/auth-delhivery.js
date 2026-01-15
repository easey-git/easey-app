import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export const config = {
    maxDuration: 60, // Extend function duration to 60s
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Require specific internal secret to prevent abuse?
    // For now, allow it to be called by the frontend (which is proxied)

    let browser = null;
    try {
        console.log("Launching Headless Browser for Auth Refresh...");

        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();

        // Setup Token Capture
        let capturedToken = null;
        await page.setRequestInterception(true);
        page.on('request', request => request.continue());

        page.on('response', async response => {
            const url = response.url();
            if ((url.includes('shipments_search') || url.includes('list') || url.includes('token')) && !url.includes('.js')) {
                const headers = response.request().headers();
                const auth = headers['authorization'] || headers['Authorization'];
                if (auth && auth.startsWith('Bearer')) {
                    console.log("Captured Token from:", url);
                    capturedToken = auth;
                }
            }
        });

        console.log("Navigating to Delhivery Login...");
        await page.goto('https://one.delhivery.com/v2/login', { waitUntil: 'networkidle0' });

        // 1. Enter Email from ENV
        const email = process.env.DELHIVERY_EMAIL;
        const password = process.env.DELHIVERY_PASSWORD;

        if (!email || !password) {
            throw new Error("Missing DELHIVERY_EMAIL or DELHIVERY_PASSWORD env vars");
        }

        console.log("Entering Email...");
        const emailSelector = 'input[type="email"]';
        await page.waitForSelector(emailSelector);
        await page.type(emailSelector, email);
        await page.keyboard.press('Enter');

        // 2. Wait for Password Page
        console.log("Waiting for Password Page...");
        const passwordSelector = 'input[type="password"]';
        try {
            await page.waitForSelector(passwordSelector, { timeout: 15000 });
        } catch (e) {
            console.log("Password field not found immediately...");
        }

        // 3. Enter Password from ENV
        console.log("Entering Password...");
        await page.type(passwordSelector, password);
        await page.keyboard.press('Enter');

        // 4. Wait for Dashboard Load
        console.log("Waiting for Dashboard...");
        try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        } catch (e) {
            console.log("Navigation timeout, checking if token was captured anyway...");
        }

        if (capturedToken) {
            console.log("Success! Token captured.");
            return res.status(200).json({
                success: true,
                token: capturedToken
            });
        } else {
            return res.status(500).json({
                success: false,
                error: "Token not captured. Login might have failed."
            });
        }

    } catch (error) {
        console.error("Puppeteer Script Error:", error);
        return res.status(500).json({ error: error.message });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
