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


module.exports = { getCompleteProfile, getStreamableProfile, assembleProfile };