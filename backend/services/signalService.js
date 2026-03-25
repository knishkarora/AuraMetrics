// ===========================================================
// 🔹 FUNCTION: Calculate average IMDb rating
// ===========================================================

function calculateAverageIMDbRating(movies) {
    let total = 0;
    let count = 0;

    for (let movie of movies) {

        // 🔹 Only consider valid OMDb ratings
        if (movie.omdb && movie.omdb.imdbRating !== null) {
            total += movie.omdb.imdbRating;
            count++;
        }
    }

    // 🔹 Avoid division by zero
    if (count === 0) return null;

    return parseFloat((total / count).toFixed(2));
}

// ===========================================================
// 🔹 FUNCTION: Calculate rating consistency (standard deviation)
// Lower value = more consistent
// ===========================================================

function calculateRatingConsistency(movies) {
    const ratings = [];

    // 🔹 Collect valid IMDb ratings
    for (let movie of movies) {
        if (movie.omdb && movie.omdb.imdbRating !== null) {
            ratings.push(movie.omdb.imdbRating);
        }
    }

    if (ratings.length === 0) return null;

    // 🔹 Calculate mean
    const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;

    // 🔹 Calculate variance
    const variance = ratings.reduce((sum, rating) => {
        return sum + Math.pow(rating - mean, 2);
    }, 0) / ratings.length;

    // 🔹 Standard deviation (consistency score)
    const stdDev = Math.sqrt(variance);

    return parseFloat(stdDev.toFixed(2));
}

module.exports = {
    calculateAverageIMDbRating,
    calculateRatingConsistency
};