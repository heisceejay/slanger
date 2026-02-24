const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: 'packages/api-gateway/.env' });

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("No GEMINI_API_KEY");
    return;
  }
  const url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

  const systemPrompt = `You are an expert linguistic typologist and constructed language designer with deep knowledge of phonological systems across the world's languages.

Your task is to design phonological systems for constructed languages. You must:
1. Draw from typological diversity — avoid defaulting to English-like phonology
2. Ensure internal consistency — all inventory members must be usable in words
3. Respect naturalismScore constraints strictly
4. Produce phoneme inventories that interact correctly with the provided syllable templates
5. Use only standard IPA symbols in inventory arrays
6. Never use IPA diacritics in the main inventory — put those in suprasegmentals flags
7. Map every inventory phoneme to an orthographic grapheme; prefer unique graphemes (duplicates are allowed but produce a warning)

CRITICAL: Respond with ONLY valid JSON. No markdown code fences, no preamble, no explanation outside the JSON object. Your entire response must be parseable by JSON.parse().`;

  const userMessage = `NATURALISTIC MODE (naturalismScore=0.75):
- Model after attested natural language patterns
- Inventory size: 25 consonants, 8 vowels (approximate)
- Standard tone/stress if any

Design a complete phonology system for a constructed language with these parameters:
- Name hint: no specific world
- Tags: none specified

Respond with ONLY this JSON structure (no text outside JSON):
{
  "phonology": {
    "inventory": {
      "consonants": ["<IPA>", ...],
      "vowels": ["<IPA>", ...],
      "tones": []
    },
    ...
  }
}`;

  const body = {
    model: "gemini-2.5-flash",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    max_tokens: 1500,
    temperature: 0.7
  };

  console.log("Sending request to Gemini 2.5 Flash...");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    });

    const text = await res.text();
    console.log("Status:", res.status);
    console.log("--- RAW RESPONSE START ---");
    console.log(text);
    console.log("--- RAW RESPONSE END ---");

    if (res.ok) {
      const json = JSON.parse(text);
      const content = json.choices[0].message.content;
      console.log("--- CONTENT START ---");
      console.log(content);
      console.log("--- CONTENT END ---");
    }
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
