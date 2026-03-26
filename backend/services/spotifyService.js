const axios = require("axios");

// ===========================================================
// 🔹 FUNCTION: Get Spotify Access Token
// ===========================================================

async function getSpotifyToken() {
    try {
        const response = await axios.post(
            "https://accounts.spotify.com/api/token",
            "grant_type=client_credentials",
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization": "Basic " + Buffer.from(
                        process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET
                    ).toString("base64")
                }
            }
        );

        return response.data.access_token;

    } catch (error) {
        console.error("Spotify Token Error:", error.message);
        return null;
    }
}

// ===========================================================
// 🔹 FUNCTION: Get Spotify Artist Data
// ===========================================================

async function getSpotifyArtistData(name) {
    try {
        // 🔹 Step 1: Get access token
        const token = await getSpotifyToken();

        if (!token) return null;

        // 🔹 Step 2: Search artist
        const response = await axios.get(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=1`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const artist = response.data.artists.items[0];

        if (!artist) return null;

        // 🔹 Step 3: Return clean data
        return {
            name: artist.name,
            followers: artist.followers.total,
            popularity: artist.popularity, // 0–100
            genres: artist.genres,
            spotify_url: artist.external_urls.spotify
        };

    } catch (error) {
        console.error("Spotify Artist Error:", error.message);
        return null;
    }
}

module.exports = { getSpotifyToken, getSpotifyArtistData };