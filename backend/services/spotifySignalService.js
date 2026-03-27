// ===========================================================
// 🔹 FUNCTION: Calculate Spotify Signals
// ===========================================================

function calculateSpotifySignals(artistData) {
    if (!artistData) return null;

    // =========================
    // 🎯 REACH (followers)
    // =========================
    const reachScore = Math.min(
        artistData.followers / 1000000, // scale
        10
    );

    // =========================
    // 🔥 POPULARITY (0–100 → 0–10)
    // =========================
    const popularityScore = artistData.popularity
        ? artistData.popularity / 10
        : 0;

    // =========================
    // 🎵 GENRE DIVERSITY
    // =========================
    const genreScore = artistData.genres
        ? Math.min(artistData.genres.length, 10)
        : 0;

    return {
        reach_score: parseFloat(reachScore.toFixed(2)),
        popularity_score: parseFloat(popularityScore.toFixed(2)),
        genre_diversity: genreScore
    };
}

module.exports = { calculateSpotifySignals };