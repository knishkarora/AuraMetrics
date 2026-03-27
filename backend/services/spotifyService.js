const axios = require("axios");

let cachedToken = null;
let tokenExpiry = 0;

// ===========================================================
// 🔹 FUNCTION: Get Spotify Access Token (with caching)
// ===========================================================

async function getSpotifyToken() {
    try {
        const now = Date.now();

        // 🔹 Use cached token if still valid
        if (cachedToken && now < tokenExpiry) {
            return cachedToken;
        }

        const body = new URLSearchParams({
            grant_type: "client_credentials"
        });

        const response = await axios.post(
            "https://accounts.spotify.com/api/token",
            body,
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization": "Basic " + Buffer.from(
                        process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET
                    ).toString("base64")
                }
            }
        );

        // 🔹 Save token + expiry
        cachedToken = response.data.access_token;
        tokenExpiry = now + (response.data.expires_in * 1000) - 60000; 
        // minus 1 min safety buffer

        return cachedToken;

    } catch (error) {
        console.error("❌ Spotify Token Error:", error.response?.data || error.message);
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

        // 🔹 Debug (important while developing)
        console.log("Spotify Token:", token);

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

        if (!artist) {
            console.log("⚠️ No artist found");
            return null;
        }

        // 🔹 Step 3: Return clean structured data
        return {
            name: artist.name,
            followers: artist.followers.total,
            popularity: artist.popularity, // 0–100
            genres: artist.genres,
            spotify_url: artist.external_urls.spotify
        };

    } catch (error) {
        console.error("❌ Spotify Artist Error:", error.response?.data || error.message);
        return null;
    }
}

module.exports = { getSpotifyToken, getSpotifyArtistData };