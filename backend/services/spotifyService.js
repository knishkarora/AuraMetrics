const axios = require("axios");

let cachedToken = null;
let tokenExpiry = 0;

// ===========================================================
// 🔹 TOKEN FUNCTION
// ===========================================================

async function getSpotifyToken() {
    try {
        const now = Date.now();

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

        cachedToken = response.data.access_token;
        tokenExpiry = now + (response.data.expires_in * 1000) - 60000;

        return cachedToken;

    } catch (error) {
        console.error("❌ Spotify Token Error:", error.response?.data || error.message);
        return null;
    }
}


// ===========================================================
// 🔹 TOP TRACKS FUNCTION (IMPORTANT — must be above usage)
// ===========================================================

async function getArtistTopTracks(artistId, token) {
    try {
        const response = await axios.get(
            `https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=IN`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        return response.data.tracks;

    } catch (error) {
        console.error("❌ Top Tracks Error:", error.response?.data || error.message);
        return [];
    }
}


// ===========================================================
// 🔹 MAIN FUNCTION
// ===========================================================

async function getSpotifyArtistData(name) {
    try {
        const token = await getSpotifyToken();

        if (!token) return null;

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


        const topTracks = await getArtistTopTracks(artist.id, token);

        const tracks = topTracks.map(track => ({
            name: track.name,
            popularity: track.popularity
        }));

        return {
            name: artist.name,
            followers: artist.followers.total,
            popularity: artist.popularity,
            genres: artist.genres,
            spotify_url: artist.external_urls.spotify,
            top_tracks: tracks
        };

    } catch (error) {
        console.error("❌ Spotify Artist Error:", error.response?.data || error.message);
        return null;
    }
}

module.exports = {
    getSpotifyToken,
    getSpotifyArtistData
};