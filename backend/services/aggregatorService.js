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
// ACTOR PIPELINE
// TMDB + OMDb enrichment → signals → Aura Score
// ─────────────────────────────────────────────
const runActorPipeline = async (name) => {
    console.log(`Aggregator: Running actor pipeline for "${name}"`);

    // Fetch enriched actor data (TMDB + OMDb merged)
    const actorData = await getEnrichedActorData(name);
    if (!actorData) return null;

    // Fetch Instagram in parallel — actors have social too
    const instagram = await getInstagramData(name);

    const movies = actorData.recent_movies || [];

    // ─────────────────────────────────────────────
    // Calculate all actor signals
    // ─────────────────────────────────────────────
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

    // ─────────────────────────────────────────────
    // Confidence Meter — cross-platform validation
    // Replaces old simple counter with full report
    // ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// INFLUENCER PIPELINE
// Instagram + YouTube → signals → Aura Score
// ─────────────────────────────────────────────
const runInfluencerPipeline = async (name) => {
    console.log(`Aggregator: Running influencer pipeline for "${name}"`);

    // Fetch all platforms in parallel
    const [instagram, youtube] = await Promise.all([
        getInstagramData(name),
        getYouTubeData(name)
    ]);

    if (!instagram && !youtube) return null;

    const result = calculateInfluencerSignals(instagram, youtube, null);

    // Build confidence report — replaces simple platform counter
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

// ─────────────────────────────────────────────
// MUSICIAN PIPELINE
// Last.fm + Instagram + YouTube → signals → Aura Score
// ─────────────────────────────────────────────
const runMusicianPipeline = async (name) => {
    console.log(`Aggregator: Running musician pipeline for "${name}"`);

    // Fetch all platforms in parallel
    const [lastfm, instagram, youtube] = await Promise.all([
        getLastFmData(name),
        getInstagramData(name),
        getYouTubeData(name)
    ]);

    if (!lastfm && !instagram && !youtube) return null;

    // Musicians use influencer signals + music signals combined
    const socialSignals = calculateInfluencerSignals(instagram, youtube, null);

    // Build confidence report — covers all 3 platforms
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

        // Music specific signals on top
        music_signals: lastfm?.music_signals || null
    };
};

// ─────────────────────────────────────────────
// ATHLETE PIPELINE
// Instagram + YouTube → signals → Aura Score
// Athletes use same pipeline as influencers
// TMDB only if they've appeared in films
// ─────────────────────────────────────────────
const runAthletePipeline = async (name) => {
    console.log(`Aggregator: Running athlete pipeline for "${name}"`);

    const [instagram, youtube] = await Promise.all([
        getInstagramData(name),
        getYouTubeData(name)
    ]);

    if (!instagram && !youtube) return null;

    const result = calculateInfluencerSignals(instagram, youtube, null);

    // Build confidence report
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

// ─────────────────────────────────────────────
// MASTER AGGREGATOR FUNCTION
// 1. Classify type via Groq (if not provided)
// 2. Run correct pipeline
// 3. Generate AI insights
// 4. Return complete profile
// ─────────────────────────────────────────────
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

module.exports = { getCompleteProfile };