const { GoogleGenAI } = require("@google/genai");
const dotenv = require('dotenv');
dotenv.config({ path: 'packages/api-gateway/.env' });

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("No GEMINI_API_KEY");
    return;
  }
  
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-flash";
  
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

  console.log("Sending structured request to native Gemini SDK...");
  try {
    const response = await ai.models.generateContent({
      model,
      contents: userMessage,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        temperature: 0.7,
        maxOutputTokens: 1500,
      }
    });

    console.log("Response text length:", response.text.length);
    console.log("--- RAW RESPONSE START ---");
    console.log(response.text.substring(0, 500) + "...\n[TRUNCATED FOR LOGS]");
    console.log("--- RAW RESPONSE END ---");
    
    // Test parsing
    const json = JSON.parse(response.text);
    console.log("Parsed inventory consonants count:", json.phonology.inventory.consonants.length);
    console.log("SUCCESS! Parsed full JSON properly.");
  } catch (err) {
      console.error("Error:", err);
  }
}
test();
