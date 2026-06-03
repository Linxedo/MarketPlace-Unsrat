const express  = require('express');
const pool     = require('../config/db');
const { authenticate } = require('../middleware/auth');
const upload   = require('../middleware/upload');

const router = express.Router();

// ─── GET /api/products — List products (search, filter, sort, paginate) ───
router.get('/', async (req, res) => {
  const {
    search   = '',
    category = '',
    sort     = 'terbaru',
    page     = 1,
    limit    = 12,
    seller_id,
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const conditions = [`p.status = 'active'`];
  const values = [];
  let idx = 1;

  if (search) {
    conditions.push(`(p.name ILIKE $${idx} OR p.description ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }
  if (category) {
    conditions.push(`p.category = $${idx}`);
    values.push(category);
    idx++;
  }
  if (seller_id) {
    conditions.push(`p.seller_id = $${idx}`);
    values.push(parseInt(seller_id));
    idx++;
  }

  const sortMap = {
    terbaru:        'p.created_at DESC',
    harga_terendah: 'p.price ASC',
    harga_tertinggi:'p.price DESC',
    populer:        'p.views DESC',
  };
  const orderBy = sortMap[sort] || 'p.created_at DESC';

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM products p ${where}`,
      values
    );
    const total = parseInt(countRes.rows[0].count);

    values.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT p.id, p.name, p.description, p.price, p.category, p.image_url, p.views,
              p.created_at, u.id AS seller_id, u.full_name AS seller_name, u.username AS seller_username
       FROM products p
       JOIN users u ON u.id = p.seller_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      values
    );

    res.json({
      products: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil produk' });
  }
});

// ─── GET /api/products/:id — Product detail ───────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE products SET views = views + 1 WHERE id = $1', [req.params.id]);
    const result = await pool.query(
      `SELECT p.*, u.id AS seller_id, u.full_name AS seller_name,
              u.username AS seller_username, u.avatar_url AS seller_avatar
       FROM products p
       JOIN users u ON u.id = p.seller_id
       WHERE p.id = $1 AND p.status != 'deleted'`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Produk tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil produk' });
  }
});

// ─── POST /api/products — Create product ──────────────────────────────────
router.post('/', authenticate, upload.single('image'), async (req, res) => {
  const { name, description, price, category } = req.body;
  if (!name || !price) {
    return res.status(400).json({ message: 'Nama dan harga produk wajib diisi' });
  }
  if (isNaN(price) || parseInt(price) <= 0) {
    return res.status(400).json({ message: 'Harga harus berupa angka positif' });
  }

  const image_url = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const result = await pool.query(
      `INSERT INTO products (seller_id, name, description, price, category, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.id, name, description || null, parseInt(price), category || 'Lainnya', image_url]
    );
    res.status(201).json({ message: 'Produk berhasil ditambahkan', product: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal menambahkan produk' });
  }
});

// ─── PUT /api/products/:id — Update product ───────────────────────────────
router.put('/:id', authenticate, upload.single('image'), async (req, res) => {
  const { name, description, price, category, status } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : undefined;

  try {
    const existing = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND status != $2',
      [req.params.id, 'deleted']
    );
    if (!existing.rows[0]) return res.status(404).json({ message: 'Produk tidak ditemukan' });
    if (existing.rows[0].seller_id !== req.user.id) {
      return res.status(403).json({ message: 'Tidak punya akses ke produk ini' });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (name)        { fields.push(`name = $${idx++}`);        values.push(name); }
    if (description) { fields.push(`description = $${idx++}`); values.push(description); }
    if (price)       { fields.push(`price = $${idx++}`);       values.push(parseInt(price)); }
    if (category)    { fields.push(`category = $${idx++}`);    values.push(category); }
    if (status)      { fields.push(`status = $${idx++}`);      values.push(status); }
    if (image_url)   { fields.push(`image_url = $${idx++}`);   values.push(image_url); }

    if (fields.length === 0) return res.status(400).json({ message: 'Tidak ada data yang diubah' });

    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    res.json({ message: 'Produk berhasil diperbarui', product: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal memperbarui produk' });
  }
});

// ─── DELETE /api/products/:id — Soft-delete product ──────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const existing = await pool.query(
      'SELECT seller_id FROM products WHERE id = $1 AND status != $2',
      [req.params.id, 'deleted']
    );
    if (!existing.rows[0]) return res.status(404).json({ message: 'Produk tidak ditemukan' });
    if (existing.rows[0].seller_id !== req.user.id) {
      return res.status(403).json({ message: 'Tidak punya akses ke produk ini' });
    }

    await pool.query("UPDATE products SET status = 'deleted' WHERE id = $1", [req.params.id]);
    res.json({ message: 'Produk berhasil dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal menghapus produk' });
  }
});

module.exports = router;
