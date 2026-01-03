try {
    const pkg = require("@google/genai");
    console.log("Keys:", Object.keys(pkg));
    if (pkg.GoogleGenerativeAI) console.log("GoogleGenerativeAI found");
    else console.log("GoogleGenerativeAI NOT found");
} catch (e) {
    console.error(e.message);
}
