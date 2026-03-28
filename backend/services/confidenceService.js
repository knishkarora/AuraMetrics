// ===========================================================
// 🔹 Confidence Meter & Cross-Platform Validation Layer
// ===========================================================
// Purpose:
//   1. Track data health per API source (TMDB, Last.fm, IG, YT)
//   2. Detect cross-platform anomalies (fake followers, mismatch)
//   3. Flag data gaps (missing platforms, partial data)
//   4. Produce a unified confidence score for frontend display
//
// Architecture:
//   Each pipeline calls `buildConfidenceReport()` with raw data.
//   The report is attached to the profile response alongside
//   the existing `confidence` number — fully backwards compatible.
// ===========================================================


// ─────────────────────────────────────────────
// DATA SOURCE HEALTH WEIGHTS
// Each platform contributes a health score (0.0–1.0)
// based on how much usable data it returned.
// ─────────────────────────────────────────────

/**
 * Evaluate Instagram data health
 * Returns 0.0 (no data) to 1.0 (fully healthy)
 */
function evaluateInstagramHealth(instagram) {
    if (!instagram) return { score: 0, status: 'missing', detail: 'Instagram data not available' };

    let health = 0;
    const issues = [];

    // Core fields
    if (instagram.followers > 0)                    health += 0.25;
    else issues.push('No follower data');

    if (instagram.combined_engagement_rate > 0)     health += 0.25;
    else issues.push('No engagement rate data');

    if (instagram.reels_avg_views > 0)              health += 0.20;
    else issues.push('No reels data');

    if (instagram.post_avg_likes > 0)               health += 0.15;
    else issues.push('No post engagement data');

    if (instagram.last_post_date)                    health += 0.15;
    else issues.push('No recent post date — may be inactive');

    const status = health >= 0.8 ? 'healthy'
                 : health >= 0.5 ? 'partial'
                 : 'degraded';

    return {
        score:  parseFloat(health.toFixed(2)),
        status,
        detail: issues.length > 0 ? issues.join('; ') : 'All checks passed'
    };
}

/**
 * Evaluate YouTube data health
 */
function evaluateYouTubeHealth(youtube) {
    if (!youtube) return { score: 0, status: 'missing', detail: 'YouTube data not available' };

    let health = 0;
    const issues = [];

    if (youtube.subscribers > 0)        health += 0.25;
    else issues.push('No subscriber data');

    if (youtube.avg_views > 0)          health += 0.25;
    else issues.push('No average view data');

    if (youtube.engagement_rate > 0)    health += 0.20;
    else issues.push('No engagement rate');

    if (youtube.views_trend !== null)    health += 0.15;
    else issues.push('Cannot calculate views trend');

    if (youtube.upload_frequency > 0)   health += 0.15;
    else issues.push('No upload frequency data');

    const status = health >= 0.8 ? 'healthy'
                 : health >= 0.5 ? 'partial'
                 : 'degraded';

    return {
        score:  parseFloat(health.toFixed(2)),
        status,
        detail: issues.length > 0 ? issues.join('; ') : 'All checks passed'
    };
}

/**
 * Evaluate Last.fm data health
 */
function evaluateLastFmHealth(lastfm) {
    if (!lastfm) return { score: 0, status: 'missing', detail: 'Last.fm data not available' };

    let health = 0;
    const issues = [];

    if (lastfm.listeners > 0)                   health += 0.30;
    else issues.push('No listener data');

    if (lastfm.play_count > 0)                   health += 0.25;
    else issues.push('No play count data');

    if (lastfm.top_track_name)                    health += 0.20;
    else issues.push('No top track data');

    if (lastfm.music_signals)                     health += 0.25;
    else issues.push('Music signals not calculated');

    const status = health >= 0.8 ? 'healthy'
                 : health >= 0.5 ? 'partial'
                 : 'degraded';

    return {
        score:  parseFloat(health.toFixed(2)),
        status,
        detail: issues.length > 0 ? issues.join('; ') : 'All checks passed'
    };
}

/**
 * Evaluate TMDB/actor data health
 * Takes the enriched actor data object from enrichmentService
 */
function evaluateActorDataHealth(actorData) {
    if (!actorData) return { score: 0, status: 'missing', detail: 'TMDB/actor data not available' };

    let health = 0;
    const issues = [];

    const movies = actorData.movies || actorData.recent_movies || [];

    if (movies.length >= 3)                      health += 0.25;
    else if (movies.length > 0)                  { health += 0.10; issues.push(`Only ${movies.length} movie(s) found — need 3+ for reliable signals`); }
    else issues.push('No movie data found');

    // Check if OMDb enrichment worked
    const moviesWithOmdb = movies.filter(m => m.omdb && m.omdb.imdbRating !== null);
    if (moviesWithOmdb.length >= 2)              health += 0.25;
    else if (moviesWithOmdb.length > 0)          { health += 0.10; issues.push('Limited IMDb rating data'); }
    else issues.push('OMDb enrichment failed — no IMDb ratings');

    // Box office data
    const moviesWithRevenue = movies.filter(m => (m.revenue_raw || m.revenue) > 0);
    if (moviesWithRevenue.length >= 2)           health += 0.25;
    else if (moviesWithRevenue.length > 0)       { health += 0.10; issues.push('Limited box office data'); }
    else issues.push('No box office revenue data');

    // Aura insights exist
    if (actorData.insights?.aura_score > 0)      health += 0.25;
    else issues.push('Aura score could not be calculated');

    const status = health >= 0.8 ? 'healthy'
                 : health >= 0.5 ? 'partial'
                 : 'degraded';

    return {
        score:  parseFloat(health.toFixed(2)),
        status,
        detail: issues.length > 0 ? issues.join('; ') : 'All checks passed'
    };
}


// ─────────────────────────────────────────────
// CROSS-PLATFORM ANOMALY DETECTION
// Checks for suspicious mismatches between
// data from different APIs.
// ─────────────────────────────────────────────

function detectAnomalies(type, { instagram, youtube, lastfm, actorData }) {
    const anomalies = [];

    // ─────────────────────────────────────────────
    // ANOMALY 1: High followers, zero engagement
    // Classic sign of purchased followers
    // ─────────────────────────────────────────────
    if (instagram?.followers > 500000 && instagram?.combined_engagement_rate < 0.5) {
        anomalies.push({
            severity: 'high',
            type:     'fake_engagement',
            message:  `${(instagram.followers / 1e6).toFixed(1)}M followers but only ${instagram.combined_engagement_rate}% engagement — potential fake followers`,
            platforms: ['instagram']
        });
    }

    // ─────────────────────────────────────────────
    // ANOMALY 2: YouTube subscriber-view mismatch
    // Healthy channels get 10-40% view:sub ratio
    // Below 3% with high subs = suspicious
    // ─────────────────────────────────────────────
    if (youtube?.subscribers > 100000 && youtube?.view_to_sub_ratio < 3) {
        anomalies.push({
            severity: 'high',
            type:     'subscriber_mismatch',
            message:  `${(youtube.subscribers / 1e6).toFixed(1)}M subscribers but only ${youtube.view_to_sub_ratio}% view-to-sub ratio — inactive or inflated audience`,
            platforms: ['youtube']
        });
    }

    // ─────────────────────────────────────────────
    // ANOMALY 3: Cross-platform follower imbalance
    // If IG has millions but YT has near zero or
    // vice versa — not necessarily bad, but notable
    // ─────────────────────────────────────────────
    if (instagram?.followers && youtube?.subscribers) {
        const ratio = instagram.followers / youtube.subscribers;
        if (ratio > 50 || ratio < 0.02) {
            anomalies.push({
                severity: 'medium',
                type:     'cross_platform_imbalance',
                message:  `Extreme follower imbalance: IG ${(instagram.followers / 1e6).toFixed(1)}M vs YT ${(youtube.subscribers / 1e6).toFixed(1)}M — influence may be concentrated on one platform`,
                platforms: ['instagram', 'youtube']
            });
        }
    }

    // ─────────────────────────────────────────────
    // ANOMALY 4: Social influence vs box office gap
    // Actor-specific — high social reach but poor
    // commercial performance or vice versa
    // ─────────────────────────────────────────────
    if (type === 'actor' && instagram?.followers && actorData) {
        const insights = actorData.insights || {};
        const roi = insights.roi_efficiency;

        if (instagram.followers > 5000000 && roi !== null && roi < 0) {
            anomalies.push({
                severity: 'medium',
                type:     'social_commercial_gap',
                message:  `High social following (${(instagram.followers / 1e6).toFixed(1)}M) but negative ROI (${roi}%) — social influence not translating to box office`,
                platforms: ['instagram', 'tmdb']
            });
        }
    }

    // ─────────────────────────────────────────────
    // ANOMALY 5: Musician — high Last.fm but zero
    // social presence, or vice versa
    // ─────────────────────────────────────────────
    if (type === 'musician' && lastfm?.listeners && instagram?.followers) {
        // Very high listeners but almost no social presence
        if (lastfm.listeners > 500000 && instagram.followers < 10000) {
            anomalies.push({
                severity: 'low',
                type:     'music_social_gap',
                message:  `Strong Last.fm presence (${(lastfm.listeners / 1e6).toFixed(1)}M listeners) but minimal Instagram following (${instagram.followers.toLocaleString()}) — may be a niche or legacy artist`,
                platforms: ['lastfm', 'instagram']
            });
        }
    }

    // ─────────────────────────────────────────────
    // ANOMALY 6: Declining trends across platforms
    // If both IG reels AND YT views are declining,
    // the person's relevance may be fading
    // ─────────────────────────────────────────────
    if (instagram?.reels_trend && youtube?.views_trend) {
        if (instagram.reels_trend < 0.7 && youtube.views_trend < 0.7) {
            anomalies.push({
                severity: 'medium',
                type:     'cross_platform_decline',
                message:  `Declining across platforms — IG reels trend: ${instagram.reels_trend}x, YT views trend: ${youtube.views_trend}x — may indicate fading relevance`,
                platforms: ['instagram', 'youtube']
            });
        }
    }

    // ─────────────────────────────────────────────
    // ANOMALY 7: Instagram followers vs reels views gap
    // reels_reach_ratio = (avg reel views / followers) × 100
    // Below 5% with 1M+ followers = fake audience flag
    // Reels views are very hard to fake — algorithm driven
    // ─────────────────────────────────────────────
    if (instagram?.followers > 1000000 && instagram?.reels_reach_ratio !== undefined) {
        if (instagram.reels_reach_ratio < 5) {
            anomalies.push({
                severity: 'high',
                type:     'followers_views_gap',
                message:  `${(instagram.followers / 1e6).toFixed(1)}M followers but reels only reach ${instagram.reels_reach_ratio}% of audience (avg views: ${(instagram.reels_avg_views || 0).toLocaleString()}) — fake audience flag`,
                platforms: ['instagram']
            });
        }
    }

    // ─────────────────────────────────────────────
    // ANOMALY 8: YouTube avg views vs subscribers gap
    // If avg video views are less than 1% of subs
    // with 500K+ subs = ghost subscriber flag
    // ─────────────────────────────────────────────
    if (youtube?.subscribers > 500000 && youtube?.avg_views > 0) {
        const viewSubPercent = (youtube.avg_views / youtube.subscribers) * 100;
        if (viewSubPercent < 1) {
            anomalies.push({
                severity: 'high',
                type:     'ghost_subscribers',
                message:  `${(youtube.subscribers / 1e6).toFixed(1)}M subscribers but avg ${youtube.avg_views.toLocaleString()} views per video (${viewSubPercent.toFixed(2)}% reach) — ghost subscriber flag`,
                platforms: ['youtube']
            });
        }
    }

    return anomalies;
}


// ─────────────────────────────────────────────
// DATA GAP IDENTIFICATION
// Flags what data is missing and what impact
// that has on the overall score reliability
// ─────────────────────────────────────────────

function identifyDataGaps(type, { instagram, youtube, lastfm, actorData }) {
    const gaps = [];

    // ── Universal gaps ──
    if (!instagram) {
        gaps.push({
            platform: 'instagram',
            impact:   'high',
            message:  'No Instagram data — social reach and engagement metrics unavailable'
        });
    }

    // ── Type-specific gaps ──
    if (type === 'actor') {
        if (!actorData) {
            gaps.push({
                platform: 'tmdb',
                impact:   'critical',
                message:  'No TMDB/film data — core actor metrics (box office, ratings, awards) cannot be calculated'
            });
        }

        // Actors don't strictly need YT/Last.fm, but note it
        if (!youtube) {
            gaps.push({
                platform: 'youtube',
                impact:   'low',
                message:  'No YouTube presence — supplementary reach data unavailable'
            });
        }
    }

    if (type === 'musician') {
        if (!lastfm) {
            gaps.push({
                platform: 'lastfm',
                impact:   'high',
                message:  'No Last.fm data — music streaming metrics and signals unavailable'
            });
        }
        if (!youtube) {
            gaps.push({
                platform: 'youtube',
                impact:   'medium',
                message:  'No YouTube data — video performance and subscriber metrics missing'
            });
        }
    }

    if (type === 'influencer' || type === 'athlete') {
        if (!youtube) {
            gaps.push({
                platform: 'youtube',
                impact:   'medium',
                message:  'No YouTube data — multi-platform reach assessment limited'
            });
        }
    }

    return gaps;
}


// ─────────────────────────────────────────────
// MASTER CONFIDENCE SCORE CALCULATOR
// Combines data health, anomalies, and gaps
// into a single 0–100 confidence percentage.
//
// This REPLACES the old simple confidence logic
// in aggregatorService and influencerSignalService
// while remaining backwards compatible (same field name).
// ─────────────────────────────────────────────

function calculateConfidenceScore(type, healthScores, anomalies, dataGaps) {

    // ─────────────────────────────────────────────
    // Step 1: Weighted platform health (50% of total)
    // Weights differ per type — actors need TMDB most,
    // musicians need Last.fm, etc.
    // ─────────────────────────────────────────────
    const weights = {
        actor:      { instagram: 0.15, youtube: 0.05, lastfm: 0.00, actorData: 0.80 },
        musician:   { instagram: 0.20, youtube: 0.25, lastfm: 0.40, actorData: 0.15 },
        influencer: { instagram: 0.50, youtube: 0.40, lastfm: 0.00, actorData: 0.10 },
        athlete:    { instagram: 0.50, youtube: 0.35, lastfm: 0.00, actorData: 0.15 }
    };

    const typeWeights = weights[type] || weights.influencer;

    const weightedHealth =
        (healthScores.instagram?.score  || 0) * typeWeights.instagram +
        (healthScores.youtube?.score    || 0) * typeWeights.youtube +
        (healthScores.lastfm?.score     || 0) * typeWeights.lastfm +
        (healthScores.actorData?.score  || 0) * typeWeights.actorData;

    // Convert to 0–100 and cap at 50 (this is half the total)
    let healthComponent = weightedHealth * 50;

    // ─────────────────────────────────────────────
    // Step 2: Platform coverage bonus (30% of total)
    // More platforms with data = higher confidence
    // ─────────────────────────────────────────────
    let platformsWithData = 0;
    let totalPlatforms = 0;

    for (const [platform, health] of Object.entries(healthScores)) {
        if (typeWeights[platform] > 0) {
            totalPlatforms++;
            if (health.score > 0) platformsWithData++;
        }
    }

    const coverageRatio = totalPlatforms > 0
        ? platformsWithData / totalPlatforms
        : 0;

    const coverageComponent = coverageRatio * 30;

    // ─────────────────────────────────────────────
    // Step 3: Penalty for anomalies (up to -15)
    // High severity = bigger penalty
    // ─────────────────────────────────────────────
    let anomalyPenalty = 0;
    for (const anomaly of anomalies) {
        if      (anomaly.severity === 'high')   anomalyPenalty += 5;
        else if (anomaly.severity === 'medium') anomalyPenalty += 3;
        else                                    anomalyPenalty += 1;
    }
    anomalyPenalty = Math.min(anomalyPenalty, 15);

    // ─────────────────────────────────────────────
    // Step 4: Penalty for critical data gaps (up to -5)
    // ─────────────────────────────────────────────
    let gapPenalty = 0;
    for (const gap of dataGaps) {
        if      (gap.impact === 'critical') gapPenalty += 5;
        else if (gap.impact === 'high')     gapPenalty += 3;
        else if (gap.impact === 'medium')   gapPenalty += 1;
    }
    gapPenalty = Math.min(gapPenalty, 5);

    // ─────────────────────────────────────────────
    // Step 5: Base reliability bonus (20% of total)
    // Ensures a minimum of 20 if any data exists at all
    // ─────────────────────────────────────────────
    const baseBonus = platformsWithData > 0 ? 20 : 0;

    // ─────────────────────────────────────────────
    // FINAL SCORE
    // ─────────────────────────────────────────────
    const rawScore = healthComponent + coverageComponent + baseBonus - anomalyPenalty - gapPenalty;

    return Math.max(10, Math.min(95, Math.round(rawScore)));
}


// ─────────────────────────────────────────────
// CONFIDENCE TIER — human-readable label
// ─────────────────────────────────────────────

function getConfidenceTier(score) {
    if (score >= 85) return 'high';
    if (score >= 65) return 'medium';
    if (score >= 40) return 'low';
    return 'very_low';
}


// ===========================================================
// 🔹 MASTER FUNCTION: buildConfidenceReport
// Called by each pipeline in aggregatorService
//
// Input:  type + raw platform data objects
// Output: complete confidence report object
// ===========================================================

function buildConfidenceReport(type, { instagram = null, youtube = null, lastfm = null, actorData = null } = {}) {

    // ── Step 1: Evaluate health of each data source ──
    const healthScores = {
        instagram:  evaluateInstagramHealth(instagram),
        youtube:    evaluateYouTubeHealth(youtube),
        lastfm:     evaluateLastFmHealth(lastfm),
        actorData:  evaluateActorDataHealth(actorData)
    };

    // ── Step 2: Detect cross-platform anomalies ──
    const anomalies = detectAnomalies(type, { instagram, youtube, lastfm, actorData });

    // ── Step 3: Identify data gaps ──
    const dataGaps = identifyDataGaps(type, { instagram, youtube, lastfm, actorData });

    // ── Step 4: Calculate confidence score ──
    const confidenceScore = calculateConfidenceScore(type, healthScores, anomalies, dataGaps);
    const confidenceTier  = getConfidenceTier(confidenceScore);

    // ── Step 5: Build summary ──
    const platformCount = Object.values(healthScores).filter(h => h.score > 0).length;
    const totalPlatforms = Object.values(healthScores).filter((h, i) => {
        const keys = Object.keys(healthScores);
        const weights = {
            actor:      { instagram: 0.15, youtube: 0.05, lastfm: 0.00, actorData: 0.80 },
            musician:   { instagram: 0.20, youtube: 0.25, lastfm: 0.40, actorData: 0.15 },
            influencer: { instagram: 0.50, youtube: 0.40, lastfm: 0.00, actorData: 0.10 },
            athlete:    { instagram: 0.50, youtube: 0.35, lastfm: 0.00, actorData: 0.15 }
        };
        const w = weights[type] || weights.influencer;
        return w[keys[i]] > 0;
    }).length;

    return {
        // ── The main confidence number (backwards compatible) ──
        confidence: confidenceScore,

        // ── Extended confidence metadata ──
        confidence_meta: {
            score:          confidenceScore,
            tier:           confidenceTier,
            platforms_used: platformCount,
            platforms_expected: totalPlatforms,

            // Per-source health breakdown
            data_health: healthScores,

            // Detected anomalies (could be empty)
            anomalies:      anomalies,
            anomaly_count:  anomalies.length,

            // Missing data flags
            data_gaps:      dataGaps,
            gap_count:      dataGaps.length,

            // Human-readable summary for AI prompt
            summary: buildConfidenceSummary(confidenceScore, confidenceTier, anomalies, dataGaps, platformCount)
        }
    };
}


// ─────────────────────────────────────────────
// Build human-readable summary for AI prompt
// ─────────────────────────────────────────────

function buildConfidenceSummary(score, tier, anomalies, gaps, platformCount) {
    let summary = `Confidence: ${score}% (${tier}). Data from ${platformCount} platform(s).`;

    if (gaps.length > 0) {
        const gapNames = gaps.map(g => g.platform).join(', ');
        summary += ` Missing: ${gapNames}.`;
    }

    if (anomalies.length > 0) {
        const highAnomalies = anomalies.filter(a => a.severity === 'high');
        if (highAnomalies.length > 0) {
            summary += ` ⚠️ ${highAnomalies.length} high-severity anomaly(s) detected: ${highAnomalies.map(a => a.type).join(', ')}.`;
        }
    }

    if (tier === 'very_low') {
        summary += ' Score reliability is very low — interpret with extreme caution.';
    }

    return summary;
}


module.exports = { buildConfidenceReport };
