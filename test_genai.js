const { GoogleGenAI } = require("@google/genai");

try {
    console.log("Trying new GoogleGenAI(apiKey string)...");
    const c1 = new GoogleGenAI("test_key");
    console.log("Success string ctor");
} catch (e) {
    console.log("Fail string ctor:", e.message);
}

try {
    console.log("Trying new GoogleGenAI({ apiKey: ... })...");
    const c2 = new GoogleGenAI({ apiKey: "test_key" });
    console.log("Success object ctor");
} catch (e) {
    console.log("Fail object ctor:", e.message);
}
