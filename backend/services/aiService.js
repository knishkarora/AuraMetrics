const axios = require("axios");

// ─────────────────────────────────────────────
// AI Service — AuraMetric Intelligence Layer
// Stack: NVIDIA NIM (llama-3.3-70b) + Tavily
// Flow: Tavily fetches context → NIM generates insights
// ─────────────────────────────────────────────

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const TAVILY_BASE_URL = "https://api.tavily.com";

// ─────────────────────────────────────────────
// STEP 1: Tavily Web Search
// Fetches recent news, box office data, brand
// deals and any public context about the person
// This is what makes AuraMetric better than ChatGPT
// — we feed LIVE context, not training data
// ─────────────────────────────────────────────
const fetchWebContext = async (name, type) => {
    try {
        // Build targeted search queries based on profile type
        const queries = type === "actor"
            ? [
                `${name} box office collection 2024 2025`,
                `${name} brand deals endorsements`,
                `${name} latest news 2025`
              ]
            : [
                `${name} latest brand collaboration 2025`,
                `${name} social media controversy or achievement`,
                `${name} audience demographics reach`
              ];

        // Run all queries in parallel for speed
        const searchResults = await Promise.all(
            queries.map(async (query) => {
                const response = await axios.post(
                    `${TAVILY_BASE_URL}/search`,
                    {
                        api_key:        TAVILY_API_KEY,
                        query:          query,
                        search_depth:   "basic",
                        max_results:    3,
                        // Only get relevant fields — saves tokens
                        include_answer: true
                    }
                );

                return response.data?.answer || "";
            })
        );

        // Combine all search results into one context block
        return searchResults.filter(Boolean).join("\n\n");

    } catch (error) {
        console.error("Tavily search error:", error.message);
        // Return empty string — AI can still work without web context
        return "";
    }
};

// ─────────────────────────────────────────────
// STEP 2: Build AI Prompt
// This is the most important function —
// the quality of the prompt determines the
// quality of the insight. We feed:
// 1. Structured data from your APIs
// 2. Live web context from Tavily
// 3. Clear instructions on what to output
// ─────────────────────────────────────────────
const buildPrompt = (profileData, auraData, webContext) => {
    const {
        name,
        type,
        instagram,
        youtube,
        tmdb,
        lastfm
    } = profileData;

    const {
        aura_score,
        confidence,
        aura_breakdown,
        signals
    } = auraData;

    // Build platform data section dynamically
    // Only include platforms that have data
    let platformSection = "";

    if (instagram) {
        platformSection += `
INSTAGRAM:
- Followers: ${instagram.followers?.toLocaleString()}
- Post Engagement Rate: ${instagram.post_engagement_rate}%
- Reels Avg Views: ${instagram.reels_avg_views?.toLocaleString()}
- Reels Trend: ${instagram.reels_trend} (${instagram.reels_trend > 1 ? "📈 Growing" : "📉 Declining"})
- Combined Engagement Rate: ${instagram.combined_engagement_rate}%
- Follower/Following Ratio: ${instagram.follower_following_ratio}
`;
    }

    if (youtube) {
        platformSection += `
YOUTUBE:
- Subscribers: ${youtube.subscribers?.toLocaleString()}
- Avg Views: ${youtube.avg_views?.toLocaleString()}
- View to Sub Ratio: ${youtube.view_to_sub_ratio}%
- Engagement Rate: ${youtube.engagement_rate}%
- Views Trend: ${youtube.views_trend} (${youtube.views_trend > 1 ? "📈 Growing" : "📉 Declining"})
- Upload Frequency: ${youtube.upload_frequency} videos/month
`;
    }

    if (tmdb) {
        platformSection += `
BOX OFFICE & FILMS:
- Recent Movies: ${tmdb.recent_movies?.map(m => m.title).join(", ")}
- Avg Box Office Revenue: $${tmdb.avg_box_office_revenue?.toLocaleString()}
- Avg Audience Rating: ${tmdb.avg_audience_rating}/10
- Box Office Trend: ${tmdb.box_office_trend} (${tmdb.box_office_trend > 1 ? "📈 Rising" : "📉 Declining"})
- Commercial Reliability: ${tmdb.commercial_reliability}%
`;
    }

    if (lastfm) {
        platformSection += `
LAST.FM (MUSIC):
(Note: Last.fm listeners reflect the platform's ecosystem only, and is much smaller than global reach platforms like Spotify. Interpret these numbers as a sample of dedicated niche listeners.)
- Monthly Listeners: ${lastfm.listeners?.toLocaleString()}
- Total Play Count: ${lastfm.play_count?.toLocaleString()}
- Top Track: ${lastfm.top_track_name || 'N/A'} (Plays: ${lastfm.top_track_plays?.toLocaleString() || 0})
- Play Momentum: ${lastfm.music_signals?.play_momentum || 0}/10
- Genres/Tags: ${lastfm.tags?.join(", ") || 'N/A'}
`;
    }

    // ─────────────────────────────────────────────
    // Final prompt — structured for maximum quality
    // Clear sections prevent hallucination
    // Specific instructions prevent generic output
    // ─────────────────────────────────────────────
    return `
You are AuraMetric's AI analyst — an expert in influencer intelligence and brand partnership strategy.

You have been given REAL-TIME data fetched live from APIs. This is NOT your training data.
Base your analysis ONLY on the numbers provided below. Be specific, use actual figures.

═══════════════════════════════════════
PROFILE: ${name} (${type})
═══════════════════════════════════════

${platformSection}

AURA SCORE: ${aura_score}/100
CONFIDENCE: ${confidence}%

AURA BREAKDOWN:
- Quality:      ${aura_breakdown?.quality}/100
- Business:     ${aura_breakdown?.business}/100
- Recognition:  ${aura_breakdown?.recognition}/100
- Momentum:     ${aura_breakdown?.momentum}/100
- Stability:    ${aura_breakdown?.stability}/100

KEY SIGNALS:
${JSON.stringify(signals, null, 2)}

RECENT WEB CONTEXT (live data):
${webContext || "No recent web data available."}

═══════════════════════════════════════
YOUR TASK — Respond in this EXACT JSON format:
═══════════════════════════════════════

{
  "summary": "2-3 sentence overview of who this person is in terms of reach and influence right now. Use actual numbers.",

  "strengths": ["strength 1 with specific data", "strength 2", "strength 3"],

  "concerns": ["concern 1 with specific data", "concern 2"],

  "brand_recommendation": "3-4 sentences. Is this person worth a brand deal? What type of brands fit? What's the risk level? Be direct and specific.",

  "alternatives": [
    {
      "name": "Alternative person name",
      "reason": "Why they might be a better fit"
    },
    {
      "name": "Alternative person name", 
      "reason": "Why they might be a better fit"
    }
  ],

  "confidence_explanation": "1-2 sentences explaining why the confidence score is ${confidence}%. What data supports or weakens it?"
}

Return ONLY valid JSON. No extra text, no markdown, no explanation outside the JSON.
`;
};

// ─────────────────────────────────────────────
// STEP 3: Call NVIDIA NIM
// Sends prompt to llama-3.3-70b-instruct
// Returns parsed JSON insight object
// ─────────────────────────────────────────────
const callNvidiaLLM = async (prompt) => {
    try {
        const response = await axios.post(
            `${NVIDIA_BASE_URL}/chat/completions`,
            {
                model:       "meta/llama-3.3-70b-instruct",
                max_tokens:  1024,
                temperature: 0.4,   // low temp = more consistent, factual output
                messages: [
                    {
                        role:    "user",
                        content: prompt
                    }
                ]
            },
            {
                headers: {
                    "Authorization": `Bearer ${NVIDIA_API_KEY}`,
                    "Content-Type":  "application/json"
                }
            }
        );

        const rawText = response.data?.choices?.[0]?.message?.content;
        if (!rawText) return null;

        // ─────────────────────────────────────────────
        // Parse JSON response — strip any markdown
        // fences the model might add despite instructions
        // ─────────────────────────────────────────────
        const cleaned = rawText
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        return JSON.parse(cleaned);

    } catch (error) {
        console.error("NVIDIA NIM error:", error.message);
        return null;
    }
};

// ─────────────────────────────────────────────
// MASTER FUNCTION — called by route
// Takes profile data + aura data
// Returns complete AI insight object
// ─────────────────────────────────────────────
const generateInsights = async (profileData, auraData) => {
    try {
        const { name, type } = profileData;

        console.log(`AI: Fetching web context for "${name}"...`);

        // Step 1: Fetch live web context via Tavily
        const webContext = await fetchWebContext(name, type);

        console.log(`AI: Generating insights for "${name}"...`);

        // Step 2: Build structured prompt
        const prompt = buildPrompt(profileData, auraData, webContext);

        // Step 3: Call NVIDIA NIM
        const insights = await callNvidiaLLM(prompt);

        if (!insights) {
            return {
                error: "AI insight generation failed",
                fallback: true
            };
        }

        // Return insights + metadata
        return {
            ...insights,
            generated_at:  new Date().toISOString(),
            model_used:    "meta/llama-3.3-70b-instruct",
            web_context_available: webContext.length > 0
        };

    } catch (error) {
        console.error("AI service error:", error.message);
        return null;
    }
};

module.exports = { generateInsights };
