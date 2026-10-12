# EDPAbarber — Barbershop Reservation & Payment System

Premium barbershop booking platform with online payment via Midtrans.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript |
| Backend | Node.js + Express |
| Database | MySQL (XAMPP) |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Payment | Midtrans Snap |

---

## Project Structure

```
EDPAbarber/
├── backend/
│   ├── config/
│   │   └── database.js          # MySQL connection pool
│   ├── middleware/
│   │   └── auth.js              # JWT verify + role guard
│   ├── routes/
│   │   ├── auth.js              # /api/auth
│   │   ├── barbers.js           # /api/barbers
│   │   ├── bookings.js          # /api/bookings
│   │   ├── customers.js         # /api/customers
│   │   ├── dashboard.js         # /api/dashboard
│   │   ├── payments.js          # /api/payments  (Midtrans)
│   │   └── services.js          # /api/services
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   └── server.js
├── database/
│   └── edpabarber.sql           # Full schema + seed data
├── frontend/
│   ├── index.html               # Homepage
│   ├── login.html               # Login / Register
│   ├── booking.html             # 6-step booking wizard
│   ├── preview.html             # Booking confirmation
│   ├── customer-dashboard.html  # Customer dashboard
│   ├── admin-dashboard.html     # Admin panel
│   ├── services.html            # Services listing
│   ├── barbers.html             # Barbers listing
│   ├── style.css                # Design system (dark/gold)
│   └── script.js                # All frontend logic
└── README.md
```

---

## Setup Instructions

### 1. Prerequisites

- [XAMPP](https://www.apachefriends.org/) (MySQL + phpMyAdmin)
- [Node.js](https://nodejs.org/) v18+
- npm

---

### 2. Database Setup

1. Start **XAMPP** → start **Apache** and **MySQL**.
2. Open [phpMyAdmin](http://localhost/phpmyadmin).
3. Click **Import** → choose `database/edpabarber.sql` → click **Go**.

This creates:
- Database `edpabarber_db`
- Tables: `users`, `customers`, `barbers`, `services`, `bookings`, `payments`
- Seed data: 3 services, 3 barbers

> Admin and demo customer accounts are created automatically when the server starts.

---

### 3. Backend Setup

```bash
cd backend
npm install
```

Copy the environment file and fill in your values:

```bash
copy .env.example .env
```

Edit `.env`:

```env
PORT=3000
APP_URL=http://localhost:3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=edpabarber_db

JWT_SECRET=generate-a-long-random-string-here

MIDTRANS_ENV=sandbox
MIDTRANS_SERVER_KEY=your-midtrans-server-key
MIDTRANS_CLIENT_KEY=your-midtrans-client-key

WHATSAPP_NUMBER=6289541541861
```

Generate a secure JWT secret (run in terminal):
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

### 4. Run the Server

```bash
# Development (auto-restart on file change)
npm run dev

# Production
npm start
```

Server starts at: **http://localhost:3000**

---

### 5. Demo Accounts

These are created automatically on first server start:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@edpabarber.com` | `Admin123!` |
| Customer | `customer@edpabarber.com` | `Customer123!` |

---

## API Endpoints

### Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Register new customer |
| POST | `/login` | — | Login, returns JWT |
| POST | `/logout` | ✓ | Logout |
| GET  | `/me` | ✓ | Current user info |

### Services — `/api/services`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET  | `/` | — | List services (`?status=active`) |
| GET  | `/:id` | — | Single service |
| POST | `/` | Admin | Create service |
| PUT  | `/:id` | Admin | Update service |
| DELETE | `/:id` | Admin | Deactivate service |

### Barbers — `/api/barbers`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET  | `/` | — | List barbers |
| GET  | `/:id` | — | Single barber |
| POST | `/` | Admin | Add barber |
| PUT  | `/:id` | Admin | Update barber |
| DELETE | `/:id` | Admin | Deactivate barber |

### Bookings — `/api/bookings`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | Customer | Create booking |
| GET  | `/` | ✓ | List bookings (customer: own, admin: all) |
| GET  | `/:id` | ✓ | Booking detail |
| PUT  | `/:id/status` | Admin | Update booking status |
| DELETE | `/:id` | ✓ | Cancel booking |

Query filters: `?date=YYYY-MM-DD`, `?status=pending`, `?barber_id=1`, `?month=YYYY-MM`

### Payments — `/api/payments`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/snap` | Customer | Create Midtrans Snap transaction |
| POST | `/webhook` | — (Midtrans) | Payment status webhook |
| GET  | `/all` | Admin | All payment records |
| GET  | `/:bookingId` | ✓ | Payment for a booking |
| POST | `/manual` | Admin | Mark booking as paid manually |

### Customers — `/api/customers`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Admin | All customers |
| GET | `/me` | Customer | Own profile |
| PUT | `/me` | Customer | Update own profile |

### Dashboard — `/api/dashboard`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/stats` | Admin | Booking & revenue statistics |

---

## Midtrans Payment Setup

### Get API Keys

1. Register at [https://dashboard.midtrans.com](https://dashboard.midtrans.com)
2. Go to **Settings → Access Keys**
3. Copy **Server Key** and **Client Key** (use Sandbox keys for testing)
4. Add to `.env`:

```env
MIDTRANS_ENV=sandbox
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxx
```

### Configure Webhook (Payment Notification URL)

Midtrans needs to reach your server to update payment status.

**For local development**, use [ngrok](https://ngrok.com):

```bash
# Install ngrok, then:
ngrok http 3000
# Copy the HTTPS URL, e.g. https://abc123.ngrok.io
```

In Midtrans Dashboard → **Settings → Configuration**:
- Set **Payment Notification URL** to:
  `https://abc123.ngrok.io/api/payments/webhook`

**For production**, use your actual domain:
  `https://yourdomain.com/api/payments/webhook`

### Test Payments (Sandbox)

Use these test card numbers from [Midtrans docs](https://docs.midtrans.com/docs/testing-payment):

| Payment | Test Data |
|---|---|
| QRIS | Scan the test QR — auto approve |
| Credit Card | `4811 1111 1111 1114` CVV `123` EXP `01/26` |
| Bank Transfer | Any virtual account number |

---

## How to Test the Full Booking Flow

1. Open **http://localhost:3000**
2. Click **BOOK NOW**
3. Log in as `customer@edpabarber.com` / `Customer123!`
4. Complete the 6-step booking wizard:
   - Step 1: Select a service
   - Step 2: Choose a barber
   - Step 3: Pick a date (tomorrow or later)
   - Step 4: Select a time slot
   - Step 5: Add optional notes
   - Step 6: Review summary → Confirm
5. Booking is created with status **pending**
6. View confirmation page with booking code + WhatsApp button

### Test with Midtrans (sandbox only):

After booking is confirmed, trigger payment via API:
```
POST /api/payments/snap
{ "booking_id": 1 }
Authorization: Bearer <your-token>
```

This returns a `snap_token`. Open the Snap payment page to complete payment.

---

## How to Create an Admin Account

The default admin is seeded automatically. To add more admins:

```sql
-- In phpMyAdmin or MySQL CLI
INSERT INTO users (name, email, password, role)
VALUES ('New Admin', 'newadmin@edpabarber.com', '<bcrypt-hash>', 'admin');
```

Or update an existing customer to admin:

```sql
UPDATE users SET role = 'admin' WHERE email = 'user@example.com';
```

---

## Security Notes

- Passwords are hashed with **bcrypt** (12 rounds)
- JWTs expire after **7 days**
- Midtrans `MIDTRANS_SERVER_KEY` is **never** sent to the frontend
- Webhook signature is verified with **SHA-512**
- No card data is stored — Midtrans handles PCI compliance
- Input is validated on both client and server
- Role-based access control on all protected routes
- CORS is configurable via `CORS_ORIGIN`

---

## Common Issues

**`Error: connect ECONNREFUSED 127.0.0.1:3306`**
→ MySQL is not running. Start XAMPP and ensure MySQL is active.

**`ER_ACCESS_DENIED_ERROR`**
→ Wrong DB_USER / DB_PASSWORD in `.env`. Default XAMPP: user=`root`, password=`(empty)`.

**`Table 'edpabarber_db.users' doesn't exist`**
→ Import `database/edpabarber.sql` in phpMyAdmin first.

**Booking shows "Barber already booked"**
→ That time slot is taken. Choose a different time or barber.

**Midtrans webhook not received**
→ Make sure ngrok is running and the webhook URL is set in Midtrans dashboard.

---

## License

© 2026 EDPAbarber. All rights reserved.
