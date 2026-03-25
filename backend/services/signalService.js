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
                (movie.roi && movie.roi > 100) ||   // stricter ROI
                (movie.revenue > movie.budget * 1.5) // real profit margin
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

// ===========================================================
// 🔹 FUNCTION: Calculate audience vs critic gap
// ===========================================================

function calculateRatingGap(movies) {
    let totalGap = 0;
    let count = 0;

    for (let movie of movies) {

        if (
            movie.vote_average && 
            movie.omdb && 
            movie.omdb.imdbRating !== null
        ) {
            const gap = Math.abs(movie.vote_average - movie.omdb.imdbRating);

            totalGap += gap;
            count++;
        }
    }

    if (count === 0) return null;

    const avgGap = totalGap / count;

    return parseFloat(avgGap.toFixed(2));
}

// ===========================================================
// 🔹 HELPER: Calculate standard deviation
// ===========================================================

function calculateStdDev(values) {
    if (values.length === 0) return null;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    const variance = values.reduce((sum, val) => {
        return sum + Math.pow(val - mean, 2);
    }, 0) / values.length;

    return Math.sqrt(variance);
}

// ===========================================================
// 🔹 FUNCTION: Advanced consistency (revenue + ROI)
// ===========================================================

function calculateAdvancedConsistency(movies) {
    const revenues = [];
    const rois = [];

    for (let movie of movies) {

        if (movie.revenue && movie.revenue > 0) {
            revenues.push(movie.revenue);
        }

        if (movie.roi !== null && movie.roi !== undefined) {
            rois.push(movie.roi);
        }
    }

    const revenueStd = calculateStdDev(revenues);
    const roiStd = calculateStdDev(rois);

    return {
        revenue_consistency: revenueStd !== null 
            ? parseFloat(revenueStd.toFixed(2)) 
            : null,

        roi_consistency: roiStd !== null 
            ? parseFloat(roiStd.toFixed(2)) 
            : null
    };
}

// ===========================================================
// 🔹 FUNCTION: Advanced Aura Score 
// ===========================================================

function calculateAuraScore(signals) {
    const {
        avgIMDb,
        consistency,
        awards,
        boxOffice,
        roi,
        hitRatio,
        trend,
        advancedConsistency
    } = signals;

    // =========================
    // 🎬 QUALITY
    // =========================

    const imdbScore = avgIMDb || 0;

    const consistencyScore = consistency !== null
        ? Math.max(0, 10 - consistency)
        : 0;

    // =========================
    // 💰 BUSINESS
    // =========================

    const boxOfficeScore = boxOffice && boxOffice.combined
        ? Math.min(boxOffice.combined / 10000000, 10)
        : 0;

    const roiScore = roi !== null
        ? Math.min(roi / 50, 10)
        : 0;

    const hitScore = hitRatio !== null
        ? hitRatio * 10
        : 0;

    // =========================
    // 🏆 RECOGNITION
    // =========================

    const awardsScore = awards
        ? Math.min(Math.log10(awards + 1) * 3, 10)
        : 0;

    // =========================
    // 🔥 MOMENTUM
    // =========================

    const trendScore = trend || 0;

    // =========================
    // ⚖️ STABILITY
    // =========================

    let stabilityScore = 0;

    if (advancedConsistency) {
        const revCons = advancedConsistency.revenue_consistency;
        const roiCons = advancedConsistency.roi_consistency;

        const revScore = revCons !== null
            ? Math.max(0, 10 - (revCons / 10000000))
            : 0;

        const roiStability = roiCons !== null
            ? Math.max(0, 10 - (roiCons / 50))
            : 0;

        stabilityScore = (revScore + roiStability) / 2;
    }

    // =========================
    // 🧠 FINAL WEIGHTING
    // =========================

    const finalScore =
        (imdbScore * 0.2) +
        (consistencyScore * 0.1) +
        (boxOfficeScore * 0.15) +
        (roiScore * 0.1) +
        (hitScore * 0.1) +
        (awardsScore * 0.1) +
        (trendScore * 0.1) +
        (stabilityScore * 0.15);

    return Math.round(finalScore * 10); // /100 scale
}

// ===========================================================
// 🔹 FUNCTION: Aura Breakdown (0–10 per category)
// ===========================================================

function calculateAuraBreakdown(signals) {
    const {
        avgIMDb,
        consistency,
        awards,
        boxOffice,
        roi,
        hitRatio,
        trend,
        advancedConsistency
    } = signals;

    // 🎬 QUALITY
    const quality =
        ((avgIMDb || 0) * 0.7) +
        ((consistency !== null ? Math.max(0, 10 - consistency) : 0) * 0.3);

    // 💰 BUSINESS
    const boxOfficeScore = boxOffice?.combined
        ? Math.min(boxOffice.combined / 10000000, 10)
        : 0;

    const roiScore = roi !== null
        ? Math.min(roi / 50, 10)
        : 0;

    const hitScore = hitRatio !== null
        ? hitRatio * 10
        : 0;

    const business = (boxOfficeScore + roiScore + hitScore) / 3;

    // 🏆 RECOGNITION
    const recognition = awards
        ? Math.min(Math.log10(awards + 1) * 3, 10)
        : 0;

    // 🔥 MOMENTUM
    const momentum = trend || 0;

    // ⚖️ STABILITY
    let stability = 0;

    if (advancedConsistency) {
        const rev = advancedConsistency.revenue_consistency;
        const roiC = advancedConsistency.roi_consistency;

        const revScore = rev !== null
            ? Math.max(0, 10 - (rev / 10000000))
            : 0;

        const roiScore = roiC !== null
            ? Math.max(0, 10 - (roiC / 50))
            : 0;

        stability = (revScore + roiScore) / 2;
    }

    return {
        quality: parseFloat(quality.toFixed(2)),
        business: parseFloat(business.toFixed(2)),
        recognition: parseFloat(recognition.toFixed(2)),
        momentum: parseFloat(momentum.toFixed(2)),
        stability: parseFloat(stability.toFixed(2))
    };
}

module.exports = {
    calculateAverageIMDbRating,
    calculateRatingConsistency,
    calculateAwardsScore,
    calculateBoxOfficeStrength,
    calculateAuraScore,
    calculateTrendScore,
    calculateHitRatio,
    calculateROIEfficiency,
    calculateRatingGap,
    calculateAdvancedConsistency,
    calculateAuraBreakdown
};