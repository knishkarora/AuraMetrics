const axios = require('axios');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// ─────────────────────────────────────────────
// instagram-looter2 — all GET requests
// Flow: name → username → userID → all data
// ─────────────────────────────────────────────
const BASE_URL = 'https://instagram-looter2.p.rapidapi.com';

const HEADERS = {
  'x-rapidapi-key':  RAPIDAPI_KEY,
  'x-rapidapi-host': 'instagram-looter2.p.rapidapi.com',
  'Content-Type':    'application/json'
};

// ─────────────────────────────────────────────
// STEP 1: Search by name → get username
// select: 'users' filters out hashtags/places
// ─────────────────────────────────────────────
const searchInstagramUser = async (name) => {
  const response = await axios.get(`${BASE_URL}/search`, {
    params:  { query: name, select: 'users' },
    headers: HEADERS
  });

  const users = response.data?.users;
  if (!users || users.length === 0) return null;

  // Pick verified user first, fallback to top result
  const verifiedUser = users.find(u => u.user?.is_verified);
  const topUser = verifiedUser || users[0];

  return topUser.user.username;
};

// ─────────────────────────────────────────────
// STEP 2: Username → User ID
// Needed for posts, reels, related profiles
// ─────────────────────────────────────────────
const getUserId = async (username) => {
  const response = await axios.get(`${BASE_URL}/id`, {
    params:  { username },
    headers: HEADERS
  });

  return response.data?.user_id || null;
};

// ─────────────────────────────────────────────
// STEP 3: Core profile — basic signals
// ─────────────────────────────────────────────
const getInstagramProfile = async (username) => {
  const response = await axios.get(`${BASE_URL}/profile`, {
    params:  { username },
    headers: HEADERS
  });

  const user = response.data;
  if (!user) return null;

  return {
    username:     user.username,
    full_name:    user.full_name,
    followers:    user.edge_followed_by?.count || user.follower_count,
    following:    user.edge_follow?.count      || user.following_count,
    post_count:   user.edge_owner_to_timeline_media?.count || user.media_count,
    is_verified:  user.is_verified,
    is_business:  user.is_business_account || false,
    is_private:   user.is_private          || false,
    biography:    user.biography           || '',
    external_url: user.external_url        || null,

    // Category label e.g "Athlete", "Actor", "Musician"
    // Very useful for AuraMetric profile classification
    category:     user.category_name       || null
  };
};

// ─────────────────────────────────────────────
// STEP 4: Web profile — extended signals
// Has additional data not in basic profile
// like pronouns, profile pic URL, highlight count
// ─────────────────────────────────────────────
const getWebProfile = async (username) => {
  try {
    const response = await axios.get(`${BASE_URL}/web-profile`, {
      params:  { username },
      headers: HEADERS
    });

    const user = response.data?.data?.user;
    if (!user) return null;

    return {
      // Profile pic for UI display
      profile_pic_url: user.profile_pic_url_hd || null,

      // Highlight count — active story creators score higher
      highlight_count: user.highlight_reel_count || 0,

      // Connected Facebook page — cross platform signal
      connected_fb_page: user.connected_fb_page || null
    };
  } catch {
    // Non-critical — don't fail if this endpoint errors
    return null;
  }
};

// ─────────────────────────────────────────────
// STEP 5: Posts engagement
// Last 12 posts = industry standard benchmark
// ─────────────────────────────────────────────
const getPostEngagement = async (userId) => {
  const response = await axios.get(`${BASE_URL}/user-feeds`, {
    params: {
      id:                     userId,
      count:                  '12',
      allow_restricted_media: 'false'
    },
    headers: HEADERS
  });

  const posts = response.data?.items
    || response.data?.edges
    || response.data?.edge_owner_to_timeline_media?.edges;

  if (!posts || posts.length === 0) return null;

  // Handle both {node: {...}} and direct item structures
  const recentPosts = posts.slice(0, 12).map(p => p.node || p);
  const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  const avgLikes    = avg(recentPosts.map(p =>
    p.edge_liked_by?.count || p.like_count    || 0
  ));
  const avgComments = avg(recentPosts.map(p =>
    p.edge_media_to_comment?.count || p.comment_count || 0
  ));

  const lastPostDate = recentPosts[0]?.taken_at_timestamp
    ? new Date(recentPosts[0].taken_at_timestamp * 1000).toISOString()
    : recentPosts[0]?.taken_at
    ? new Date(recentPosts[0].taken_at  * 1000).toISOString()
    : null;

  // ─────────────────────────────────────────────
  // Trend: compare last 6 vs previous 6 posts
  // Ratio > 1.0 = engagement growing
  // ─────────────────────────────────────────────
  const recentLikes = recentPosts.slice(0, 6).map(p  => p.edge_liked_by?.count || p.like_count || 0);
  const olderLikes  = recentPosts.slice(6, 12).map(p => p.edge_liked_by?.count || p.like_count || 0);
  const postsTrend  = avg(olderLikes) > 0
    ? parseFloat((avg(recentLikes) / avg(olderLikes)).toFixed(2))
    : null;

  return { avgLikes, avgComments, lastPostDate, postsTrend };
};

// ─────────────────────────────────────────────
// STEP 6: Reels engagement
// View count is unique to reels — key reach signal
// Reels reach beyond followers via explore page
// ─────────────────────────────────────────────
const getReelsEngagement = async (userId) => {
  const response = await axios.get(`${BASE_URL}/reels`, {
    params: { id: userId, count: '12' },
    headers: HEADERS
  });

  const items = response.data?.items;
  if (!items || items.length === 0) return null;

  // Each item has a nested 'media' object — extract that
  const reels = items.map(item => item.media || item);
  const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  // play_count = views, like_count and comment_count are direct fields
  const avgViews    = avg(reels.map(r => r.play_count    || 0));
  const avgLikes    = avg(reels.map(r => r.like_count    || 0));
  const avgComments = avg(reels.map(r => r.comment_count || 0));

  // Trend: compare first 6 vs last 6 reels
  const recentViews = reels.slice(0, 6).map(r  => r.play_count || 0);
  const olderViews  = reels.slice(6, 12).map(r => r.play_count || 0);
  const reelsTrend  = avg(olderViews) > 0
    ? parseFloat((avg(recentViews) / avg(olderViews)).toFixed(2))
    : null;

  return { avgViews, avgLikes, avgComments, reelsTrend };
};

// ─────────────────────────────────────────────
// STEP 7: Related profiles
// Similar accounts signal — tells us who Instagram
// thinks this person is comparable to
// Useful for competitor context in Phase 3 AI layer
// ─────────────────────────────────────────────
const getRelatedProfiles = async (userId) => {
  try {
    const response = await axios.get(`${BASE_URL}/related-profiles`, {
      params:  { id: userId },
      headers: HEADERS
    });

    const related = response.data?.users;
    if (!related) return [];

    return related.slice(0, 5).map(u => ({
      username:  u.username,
      followers: u.follower_count,
      verified:  u.is_verified
    }));
  } catch {
    return [];
  }
};

// ─────────────────────────────────────────────
// STEP 8: All derived metrics
// These feed directly into Phase 2 algorithm
// ─────────────────────────────────────────────
const calculateDerivedMetrics = (profile, postEng, reelsEng) => {

  // Post engagement rate = (likes + comments) ÷ followers × 100
  const postEngagementRate = profile.followers > 0 && postEng
    ? parseFloat((
        (postEng.avgLikes + postEng.avgComments)
        / profile.followers * 100
      ).toFixed(2))
    : 0;

  // Reels engagement = (likes + comments) ÷ views × 100
  // Uses views not followers — reels reach beyond followers
  const reelsEngagementRate = reelsEng?.avgViews > 0
    ? parseFloat((
        (reelsEng.avgLikes + reelsEng.avgComments)
        / reelsEng.avgViews * 100
      ).toFixed(2))
    : 0;

  // Reels reach ratio = views ÷ followers × 100
  // Above 100% = content reaching beyond follower base
  const reelsReachRatio = profile.followers > 0 && reelsEng
    ? parseFloat((
        reelsEng.avgViews / profile.followers * 100
      ).toFixed(2))
    : 0;

  // Follower-following ratio — organic authority signal
  // Very high = people follow them naturally
  const followerFollowingRatio = profile.following > 0
    ? parseFloat((profile.followers / profile.following).toFixed(2))
    : null;

  // Combined engagement — posts 40% + reels 60%
  // Reels weighted higher since they drive more reach in 2025
  const combinedEngagementRate = parseFloat((
    (postEngagementRate * 0.4) + (reelsEngagementRate * 0.6)
  ).toFixed(2));

  // Overall activity score — private + inactive accounts score lower
  // in confidence meter
  const isActive = !profile.is_private;

  return {
    post_engagement_rate:     postEngagementRate,
    reels_engagement_rate:    reelsEngagementRate,
    reels_reach_ratio:        reelsReachRatio,
    follower_following_ratio: followerFollowingRatio,
    combined_engagement_rate: combinedEngagementRate,
    posts_trend:              postEng?.postsTrend  || null,
    reels_trend:              reelsEng?.reelsTrend || null,
    is_active_public:         isActive
  };
};

// ─────────────────────────────────────────────
// MASTER FUNCTION — called by aggregator later
// Flow: name → username → userID → all data
// ─────────────────────────────────────────────
const getInstagramData = async (name) => {
  try {
    // Resolve name → username
    const username = await searchInstagramUser(name);
    if (!username) {
      console.log(`Instagram: No user found for "${name}"`);
      return null;
    }

    // Resolve username → user ID
    const userId = await getUserId(username);
    if (!userId) {
      console.log(`Instagram: Could not get user ID for "${username}"`);
      return null;
    }

    // Fetch profile first — needed for derived metrics
    const profile = await getInstagramProfile(username);
    if (!profile) return null;

    // Fetch everything else in parallel for speed
    const [webProfile, postEng, reelsEng, relatedProfiles] = await Promise.all([
      getWebProfile(username),
      getPostEngagement(userId),
      getReelsEngagement(userId),
      getRelatedProfiles(userId)
    ]);

    const derived = calculateDerivedMetrics(profile, postEng, reelsEng);

    return {
      // Core profile
      ...profile,

      // Extended profile
      profile_pic_url:   webProfile?.profile_pic_url  || null,
      highlight_count:   webProfile?.highlight_count  || 0,
      connected_fb_page: webProfile?.connected_fb_page || null,

      // Post stats
      post_avg_likes:    postEng?.avgLikes    || 0,
      post_avg_comments: postEng?.avgComments || 0,
      last_post_date:    postEng?.lastPostDate || null,

      // Reels stats
      reels_avg_views:    reelsEng?.avgViews    || 0,
      reels_avg_likes:    reelsEng?.avgLikes    || 0,
      reels_avg_comments: reelsEng?.avgComments || 0,

      // Related profiles — for Phase 3 AI context
      related_profiles: relatedProfiles,

      // All derived metrics
      ...derived
    };

  } catch (error) {
    console.error('Instagram service error:', error.message);
    return null;
  }
};

module.exports = { getInstagramData };
