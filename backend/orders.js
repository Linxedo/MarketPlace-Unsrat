const express = require('express');
const pool    = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/** Generate order number like #PSN-2026-05-00123 */
function generateOrderNumber() {
  const now    = new Date();
  const year   = now.getFullYear();
  const month  = String(now.getMonth() + 1).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
  return `PSN-${year}-${month}-${random}`;
}

// ─── GET /api/orders — List my orders (with optional status filter) ───────
router.get('/', authenticate, async (req, res) => {
  const { status } = req.query;

  const conditions = ['o.buyer_id = $1'];
  const values     = [req.user.id];

  if (status) {
    conditions.push(`o.status = $2`);
    values.push(status);
  }

  try {
    const result = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.total, o.note, o.created_at,
              JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id',        oi.id,
                  'name',      oi.name,
                  'price',     oi.price,
                  'quantity',  oi.quantity,
                  'image_url', oi.image_url,
                  'seller_id', oi.seller_id
                )
              ) AS items
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil pesanan' });
  }
});

// ─── GET /api/orders/:id — Order detail ──────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, u.full_name AS buyer_name,
              JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id',          oi.id,
                  'product_id',  oi.product_id,
                  'name',        oi.name,
                  'price',       oi.price,
                  'quantity',    oi.quantity,
                  'image_url',   oi.image_url,
                  'seller_id',   oi.seller_id
                )
              ) AS items
       FROM orders o
       JOIN users u       ON u.id = o.buyer_id
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1 AND o.buyer_id = $2
       GROUP BY o.id, u.full_name`,
      [req.params.id, req.user.id]
    );

    if (!result.rows[0]) return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil detail pesanan' });
  }
});

// ─── POST /api/orders — Checkout (create order from cart) ─────────────────
router.post('/', authenticate, async (req, res) => {
  const { note, product_ids } = req.body;
  // product_ids: optional array to checkout only specific cart items

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get cart items
    let cartQuery = `
      SELECT ci.id AS cart_item_id, ci.quantity,
             p.id AS product_id, p.name, p.price, p.image_url, p.status, p.seller_id
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.user_id = $1
    `;
    const cartValues = [req.user.id];

    if (product_ids && product_ids.length > 0) {
      cartQuery += ` AND p.id = ANY($2)`;
      cartValues.push(product_ids);
    }

    const cartRes = await client.query(cartQuery, cartValues);

    if (cartRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Keranjang kosong' });
    }

    // 2. Validate all items are still active
    const inactive = cartRes.rows.filter(r => r.status !== 'active');
    if (inactive.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Beberapa produk sudah tidak tersedia',
        products: inactive.map(i => i.name),
      });
    }

    // 3. Calculate total
    const total = cartRes.rows.reduce((sum, r) => sum + r.price * r.quantity, 0);

    // 4. Create order
    const orderRes = await client.query(
      `INSERT INTO orders (buyer_id, order_number, total, note)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, generateOrderNumber(), total, note || null]
    );
    const order = orderRes.rows[0];

    // 5. Insert order items
    for (const item of cartRes.rows) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, seller_id, name, price, quantity, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [order.id, item.product_id, item.seller_id, item.name, item.price, item.quantity, item.image_url]
      );
    }

    // 6. Remove checked-out items from cart
    const cartItemIds = cartRes.rows.map(r => r.cart_item_id);
    await client.query(
      'DELETE FROM cart_items WHERE id = ANY($1)',
      [cartItemIds]
    );

    await client.query('COMMIT');
    res.status(201).json({ message: 'Pesanan berhasil dibuat', order });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Gagal membuat pesanan' });
  } finally {
    client.release();
  }
});

// ─── PUT /api/orders/:id/cancel — Cancel order ───────────────────────────
router.put('/:id/cancel', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE orders SET status = 'dibatalkan'
       WHERE id = $1 AND buyer_id = $2 AND status = 'menunggu_pembayaran'
       RETURNING *`,
      [req.params.id, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(400).json({
        message: 'Pesanan tidak ditemukan atau tidak dapat dibatalkan (hanya pesanan yang belum dibayar bisa dibatalkan)',
      });
    }

    res.json({ message: 'Pesanan berhasil dibatalkan', order: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal membatalkan pesanan' });
  }
});

// ─── PUT /api/orders/:id/status — Update status (seller/admin) ───────────
router.put('/:id/status', authenticate, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['menunggu_pembayaran', 'sedang_dikirim', 'selesai', 'dibatalkan'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Status tidak valid' });
  }

  try {
    // Only allow seller of items in this order to update
    const check = await pool.query(
      `SELECT DISTINCT oi.seller_id FROM order_items oi WHERE oi.order_id = $1`,
      [req.params.id]
    );
    const isSellerInOrder = check.rows.some(r => r.seller_id === req.user.id);

    if (!isSellerInOrder) {
      return res.status(403).json({ message: 'Tidak punya akses ke pesanan ini' });
    }

    const result = await pool.query(
      `UPDATE orders SET status = $1 WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );

    if (!result.rows[0]) return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
    res.json({ message: 'Status pesanan diperbarui', order: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal memperbarui status pesanan' });
  }
});

module.exports = router;
