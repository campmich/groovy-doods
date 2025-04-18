const axios = require('axios');
require('dotenv').config();

let token = '';
let tokenExpiresAt = 0;

async function getSpotifyToken() {
  // If token is still valid, return it
  if (token && Date.now() < tokenExpiresAt) return token;

  // Otherwise, request a new one
  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    'grant_type=client_credentials',
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString('base64'),
      },
    }
  );

  token = response.data.access_token;
  tokenExpiresAt = Date.now() + response.data.expires_in * 1000;
  return token;
}

module.exports = { getSpotifyToken };