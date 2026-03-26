const express = require('express');
const router = express.Router();

const { getYouTubeData }    = require('../services/youtubeService');
const { getInstagramData }  = require('../services/instagramService');
const { getTMDBData }       = require('../services/tmdbService');
const { getMovieDetails }   = require('../services/omdbService');
const { getEnrichedActorData } = require('../services/enrichmentService');
const { getSpotifyToken, getSpotifyArtistData } = require('../services/spotifyService');

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

module.exports = router;