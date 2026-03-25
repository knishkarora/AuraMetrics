const axios = require("axios");

// 🔹 Helper: Convert "$123,456" → 123456
function parseBoxOffice(value) {
    if (!value || value === "N/A") return null;

    return parseInt(value.replace(/[$,]/g, ""));
}

// ===========================================================
// 🔹 FUNCTION: Fetch movie details from OMDb
// Input: title (required), year (optional but improves accuracy)
// ===========================================================

async function getMovieDetails(title, year = "") {
    try {
        // 🔹 Construct API URL
        const url = `http://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&t=${encodeURIComponent(title)}&y=${year}`;

        const response = await axios.get(url);

        // 🔹 If movie not found, return null (clean handling)
        if (response.data.Response === "False") {
            return null;
        }

        // 🔹 Return only relevant data (important for normalization later)
        return {
            title: response.data.Title,
            year: response.data.Year !== "N/A"
                ? parseFloat(response.data.Year)
                : null,

            imdbRating: response.data.imdbRating !== "N/A"
                ? parseFloat(response.data.imdbRating)
                : null,

            awards: response.data.Awards,

            // 🔹 Normalized box office
            boxOffice: parseBoxOffice(response.data.BoxOffice),

            metascore: response.data.Metascore !== "N/A"
                ? parseFloat(response.data.Metascore)
                : null,
            imdbID: response.data.imdbID
        };

    } catch (error) {
        console.error("OMDb Service Error:", error.message);
        return null;
    }
}

module.exports = { getMovieDetails };