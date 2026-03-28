const express = require('express');
const router = express.Router();

const { getYouTubeData }    = require('../services/youtubeService');
const { getInstagramData }  = require('../services/instagramService');
const { getTMDBData }       = require('../services/tmdbService');
const { getMovieDetails }   = require('../services/omdbService');
const { getEnrichedActorData } = require('../services/enrichmentService');
const { calculateInfluencerSignals } = require('../services/influencerSignalService');
const { getLastFmData } = require('../services/lastfmService');

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'AuraMetric backend is alive' });
});


// YouTube test route
router.get('/test/youtube', async (req, res) => {
  const { name } = req.query;
  const data = await getYouTubeData(name);
  res.json(data);
});


// TMDB test route
router.get('/test/tmdb', async (req, res) => {
  const { name } = req.query;
  const data = await getTMDBData(name);
  res.json(data);
});


// Instagram test route
router.get('/test/instagram', async (req, res) => {
  const { name } = req.query;
  const data = await getInstagramData(name);
  res.json(data);
});


// ===========================================================
// 🔹 OMDb TEST ROUTE
// Example: /api/test/omdb?title=Inception&year=2010
// ===========================================================
router.get('/test/omdb', async (req, res) => {
  try {
    const { title, year } = req.query;

    // 🔹 Basic validation
    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Please provide a movie title"
      });
    }

    // 🔹 Call OMDb service (clean architecture)
    const data = await getMovieDetails(title, year);

    // 🔹 Handle not found
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Movie not found"
      });
    }

    return res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error("OMDb Route Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Server error while fetching OMDb data"
    });
  }
});

// ===========================================================
// 🔹 ENRICHED DATA ROUTE
// Example: /api/test/enriched?name=Leonardo DiCaprio
// ===========================================================

router.get('/test/enriched', async (req, res) => {
  try {
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Please provide an actor name"
      });
    }

    const data = await getEnrichedActorData(name);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "No data found"
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error("Enriched Route Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});



const { generateInsights } = require('../services/aiService');

router.get('/test/ai', async (req, res) => {
  const { name, type } = req.query;

  // Mock profile + aura data for testing
  // Replace with real aggregator data later
  const mockProfileData = {
    name: name || "Shah Rukh Khan",
    type: type || "actor",
    instagram: {
      followers:               275000000,
      post_engagement_rate:    3.53,
      reels_avg_views:         56000000,
      reels_trend:             1.52,
      combined_engagement_rate: 6.07,
      follower_following_ratio: 964971
    },
    youtube: null,
    tmdb: {
      recent_movies:           [{ title: "Dunki" }, { title: "Jawan" }],
      avg_box_office_revenue:  400000000,
      avg_audience_rating:     6.8,
      box_office_trend:        1.2,
      commercial_reliability:  80
    },
    lastfm: null
  };

  const mockAuraData = {
    aura_score:     84,
    confidence:     91,
    aura_breakdown: {
      quality:     88,
      business:    79,
      recognition: 95,
      momentum:    86,
      stability:   81
    },
    signals: {
      avg_imdb_rating:    7.2,
      hit_ratio:          0.8,
      roi_efficiency:     180
    }
  };

  const insights = await generateInsights(mockProfileData, mockAuraData);
  res.json(insights);
});

const { classifyPersonType } = require('../services/classifierService');

router.get('/test/classify', async (req, res) => {
    const { name } = req.query;

    if (!name) return res.status(400).json({ error: 'Name is required' });

    const type = await classifyPersonType(name);
    res.json({ name, type });
});


router.get('/test/influencer-signals', async (req, res) => {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    // Fetch all platforms in parallel
    const [instagram, youtube, lastfm] = await Promise.all([
        getInstagramData(name),
        getYouTubeData(name),
        getLastFmData(name)
    ]);

    const result = calculateInfluencerSignals(instagram, youtube, lastfm);

    res.json({
        name,
        instagram_found: !!instagram,
        youtube_found:   !!youtube,
        lastfm_found:    !!lastfm,
        ...result
    });
});

router.get('/test/lastfm', async (req, res) => {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const data = await getLastFmData(name);
    if (!data) return res.status(404).json({ error: `No artist found for "${name}"` });

    res.json(data);
});

const { getCompleteProfile } = require('../services/aggregatorService');

// ─────────────────────────────────────────────
// MASTER PROFILE ROUTE — the main endpoint
// GET /api/profile?name=Virat Kohli
// GET /api/profile?name=Shah Rukh Khan&type=actor
// type is optional — Groq classifies if not provided
// ─────────────────────────────────────────────
router.get('/profile', async (req, res) => {
    const { name, type } = req.query;

    if (!name) return res.status(400).json({ error: 'Name is required' });

    console.log(`Profile request: ${name} (${type || 'auto-classify'})`);

    const profile = await getCompleteProfile(name, type || null);

    if (profile.error) {
        return res.status(404).json(profile);
    }

    res.json(profile);
});

router.get('/profile/stream', async (req, res) => {
    const { name, type } = req.query;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    // ─────────────────────────────────────────────
    // SSE Headers — keeps connection open
    // Frontend receives events as they arrive
    // ─────────────────────────────────────────────
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    // Helper — sends one event to frontend
    const send = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        // ── STEP 1: Classify type ──
        send('status', { message: 'Identifying profile type...' });
        const resolvedType = type || await classifyPersonType(name);
        send('type', { type: resolvedType });

        // ── STEP 2: Run platform fetches based on type ──
        send('status', { message: 'Fetching Instagram data...' });
        const instagram = await getInstagramData(name);
        if (instagram) send('instagram', instagram);

        if (resolvedType === 'actor') {
            send('status', { message: 'Fetching film data...' });
            const actorData = await getEnrichedActorData(name);
            if (actorData) send('actor', actorData);

        } else if (resolvedType === 'musician') {
            send('status', { message: 'Fetching music data...' });
            const lastfm = await getLastFmData(name);
            if (lastfm) send('lastfm', lastfm);

            send('status', { message: 'Fetching YouTube data...' });
            const youtube = await getYouTubeData(name);
            if (youtube) send('youtube', youtube);

        } else {
            // influencer or athlete
            send('status', { message: 'Fetching YouTube data...' });
            const youtube = await getYouTubeData(name);
            if (youtube) send('youtube', youtube);
        }

        // ── STEP 3: Signals ──
        send('status', { message: 'Calculating signals...' });

        // ── STEP 4: AI Insights ──
        send('status', { message: 'Generating AI insights...' });

        // ── STEP 5: Complete profile via aggregator ──
        const profile = await getCompleteProfile(name, resolvedType);
        send('signals',  { aura_score: profile.aura_score, aura_breakdown: profile.aura_breakdown, confidence: profile.confidence, confidence_meta: profile.confidence_meta || null, signals: profile.signals });
        send('insights', profile.ai_insights);

        // ── DONE ──
        send('done', { message: 'Complete' });
        res.end();

    } catch (error) {
        send('error', { message: error.message });
        res.end();
    }
});

module.exports = router;