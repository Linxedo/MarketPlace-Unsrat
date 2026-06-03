const express = require('express');
const pool    = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/cart — View cart ────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ci.id, ci.quantity, ci.added_at,
              p.id AS product_id, p.name, p.price, p.image_url, p.status,
              u.id AS seller_id, u.full_name AS seller_name
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       JOIN users    u ON u.id = p.seller_id
       WHERE ci.user_id = $1
       ORDER BY ci.added_at DESC`,
      [req.user.id]
    );

    const items = result.rows;
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    res.json({ items, subtotal, item_count: items.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil keranjang' });
  }
});

// ─── POST /api/cart — Add item to cart ───────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  const { product_id, quantity = 1 } = req.body;
  if (!product_id) return res.status(400).json({ message: 'product_id wajib diisi' });
  if (parseInt(quantity) < 1) return res.status(400).json({ message: 'Jumlah minimal 1' });

  try {
    // Check product exists and is not the user's own
    const prod = await pool.query(
      "SELECT id, seller_id FROM products WHERE id = $1 AND status = 'active'",
      [product_id]
    );
    if (!prod.rows[0]) return res.status(404).json({ message: 'Produk tidak ditemukan' });
    if (prod.rows[0].seller_id === req.user.id) {
      return res.status(400).json({ message: 'Tidak bisa membeli produk sendiri' });
    }

    const result = await pool.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id)
         DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
       RETURNING *`,
      [req.user.id, product_id, parseInt(quantity)]
    );

    res.status(201).json({ message: 'Produk ditambahkan ke keranjang', item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal menambahkan ke keranjang' });
  }
});

// ─── PUT /api/cart/:id — Update quantity ─────────────────────────────────
router.put('/:id', authenticate, async (req, res) => {
  const { quantity } = req.body;
  if (!quantity || parseInt(quantity) < 1) {
    return res.status(400).json({ message: 'Jumlah minimal 1' });
  }

  try {
    const result = await pool.query(
      `UPDATE cart_items SET quantity = $1
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [parseInt(quantity), req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Item tidak ditemukan' });
    res.json({ message: 'Jumlah berhasil diperbarui', item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal memperbarui keranjang' });
  }
});

// ─── DELETE /api/cart/:id — Remove item ──────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Item tidak ditemukan' });
    res.json({ message: 'Item dihapus dari keranjang' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal menghapus item' });
  }
});

// ─── DELETE /api/cart — Clear entire cart ────────────────────────────────
router.delete('/', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'Keranjang berhasil dikosongkan' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengosongkan keranjang' });
  }
});

module.exports = router;
