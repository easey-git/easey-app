const axios = require('axios');

// CONFIGURATION
const ACCESS_TOKEN = 'YOUR_ACCESS_TOKEN'; // We will use your env token if running on server
const WABA_ID = 'YOUR_WABA_ID'; // WhatsApp Business Account ID

const inspectTemplates = async () => {
    console.log("🔍 Inspecting WhatsApp Templates...");
    try {
        // We fetch the templates from the Meta Graph API
        const response = await axios.get(`https://graph.facebook.com/v19.0/me/message_templates`, {
            params: {
                limit: 100,
                access_token: process.env.WHATSAPP_ACCESS_TOKEN // Uses the token from your environment
            }
        });

        const templates = response.data.data;
        const targetNames = ['alert_shipping_transit', 'alert_shipping_ofd', 'alert_shipping_ndr'];
        
        templates.forEach(t => {
            if (targetNames.includes(t.name)) {
                console.log(`\n--- Template: ${t.name} [${t.status}] ---`);
                t.components.forEach(c => {
                    console.log(`Type: ${c.type}`);
                    if (c.text) console.log(`Text: ${c.text}`);
                    
                    // Count variables {{1}}, {{2}}, etc.
                    const matches = (c.text || '').match(/\{\{\d+\}\}/g);
                    console.log(`Variables detected: ${matches ? matches.length : 0}`);
                    
                    if (c.buttons) {
                        c.buttons.forEach((b, i) => {
                            console.log(`Button ${i}: ${b.type} - ${b.text}`);
                            if (b.url) {
                                const btnVar = b.url.match(/\{\{\d+\}\}/g);
                                console.log(`   Button Variables: ${btnVar ? btnVar.length : 0}`);
                            }
                        });
                    }
                });
            }
        });

    } catch (error) {
        console.error("❌ Error fetching templates:", error.response?.data?.error || error.message);
    }
};

inspectTemplates();
