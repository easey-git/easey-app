const axios = require('axios');

// CONFIGURATION: Update these to match your setup
const API_URL = 'https://easey-app.vercel.app/api/shipping-webhook'; // Update if your API is elsewhere
const TEST_ORDER_NUMBER = '#3441'; // Ensure this order exists in your Firestore with YOUR phone number

const testAutomation = async (status, label) => {
    console.log(`\n--- Testing ${label} Automation ---`);
    try {
        const response = await axios.post(API_URL, {
            order_number: TEST_ORDER_NUMBER,
            status: status,
            awb_number: '40441734347186', // Using a real AWB format to test the button link
            courier_name: 'Delhivery',
            ndr_reason: status === 'ndr' ? 'Customer not available' : undefined,
            is_test: true // Bypass duplicate check for testing
        });
        console.log(`✅ Success: ${JSON.stringify(response.data)}`);
    } catch (error) {
        console.error(`❌ Failed: ${error.response?.data?.error || error.message}`);
        if (error.response?.data?.details) {
            console.error(`   Details: ${error.response.data.details}`);
        }
    }
};

const runAllTests = async () => {
    console.log("🚀 Starting Automation Suitability Tests...");

    // 1. Test In-Transit
    await testAutomation('in transit', 'IN-TRANSIT');

    // Wait 2 seconds between tests to avoid rate limits
    await new Promise(r => setTimeout(r, 2000));

    // 2. Test Out For Delivery
    await testAutomation('out for delivery', 'OFD');

    await new Promise(r => setTimeout(r, 2000));

    // 3. Test NDR (Delivery Failure)
    await testAutomation('ndr', 'NDR');

    console.log("\n✨ Testing Complete! Check your WhatsApp and the Logistics Hub Live Logs.");
};

runAllTests();
