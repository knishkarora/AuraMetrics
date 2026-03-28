const axios = require("axios");
const formatSocialCount = require("../utils/formatSocialCount");

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
        confidence_meta,
        aura_breakdown,
        signals
    } = auraData;

    // Build platform data section dynamically
    // Only include platforms that have data
    let platformSection = "";

    if (instagram) {
        platformSection += `
INSTAGRAM:
- Followers: ${formatSocialCount(instagram.followers)}
- Post Engagement Rate: ${instagram.post_engagement_rate}%
- Reels Avg Views: ${formatSocialCount(instagram.reels_avg_views)}
- Reels Trend: ${instagram.reels_trend} (${instagram.reels_trend > 1 ? "📈 Growing" : "📉 Declining"})
- Combined Engagement Rate: ${instagram.combined_engagement_rate}%
- Follower/Following Ratio: ${instagram.follower_following_ratio}
`;
    }

    if (youtube) {
        platformSection += `
YOUTUBE:
- Subscribers: ${formatSocialCount(youtube.subscribers)}
- Avg Views: ${formatSocialCount(youtube.avg_views)}
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
- Monthly Listeners: ${formatSocialCount(lastfm.listeners)}
- Total Play Count: ${formatSocialCount(lastfm.play_count)}
- Top Track: ${lastfm.top_track_name || 'N/A'} (Plays: ${formatSocialCount(lastfm.top_track_plays || 0)})
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
CONFIDENCE: ${confidence}%${confidence_meta ? ` (${confidence_meta.tier})` : ''}

AURA BREAKDOWN:
- Quality:      ${aura_breakdown?.quality}/100
- Business:     ${aura_breakdown?.business}/100
- Recognition:  ${aura_breakdown?.recognition}/100
- Momentum:     ${aura_breakdown?.momentum}/100
- Stability:    ${aura_breakdown?.stability}/100

${confidence_meta ? `DATA RELIABILITY CONTEXT:
- Confidence Summary: ${confidence_meta.summary}
- Platforms Used: ${confidence_meta.platforms_used}/${confidence_meta.platforms_expected}
${confidence_meta.anomalies?.length > 0 ? `- Anomalies Detected:\n${confidence_meta.anomalies.map(a => `  ⚠️ [${a.severity.toUpperCase()}] ${a.message}`).join('\n')}` : '- No anomalies detected.'}
${confidence_meta.data_gaps?.length > 0 ? `- Data Gaps:\n${confidence_meta.data_gaps.map(g => `  📭 [${g.impact.toUpperCase()}] ${g.message}`).join('\n')}` : '- No data gaps.'}
` : ''}
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

  "confidence_explanation": "1-2 sentences explaining why the confidence score is ${confidence}%. Reference specific data gaps, anomalies, or platform coverage from the DATA RELIABILITY CONTEXT above. Be specific — cite which platforms contributed or were missing."
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


// ─────────────────────────────────────────────
// COMPARISON PROMPT — Different from single profile
// Two profiles side by side, 6 common dimensions
// AI acts as a brand strategist making a pick
// ─────────────────────────────────────────────
const buildComparisonPrompt = (profile1, profile2, normalized1, normalized2, webContext1, webContext2) => {

    const formatDimensions = (norm) => {
        const d = norm.dimensions;
        return `
  Reach:            ${d.reach}/100
  Engagement:       ${d.engagement}/100
  Authenticity:     ${d.authenticity}/100
  Momentum:         ${d.momentum}/100
  Brand Safety:     ${d.brand_safety}/100
  Commercial Value: ${d.commercial_value}/100
  ──────────────────
  Dimension Avg:    ${norm.dimension_average}/100`;
    };

    const formatProfile = (profile) => {
        let section = '';

        if (profile.instagram) {
            section += `
  Instagram: ${formatSocialCount(profile.instagram.followers)} followers, ${profile.instagram.combined_engagement_rate}% engagement`;
        }
        if (profile.youtube) {
            section += `
  YouTube: ${formatSocialCount(profile.youtube.subscribers)} subscribers, ${profile.youtube.engagement_rate}% engagement`;
        }
        if (profile.lastfm) {
            section += `
  Last.fm: ${formatSocialCount(profile.lastfm.listeners)} listeners, ${formatSocialCount(profile.lastfm.play_count)} plays`;
        }
        if (profile.profile?.recent_movies) {
            const movies = profile.profile.recent_movies.slice(0, 5).map(m => m.title).join(', ');
            section += `
  Recent Films: ${movies}`;
        }

        return section;
    };

    return `
You are AuraMetric's AI comparison analyst — an expert in cross-category influencer intelligence and brand partnership strategy.

You have been given REAL-TIME data fetched live from APIs for TWO profiles. This is NOT your training data.
Your job: compare them head-to-head across 6 standardized dimensions and declare dimension winners.

═══════════════════════════════════════
PROFILE A: ${profile1.name} (${profile1.type})
═══════════════════════════════════════
  Aura Score: ${profile1.aura_score || 'N/A'}/100
  Confidence: ${profile1.confidence || 'N/A'}%
${formatProfile(profile1)}

  NORMALIZED DIMENSIONS:
${formatDimensions(normalized1)}

WEB CONTEXT (Profile A):
${webContext1 || 'No recent web data available.'}

═══════════════════════════════════════
PROFILE B: ${profile2.name} (${profile2.type})
═══════════════════════════════════════
  Aura Score: ${profile2.aura_score || 'N/A'}/100
  Confidence: ${profile2.confidence || 'N/A'}%
${formatProfile(profile2)}

  NORMALIZED DIMENSIONS:
${formatDimensions(normalized2)}

WEB CONTEXT (Profile B):
${webContext2 || 'No recent web data available.'}

═══════════════════════════════════════
COMPARISON CONTEXT
═══════════════════════════════════════
This is a ${profile1.type === profile2.type ? 'same-type' : 'CROSS-TYPE'} comparison.
${profile1.type !== profile2.type ? `Note: You are comparing a ${profile1.type} with a ${profile2.type}. The dimension scores have been normalized to a common scale, so direct comparison is valid.` : ''}

═══════════════════════════════════════
YOUR TASK — Respond in this EXACT JSON format:
═══════════════════════════════════════

{
  "winner_overall": "Name of the overall winner",
  "winner_score": 0,
  "runner_up_score": 0,

  "dimension_winners": {
    "reach":            { "winner": "Name", "winner_score": 0, "loser_score": 0, "margin": "significant|moderate|slight|tie", "reason": "1 sentence why" },
    "engagement":       { "winner": "Name", "winner_score": 0, "loser_score": 0, "margin": "significant|moderate|slight|tie", "reason": "1 sentence why" },
    "authenticity":     { "winner": "Name", "winner_score": 0, "loser_score": 0, "margin": "significant|moderate|slight|tie", "reason": "1 sentence why" },
    "momentum":         { "winner": "Name", "winner_score": 0, "loser_score": 0, "margin": "significant|moderate|slight|tie", "reason": "1 sentence why" },
    "brand_safety":     { "winner": "Name", "winner_score": 0, "loser_score": 0, "margin": "significant|moderate|slight|tie", "reason": "1 sentence why" },
    "commercial_value": { "winner": "Name", "winner_score": 0, "loser_score": 0, "margin": "significant|moderate|slight|tie", "reason": "1 sentence why" }
  },

  "verdict": "3-4 sentences. Who wins overall and why? Reference actual dimension scores. Be specific and data-driven.",

  "use_cases": {
    "choose_A_for": "2-3 sentence description of when/why to pick ${profile1.name}. Be specific about campaign types, demographics, regions.",
    "choose_B_for": "2-3 sentence description of when/why to pick ${profile2.name}. Be specific about campaign types, demographics, regions."
  },

  "head_to_head_summary": "1-2 sentences. A punchy, memorable one-liner summarizing this matchup."
}

RULES:
- Use actual names, not "Profile A" or "Profile B"
- Use the normalized dimension scores provided — do NOT invent your own
- margin is "significant" if gap > 15, "moderate" if 8-15, "slight" if 3-7, "tie" if < 3
- winner_score and runner_up_score should be the dimension_average for each
- Return ONLY valid JSON. No extra text, no markdown, no explanation outside the JSON.
`;
};


// ─────────────────────────────────────────────
// MASTER COMPARISON FUNCTION — called by route
// Takes both profiles + normalized dimensions
// Returns complete AI comparison report
// ─────────────────────────────────────────────
const generateComparisonInsights = async (profile1, profile2, normalized1, normalized2) => {
    try {
        console.log(`AI Comparison: "${profile1.name}" vs "${profile2.name}"`);

        // ── Fetch web context for BOTH profiles in parallel ──
        const [webContext1, webContext2] = await Promise.all([
            fetchWebContext(profile1.name, profile1.type),
            fetchWebContext(profile2.name, profile2.type)
        ]);

        console.log(`AI Comparison: Web context fetched, generating comparison...`);

        // ── Build comparison prompt ──
        const prompt = buildComparisonPrompt(
            profile1, profile2,
            normalized1, normalized2,
            webContext1, webContext2
        );

        // ── Call NVIDIA NIM ──
        const comparison = await callNvidiaLLM(prompt);

        if (!comparison) {
            return {
                error:    'AI comparison generation failed',
                fallback: true
            };
        }

        return {
            ...comparison,
            generated_at:           new Date().toISOString(),
            model_used:             'meta/llama-3.3-70b-instruct',
            comparison_type:        profile1.type === profile2.type ? 'same_type' : 'cross_type',
            web_context_available:  (webContext1.length > 0) || (webContext2.length > 0)
        };

    } catch (error) {
        console.error('AI comparison error:', error.message);
        return null;
    }
};


module.exports = { generateInsights, generateComparisonInsights };
