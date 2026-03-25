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

// ===========================================================
// 🔹 FUNCTION: Calculate awards score
// Formula: (wins * 2) + nominations
// ===========================================================

function calculateAwardsScore(movies) {
    let totalScore = 0;

    for (let movie of movies) {

        if (movie.omdb && movie.omdb.awards) {
            const awardsText = movie.omdb.awards;

            // 🔹 Extract wins and nominations using regex
            const winsMatch = awardsText.match(/(\d+)\s+wins?/i);
            const nomsMatch = awardsText.match(/(\d+)\s+nominations?/i);

            const wins = winsMatch ? parseInt(winsMatch[1]) : 0;
            const nominations = nomsMatch ? parseInt(nomsMatch[1]) : 0;

            // 🔹 Weighted score
            totalScore += (wins * 2) + nominations;
        }
    }

    return totalScore;
}

// ===========================================================
// 🔹 FUNCTION: Calculate box office metrics
// Returns mean, median, and combined score
// ===========================================================

function calculateBoxOfficeStrength(movies) {
    const revenues = [];

    // 🔹 Collect valid revenues
    for (let movie of movies) {
        if (movie.revenue && movie.revenue > 0) {
            revenues.push(movie.revenue);
        }
    }

    if (revenues.length === 0) return null;

    // 🔹 MEAN (average)
    const mean = revenues.reduce((a, b) => a + b, 0) / revenues.length;

    // 🔹 MEDIAN (consistency)
    const sorted = [...revenues].sort((a, b) => a - b);
    let median;

    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        median = (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
        median = sorted[mid];
    }

    // 🔹 COMBINED SCORE (weighted)
    const combined = (median * 0.7) + (mean * 0.3);

    return {
        mean: Math.round(mean),
        median: Math.round(median),
        combined: Math.round(combined)
    };
}

// ===========================================================
// 🔹 FUNCTION: Calculate Aura Score (0–100)
// ===========================================================

function calculateAuraScore(signals) {
    const {
        avgIMDb,
        consistency,
        awards,
        boxOffice
    } = signals;

    // 🔹 Normalize IMDb (already out of 10)
    const imdbScore = avgIMDb ? avgIMDb : 0;

    // 🔹 Consistency → lower is better → invert
    const consistencyScore = consistency !== null
        ? Math.max(0, 10 - consistency)
        : 0;

    // 🔹 Awards → scale down (rough normalization)
    const awardsScore = awards ? Math.min(awards / 50, 10) : 0;

    // 🔹 Box office → scale (assume 100M ≈ 10 score)
    const boxOfficeScore = boxOffice && boxOffice.combined
        ? Math.min(boxOffice.combined / 10000000, 10)
        : 0;

    // 🔹 Final weighted score
    const finalScore =
        (imdbScore * 0.3) +
        (consistencyScore * 0.2) +
        (awardsScore * 0.2) +
        (boxOfficeScore * 0.3);

    // Convert to /100
    return Math.round(finalScore * 10);
}

// ===========================================================
// 🔹 FUNCTION: Calculate trend score (0–10)
// ===========================================================

function calculateTrendScore(tmdbData, movies) {

    // 🔹 Base: actor popularity
    const basePopularity = tmdbData.tmdb_popularity || 0;

    // 🔹 Recent movies popularity
    let totalPopularity = 0;
    let count = 0;

    for (let movie of movies) {
        if (movie.popularity) {
            totalPopularity += movie.popularity;
            count++;
        }
    }

    const avgMoviePopularity = count > 0 ? totalPopularity / count : 0;

    // 🔹 Combine both (weighted)
    const rawScore = (basePopularity * 0.6) + (avgMoviePopularity * 0.4);

    // 🔹 Normalize to 0–10 (simple cap)
    const normalized = Math.min(rawScore, 10);

    return parseFloat(normalized.toFixed(2));
}

// ===========================================================
// 🔹 FUNCTION: Calculate hit ratio
// ===========================================================

function calculateHitRatio(movies) {
    let hits = 0;
    let total = 0;

    for (let movie of movies) {

        // Only consider valid movies
        if (movie.revenue && movie.budget) {
            total++;

            // 🔹 Hit conditions
            if (
                (movie.roi && movie.roi > 50) ||
                (movie.revenue > movie.budget)
            ) {
                hits++;
            }
        }
    }

    if (total === 0) return null;

    const ratio = hits / total;

    return parseFloat(ratio.toFixed(2)); // e.g. 0.6
}

// ===========================================================
// 🔹 FUNCTION: Calculate ROI efficiency
// ===========================================================

function calculateROIEfficiency(movies) {
    let totalROI = 0;
    let count = 0;

    for (let movie of movies) {

        // 🔹 Only consider valid ROI
        if (movie.roi !== null && movie.roi !== undefined) {
            totalROI += movie.roi;
            count++;
        }
    }

    if (count === 0) return null;

    const avgROI = totalROI / count;

    return parseFloat(avgROI.toFixed(2));
}

module.exports = {
    calculateAverageIMDbRating,
    calculateRatingConsistency,
    calculateAwardsScore,
    calculateBoxOfficeStrength,
    calculateAuraScore,
    calculateTrendScore,
    calculateHitRatio,
    calculateROIEfficiency
};