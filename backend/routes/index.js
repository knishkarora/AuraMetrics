const express = require('express');
const router = express.Router();

const { getYouTubeData }    = require('../services/youtubeService');
const { getInstagramData }  = require('../services/instagramService');
const { getTMDBData }       = require('../services/tmdbService');
const { getMovieDetails }   = require('../services/omdbService');
const { getEnrichedActorData } = require('../services/enrichmentService');
const { getSpotifyToken, getSpotifyArtistData } = require('../services/spotifyService');
const { calculateSpotifySignals } = require('../services/spotifySignalService');
const { calculateInfluencerSignals } = require('../services/influencerSignalService');

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

// Spotify test route
router.get('/test/spotify-token', async (req, res) => {
  const token = await getSpotifyToken();
  res.json({ token });
});

// Spotify artist test route
router.get('/test/spotify', async (req, res) => {
  const { name } = req.query;

  const data = await getSpotifyArtistData(name);

  res.json(data);
});

// Spotify signals test route
router.get('/test/spotify-signals', async (req, res) => {
  const { name } = req.query;

  const artistData = await getSpotifyArtistData(name);
  const signals = calculateSpotifySignals(artistData);

  res.json({
    artist: artistData,
    signals
  });
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
    spotify: null
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

    // Fetch both platforms in parallel
    const [instagram, youtube] = await Promise.all([
        getInstagramData(name),
        getYouTubeData(name)
    ]);

    const result = calculateInfluencerSignals(instagram, youtube, null);

    res.json({
        name,
        instagram_found: !!instagram,
        youtube_found:   !!youtube,
        ...result
    });
});
module.exports = router;