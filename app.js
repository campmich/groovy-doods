const express = require('express');
const path = require('path');
const axios = require('axios');
const bcrypt = require('bcrypt');
const session = require('express-session');
const { getSpotifyToken } = require('./spotify');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Session setup
app.use(session({
  secret: 'groovy-secret-key',
  resave: false,
  saveUninitialized: false
}));

// Inject user into views
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

// Middleware
function isLoggedIn(req, res, next) {
  if (req.session.user) next();
  else res.redirect('/login');
}

// === ROUTES ===

// Home
app.get('/', (req, res) => {
  res.render('index');
});

// Register
app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  try {
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hashed, 'user');
    res.redirect('/login');
  } catch {
    res.send('Username already taken.');
  }
});

// Login
app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (user && await bcrypt.compare(password, user.password)) {
    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.redirect('/');
  } else {
    res.send('Invalid credentials.');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Make Groove
app.get('/make', isLoggedIn, (req, res) => {
  res.render('make');
});

app.post('/make', isLoggedIn, (req, res) => {
  const { artist, album, image, review, rating } = req.body;
  db.prepare('INSERT INTO reviews (album, artist, image, review, rating, user_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(album, artist, image, review, rating, req.session.user.id);
  res.redirect('/grooves');
});

// View Grooves
app.get('/grooves', (req, res) => {
  const stmt = db.prepare(`
    SELECT reviews.*, users.username 
    FROM reviews 
    LEFT JOIN users ON reviews.user_id = users.id 
    ORDER BY reviews.id DESC
  `);
  const reviews = stmt.all();
  res.render('grooves', { reviews });
});

// Delete Groove + misc. left over code from when I wanted to add an admin user (which continues below)
app.post('/delete/:id', isLoggedIn, (req, res) => {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).send('Not found');

  if (req.session.user.role === 'admin' || req.session.user.id === review.user_id) {
    db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
    res.redirect('/grooves');
  } else {
    res.status(403).send('Nope. Not yours.');
  }
});

// GET: Edit form
app.get('/edit/:id', isLoggedIn, (req, res) => {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).send('Review not found');

  if (req.session.user.id !== review.user_id && req.session.user.role !== 'admin') {
    return res.status(403).send('You can’t edit this one, buddy.');
  }

  res.render('edit', { review });
});

// POST: Submit edit
app.post('/edit/:id', isLoggedIn, (req, res) => {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).send('Review not found');

  if (req.session.user.id !== review.user_id && req.session.user.role !== 'admin') {
    return res.status(403).send('You can’t edit this one either, pal.');
  }

  const { review: newReview, rating } = req.body;
  db.prepare('UPDATE reviews SET review = ?, rating = ? WHERE id = ?')
    .run(newReview, rating, req.params.id);

  res.redirect('/grooves');
});

// Spotify Search
app.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json({ albums: [] });

  const token = await getSpotifyToken();
  const response = await axios.get('https://api.spotify.com/v1/search', {
    headers: { Authorization: `Bearer ${token}` },
    params: { q: query, type: 'album', limit: 10 },
  });

  const albums = response.data.albums.items.map(album => ({
    id: album.id,
    name: album.name,
    artist: album.artists[0].name,
    image: album.images[0]?.url || '',
  }));

  res.json({ albums });
});

app.listen(PORT, () => {
  console.log(`Groovy Doods running on http://localhost:${PORT}`);
});