require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

function normalizePhone(phone) {
  if (typeof phone !== 'string') return '';
  return phone.trim().replace(/\s+/g, '');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

function getUserPayload(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    joined_at: user.joined_at
  };
}

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
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT UNIQUE,
        role TEXT DEFAULT 'member',
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS contributions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        method TEXT NOT NULL,
        package_name TEXT,
        status TEXT DEFAULT 'pending',
        reference TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    db.get('SELECT id FROM users WHERE email = ?', ['demo@coop.com'], (err, row) => {
      if (err) return console.error('Could not check demo user:', err.message);
      if (!row) {
        const hashed = bcrypt.hashSync('password123', 10);
        db.run(
          'INSERT INTO users (email, password, full_name, phone, role) VALUES (?, ?, ?, ?, ?)',
          ['demo@coop.com', hashed, 'Demo User', '+256700000000', 'admin'],
          (insertErr) => {
            if (insertErr) {
              console.error('Could not create demo user:', insertErr.message);
              return;
            }
            console.log('Demo user created: demo@coop.com / password123');
          }
        );
      }
    });
  });
}

// ---------- API ROUTES ----------

app.post('/api/register', async (req, res) => {
  const { email, password, full_name, phone } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedName = String(full_name || '').trim();
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedName || !normalizedEmail || !password) {
    return res.status(400).json({ error: 'Full name, email, and password are required' });
  }

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  if (normalizedPhone && normalizedPhone.length < 9) {
    return res.status(400).json({ error: 'Phone number is too short' });
  }

  try {
    const existingUser = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id FROM users WHERE email = ? OR phone = ?',
        [normalizedEmail, normalizedPhone || null],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });

    if (existingUser) {
      return res.status(409).json({ error: 'An account with that email or phone already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    db.run(
      'INSERT INTO users (email, password, full_name, phone, role) VALUES (?, ?, ?, ?, ?)',
      [normalizedEmail, hashed, normalizedName, normalizedPhone || null, 'member'],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ message: 'User registered successfully' });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', (req, res) => {
  const { email, phone, identifier, password } = req.body;
  const loginValue = String(identifier || email || phone || '').trim();

  if (!loginValue || !password) {
    return res.status(400).json({ error: 'Email/phone and password are required' });
  }

  const isEmailLogin = loginValue.includes('@');
  const query = isEmailLogin ? 'SELECT * FROM users WHERE email = ?' : 'SELECT * FROM users WHERE phone = ? OR email = ?';
  const params = isEmailLogin ? [loginValue.toLowerCase()] : [normalizePhone(loginValue), loginValue.toLowerCase()];

  db.get(query, params, async (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      token,
      user: getUserPayload(user)
    });
  });
});

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Invalid token format' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/api/dashboard', authenticate, (req, res) => {
  const userId = req.user.id;
  db.get('SELECT id, email, full_name, phone, role, joined_at FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: 'User not found' });

    db.all('SELECT id, amount, date FROM contributions WHERE user_id = ? ORDER BY date DESC', [userId], (contributionErr, contributions) => {
      if (contributionErr) return res.status(500).json({ error: contributionErr.message });

      db.all(
        'SELECT id, amount, method, package_name, status, reference, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (paymentErr, payments) => {
          if (paymentErr) return res.status(500).json({ error: paymentErr.message });

          const successfulPayments = (payments || []).filter((payment) => payment.status === 'successful');
          const totalShares = successfulPayments.reduce((sum, payment) => {
            const packageName = String(payment.package_name || '').toLowerCase();
            return packageName.includes('share') || packageName.includes('contribution') || packageName.includes('donation')
              ? sum + Number(payment.amount || 0)
              : sum;
          }, 0);
          const membershipPaid = successfulPayments.some((payment) => String(payment.package_name || '').toLowerCase().includes('membership'));

          res.json({
            user: getUserPayload(user),
            contributions,
            payments,
            summary: {
              membership_status: membershipPaid ? 'Paid' : 'Pending',
              total_shares: totalShares,
              share_balance: totalShares,
              total_paid: successfulPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
              payment_history_count: payments.length
            }
          });
        }
      );
    });
  });
});

app.get('/api/members', authenticate, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  db.all('SELECT id, email, full_name, phone, role, joined_at FROM users', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/contributions', authenticate, (req, res) => {
  const { amount } = req.body;
  const validAmount = Number(amount);

  if (!validAmount || validAmount <= 0) {
    return res.status(400).json({ error: 'Valid amount required' });
  }

  db.run(
    'INSERT INTO contributions (user_id, amount) VALUES (?, ?)',
    [req.user.id, validAmount],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, message: 'Contribution added' });
    }
  );
});

app.post('/api/payments', authenticate, (req, res) => {
  const { amount, method, package_name, status, reference } = req.body;
  const validAmount = Number(amount);
  const normalizedMethod = String(method || '').trim();
  const normalizedPackage = String(package_name || '').trim() || 'Membership fee';
  const paymentStatus = String(status || 'pending').trim().toLowerCase();
  const paymentReference = String(reference || `RS-${Date.now()}`).trim();

  if (!normalizedMethod || !validAmount || validAmount <= 0) {
    return res.status(400).json({ error: 'Payment method and valid amount are required' });
  }

  if (!['pending', 'paid', 'successful', 'failed', 'cancelled'].includes(paymentStatus)) {
    return res.status(400).json({ error: 'Invalid payment status' });
  }

  const finalStatus = paymentStatus === 'paid' ? 'successful' : paymentStatus;

  db.run(
    'INSERT INTO payments (user_id, amount, method, package_name, status, reference) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, validAmount, normalizedMethod, normalizedPackage, finalStatus, paymentReference],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(409).json({ error: 'Duplicate payment reference' });
        }
        return res.status(500).json({ error: err.message });
      }

      res.status(201).json({
        id: this.lastID,
        amount: validAmount,
        method: normalizedMethod,
        package_name: normalizedPackage,
        status: finalStatus,
        reference: paymentReference,
        message: finalStatus === 'successful' ? 'Payment confirmed successfully' : 'Payment request recorded successfully. Waiting for payment confirmation.'
      });
    }
  );
});

app.post('/api/payments/:id/confirm', authenticate, (req, res) => {
  const paymentId = Number(req.params.id);
  if (!paymentId) return res.status(400).json({ error: 'Invalid payment id' });

  db.get(
    'SELECT * FROM payments WHERE id = ? AND user_id = ?',
    [paymentId, req.user.id],
    (getErr, payment) => {
      if (getErr) return res.status(500).json({ error: getErr.message });
      if (!payment) return res.status(404).json({ error: 'Payment not found' });
      if (payment.status === 'successful') {
        return res.json({ message: 'Payment already confirmed', payment });
      }

      db.run(
        'UPDATE payments SET status = ? WHERE id = ? AND user_id = ?',
        ['successful', paymentId, req.user.id],
        function (updateErr) {
          if (updateErr) return res.status(500).json({ error: updateErr.message });
          db.run(
            'INSERT INTO contributions (user_id, amount, date) VALUES (?, ?, CURRENT_TIMESTAMP)',
            [req.user.id, payment.amount],
            (contributionErr) => {
              if (contributionErr) return res.status(500).json({ error: contributionErr.message });
              const confirmedPayment = { ...payment, status: 'successful' };
              res.json({ message: 'Payment confirmed successfully', payment: confirmedPayment });
            }
          );
        }
      );
    }
  );
});

app.get('/api/payments', authenticate, (req, res) => {
  db.all(
    'SELECT id, amount, method, package_name, status, reference, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'pubic', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));