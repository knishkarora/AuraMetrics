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

const { getCompleteProfile, assembleProfile } = require('../services/aggregatorService');

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
        const startTime = Date.now();

        // ══════════════════════════════════════════
        // STEP 1: Classify type (must run first)
        // ~1s via Groq — determines which APIs to call
        // ══════════════════════════════════════════
        send('status', { message: 'Identifying profile type...' });
        const resolvedType = type || await classifyPersonType(name);
        send('type', { type: resolvedType });
        console.log(`SSE: Type resolved to "${resolvedType}" in ${Date.now() - startTime}ms`);

        // ══════════════════════════════════════════
        // STEP 2: Fire ALL APIs simultaneously
        // Promise.allSettled — if one fails, others
        // still complete and stream their data
        // This is where 10-12s is saved
        // ══════════════════════════════════════════
        send('status', { message: 'Fetching data from all platforms...' });

        // ── Build platform fetch list based on type ──
        const fetchMap = {};
        let fetchPromises = {};

        // Instagram — always fetched for every type
        fetchPromises.instagram = getInstagramData(name)
            .then(data => { fetchMap.instagram = data; return data; })
            .catch(err => { console.error('SSE [Instagram] error:', err.message); fetchMap.instagram = null; return null; });

        // YouTube — needed for influencer, musician, athlete
        if (resolvedType !== 'actor') {
            fetchPromises.youtube = getYouTubeData(name)
                .then(data => { fetchMap.youtube = data; return data; })
                .catch(err => { console.error('SSE [YouTube] error:', err.message); fetchMap.youtube = null; return null; });
        }

        // TMDB + OMDb enrichment — actors only
        if (resolvedType === 'actor') {
            fetchPromises.actorData = getEnrichedActorData(name)
                .then(data => { fetchMap.actorData = data; return data; })
                .catch(err => { console.error('SSE [TMDB+OMDb] error:', err.message); fetchMap.actorData = null; return null; });
        }

        // Last.fm — musicians only
        if (resolvedType === 'musician') {
            fetchPromises.lastfm = getLastFmData(name)
                .then(data => { fetchMap.lastfm = data; return data; })
                .catch(err => { console.error('SSE [Last.fm] error:', err.message); fetchMap.lastfm = null; return null; });
        }

        // ── Stream each result as it arrives ──
        // Convert to individual streaming promises
        const streamingPromises = Object.entries(fetchPromises).map(
            ([key, promise]) => promise.then(data => {
                if (data) {
                    // Map internal key names to SSE event names
                    const eventName = key === 'actorData' ? 'actor' : key;
                    send(eventName, data);
                    console.log(`SSE: [${key}] streamed in ${Date.now() - startTime}ms`);
                } else {
                    console.log(`SSE: [${key}] returned null — skipped`);
                }
            })
        );

        // Wait for ALL to complete (they're running in parallel)
        await Promise.allSettled(streamingPromises);
        console.log(`SSE: All APIs done in ${Date.now() - startTime}ms`);

        // ══════════════════════════════════════════
        // STEP 3: Calculate signals + confidence
        // Uses already-fetched data — no re-fetch
        // Instant — pure math
        // ══════════════════════════════════════════
        send('status', { message: 'Calculating signals...' });

        const profileData = assembleProfile(name, resolvedType, {
            instagram: fetchMap.instagram || null,
            youtube:   fetchMap.youtube   || null,
            lastfm:    fetchMap.lastfm    || null,
            actorData: fetchMap.actorData || null
        });

        if (!profileData) {
            send('error', { message: `No usable data found for "${name}"` });
            res.end();
            return;
        }

        // Send signals + confidence to frontend
        send('signals', {
            aura_score:      profileData.aura_score,
            aura_breakdown:  profileData.aura_breakdown,
            confidence:      profileData.confidence,
            confidence_meta: profileData.confidence_meta || null,
            signals:         profileData.signals
        });
        console.log(`SSE: Signals calculated in ${Date.now() - startTime}ms`);

        // ══════════════════════════════════════════
        // STEP 4: AI Insights (must run last)
        // Needs all data + signals before generating
        // ~8s via NVIDIA NIM
        // ══════════════════════════════════════════
        send('status', { message: 'Generating AI insights...' });

        const auraData = {
            aura_score:      profileData.aura_score,
            confidence:      profileData.confidence,
            confidence_meta: profileData.confidence_meta || null,
            aura_breakdown:  profileData.aura_breakdown,
            signals:         profileData.signals
        };

        const insights = await generateInsights(profileData, auraData);
        send('insights', insights);
        console.log(`SSE: AI insights done in ${Date.now() - startTime}ms`);

        // ══════════════════════════════════════════
        // DONE — close stream
        // ══════════════════════════════════════════
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        send('done', { message: 'Complete', total_time: `${totalTime}s` });
        console.log(`SSE: Complete profile for "${name}" in ${totalTime}s`);
        res.end();

    } catch (error) {
        send('error', { message: error.message });
        res.end();
    }
});

module.exports = router;