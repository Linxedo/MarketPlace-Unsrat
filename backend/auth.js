const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const pool     = require('../config/db');

const router = express.Router();

// ─── POST /api/auth/register ───────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, password, full_name, email, phone, address } = req.body;

  if (!username || !password || !full_name || !email) {
    return res.status(400).json({ message: 'username, password, nama lengkap, dan email wajib diisi' });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, password, full_name, email, phone, address)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, full_name, email, phone, address, created_at`,
      [username, hashed, full_name, email, phone || null, address || null]
    );

    const user  = result.rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({ message: 'Registrasi berhasil', token, user });
  } catch (err) {
    if (err.code === '23505') {
      const field = err.detail.includes('username') ? 'Username' : 'Email';
      return res.status(409).json({ message: `${field} sudah digunakan` });
    }
    console.error(err);
    res.status(500).json({ message: 'Gagal registrasi' });
  }
});

// ─── POST /api/auth/login ──────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username dan password wajib diisi' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ message: 'Username atau password salah' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Username atau password salah' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const { password: _, ...safeUser } = user;
    res.json({ message: 'Login berhasil', token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal login' });
  }
});

module.exports = router;
