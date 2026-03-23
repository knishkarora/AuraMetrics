const axios = require('axios');

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const BASE_URL = 'https://www.googleapis.com/youtube/v3';

// ─────────────────────────────────────────────
// STEP 1: Search YouTube by name → get channel ID
// We use 'search' endpoint with type=channel
// maxResults=1 because we want the top match only
// ─────────────────────────────────────────────
const searchChannel = async (name) => {
  const response = await axios.get(`${BASE_URL}/search`, {
    params: {
      part: 'snippet',
      q: name,
      type: 'channel',
      maxResults: 1,
      key: YOUTUBE_API_KEY
    }
  });

  const items = response.data.items;

  // If no channel found, return null gracefully
  if (!items || items.length === 0) return null;

  return items[0].snippet.channelId;
};

// ─────────────────────────────────────────────
// STEP 2: Get core channel stats + metadata
// 'statistics' → subscriber/view/video counts
// 'snippet'    → name, country, published date
// ─────────────────────────────────────────────
const getChannelStats = async (channelId) => {
  const response = await axios.get(`${BASE_URL}/channels`, {
    params: {
      part: 'statistics,snippet',
      id: channelId,
      key: YOUTUBE_API_KEY
    }
  });

  const channel = response.data.items[0];

  return {
    name: channel.snippet.title,
    subscribers: parseInt(channel.statistics.subscriberCount),
    total_views: parseInt(channel.statistics.viewCount),
    video_count: parseInt(channel.statistics.videoCount),

    // Channel age helps calculate upload frequency + trust score
    published_at: channel.snippet.publishedAt,

    // Country useful for regional reach analysis later
    country: channel.snippet.country || 'N/A'
  };
};

// ─────────────────────────────────────────────
// STEP 3: Fetch last 10 videos → calculate avg stats
// We fetch video IDs first via search, then batch-fetch
// their statistics in one API call (more quota efficient)
// contentDetails gives us duration for future use
// ─────────────────────────────────────────────
const getVideoStats = async (channelId) => {
  // First get the last 10 video IDs
  const searchResponse = await axios.get(`${BASE_URL}/search`, {
    params: {
      part: 'id',
      channelId: channelId,
      order: 'date',        // most recent first
      maxResults: 10,
      type: 'video',
      key: YOUTUBE_API_KEY
    }
  });

  const videoIds = searchResponse.data.items
    .map(v => v.id.videoId)
    .join(',');             // API accepts comma-separated IDs

  // Batch fetch stats for all 10 videos in one call
  const statsResponse = await axios.get(`${BASE_URL}/videos`, {
    params: {
      part: 'statistics,contentDetails,snippet',
      id: videoIds,
      key: YOUTUBE_API_KEY
    }
  });

  const items = statsResponse.data.items;

  // Helper: calculate average of a number array
  const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  const avgViews    = avg(items.map(v => parseInt(v.statistics.viewCount    || 0)));
  const avgLikes    = avg(items.map(v => parseInt(v.statistics.likeCount    || 0)));
  const avgComments = avg(items.map(v => parseInt(v.statistics.commentCount || 0)));

  // Last upload date → used in confidence meter (inactive channels score lower)
  const lastUploadDate = items[0]?.snippet?.publishedAt || null;

  // ─────────────────────────────────────────────
  // Views trend: compare last 5 vs previous 5
  // Ratio > 1.0 = growing channel
  // Ratio < 1.0 = declining channel
  // This is a key signal for reach quality
  // ─────────────────────────────────────────────
  const recentViews = items.slice(0, 5).map(v => parseInt(v.statistics.viewCount || 0));
  const olderViews  = items.slice(5, 10).map(v => parseInt(v.statistics.viewCount || 0));

  const recentAvg = avg(recentViews);
  const olderAvg  = avg(olderViews);

  // Avoid division by zero if older videos don't exist
  const viewsTrend = olderAvg > 0
    ? parseFloat((recentAvg / olderAvg).toFixed(2))
    : null;

return {
    avg_views:        avgViews,
    avg_likes:        avgLikes,
    avg_comments:     avgComments,
    last_upload_date: lastUploadDate,
    views_trend:      viewsTrend    
  };
};

// ─────────────────────────────────────────────
// STEP 4: Calculate derived metrics
// These feed directly into the algorithm layer (Phase 2)
// All formulas are our own — key interview talking point
// ─────────────────────────────────────────────
const calculateDerivedMetrics = (stats, videoStats) => {

  // Engagement Rate = (likes + comments) ÷ views × 100
  // Measures how actively audience interacts per view
  const engagementRate = videoStats.avg_views > 0
    ? parseFloat((
        (videoStats.avg_likes + videoStats.avg_comments)
        / videoStats.avg_views * 100
      ).toFixed(2))
    : 0;

  // View-to-Subscriber Ratio = avg views ÷ subscribers × 100
  // CRITICAL for mismatch detection:
  // If someone has 10M subs but only 50K avg views → suspicious
  // Healthy range: 10–40% | Suspicious: below 3%
  const viewToSubRatio = stats.subscribers > 0
    ? parseFloat((
        videoStats.avg_views / stats.subscribers * 100
      ).toFixed(2))
    : 0;

  // Channel age in months → used for upload frequency calculation
  const channelAgeMonths = stats.published_at
    ? Math.floor(
        (new Date() - new Date(stats.published_at))
        / (1000 * 60 * 60 * 24 * 30)
      )
    : null;

  // Upload frequency = total videos ÷ channel age in months
  // Active creators score higher in confidence meter
  const uploadFrequency = channelAgeMonths > 0
    ? parseFloat((stats.video_count / channelAgeMonths).toFixed(2))
    : null;

  return {
    engagement_rate: engagementRate,     // % — higher is better
    view_to_sub_ratio: viewToSubRatio,   // % — mismatch detection
    channel_age_months: channelAgeMonths,
    upload_frequency: uploadFrequency    // videos/month
  };
};

// ─────────────────────────────────────────────
// MASTER FUNCTION — called by aggregator later
// Takes a name → returns complete YouTube profile
// Returns null if channel not found (handled upstream)
// ─────────────────────────────────────────────
const getYouTubeData = async (name) => {
  try {
    // Resolve name → channel ID
    const channelId = await searchChannel(name);
    if (!channelId) {
      console.log(`YouTube: No channel found for "${name}"`);
      return null;
    }

    // Fetch base stats and video stats in parallel for speed
    const [stats, videoStats] = await Promise.all([
      getChannelStats(channelId),
      getVideoStats(channelId)
    ]);

    // Calculate derived metrics for algorithm layer
    const derived = calculateDerivedMetrics(stats, videoStats);

    // Return clean unified object
    return {
      channel_id: channelId,
      ...stats,
      ...videoStats,
      ...derived
    };

  } catch (error) {
    console.error('YouTube service error:', error.message);
    return null;
  }
};

module.exports = { getYouTubeData };