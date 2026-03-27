// ===========================================================
// 🔹 Influencer Signal Engine
// Works with YouTube + Instagram + Spotify data
// Parallel to actorSignalService — same output structure
// So Aura Score works identically for both types
// ===========================================================

// ===========================================================
// 🔹 FUNCTION: Calculate Reach Score (0-10)
// Measures total cross-platform audience size
// Log scaled — 10x followers ≠ 10x reach
// ===========================================================
function calculateReachScore(instagram, youtube, spotify) {
    let totalScore = 0;
    let platformCount = 0;

    if (instagram?.followers) {
        // Log scale — more realistic than linear
        const igScore = Math.min(
            Math.log10(instagram.followers) * 1.4,
            10
        );
        totalScore += igScore * 0.45; // Instagram weighted highest
        platformCount++;
    }

    if (youtube?.subscribers) {
        const ytScore = Math.min(
            Math.log10(youtube.subscribers) * 1.4,
            10
        );
        totalScore += ytScore * 0.40; // YouTube second
        platformCount++;
    }

    if (spotify?.followers) {
        const spScore = Math.min(
            Math.log10(spotify.followers) * 1.4,
            10
        );
        totalScore += spScore * 0.15; // Spotify supporting signal
        platformCount++;
    }

    if (platformCount === 0) return null;

    return parseFloat(totalScore.toFixed(2));
}

// ===========================================================
// 🔹 FUNCTION: Calculate Engagement Score (0-10)
// Engagement rate is the most fake-proof signal
// Bots follow but don't engage — this exposes them
// ===========================================================
function calculateEngagementScore(instagram, youtube) {

    let scores = [];

    if (instagram?.combined_engagement_rate) {
        // Industry benchmarks:
        // 6%+ = excellent | 3-6% = good | 1-3% = average | <1% = low
        const igEngagement = Math.min(
            instagram.combined_engagement_rate * 1.2,
            10
        );
        scores.push(igEngagement * 0.6); // Instagram weighted higher
    }

    if (youtube?.engagement_rate) {
        const ytEngagement = Math.min(
            youtube.engagement_rate * 1.2,
            10
        );
        scores.push(ytEngagement * 0.4);
    }

    if (scores.length === 0) return null;

    return parseFloat(
        scores.reduce((a, b) => a + b, 0).toFixed(2)
    );
}

// ===========================================================
// 🔹 FUNCTION: Calculate Authenticity Score (0-10)
// Detects fake followers via mismatch signals
// Core differentiator of AuraMetric vs simple tools
// ===========================================================
function calculateAuthenticityScore(instagram, youtube) {
    let signals = [];

    if (instagram) {
        // ─────────────────────────────────────────────
        // Signal 1: Follower/Following ratio
        // Very high ratio = organic authority
        // Low ratio = follow-for-follow tactics
        // ─────────────────────────────────────────────
        if (instagram.follower_following_ratio) {
            const ratioScore = Math.min(
                Math.log10(instagram.follower_following_ratio + 1) * 2.5,
                10
            );
            signals.push(ratioScore * 0.3);
        }

        // ─────────────────────────────────────────────
        // Signal 2: Reels reach ratio
        // Above 100% = content reaching beyond followers
        // This is very hard to fake
        // ─────────────────────────────────────────────
        if (instagram.reels_reach_ratio) {
            const reachScore = Math.min(
                instagram.reels_reach_ratio / 20,
                10
            );
            signals.push(reachScore * 0.4);
        }

        // ─────────────────────────────────────────────
        // Signal 3: Verified badge
        // Small but meaningful trust signal
        // ─────────────────────────────────────────────
        if (instagram.is_verified) {
            signals.push(8 * 0.3); // verified = 8/10 trust
        } else {
            signals.push(5 * 0.3); // unverified = neutral
        }
    }

    if (youtube) {
        // ─────────────────────────────────────────────
        // YouTube view-to-sub ratio
        // Healthy: 10-40% | Suspicious: below 3%
        // Cannot be easily faked consistently
        // ─────────────────────────────────────────────
        if (youtube.view_to_sub_ratio) {
            const healthy = 20; // 20% is ideal
            const distance = Math.abs(youtube.view_to_sub_ratio - healthy);
            const ytAuthScore = Math.max(0, 10 - (distance / 5));
            signals.push(ytAuthScore * 0.4);
        }
    }

    if (signals.length === 0) return null;

    return parseFloat(
        Math.min(signals.reduce((a, b) => a + b, 0), 10).toFixed(2)
    );
}

// ===========================================================
// 🔹 FUNCTION: Calculate Growth Score (0-10)
// Are they trending up or down?
// Based on trend signals from both platforms
// ===========================================================
function calculateGrowthScore(instagram, youtube) {
    let trends = [];

    if (instagram?.reels_trend) {
        // reels_trend > 1.0 = growing
        // Convert to 0-10 scale
        const igGrowth = Math.min(instagram.reels_trend * 5, 10);
        trends.push(igGrowth * 0.5);
    }

    if (instagram?.posts_trend) {
        const postGrowth = Math.min(instagram.posts_trend * 5, 10);
        trends.push(postGrowth * 0.2);
    }

    if (youtube?.views_trend) {
        const ytGrowth = Math.min(youtube.views_trend * 5, 10);
        trends.push(ytGrowth * 0.3);
    }

    if (trends.length === 0) return null;

    return parseFloat(
        trends.reduce((a, b) => a + b, 0).toFixed(2)
    );
}

// ===========================================================
// 🔹 FUNCTION: Calculate Consistency Score (0-10)
// Is their performance stable over time?
// Stable creators are lower risk for brand deals
// ===========================================================
function calculateConsistencyScore(instagram, youtube) {
    let scores = [];

    if (youtube?.upload_frequency) {
        // Regular uploaders score higher
        // 4+ videos/month = very active
        const uploadScore = Math.min(youtube.upload_frequency * 2, 10);
        scores.push(uploadScore * 0.4);
    }

    if (instagram?.post_count && instagram?.last_post_date) {
        // Check recency — inactive accounts score lower
        const daysSincePost = Math.floor(
            (new Date() - new Date(instagram.last_post_date))
            / (1000 * 60 * 60 * 24)
        );

        // Within 7 days = 10 | Within 30 days = 7 | 90+ days = 3
        const recencyScore = daysSincePost <= 7 ? 10
            : daysSincePost <= 30 ? 7
                : daysSincePost <= 90 ? 5
                    : 3;

        scores.push(recencyScore * 0.6);
    }

    if (scores.length === 0) return null;

    return parseFloat(
        Math.min(scores.reduce((a, b) => a + b, 0), 10).toFixed(2)
    );
}

// ===========================================================
// 🔹 FUNCTION: Calculate Influencer Aura Score (0-100)
// Same structure as actor Aura Score
// So frontend treats both identically
// ===========================================================
function calculateInfluencerAuraScore(signals) {
    const {
        reach,
        engagement,
        authenticity,
        growth,
        consistency
    } = signals;

    // ─────────────────────────────────────────────
    // Engagement weighted highest — most fake-proof
    // Reach second — raw audience size matters
    // Authenticity third — trust signal
    // Growth fourth — momentum indicator
    // Consistency last — supporting signal
    // ─────────────────────────────────────────────
    const finalScore =
        ((reach || 0) * 0.25) +
        ((engagement || 0) * 0.30) +
        ((authenticity || 0) * 0.20) +
        ((growth || 0) * 0.15) +
        ((consistency || 0) * 0.10);

    return Math.min(Math.round(finalScore * 10), 95); // 0-100 scale
}

// ===========================================================
// 🔹 FUNCTION: Influencer Aura Breakdown
// Maps to same 5 dimensions as actor breakdown
// quality → engagement (content quality proxy)
// business → reach (monetization potential)
// recognition → authenticity (audience trust)
// momentum → growth
// stability → consistency
// ===========================================================
function calculateInfluencerAuraBreakdown(signals) {
    const {
        reach,
        engagement,
        authenticity,
        growth,
        consistency
    } = signals;

    return {
        // Maps engagement → quality
        // High engagement = quality content
        quality: parseFloat(Math.min((engagement || 0) * 10, 95).toFixed(2)),

        // Maps reach → business potential
        business: parseFloat(Math.min((reach || 0) * 10, 95).toFixed(2)),

        // Maps authenticity → recognition/trust
        recognition: parseFloat(Math.min((authenticity || 0) * 10, 95).toFixed(2)),

        // Growth directly maps to momentum
        momentum: parseFloat(Math.min((growth || 0) * 10, 95).toFixed(2)),

        // Consistency directly maps to stability
        stability: parseFloat(Math.min((consistency || 0) * 10, 95).toFixed(2))
    };
}

// ===========================================================
// 🔹 MASTER FUNCTION — called by aggregator
// Takes raw Instagram + YouTube + Spotify data
// Returns complete signal object ready for AI layer
// ===========================================================
function calculateInfluencerSignals(instagram, youtube, spotify) {
    // Calculate all individual signals
    const reach = calculateReachScore(instagram, youtube, spotify);
    const engagement = calculateEngagementScore(instagram, youtube);
    const authenticity = calculateAuthenticityScore(instagram, youtube);
    const growth = calculateGrowthScore(instagram, youtube);
    const consistency = calculateConsistencyScore(instagram, youtube);

    const signals = {
        reach,
        engagement,
        authenticity,
        growth,
        consistency
    };

    // Calculate Aura Score + breakdown from signals
    const aura_score = calculateInfluencerAuraScore(signals);
    const aura_breakdown = calculateInfluencerAuraBreakdown(signals);

    // ─────────────────────────────────────────────
    // Confidence meter — how much to trust this score?
    // Based on data completeness across platforms
    // ─────────────────────────────────────────────
    let platformsFound = 0;
    if (instagram) platformsFound++;
    if (youtube) platformsFound++;
    if (spotify) platformsFound++;

    const confidence = platformsFound === 3 ? 95
        : platformsFound === 2 ? 75
            : 50;

    return {
        signals,
        aura_score,
        aura_breakdown,
        confidence,
        platforms_found: platformsFound
    };
}

module.exports = { calculateInfluencerSignals };