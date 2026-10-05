# Geekey Engineering Co — Web App

## Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, React Query, Axios, React Router v6
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL

---

## Quick Start

### 1. Database
```bash
createdb geekey_db
```

### 2. Backend
```bash
cd backend
cp .env.example .env        # fill in your DB credentials
npm install
npm run db:migrate          # creates tables + seeds sample data
npm run dev                 # starts on :4000
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env        # set REACT_APP_API_BASE_URL=http://localhost:4000/api
npm install
npm start                   # starts on :3000
```

---

## Project Structure

```
backend/src/
  config.ts           — env-validated config (never raw process.env in code)
  types/index.ts      — all shared types
  constants/index.ts  — HTTP status, batch status constants
  db/
    pool.ts           — pg pool + typed query helpers
    migrate.ts        — schema + seed
  middleware/
    logger.ts         — winston logger
    response.ts       — sendSuccess / sendError (always wrapped)
    errorHandler.ts   — global error handler
  services/           — all business logic (no DB in controllers)
  controllers/        — thin: parse request → call service → sendSuccess/sendError
  routes/index.ts     — all routes in one place

frontend/src/
  types/index.ts      — domain types (mirrored from backend)
  constants/index.ts  — routes, labels, colors
  api/
    client.ts         — axios instance; response unwrapped here ONCE
    vendorApi.ts      — typed vendor calls
    itemApi.ts        — typed item calls
    pricingApi.ts     — typed pricing calls
  components/
    ui/index.tsx      — Button, Badge, Spinner, DataTable, Modal, Input, Select, Card
    layout/AppShell   — sidebar nav + outlet
  pages/
    ItemMasterPage
    PricingUpdatePage  — batch list, create, preview, approve
    VendorMasterPage
```

---

## Key Design Decisions

| Rule | How it's enforced |
|------|------------------|
| API response always unwrapped | `client.ts` interceptor does it once — never in components |
| No non-null assertions (`!`) | Types designed so null is explicit; guards used instead |
| All config from env | `config.ts` validates at startup — missing vars throw immediately |
| Consistent UI patterns | All UI through shared `components/ui/index.tsx` |
| No logic duplication | Pricing calc in one service; filters built in one helper |
| Types always defined | Separate `types/index.ts` on both sides; no `any` |
| Constants centralized | `constants/index.ts` for routes, colors, labels |
| Components split | Page → Section → Modal/Table/Form hierarchy |

---

## API Endpoints

```
GET    /api/vendors
PUT    /api/vendors/:id

GET    /api/items?grade=&vendorId=&customerName=&page=&pageSize=
GET    /api/items/filter-options
GET    /api/items/:id

GET    /api/pricing/batches
POST   /api/pricing/batches          { description, grade, vendorId, itemMasterIds, updatedMmr, ... }
GET    /api/pricing/batches/:id
GET    /api/pricing/batches/:id/items
POST   /api/pricing/batches/:id/approve

GET    /api/pricing/log?castingCode=&itemCode=
```
