const Groq = require('groq-sdk');

// ─────────────────────────────────────────────
// Groq Classifier — detects person type
// Uses llama-3.3-70b-versatile for instant
// classification before pipeline runs
// Ultra fast — typically < 500ms
// ─────────────────────────────────────────────
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const classifyPersonType = async (name) => {
    try {
        const response = await groq.chat.completions.create({
            model:      "llama-3.3-70b-versatile",
            max_tokens: 10,

            // Low temperature = consistent, deterministic output
            // We want the same answer every time for same name
            temperature: 0.1,

            messages: [{
                role:    "user",
                content: `Classify "${name}" into exactly one category.
                
Rules:
- actor → if primarily known for films/TV
- musician → if primarily known for music/singing  
- influencer → if primarily known for social media content
- athlete → if primarily known for sports

Reply with ONLY one word. No explanation. No punctuation.`
            }]
        });

        const type = response.choices[0].message.content
            .trim()
            .toLowerCase()
            // ─────────────────────────────────────────────
            // Sanitize response — model might return
            // unexpected words despite clear instructions
            // Fall back to "influencer" if unrecognized
            // ─────────────────────────────────────────────
            .replace(/[^a-z]/g, '');

        const validTypes = ['actor', 'musician', 'influencer', 'athlete'];
        return validTypes.includes(type) ? type : 'influencer';

    } catch (error) {
        console.error('Classifier error:', error.message);
        // Default fallback if Groq fails
        return 'influencer';
    }
};

module.exports = { classifyPersonType };