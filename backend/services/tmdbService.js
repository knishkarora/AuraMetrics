const axios = require('axios');
const { usdToInr } = require('../utils/currency');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

// ─────────────────────────────────────────────
// TMDB short API key uses query param auth
// api_key is added to params of every request
// ─────────────────────────────────────────────

const searchPerson = async (name) => {
  const response = await axios.get(`${BASE_URL}/search/person`, {
    params: {
      query: name,
      api_key: TMDB_API_KEY
    }
  });

  const results = response.data?.results;
  if (!results || results.length === 0) return null;

  const person = results[0];
  return {
    id: person.id,
    name: person.name,
    popularity: person.popularity,
    known_for: person.known_for_department
  };
};

const getPersonDetails = async (personId) => {
  const response = await axios.get(`${BASE_URL}/person/${personId}`, {
    params: { api_key: TMDB_API_KEY }   // ← fixed
  });

  const p = response.data;
  if (!p) return null;

  return {
    tmdb_id: p.id,
    imdb_id: p.imdb_id || null,
    name: p.name,
    biography: p.biography || '',
    birthday: p.birthday || null,
    place_of_birth: p.place_of_birth || null,
    popularity: p.popularity,
    profile_pic_url: p.profile_path
      ? `https://image.tmdb.org/t/p/w500${p.profile_path}`
      : null
  };
};

const getMovieCredits = async (personId) => {
  const response = await axios.get(`${BASE_URL}/person/${personId}/movie_credits`, {
    params: { api_key: TMDB_API_KEY }   // ← fixed
  });

  const cast = response.data?.cast;
  if (!cast || cast.length === 0) return null;

  const movies = cast
    .filter(m => m.release_date && m.release_date.length > 0)
    .filter(m => new Date(m.release_date) <= new Date())
    .sort((a, b) => new Date(b.release_date) - new Date(a.release_date));

  return movies;
};

const getBoxOfficeData = async (movies) => {
  const recentMovies = movies.slice(0, 5);

  const movieDetails = await Promise.all(
    recentMovies.map(async (movie) => {
      try {
        const response = await axios.get(`${BASE_URL}/movie/${movie.id}`, {
          params: { api_key: TMDB_API_KEY }   // ← fixed
        });

        const m = response.data;
        const roiValue = m.budget > 0
          ? parseFloat(((m.revenue - m.budget) / m.budget * 100).toFixed(2))
          : null;

        return {
          title: m.title,
          release_date: m.release_date,
          revenue_raw: m.revenue || 0,      // ← keep raw for calculations
          budget_raw: m.budget || 0,       // ← keep raw for calculations
          revenue: await usdToInr(m.revenue) || '₹0',  // ← display
          budget: await usdToInr(m.budget) || '₹0',  // ← display
          vote_average: m.vote_average || 0,
          vote_count: m.vote_count || 0,
          popularity: m.popularity || 0,
          roi: roiValue
        };
      } catch {
        return null;
      }
    })
  );

  return movieDetails.filter(Boolean);
};

const calculateActorMetrics = async (details, boxOffice) => {
  const avg = (arr) => arr.length > 0
    ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
    : 0;

  const moviesWithRevenue = boxOffice.filter(m => m.revenue_raw > 0);
  console.log('Movies with revenue:', moviesWithRevenue.map(m => ({
    title: m.title,
    revenue_raw: m.revenue_raw
  })));

  const avgRevenue = avg(moviesWithRevenue.map(m => m.revenue_raw));
  const avgRating = moviesWithRevenue.length > 0
    ? parseFloat((
      moviesWithRevenue.reduce((a, m) => a + m.vote_average, 0)
      / moviesWithRevenue.length
    ).toFixed(2))
    : 0;

  const totalRevenue = moviesWithRevenue.reduce((a, m) => a + m.revenue_raw, 0);

  // ─────────────────────────────────────────────
  // Box office trend: latest movie vs average
  // Above 1.0 = rising star | Below 1.0 = declining
  // ─────────────────────────────────────────────
  const boxOfficeTrend = avgRevenue > 0 && moviesWithRevenue.length > 0
    ? parseFloat((moviesWithRevenue[0].revenue_raw / avgRevenue).toFixed(2))
    : null;

  // Commercial reliability = % of movies that turned profit
  const profitableMovies = boxOffice.filter(m => m.roi !== null && m.roi > 0);
  const commercialReliability = boxOffice.length > 0
    ? parseFloat((profitableMovies.length / boxOffice.length * 100).toFixed(1))
    : 0;
  console.log('avgRevenueUSD:', avgRevenue);
  console.log('totalRevenueUSD:', totalRevenue);
  console.log('moviesWithRevenue:', moviesWithRevenue.length);
  return {
    total_movies: details.popularity > 0 ? Math.round(details.popularity) : 0,
    avg_box_office_revenue_raw: avgRevenue,
    total_box_office_raw: totalRevenue,
    avg_box_office_revenue: await usdToInr(avgRevenue) || '₹0',
    total_box_office: await usdToInr(totalRevenue) || '₹0',
    avg_audience_rating: avgRating,
    box_office_trend: boxOfficeTrend,
    commercial_reliability: commercialReliability,
    tmdb_popularity: details.popularity
  };
};

const getTMDBData = async (name) => {
  try {
    const personSearch = await searchPerson(name);
    if (!personSearch) {
      console.log(`TMDB: No person found for "${name}"`);
      return null;
    }

    const [details, movies] = await Promise.all([
      getPersonDetails(personSearch.id),
      getMovieCredits(personSearch.id)
    ]);

    if (!details || !movies) return null;

    const boxOffice = await getBoxOfficeData(movies);
    const metrics = await calculateActorMetrics(details, boxOffice);

    return {
      ...details,
      known_for: personSearch.known_for,
      recent_movies: boxOffice,
      ...metrics
    };

  } catch (error) {
    // ← expanded error logging to find exact issue
    console.error('TMDB service error:', error.message);
    console.error('TMDB error status:', error.response?.status);
    console.error('TMDB error data:', error.response?.data);
    console.error('TMDB full error:', error.stack);
    return null;
  }
};

module.exports = { getTMDBData };