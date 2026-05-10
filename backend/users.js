const express  = require('express');
const bcrypt   = require('bcryptjs');
const pool     = require('../config/db');
const { authenticate } = require('../middleware/auth');
const upload   = require('../middleware/upload');

const router = express.Router();

// ─── GET /api/users/me — Get own profile ──────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, full_name, email, phone, university, address, avatar_url, created_at,
              (SELECT COUNT(*) FROM products WHERE seller_id = u.id AND status = 'sold') AS products_sold,
              (SELECT COUNT(*) FROM products WHERE seller_id = u.id AND status = 'active') AS products_active
       FROM users u
       WHERE id = $1`,
      [req.user.id]
    );

    if (!result.rows[0]) return res.status(404).json({ message: 'User tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil profil' });
  }
});

// ─── PUT /api/users/me — Update own profile ───────────────────────────────
router.put('/me', authenticate, upload.single('avatar'), async (req, res) => {
  const { full_name, email, phone, university, address } = req.body;
  const avatar_url = req.file ? `/uploads/${req.file.filename}` : undefined;

  try {
    const fields = [];
    const values = [];
    let idx = 1;

    if (full_name)  { fields.push(`full_name = $${idx++}`);  values.push(full_name); }
    if (email)      { fields.push(`email = $${idx++}`);      values.push(email); }
    if (phone)      { fields.push(`phone = $${idx++}`);      values.push(phone); }
    if (university) { fields.push(`university = $${idx++}`); values.push(university); }
    if (address)    { fields.push(`address = $${idx++}`);    values.push(address); }
    if (avatar_url) { fields.push(`avatar_url = $${idx++}`); values.push(avatar_url); }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'Tidak ada data yang diubah' });
    }

    values.push(req.user.id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING id, username, full_name, email, phone, university, address, avatar_url`,
      values
    );

    res.json({ message: 'Profil berhasil diperbarui', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Email sudah digunakan' });
    console.error(err);
    res.status(500).json({ message: 'Gagal memperbarui profil' });
  }
});

// ─── PUT /api/users/me/password — Change password ─────────────────────────
router.put('/me/password', authenticate, async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) {
    return res.status(400).json({ message: 'Password lama dan baru wajib diisi' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ message: 'Password baru minimal 6 karakter' });
  }

  try {
    const result = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(old_password, result.rows[0].password);
    if (!valid) return res.status(401).json({ message: 'Password lama salah' });

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, req.user.id]);
    res.json({ message: 'Password berhasil diubah' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengubah password' });
  }
});

// ─── GET /api/users/:id — Public profile ──────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, full_name, university, avatar_url, created_at,
              (SELECT COUNT(*) FROM products WHERE seller_id = u.id AND status = 'sold') AS products_sold,
              (SELECT COUNT(*) FROM products WHERE seller_id = u.id AND status = 'active') AS products_active
       FROM users u WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'User tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil profil' });
  }
});

module.exports = router;
