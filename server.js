require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'pubic')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// Database setup
const db = new sqlite3.Database('./cooperative.db', (err) => {
  if (err) {
    console.error('DB connection error:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    initDb();
  }
});

// Initialize tables
function initDb() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      role TEXT DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.all('PRAGMA table_info(users)', (err, columns) => {
    if (err) return console.error('Could not inspect users table:', err.message);
    if (!columns.some((column) => column.name === 'phone')) {
      db.run('ALTER TABLE users ADD COLUMN phone TEXT', (alterErr) => {
        if (alterErr) console.error('Could not add phone column:', alterErr.message);
      });
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Insert a demo user if not exists
  db.get('SELECT id FROM users WHERE email = ?', ['demo@coop.com'], (err, row) => {
    if (!row) {
      const hashed = bcrypt.hashSync('password123', 10);
      db.run(
        'INSERT INTO users (email, password, full_name, role) VALUES (?, ?, ?, ?)',
        ['demo@coop.com', hashed, 'Demo User', 'admin']
      );
      console.log('Demo user created: demo@coop.com / password123');
    }
  });
}

// ---------- API ROUTES ----------

// Register
app.post('/api/register', async (req, res) => {
  const { email, password, full_name, phone } = req.body;
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'All fields required' });
  }
  try {
    const hashed = await bcrypt.hash(password, 10);
    db.run(
      'INSERT INTO users (email, password, full_name, phone) VALUES (?, ?, ?, ?)',
      [email, hashed, full_name, phone || null],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Email already exists' });
          }
          return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ message: 'User registered successfully' });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({ token, user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role } });
  });
});

// Middleware to verify JWT
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Dashboard data (user info + contributions)
app.get('/api/dashboard', authenticate, (req, res) => {
  const userId = req.user.id;
  db.get('SELECT id, email, full_name, role, joined_at FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: 'User not found' });

    db.all('SELECT id, amount, date FROM contributions WHERE user_id = ? ORDER BY date DESC', [userId], (err, contributions) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ user, contributions });
    });
  });
});

// Get all members (for admin)
app.get('/api/members', authenticate, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  db.all('SELECT id, email, full_name, role, joined_at FROM users', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add a contribution
app.post('/api/contributions', authenticate, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid amount required' });
  }
  db.run(
    'INSERT INTO contributions (user_id, amount) VALUES (?, ?)',
    [req.user.id, amount],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, message: 'Contribution added' });
    }
  );
});

// Serve index.html for any other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'pubic', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));