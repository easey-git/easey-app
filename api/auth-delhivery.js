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
        console.log(msg); // Enable logs in production for debugging
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
        await page.goto('https://one.delhivery.com/v2/login', { waitUntil: 'networkidle2', timeout: 30000 });

        // 2. Email
        const email = process.env.DELHIVERY_EMAIL;
        const password = process.env.DELHIVERY_PASSWORD;
        if (!email || !password) throw new Error("Missing Credentials in Env");

        log("Typing Email...");
        await page.waitForSelector('input[name="email"]');
        await page.type('input[name="email"]', email);
        await new Promise(r => setTimeout(r, 500)); // Small pause

        // Attempt to click "Continue" button explicitly - finding by text is safest
        // Attempt to click "Continue" button explicitly - finding by text is safest
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));

            // Priority 1: Exact "Continue"
            let targetBtn = buttons.find(b => (b.innerText || '').trim().toLowerCase() === 'continue');

            // Priority 2: Contains "Continue"
            if (!targetBtn) {
                targetBtn = buttons.find(b => (b.innerText || '').toLowerCase().includes('continue'));
            }

            // Priority 3: Contains "Login" or "Next", BUT NOT "Google"
            if (!targetBtn) {
                targetBtn = buttons.find(b => {
                    const t = (b.innerText || '').toLowerCase();
                    return (t.includes('login') || t.includes('next')) && !t.includes('google');
                });
            }

            if (targetBtn) targetBtn.click();
        });

        // Also press Enter just in case the button click fails or isn't picked up
        await page.keyboard.press('Enter');

        // 3. Wait for Redirect to SSO
        log("Waiting for redirection to SSO (ucp-auth)...");
        try {
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
        } catch (e) {
            log("Navigation wait timed out. Checking URL...");
        }

        const currentUrl = page.url();
        log(`Current URL: ${currentUrl}`);

        if (currentUrl.includes('ucp-auth') || currentUrl.includes('realms')) {
            log("On SSO Page. Entering Password...");

            try {
                // Correct Selector for Keycloak: #password
                await page.waitForSelector('#password', { visible: true, timeout: 10000 });
                await page.type('#password', password);

                // Submit using #kc-login or Enter
                await new Promise(r => setTimeout(r, 500));
                await page.evaluate(() => {
                    const loginBtn = document.getElementById('kc-login');
                    if (loginBtn) loginBtn.click();
                });
                await page.keyboard.press('Enter');

            } catch (e) {
                log("Error on SSO page: " + e.message);
                // Backup attempt
                try {
                    await page.type('input[type="password"]', password);
                    await page.keyboard.press('Enter');
                } catch (err) { }
            }
        } else {
            // Fallback: If we didn't redirect, check current page
            log("Not on SSO URL. Checking for password field here...");
            try {
                // Original page fallback
                await page.waitForSelector('input[name="password"]', { timeout: 5000 });
                await page.type('input[name="password"]', password);
                await page.keyboard.press('Enter');
            } catch (e) {
                log("No password field found on current page.");
            }
        }

        // 4. Wait for Dashboard Load (Final Step)
        log("Waiting for Dashboard Load...");
        try {
            // Increase timeout for final redirect
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        } catch (e) {
            log("Dashboard navigation timeout - checking success state...");
        }



        // --- Result Check ---
        const finalUrl = page.url();
        const title = await page.title();

        if (capturedToken) {
            log("Success.");
            return res.status(200).json({ success: true, token: capturedToken });
        } else {
            // Check if we can capture current page HTML for debugging
            let htmlContent = "";
            try {
                htmlContent = await page.content();
            } catch (e) {
                htmlContent = "Could not capture HTML";
            }
            log("Failed to capture token. Dumping debug info...");
            console.error("Page Title:", title);
            console.error("Final URL:", finalUrl);

            // Failed
            return res.status(500).json({
                success: false,
                error: "Token Not Captured",
                debug: {
                    url: finalUrl,
                    title: title,
                    envEmail: !!email,
                    logs: debugInfo.logs,
                    htmlSnippet: htmlContent.substring(0, 2000) // First 2k chars
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
