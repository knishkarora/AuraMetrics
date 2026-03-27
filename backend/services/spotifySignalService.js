// ===========================================================
// 🔹 FUNCTION: Calculate Spotify Signals (Advanced)
// ===========================================================

function calculateSpotifySignals(artistData) {
    if (!artistData) return null;

    // =========================
    // 🎯 REACH
    // =========================
    const reachScore = Math.min(
        artistData.followers / 1000000,
        10
    );

    // =========================
    // 🔥 ARTIST POPULARITY
    // =========================
    const popularityScore = artistData.popularity
        ? artistData.popularity / 10
        : 0;

    // =========================
    // 🎵 TOP TRACKS ANALYSIS
    // =========================
    let avgTrackPopularity = 0;
    let trackConsistency = 0;

    if (artistData.top_tracks && artistData.top_tracks.length > 0) {

        const pops = artistData.top_tracks.map(t => t.popularity);

        // 🔹 Average popularity
        avgTrackPopularity = pops.reduce((a, b) => a + b, 0) / pops.length;

        // 🔹 Consistency (std dev)
        const mean = avgTrackPopularity;

        const variance = pops.reduce((sum, val) => {
            return sum + Math.pow(val - mean, 2);
        }, 0) / pops.length;

        trackConsistency = Math.sqrt(variance);
    }

    return {
        reach_score: parseFloat(reachScore.toFixed(2)),
        popularity_score: parseFloat(popularityScore.toFixed(2)),

        // 🔥 NEW SIGNALS
        avg_track_popularity: parseFloat((avgTrackPopularity / 10).toFixed(2)),
        track_consistency: parseFloat(trackConsistency.toFixed(2)),

        genre_diversity: artistData.genres.length
    };
}

module.exports = { calculateSpotifySignals };