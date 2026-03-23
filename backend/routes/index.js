const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'AuraMetric backend is alive' });
});

module.exports = router;