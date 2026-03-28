const axios = require('axios');

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

// ─────────────────────────────────────────────
// All Last.fm requests use same base params
// format=json prevents XML response
// ─────────────────────────────────────────────
const baseParams = {
    api_key: LASTFM_API_KEY,
    format:  'json'
};

// ─────────────────────────────────────────────
// STEP 1: Get core artist info
// Returns listeners, play count, bio, tags
// Listeners = unique monthly listeners (like Spotify)
// Play count = total streams ever
// ─────────────────────────────────────────────
const getArtistInfo = async (name) => {
    const response = await axios.get(BASE_URL, {
        params: {
            ...baseParams,
            method: 'artist.getinfo',
            artist: name
        }
    });

    const artist = response.data?.artist;
    if (!artist) return null;

    return {
        name:          artist.name,
        listeners:     parseInt(artist.stats?.listeners || 0),
        play_count:    parseInt(artist.stats?.playcount || 0),
        bio:           artist.bio?.summary?.replace(/<[^>]*>/g, '').trim() || '',

        // Tags = genres on Last.fm
        // Top 3 are most relevant
        tags: artist.tags?.tag
            ?.slice(0, 3)
            .map(t => t.name) || [],

        lastfm_url: artist.url || null
    };
};

// ─────────────────────────────────────────────
// STEP 2: Get top tracks
// Returns most played songs with play counts
// This is what Spotify Premium blocked us from
// ─────────────────────────────────────────────
const getTopTracks = async (name) => {
    const response = await axios.get(BASE_URL, {
        params: {
            ...baseParams,
            method:  'artist.gettoptracks',
            artist:  name,
            limit:   10
        }
    });

    const tracks = response.data?.toptracks?.track;
    if (!tracks || tracks.length === 0) return [];

    const avg = (arr) => Math.round(
        arr.reduce((a, b) => a + b, 0) / arr.length
    );

    const playCountsArr = tracks.map(t => parseInt(t.playcount || 0));

    return {
        top_track_name:    tracks[0]?.name || null,
        top_track_plays:   parseInt(tracks[0]?.playcount || 0),
        avg_track_plays:   avg(playCountsArr),
        total_top_plays:   playCountsArr.reduce((a, b) => a + b, 0),
        tracks_list:       tracks.slice(0, 5).map(t => ({
            name:      t.name,
            playcount: parseInt(t.playcount || 0)
        }))
    };
};

// ─────────────────────────────────────────────
// STEP 3: Get similar artists
// Last.fm similarity is based on listening patterns
// Useful for AI comparison layer in Phase 3
// ─────────────────────────────────────────────
const getSimilarArtists = async (name) => {
    try {
        const response = await axios.get(BASE_URL, {
            params: {
                ...baseParams,
                method: 'artist.getsimilar',
                artist: name,
                limit:  5
            }
        });

        const similar = response.data?.similarartists?.artist;
        if (!similar) return [];

        return similar.map(a => ({
            name:  a.name,
            match: parseFloat(a.match || 0)  // similarity score 0-1
        }));

    } catch {
        return [];
    }
};

// ─────────────────────────────────────────────
// STEP 4: Calculate derived music signals
// These feed into influencer signal pipeline
// ─────────────────────────────────────────────
const calculateMusicSignals = (artistInfo, topTracks) => {
    if (!artistInfo) return null;

    // ─────────────────────────────────────────────
    // Listener reach score (0-10)
    // Log scaled — 10M listeners ≠ 10x better than 1M
    // ─────────────────────────────────────────────
    const listenerScore = artistInfo.listeners > 0
        ? parseFloat(
            Math.min(
                Math.log10(artistInfo.listeners) * 1.4,
                10
            ).toFixed(2)
          )
        : 0;

    // ─────────────────────────────────────────────
    // Play count momentum (0-10)
    // High play count = sustained long term popularity
    // Different from listeners — measures depth of fandom
    // ─────────────────────────────────────────────
    const playMomentum = artistInfo.play_count > 0
        ? parseFloat(
            Math.min(
                Math.log10(artistInfo.play_count) * 1.2,
                10
            ).toFixed(2)
          )
        : 0;

    // ─────────────────────────────────────────────
    // Track performance score (0-10)
    // Based on avg plays per top track
    // Shows if popularity is spread across songs
    // or concentrated in one viral hit
    // ─────────────────────────────────────────────
    const trackScore = topTracks?.avg_track_plays > 0
        ? parseFloat(
            Math.min(
                Math.log10(topTracks.avg_track_plays) * 1.3,
                10
            ).toFixed(2)
          )
        : 0;

    // Combined music score — weighted
    const combinedMusicScore = parseFloat((
        (listenerScore * 0.40) +
        (playMomentum  * 0.35) +
        (trackScore    * 0.25)
    ).toFixed(2));

    return {
        listener_score:       listenerScore,
        play_momentum:        playMomentum,
        track_performance:    trackScore,
        combined_music_score: combinedMusicScore
    };
};

// ─────────────────────────────────────────────
// MASTER FUNCTION — called by aggregator
// Returns complete musician data + signals
// ─────────────────────────────────────────────
const getLastFmData = async (name) => {
    try {
        // Fetch artist info and top tracks in parallel
        const [artistInfo, topTracks] = await Promise.all([
            getArtistInfo(name),
            getTopTracks(name)
        ]);

        if (!artistInfo) {
            console.log(`Last.fm: No artist found for "${name}"`);
            return null;
        }

        // Fetch similar artists separately
        const similarArtists = await getSimilarArtists(name);

        // Calculate music signals
        const musicSignals = calculateMusicSignals(artistInfo, topTracks);

        return {
            // Core artist data
            ...artistInfo,

            // Top tracks data
            ...topTracks,

            // Similar artists for AI context
            similar_artists: similarArtists,

            // Calculated signals
            music_signals: musicSignals
        };

    } catch (error) {
        console.error('Last.fm service error:', error.message);
        return null;
    }
};

module.exports = { getLastFmData };