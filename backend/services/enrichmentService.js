const { getTMDBData } = require("./tmdbService");
const { getMovieDetails } = require("./omdbService");
const { calculateAverageIMDbRating, calculateRatingConsistency, calculateAwardsScore, calculateBoxOfficeStrength, calculateAuraScore } = require("./signalService");

// ===========================================================
// 🔹 FUNCTION: Enrich TMDB recent_movies with OMDb data
// ===========================================================

async function getEnrichedActorData(actorName) {
    try {
        // 🔹 Step 1: Fetch TMDB data
        const tmdbData = await getTMDBData(actorName);

        if (!tmdbData || !tmdbData.recent_movies) {
            return null;
        }

        // 🔹 Step 2: Limit movies (IMPORTANT)
        const movies = tmdbData.recent_movies.slice(0, 5);

        const enrichedMovies = [];

        // 🔹 Step 3: Enrich each movie
        for (let movie of movies) {

            // 🔹 STEP 1: Skip movies with no revenue (avoid useless OMDb calls)
            if (movie.revenue === 0) {
                continue; // skip this movie completely
            }

            // Extract year
            const year = movie.release_date
                ? movie.release_date.split("-")[0]
                : "";

            // 🔹 Call OMDb ONLY for valid movies
            const omdbData = await getMovieDetails(movie.title, year);

            enrichedMovies.push({
                ...movie,
                omdb: omdbData
            });
        }

        // ===========================================================
        // 🔹 SIGNAL: Average IMDb Rating
        // ===========================================================

        const avgIMDbRating = calculateAverageIMDbRating(enrichedMovies);
        const consistencyScore = calculateRatingConsistency(enrichedMovies);
        const awardsScore = calculateAwardsScore(enrichedMovies);
        const boxOfficeStrength = calculateBoxOfficeStrength(enrichedMovies);
        const auraScore = calculateAuraScore({
            avgIMDb: avgIMDbRating,
            consistency: consistencyScore,
            awards: awardsScore,
            boxOffice: boxOfficeStrength
        });

        // 🔹 Step 4: Return structured response
        return {
            actor: tmdbData.name,
            tmdb_id: tmdbData.tmdb_id,

            // Keep original TMDB insights (VERY IMPORTANT)
            insights: {
                total_movies: tmdbData.total_movies,
                avg_box_office_revenue: tmdbData.avg_box_office_revenue,
                total_box_office: tmdbData.total_box_office,
                avg_audience_rating: tmdbData.avg_audience_rating,
                box_office_trend: tmdbData.box_office_trend,
                commercial_reliability: tmdbData.commercial_reliability,
                tmdb_popularity: tmdbData.tmdb_popularity,
                avg_imdb_rating: avgIMDbRating,
                rating_consistency: consistencyScore,
                awards_score: awardsScore,
                box_office: boxOfficeStrength,
                aura_score: auraScore
            },

            // 🔹 Enriched movies
            movies: enrichedMovies
        };

    } catch (error) {
        console.error("Enrichment Error:", error.message);
        return null;
    }
}

module.exports = { getEnrichedActorData };