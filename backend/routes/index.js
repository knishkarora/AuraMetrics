const express = require('express');
const router = express.Router();

const { getYouTubeData }    = require('../services/youtubeService');
const { getInstagramData }  = require('../services/instagramService');

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

// Instagram test route
router.get('/test/instagram', async (req, res) => {
  const { name } = req.query;
  const data = await getInstagramData(name);
  res.json(data);
});

module.exports = router;