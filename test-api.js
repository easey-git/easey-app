const fetch = require('node-fetch');

async function test() {
    const response = await fetch('https://easey-app.vercel.app/api/payu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'get_settlement_details',
            params: { date: '2026-02-23' }
        })
    });
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
}

test();
