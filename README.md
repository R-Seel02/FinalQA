# Wine Rental Service

A full-stack web application for renting expensive bottles of wine for display at events. Built for SER330 Final Project, Phase 2.

**Personas:** Customer (renter) and Cellar Concierge (staff). The defining domain rule is that bottles must be returned with their factory seal intact — a broken seal forfeits the customer's deposit.

---

## Tech Stack

- **Backend:** Node.js, Express, TypeScript, MongoDB (Mongoose)
- **Frontend:** React 18, TypeScript, Vite, React Router
- **Auth:** JWT with role-based middleware
- **Testing:** Jest + Supertest + mongodb-memory-server (backend), Vitest + React Testing Library (frontend)
- **Linting:** TypeScript strict mode

---

## Repository Layout

```
wine-rental-service/
├── backend/                Node.js + Express API
│   ├── src/
│   │   ├── config/         env loading, MongoDB connection
│   │   ├── models/         Mongoose schemas (User, Bottle, Reservation, AuditEntry)
│   │   ├── services/       business logic (auth, reservations, returns, payment mock)
│   │   ├── controllers/    thin HTTP handlers
│   │   ├── routes/         Express routers
│   │   ├── middleware/     auth, error handler, async wrapper
│   │   ├── utils/          errors, logger, date helpers
│   │   └── types/          shared TypeScript types
│   ├── tests/              Jest test suites
│   ├── seed/               database seed script
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── frontend/               React + Vite app
│   ├── src/
│   │   ├── api/            typed fetch client
│   │   ├── components/     LoginForm, BottleCard, ReservationModal, ...
│   │   ├── pages/          AuthPage, CatalogPage, MyRentalsPage, StaffPage
│   │   ├── context/        AuthContext
│   │   ├── types/
│   │   └── styles/
│   ├── tests/              Vitest component tests
│   └── package.json
├── docker-compose.yml      MongoDB container for local development
├── docs/
│   └── PHASE2_WRITEUP.docx Phase 2 deliverable answering Q9-Q12
└── README.md
```

---

## Prerequisites

You will need:

- **Node.js 18+** and **npm 9+** (verify with `node --version` and `npm --version`)
- **MongoDB 6.0+**, accessible via either:
  - A local install (instructions below), or
  - Docker, using the supplied `docker-compose.yml`, or
  - A hosted MongoDB Atlas cluster (free tier is sufficient)

---

## Connecting to MongoDB

You have three options. Pick whichever fits your environment.

### Option A — Docker (recommended; the simplest path)

A `docker-compose.yml` is included at the repo root. With Docker Desktop or Docker Engine installed:

```bash
# From the repo root
docker compose up -d

# Confirm MongoDB is reachable
docker compose ps
```

This starts MongoDB on `localhost:27017` with no authentication. Your `MONGODB_URI` should be:

```
mongodb://localhost:27017/wine-rental
```

To stop and remove the container later:

```bash
docker compose down
```

### Option B — Local install

**macOS (Homebrew):**

```bash
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

**Ubuntu/Debian:**

Follow the official guide at [https://www.mongodb.com/docs/manual/administration/install-on-linux/](https://www.mongodb.com/docs/manual/administration/install-on-linux/). The summary is:

```bash
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

**Windows:**

Download the MSI installer from [https://www.mongodb.com/try/download/community](https://www.mongodb.com/try/download/community) and run it. The installer will offer to start MongoDB as a Windows service.

After install, your `MONGODB_URI` is `mongodb://localhost:27017/wine-rental`.

### Option C — MongoDB Atlas (cloud)

1. Create a free account at [https://cloud.mongodb.com/](https://cloud.mongodb.com/).
2. Create a new free-tier (M0) cluster.
3. Add your IP to the network access allowlist.
4. Create a database user.
5. Click **Connect** → **Drivers** and copy the connection string. It looks like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/wine-rental?retryWrites=true&w=majority
   ```
6. Use that string as your `MONGODB_URI`.

---

## Initial Setup

### 1. Clone and install

```bash
git clone <your-fork-url>
cd wine-rental-service

# Install backend deps
cd backend
npm install

# Install frontend deps
cd ../frontend
npm install
```

### 2. Configure environment

```bash
cd ../backend
cp .env.example .env
```

Edit `.env`:

```env
PORT=4000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/wine-rental
JWT_SECRET=replace-this-with-a-long-random-string
JWT_EXPIRES_IN=24h
FRONTEND_URL=http://localhost:5173
```

> **Important:** Generate a real `JWT_SECRET` for any non-development use. A good source is `openssl rand -hex 32`.

### 3. Seed the database

```bash
cd backend
npm run seed
```

This wipes any existing data and inserts:
- Two test users:
  - **Customer** — `customer@example.com` / `Customer1!`
  - **Concierge** — `concierge@example.com` / `Concierge1!`
- Six sample bottles spanning Bordeaux, Burgundy, Napa, Tuscany, Australia, and Champagne.

### 4. Run the application

In two terminals:

```bash
# Terminal 1 — backend (port 4000)
cd backend
npm run dev

# Terminal 2 — frontend (port 5173)
cd frontend
npm run dev
```

Open `http://localhost:5173` in a browser. The frontend Vite dev server proxies `/api/*` to the backend automatically.

---

## Running Tests

### Backend

```bash
cd backend
npm test
```

The backend tests use `mongodb-memory-server`, which downloads a MongoDB binary on first run (~150 MB, cached afterwards). On networks where the MongoDB CDN is unreachable, set `TEST_MONGODB_URI` to point at any MongoDB instance and the tests will use it instead:

```bash
TEST_MONGODB_URI=mongodb://localhost:27017/wine-rental-test npm test
```

The test suite covers approximately 40 cases mapping back to specific Phase 1 acceptance criteria. Coverage report:

```bash
npm run test:coverage
```

### Frontend

```bash
cd frontend
npm test
```

---

## Building for Production

```bash
# Backend
cd backend
npm run build
npm start

# Frontend
cd frontend
npm run build
npm run preview
```

---

## API Quick Reference

All endpoints are prefixed with `/api`. Authenticated endpoints require `Authorization: Bearer <jwt>`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | none | Create a customer account |
| POST | `/auth/login` | none | Sign in (returns JWT and user) |
| GET | `/catalog` | none | Paginated list of available bottles |
| GET | `/catalog/:id` | none | Single bottle detail |
| POST | `/reservations` | customer | Create a reservation |
| DELETE | `/reservations/:id` | customer | Cancel own reservation |
| GET | `/reservations/me` | customer | List own active reservations |
| POST | `/reservations/:id/reassign` | concierge | Override to substitute bottle |
| POST | `/reservations/:id/pickup` | concierge | Mark a bottle picked up |
| POST | `/reservations/:id/return` | concierge | Process return (clean or broken seal) |
| POST | `/bottles` | concierge | Add a bottle to inventory |
| POST | `/bottles/:id/retire` | concierge | Retire a bottle |
| POST | `/bottles/:id/mark-missing` | concierge | Mark bottle missing (after 30 days overdue) |
| POST | `/jobs/late-fees` | concierge | Trigger daily late-fee accrual |

All errors follow the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "human-readable message",
    "details": { /* optional field-level info */ }
  }
}
```

---

## Domain Rules Enforced in Code

| Rule | Where |
|------|-------|
| Password complexity (8+ chars, upper, digit, symbol) | `models/User.ts`, `services/authService.ts` |
| Deposit equals retail value | `models/Bottle.ts` (pre-validate hook) |
| Vintage between 1900 and current year | `models/Bottle.ts` schema |
| Rental period 1–30 nights | `services/reservationService.ts` |
| Start date no earlier than tomorrow | `services/reservationService.ts` |
| No overlapping reservations on same bottle | `services/reservationService.ts` |
| Boundary day overlap rejected | `utils/dateHelpers.ts` |
| Customer can only cancel own reservation | `services/reservationService.ts` |
| Concierge-only inventory and inspection | `middleware/auth.ts` (role guard) |
| Broken seal → bottle Damaged + deposit forfeit | `services/returnService.ts` |
| 30-day overdue threshold for Missing | `services/returnService.ts` |
| Late fees: 25% per night, capped at deposit | `services/returnService.ts` |
| Lockout after 5 failed logins in 10 min | `services/authService.ts` |

---

## License

Educational project. Not for commercial use.
