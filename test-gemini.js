const fs = require('fs');

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("No GEMINI_API_KEY");
    return;
  }
  const url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  
  const systemPrompt = `You are an expert linguistic typologist and constructed language designer.
Respond with ONLY valid JSON.`;
  const userMessage = `Design a phonology.
{
  "phonology": {
    "inventory": { "consonants": [], "vowels": [] }
  },
  "rationale": "<2-3 sentences>"
}`;

  const body = {
    model: "gemini-1.5-flash",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    max_tokens: 1500,
    response_format: { type: "json_object" },
    temperature: 0.7
  };

  console.log("Sending request...");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text);
}
test();
