-- ============================================================
-- Marketplace Unsrat — Database Schema
-- Run this file once to set up all tables:
--   psql -U postgres -d marketplace_unsrat -f schema.sql
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  username    VARCHAR(50)  UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  full_name   VARCHAR(100) NOT NULL,
  email       VARCHAR(100) UNIQUE NOT NULL,
  phone       VARCHAR(20),
  university  VARCHAR(150) DEFAULT 'Universitas Sam Ratulangi Manado',
  address     TEXT,
  avatar_url  VARCHAR(255),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  seller_id   INT REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(150) NOT NULL,
  description TEXT,
  price       BIGINT       NOT NULL,        -- stored in IDR (no decimal)
  category    VARCHAR(50)  DEFAULT 'Lainnya',
  image_url   VARCHAR(255),
  status      VARCHAR(20)  DEFAULT 'active' CHECK (status IN ('active', 'sold', 'deleted')),
  views       INT          DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Cart items
CREATE TABLE IF NOT EXISTS cart_items (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE CASCADE,
  product_id  INT REFERENCES products(id) ON DELETE CASCADE,
  quantity    INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id          SERIAL PRIMARY KEY,
  buyer_id    INT REFERENCES users(id) ON DELETE SET NULL,
  order_number VARCHAR(30) UNIQUE NOT NULL,
  status      VARCHAR(30) DEFAULT 'menunggu_pembayaran'
                CHECK (status IN ('menunggu_pembayaran', 'sedang_dikirim', 'selesai', 'dibatalkan')),
  total       BIGINT NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Order line items
CREATE TABLE IF NOT EXISTS order_items (
  id          SERIAL PRIMARY KEY,
  order_id    INT REFERENCES orders(id) ON DELETE CASCADE,
  product_id  INT REFERENCES products(id) ON DELETE SET NULL,
  seller_id   INT REFERENCES users(id) ON DELETE SET NULL,
  name        VARCHAR(150) NOT NULL,   -- snapshot at time of purchase
  price       BIGINT       NOT NULL,
  quantity    INT          NOT NULL DEFAULT 1,
  image_url   VARCHAR(255)
);

-- Indexes for frequent queries
CREATE INDEX IF NOT EXISTS idx_products_seller   ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_status   ON products(status);
CREATE INDEX IF NOT EXISTS idx_cart_user         ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer      ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- Trigger: auto-update orders.updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed: one demo user (password: "password123")
INSERT INTO users (username, password, full_name, email, phone, address)
VALUES (
  'graciano',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lLui',
  'Graciano',
  'graciano@unsrat.ac.id',
  '+62 812 3456 7890',
  'Jl. Kampus Bahu, Manado, Sulawesi Utara 95115'
) ON CONFLICT DO NOTHING;
