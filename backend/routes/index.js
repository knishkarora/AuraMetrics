const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'AuraMetric backend is alive' });
});

const { getYouTubeData } = require('../services/youtubeService');

router.get('/test/youtube', async (req, res) => {
  const { name } = req.query;
  const data = await getYouTubeData(name);
  res.json(data);
});

module.exports = router;