const Groq = require('groq-sdk');
const axios = require('axios');

// ─────────────────────────────────────────────
// Groq Classifier — detects person type
// Primary: Groq (llama-3.3-70b-versatile) — ultra fast ~500ms
// Fallback: NVIDIA NIM (llama-3.3-70b-instruct) — slower but reliable
// ─────────────────────────────────────────────
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const NVIDIA_API_KEY  = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

const VALID_TYPES = ['actor', 'musician', 'influencer', 'athlete'];

// ─────────────────────────────────────────────
// Shared classification prompt — used by both
// Groq and NVIDIA NIM so behavior is identical
// ─────────────────────────────────────────────
const SYSTEM_MSG = `You are a celebrity profession classifier. You classify people by their PRIMARY PROFESSION — the field they originally became famous in. Having a large social media following does NOT make someone an influencer. Most actors, musicians, and athletes have millions of followers — that's normal. Only classify as "influencer" if social media content creation is their PRIMARY career.`;

const buildClassifyMessages = (name) => [
    { role: "system", content: SYSTEM_MSG },

    // Few-shot examples — prevent misclassification of
    // celebrities with huge social followings
    { role: "user",      content: `Classify "Virat Kohli" into one category: actor, musician, influencer, or athlete.` },
    { role: "assistant", content: "athlete" },
    { role: "user",      content: `Classify "Alia Bhatt" into one category: actor, musician, influencer, or athlete.` },
    { role: "assistant", content: "actor" },
    { role: "user",      content: `Classify "MrBeast" into one category: actor, musician, influencer, or athlete.` },
    { role: "assistant", content: "influencer" },
    { role: "user",      content: `Classify "Arijit Singh" into one category: actor, musician, influencer, or athlete.` },
    { role: "assistant", content: "musician" },

    // Actual request
    {
        role: "user",
        content: `Classify "${name}" into exactly one category: actor, musician, influencer, or athlete.

Rules:
- actor → primarily known for acting in films, TV shows, or web series
- musician → primarily known for singing, composing, or music production
- influencer → primarily known for social media content creation (YouTube, Instagram, TikTok)
- athlete → primarily known for playing a sport professionally

IMPORTANT: Having millions of social media followers does NOT make someone an influencer. Actors, musicians, and athletes all have large followings — classify by their ORIGINAL profession.

Reply with ONLY one word. No explanation.`
    }
];

// ─────────────────────────────────────────────
// Helper: extract + sanitize type from LLM response
// ─────────────────────────────────────────────
const parseType = (rawText) => {
    if (!rawText) return null;
    const cleaned = rawText.trim().toLowerCase().replace(/[^a-z]/g, '');
    return VALID_TYPES.includes(cleaned) ? cleaned : null;
};


// ─────────────────────────────────────────────
// PRIMARY: Groq — fast (~500ms)
// ─────────────────────────────────────────────
const classifyViaGroq = async (name) => {
    const response = await groq.chat.completions.create({
        model:       "llama-3.3-70b-versatile",
        max_tokens:  10,
        temperature: 0,
        messages:    buildClassifyMessages(name)
    });
    return parseType(response.choices[0]?.message?.content);
};


// ─────────────────────────────────────────────
// FALLBACK: NVIDIA NIM — slower (~2s) but reliable
// Uses the same API already configured for AI insights
// ─────────────────────────────────────────────
const classifyViaNvidia = async (name) => {
    const response = await axios.post(
        `${NVIDIA_BASE_URL}/chat/completions`,
        {
            model:       "meta/llama-3.3-70b-instruct",
            max_tokens:  10,
            temperature: 0,
            messages:    buildClassifyMessages(name)
        },
        {
            headers: {
                "Authorization": `Bearer ${NVIDIA_API_KEY}`,
                "Content-Type":  "application/json"
            }
        }
    );
    return parseType(response.data?.choices?.[0]?.message?.content);
};


// ─────────────────────────────────────────────
// MASTER FUNCTION
// Tries Groq first → falls back to NVIDIA NIM
// Only defaults to "influencer" if BOTH fail
// ─────────────────────────────────────────────
const classifyPersonType = async (name) => {

    // ── Attempt 1: Groq (fast) ──
    try {
        const type = await classifyViaGroq(name);
        if (type) {
            console.log(`Classifier [Groq]: "${name}" → ${type}`);
            return type;
        }
    } catch (error) {
        console.warn(`Classifier [Groq] failed for "${name}": ${error.message}`);
    }

    // ── Attempt 2: NVIDIA NIM (reliable backup) ──
    try {
        console.log(`Classifier: Falling back to NVIDIA NIM for "${name}"...`);
        const type = await classifyViaNvidia(name);
        if (type) {
            console.log(`Classifier [NVIDIA]: "${name}" → ${type}`);
            return type;
        }
    } catch (error) {
        console.error(`Classifier [NVIDIA] also failed for "${name}": ${error.message}`);
    }

    // ── Both failed — absolute last resort ──
    console.error(`Classifier: ALL PROVIDERS FAILED for "${name}" — defaulting to "influencer"`);
    return 'influencer';
};

module.exports = { classifyPersonType };