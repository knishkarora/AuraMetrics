const { getYouTubeData }          = require('./youtubeService');
const { getInstagramData }        = require('./instagramService');
const { getTMDBData }             = require('./tmdbService');
const { getEnrichedActorData }    = require('./enrichmentService');
const { getLastFmData }           = require('./lastfmService');
const { classifyPersonType }      = require('./classifierService');
const { calculateInfluencerSignals } = require('./influencerSignalService');
const { buildConfidenceReport } = require('./confidenceService');
const {
    calculateAverageIMDbRating,
    calculateRatingConsistency,
    calculateAwardsScore,
    calculateBoxOfficeStrength,
    calculateTrendScore,
    calculateHitRatio,
    calculateROIEfficiency,
    calculateRatingGap,
    calculateAdvancedConsistency,
    calculateAuraScore,
    calculateAuraBreakdown
} = require('./signalService');
const { generateInsights } = require('./aiService');


// ─────────────────────────────────────────────
// HELPER: Safe promise wrapper
// Returns { data, error } instead of throwing
// Used with Promise.allSettled pattern
// ─────────────────────────────────────────────
const safeFetch = async (fetchFn, label) => {
    try {
        const data = await fetchFn();
        return { data, error: null };
    } catch (error) {
        console.error(`SafeFetch [${label}] failed:`, error.message);
        return { data: null, error: error.message };
    }
};


// ===========================================================
// 🔹 ACTOR PIPELINE — Parallelized
// TMDB+OMDb enrichment runs IN PARALLEL with Instagram
// Previously sequential: enrichment(8s) → instagram(5s) = 13s
// Now parallel: max(enrichment, instagram) = ~8s
// ===========================================================
const runActorPipeline = async (name) => {
    console.log(`Aggregator: Running actor pipeline for "${name}"`);

    // ── Fire TMDB+OMDb and Instagram simultaneously ──
    const [actorResult, igResult] = await Promise.allSettled([
        getEnrichedActorData(name),
        getInstagramData(name)
    ]);

    const actorData = actorResult.status === 'fulfilled' ? actorResult.value : null;
    const instagram = igResult.status === 'fulfilled' ? igResult.value : null;

    if (!actorData) return null;

    const movies = actorData.recent_movies || [];

    // ── Calculate all actor signals ──
    const signals = {
        avgIMDb:             calculateAverageIMDbRating(movies),
        consistency:         calculateRatingConsistency(movies),
        awards:              calculateAwardsScore(movies),
        boxOffice:           calculateBoxOfficeStrength(movies),
        trend:               calculateTrendScore(actorData, movies),
        hitRatio:            calculateHitRatio(movies),
        roi:                 calculateROIEfficiency(movies),
        ratingGap:           calculateRatingGap(movies),
        advancedConsistency: calculateAdvancedConsistency(movies)
    };

    const aura_score     = calculateAuraScore(signals);
    const aura_breakdown = calculateAuraBreakdown(signals);

    const confidenceReport = buildConfidenceReport('actor', {
        instagram,
        actorData
    });

    return {
        name,
        type:         'actor',
        profile:      actorData,
        instagram:    instagram || null,
        signals,
        aura_score,
        aura_breakdown,
        ...confidenceReport
    };
};


// ===========================================================
// 🔹 INFLUENCER PIPELINE — Already parallel (Promise.all)
// ===========================================================
const runInfluencerPipeline = async (name) => {
    console.log(`Aggregator: Running influencer pipeline for "${name}"`);

    const [igResult, ytResult] = await Promise.allSettled([
        getInstagramData(name),
        getYouTubeData(name)
    ]);

    const instagram = igResult.status === 'fulfilled' ? igResult.value : null;
    const youtube   = ytResult.status === 'fulfilled' ? ytResult.value : null;

    if (!instagram && !youtube) return null;

    const result = calculateInfluencerSignals(instagram, youtube, null);

    const confidenceReport = buildConfidenceReport('influencer', {
        instagram,
        youtube
    });

    return {
        name,
        type:      'influencer',
        instagram: instagram || null,
        youtube:   youtube   || null,
        ...result,
        ...confidenceReport
    };
};


// ===========================================================
// 🔹 MUSICIAN PIPELINE — All 3 APIs in parallel
// ===========================================================
const runMusicianPipeline = async (name) => {
    console.log(`Aggregator: Running musician pipeline for "${name}"`);

    const [lfmResult, igResult, ytResult] = await Promise.allSettled([
        getLastFmData(name),
        getInstagramData(name),
        getYouTubeData(name)
    ]);

    const lastfm    = lfmResult.status === 'fulfilled' ? lfmResult.value : null;
    const instagram = igResult.status  === 'fulfilled' ? igResult.value  : null;
    const youtube   = ytResult.status  === 'fulfilled' ? ytResult.value  : null;

    if (!lastfm && !instagram && !youtube) return null;

    const socialSignals = calculateInfluencerSignals(instagram, youtube, null);

    const confidenceReport = buildConfidenceReport('musician', {
        instagram,
        youtube,
        lastfm
    });

    return {
        name,
        type:      'musician',
        lastfm:    lastfm    || null,
        instagram: instagram || null,
        youtube:   youtube   || null,
        ...socialSignals,
        ...confidenceReport,
        music_signals: lastfm?.music_signals || null
    };
};


// ===========================================================
// 🔹 ATHLETE PIPELINE — Already parallel
// ===========================================================
const runAthletePipeline = async (name) => {
    console.log(`Aggregator: Running athlete pipeline for "${name}"`);

    const [igResult, ytResult] = await Promise.allSettled([
        getInstagramData(name),
        getYouTubeData(name)
    ]);

    const instagram = igResult.status === 'fulfilled' ? igResult.value : null;
    const youtube   = ytResult.status === 'fulfilled' ? ytResult.value : null;

    if (!instagram && !youtube) return null;

    const result = calculateInfluencerSignals(instagram, youtube, null);

    const confidenceReport = buildConfidenceReport('athlete', {
        instagram,
        youtube
    });

    return {
        name,
        type:      'athlete',
        instagram: instagram || null,
        youtube:   youtube   || null,
        ...result,
        ...confidenceReport
    };
};


// ===========================================================
// 🔹 ASSEMBLE PROFILE FROM RAW DATA
// Takes pre-fetched platform data → builds complete profile
// Used by both getCompleteProfile and SSE stream route
// so data is never fetched twice.
// ===========================================================
const assembleProfile = (name, type, { instagram, youtube, lastfm, actorData }) => {

    if (type === 'actor') {
        if (!actorData) return null;

        const movies = actorData.recent_movies || [];

        const signals = {
            avgIMDb:             calculateAverageIMDbRating(movies),
            consistency:         calculateRatingConsistency(movies),
            awards:              calculateAwardsScore(movies),
            boxOffice:           calculateBoxOfficeStrength(movies),
            trend:               calculateTrendScore(actorData, movies),
            hitRatio:            calculateHitRatio(movies),
            roi:                 calculateROIEfficiency(movies),
            ratingGap:           calculateRatingGap(movies),
            advancedConsistency: calculateAdvancedConsistency(movies)
        };

        const aura_score     = calculateAuraScore(signals);
        const aura_breakdown = calculateAuraBreakdown(signals);

        const confidenceReport = buildConfidenceReport('actor', { instagram, actorData });

        return {
            name, type: 'actor',
            profile:   actorData,
            instagram: instagram || null,
            signals, aura_score, aura_breakdown,
            ...confidenceReport
        };
    }

    if (type === 'musician') {
        if (!lastfm && !instagram && !youtube) return null;

        const socialSignals = calculateInfluencerSignals(instagram, youtube, null);
        const confidenceReport = buildConfidenceReport('musician', { instagram, youtube, lastfm });

        return {
            name, type: 'musician',
            lastfm:    lastfm    || null,
            instagram: instagram || null,
            youtube:   youtube   || null,
            ...socialSignals,
            ...confidenceReport,
            music_signals: lastfm?.music_signals || null
        };
    }

    // influencer, athlete, or fallback
    if (!instagram && !youtube) return null;

    const result = calculateInfluencerSignals(instagram, youtube, null);
    const confidenceReport = buildConfidenceReport(type, { instagram, youtube });

    return {
        name, type,
        instagram: instagram || null,
        youtube:   youtube   || null,
        ...result,
        ...confidenceReport
    };
};


// ===========================================================
// 🔹 STREAMABLE PROFILE BUILDER
// Returns the classified type + individual promises
// so the SSE route can emit events as each resolves.
//
// Flow:
//   Step 1: Classify type         (1s)
//   Step 2: All APIs in parallel  (max ~8s, was 15s sequential)
//   Step 3: Assemble signals      (instant)
//   Step 4: AI insights           (~8s)
//   Total: ~18s (was ~30s)
// ===========================================================
const getStreamableProfile = async (name, type = null) => {

    // ── Step 1: Classify (must run first) ──
    if (!type) {
        type = await classifyPersonType(name);
    }

    // ── Step 2: Build fetch promises based on type ──
    // We DON'T await these yet — caller controls when/how to consume
    const fetches = {
        instagram: safeFetch(() => getInstagramData(name), 'Instagram'),
    };

    if (type === 'actor') {
        fetches.actorData = safeFetch(() => getEnrichedActorData(name), 'TMDB+OMDb');
    }

    if (type === 'musician') {
        fetches.lastfm  = safeFetch(() => getLastFmData(name),  'Last.fm');
        fetches.youtube  = safeFetch(() => getYouTubeData(name), 'YouTube');
    }

    if (type === 'influencer' || type === 'athlete') {
        fetches.youtube = safeFetch(() => getYouTubeData(name), 'YouTube');
    }

    return { type, fetches };
};


// ===========================================================
// 🔹 MASTER AGGREGATOR — getCompleteProfile
// Non-streaming endpoint: /api/profile
// Now internally parallelized via Promise.allSettled
// Still returns a single complete JSON response
// ===========================================================
const getCompleteProfile = async (name, type = null) => {
    try {
        console.log(`\nAggregator: Starting profile for "${name}"`);

        // Step 1: Classify type if not provided
        if (!type) {
            console.log(`Aggregator: Classifying type for "${name}"...`);
            type = await classifyPersonType(name);
        }

        console.log(`Aggregator: Type = ${type}`);

        // Step 2: Run correct pipeline based on type
        let profileData = null;

        if      (type === 'actor')      profileData = await runActorPipeline(name);
        else if (type === 'influencer') profileData = await runInfluencerPipeline(name);
        else if (type === 'musician')   profileData = await runMusicianPipeline(name);
        else if (type === 'athlete')    profileData = await runAthletePipeline(name);
        else                            profileData = await runInfluencerPipeline(name);

        if (!profileData) {
            return { error: `No data found for "${name}"` };
        }

        // Step 3: Generate AI insights
        console.log(`Aggregator: Generating AI insights...`);

        const auraData = {
            aura_score:      profileData.aura_score,
            confidence:      profileData.confidence,
            confidence_meta: profileData.confidence_meta || null,
            aura_breakdown:  profileData.aura_breakdown,
            signals:         profileData.signals || profileData.signals
        };

        const insights = await generateInsights(profileData, auraData);

        // Step 4: Return complete unified profile
        return {
            ...profileData,
            ai_insights:  insights,
            generated_at: new Date().toISOString()
        };

    } catch (error) {
        console.error('Aggregator error:', error.message);
        return { error: error.message };
    }
};


// ===========================================================
// 🔹 NORMALIZATION LAYER — Maps any profile to 6 common dims
// This is what makes cross-type comparison possible.
// Actor reach uses TMDB popularity + Instagram followers
// Influencer reach uses YouTube subs + Instagram followers
// Same output shape, different input signals.
//
// All dimensions normalized to 0–100 scale.
// ===========================================================
const normalizeToCommonDimensions = (profileData) => {
    if (!profileData) return null;

    const { type, instagram, youtube, lastfm, signals, aura_score, aura_breakdown } = profileData;

    // ── Helper: clamp to 0–100 ──
    const clamp = (val) => Math.max(0, Math.min(100, Math.round(val)));

    // ── Helper: log-scale follower count to 0–100 ──
    // 1K=30, 10K=40, 100K=50, 1M=60, 10M=70, 100M=80, 1B=90
    const logFollowers = (count) => {
        if (!count || count <= 0) return 0;
        return clamp(Math.log10(count) * 10);
    };

    let reach = 0, engagement = 0, authenticity = 0;
    let momentum = 0, brandSafety = 0, commercialValue = 0;

    // ─────────────────────────────────────────────
    // REACH — how many people can they actually touch?
    // ─────────────────────────────────────────────
    if (type === 'actor') {
        const igReach   = logFollowers(instagram?.followers);
        const tmdbPop   = clamp((profileData.profile?.tmdb_popularity || 0) * 2);
        reach = clamp((igReach * 0.5) + (tmdbPop * 0.5));
    } else if (type === 'musician') {
        const igReach   = logFollowers(instagram?.followers);
        const lfmReach  = logFollowers(lastfm?.listeners);
        const ytReach   = logFollowers(youtube?.subscribers);
        reach = clamp((igReach * 0.35) + (lfmReach * 0.35) + (ytReach * 0.30));
    } else {
        // influencer, athlete
        const igReach   = logFollowers(instagram?.followers);
        const ytReach   = logFollowers(youtube?.subscribers);
        reach = clamp((igReach * 0.55) + (ytReach * 0.45));
    }

    // ─────────────────────────────────────────────
    // ENGAGEMENT — how deeply does audience connect?
    // ─────────────────────────────────────────────
    if (type === 'actor') {
        const igEng = instagram?.combined_engagement_rate || 0;
        // Actor engagement also factors in audience rating quality
        const ratingEng = ((signals?.avgIMDb || 0) / 10) * 100;
        engagement = clamp((igEng * 8) * 0.5 + ratingEng * 0.5);
    } else if (type === 'musician') {
        const igEng = instagram?.combined_engagement_rate || 0;
        const ytEng = youtube?.engagement_rate || 0;
        const playMomentum = (lastfm?.music_signals?.play_momentum || 0) * 10;
        engagement = clamp(((igEng * 8) * 0.35) + ((ytEng * 8) * 0.30) + (playMomentum * 0.35));
    } else {
        const igEng = instagram?.combined_engagement_rate || 0;
        const ytEng = youtube?.engagement_rate || 0;
        engagement = clamp(((igEng * 8) * 0.55) + ((ytEng * 8) * 0.45));
    }

    // ─────────────────────────────────────────────
    // AUTHENTICITY — how genuine is their following?
    // ─────────────────────────────────────────────
    if (type === 'actor') {
        // Actors have high inherent authenticity (public figures)
        const igAuth = instagram?.follower_following_ratio
            ? clamp(Math.log10(instagram.follower_following_ratio + 1) * 25)
            : 50;
        const ratingGap = signals?.ratingGap || 0;
        const gapScore = clamp(100 - (ratingGap * 15));
        authenticity = clamp((igAuth * 0.5) + (gapScore * 0.5));
    } else {
        // For influencer/musician/athlete — use signal engine's authenticity
        const rawAuth = profileData.signals?.authenticity || 0;
        authenticity = clamp(rawAuth * 10);
    }

    // ─────────────────────────────────────────────
    // MOMENTUM — are they growing or declining?
    // ─────────────────────────────────────────────
    if (type === 'actor') {
        const trendScore = (signals?.trend || 0) * 10;
        const igTrend = instagram?.reels_trend
            ? clamp(instagram.reels_trend * 50)
            : 50;
        momentum = clamp((trendScore * 0.6) + (igTrend * 0.4));
    } else if (type === 'musician') {
        const igTrend = instagram?.reels_trend ? clamp(instagram.reels_trend * 50) : 50;
        const ytTrend = youtube?.views_trend ? clamp(youtube.views_trend * 50) : 50;
        const playMomentum = (lastfm?.music_signals?.play_momentum || 5) * 10;
        momentum = clamp((igTrend * 0.30) + (ytTrend * 0.30) + (playMomentum * 0.40));
    } else {
        const igTrend = instagram?.reels_trend ? clamp(instagram.reels_trend * 50) : 50;
        const ytTrend = youtube?.views_trend ? clamp(youtube.views_trend * 50) : 50;
        momentum = clamp((igTrend * 0.55) + (ytTrend * 0.45));
    }

    // ─────────────────────────────────────────────
    // BRAND SAFETY — how risky are they for a brand?
    // Higher = safer (inverted risk)
    // ─────────────────────────────────────────────
    if (type === 'actor') {
        const hitRatio = (signals?.hitRatio || 0) * 100;
        const consistency = signals?.consistency !== null
            ? clamp(100 - (signals.consistency * 10))
            : 50;
        const igVerified = instagram?.is_verified ? 80 : 50;
        brandSafety = clamp((hitRatio * 0.4) + (consistency * 0.3) + (igVerified * 0.3));
    } else {
        const authScore = profileData.signals?.authenticity
            ? clamp(profileData.signals.authenticity * 10)
            : 50;
        const consistencyScore = profileData.signals?.consistency
            ? clamp(profileData.signals.consistency * 10)
            : 50;
        const igVerified = instagram?.is_verified ? 80 : 50;
        brandSafety = clamp((authScore * 0.35) + (consistencyScore * 0.35) + (igVerified * 0.30));
    }

    // ─────────────────────────────────────────────
    // COMMERCIAL VALUE — what's their market worth?
    // ─────────────────────────────────────────────
    if (type === 'actor') {
        const boxOffice = signals?.boxOffice?.combined
            ? clamp(Math.min(signals.boxOffice.combined / 5000000, 100))
            : 0;
        const roi = signals?.roi ? clamp(signals.roi / 3) : 0;
        commercialValue = clamp((boxOffice * 0.5) + (roi * 0.3) + (reach * 0.2));
    } else {
        // For non-actors, commercial value is derived from reach + engagement
        commercialValue = clamp((reach * 0.4) + (engagement * 0.35) + (authenticity * 0.25));
    }

    return {
        name:           profileData.name,
        type:           profileData.type,
        aura_score:     aura_score || 0,
        aura_breakdown: aura_breakdown || null,
        confidence:     profileData.confidence || 0,
        dimensions: {
            reach,
            engagement,
            authenticity,
            momentum,
            brand_safety:     brandSafety,
            commercial_value: commercialValue
        },
        // Overall dimension average (weighted)
        dimension_average: clamp(
            (reach * 0.20) +
            (engagement * 0.20) +
            (authenticity * 0.15) +
            (momentum * 0.15) +
            (brandSafety * 0.15) +
            (commercialValue * 0.15)
        )
    };
};


// ===========================================================
// 🔹 COMPARE PROFILES — Fetches two profiles in parallel
// Returns both raw profiles + normalized dimensions
// Ready for AI comparison layer
// ===========================================================
const compareProfiles = async (name1, name2, type1 = null, type2 = null) => {
    try {
        console.log(`\nComparison: "${name1}" vs "${name2}"`);

        // ── Step 1: Classify both in parallel if needed ──
        const [resolvedType1, resolvedType2] = await Promise.all([
            type1 ? Promise.resolve(type1) : classifyPersonType(name1),
            type2 ? Promise.resolve(type2) : classifyPersonType(name2)
        ]);

        console.log(`Comparison: Types → ${resolvedType1} vs ${resolvedType2}`);

        // ── Step 2: Fetch both profiles in parallel ──
        const [profile1, profile2] = await Promise.allSettled([
            getCompleteProfileForComparison(name1, resolvedType1),
            getCompleteProfileForComparison(name2, resolvedType2)
        ]);

        const p1 = profile1.status === 'fulfilled' ? profile1.value : null;
        const p2 = profile2.status === 'fulfilled' ? profile2.value : null;

        if (!p1 || p1.error) {
            return { error: `Could not fetch profile for "${name1}": ${p1?.error || 'unknown error'}` };
        }
        if (!p2 || p2.error) {
            return { error: `Could not fetch profile for "${name2}": ${p2?.error || 'unknown error'}` };
        }

        // ── Step 3: Normalize both to common dimensions ──
        const normalized1 = normalizeToCommonDimensions(p1);
        const normalized2 = normalizeToCommonDimensions(p2);

        return {
            profile1: p1,
            profile2: p2,
            normalized1,
            normalized2
        };

    } catch (error) {
        console.error('Comparison error:', error.message);
        return { error: error.message };
    }
};


// ─────────────────────────────────────────────
// Internal helper — gets a profile without AI insights
// (AI comparison generates its own insights)
// This is faster since we skip the single-profile AI call
// ─────────────────────────────────────────────
const getCompleteProfileForComparison = async (name, type) => {
    try {
        let profileData = null;

        if      (type === 'actor')      profileData = await runActorPipeline(name);
        else if (type === 'influencer') profileData = await runInfluencerPipeline(name);
        else if (type === 'musician')   profileData = await runMusicianPipeline(name);
        else if (type === 'athlete')    profileData = await runAthletePipeline(name);
        else                            profileData = await runInfluencerPipeline(name);

        if (!profileData) {
            return { error: `No data found for "${name}"` };
        }

        return profileData;

    } catch (error) {
        console.error(`Profile fetch failed for "${name}":`, error.message);
        return { error: error.message };
    }
};


module.exports = {
    getCompleteProfile,
    getStreamableProfile,
    assembleProfile,
    normalizeToCommonDimensions,
    compareProfiles
};