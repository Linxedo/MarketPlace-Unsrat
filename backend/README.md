# Marketplace Unsrat — Backend API

REST API for Marketplace Unsrat built with **Node.js + Express + PostgreSQL**.

---

## Requirements

- Node.js v18+
- PostgreSQL 14+

---

## Quick Start

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your PostgreSQL credentials and a strong JWT secret:

```env
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=marketplace_unsrat
DB_USER=postgres
DB_PASSWORD=your_password_here

JWT_SECRET=ganti_dengan_string_rahasia_yang_panjang
JWT_EXPIRES_IN=7d
```

### 3. Create the database and run schema

```bash
psql -U postgres -c "CREATE DATABASE marketplace_unsrat;"
psql -U postgres -d marketplace_unsrat -f schema.sql
```

The schema file also seeds one demo user:
- **username:** `graciano`  
- **password:** `password123`

### 4. Start the server

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Server runs at `http://localhost:3000`

---

## API Reference

All endpoints return JSON. Protected routes require:
```
Authorization: Bearer <token>
```

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |

**Register body:**
```json
{
  "username": "john",
  "password": "secret123",
  "full_name": "John Doe",
  "email": "john@unsrat.ac.id",
  "phone": "+62 812 xxxx",
  "address": "Jl. Kampus..."
}
```

**Login body:**
```json
{ "username": "graciano", "password": "password123" }
```

---

### Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users/me` | ✅ | Get own profile + stats |
| PUT | `/api/users/me` | ✅ | Update profile (form-data, supports avatar upload) |
| PUT | `/api/users/me/password` | ✅ | Change password |
| GET | `/api/users/:id` | ❌ | Public profile |

---

### Products

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/products` | ❌ | List products |
| GET | `/api/products/:id` | ❌ | Product detail |
| POST | `/api/products` | ✅ | Create product (form-data) |
| PUT | `/api/products/:id` | ✅ | Update product |
| DELETE | `/api/products/:id` | ✅ | Delete product (soft delete) |

**GET /api/products query params:**
- `search` — search by name/description
- `category` — `Elektronik`, `Fashion`, `Alat Tulis`, `Lainnya`
- `sort` — `terbaru` | `harga_terendah` | `harga_tertinggi` | `populer`
- `page` / `limit` — pagination (default: page=1, limit=12)
- `seller_id` — filter by seller

**POST /api/products form-data:**
```
name        = Asus TUF
price       = 9000000
description = Laptop gaming RAM 8GB
category    = Elektronik
image       = <file>
```

---

### Cart

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/cart` | ✅ | View cart (items + subtotal) |
| POST | `/api/cart` | ✅ | Add item to cart |
| PUT | `/api/cart/:id` | ✅ | Update item quantity |
| DELETE | `/api/cart/:id` | ✅ | Remove one item |
| DELETE | `/api/cart` | ✅ | Clear entire cart |

**POST /api/cart body:**
```json
{ "product_id": 1, "quantity": 1 }
```

---

### Orders

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/orders` | ✅ | List my orders |
| GET | `/api/orders/:id` | ✅ | Order detail |
| POST | `/api/orders` | ✅ | Checkout (creates order from cart) |
| PUT | `/api/orders/:id/cancel` | ✅ | Cancel order (only while pending) |
| PUT | `/api/orders/:id/status` | ✅ | Update status (seller only) |

**GET /api/orders query params:**
- `status` — `menunggu_pembayaran` | `sedang_dikirim` | `selesai` | `dibatalkan`

**POST /api/orders body:**
```json
{
  "note": "Tolong dibungkus rapi",
  "product_ids": [1, 3]   // optional — checkout only these products from cart
}
```

---

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── db.js          # PostgreSQL connection pool
│   ├── middleware/
│   │   ├── auth.js        # JWT authentication
│   │   └── upload.js      # Multer image upload
│   ├── routes/
│   │   ├── auth.js        # POST /api/auth/*
│   │   ├── users.js       # GET|PUT /api/users/*
│   │   ├── products.js    # CRUD /api/products/*
│   │   ├── cart.js        # CRUD /api/cart/*
│   │   └── orders.js      # CRUD /api/orders/*
│   ├── uploads/           # Uploaded product/avatar images
│   └── index.js           # App entry point
├── schema.sql             # Database schema + seed
├── .env.example
├── package.json
└── README.md
```
