# RBU Leasing — Plan 1: Foundation & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo, database schema, and a working JWT auth system with role-based guards, so later feature phases have a tested foundation to build on.

**Architecture:** Monorepo with `/server` (Express, layered routes → controllers → services → Prisma) and `/client` (Vue 3 + Vite). PostgreSQL via Prisma. Auth issues a JWT carrying `userId` and `role`; middleware verifies it and a `requireRole` guard protects write endpoints.

**Tech Stack:** Node.js LTS, Express, Prisma, PostgreSQL, bcrypt, jsonwebtoken, Vitest, Supertest, Vue 3, Vite, Pinia, Vue Router, Axios.

## Global Constraints

- Node.js: latest LTS.
- Vue: 3.x latest stable. Vite build tool.
- PostgreSQL: latest stable, accessed only through Prisma (no raw SQL in v1).
- All business logic lives in `server/src/services/`; controllers stay thin.
- Currency: PHP (formatting concern for later phases; store amounts as `Decimal`).
- Passwords hashed with bcrypt (cost 10+). JWT secret from env, never hard-coded.
- Roles enum: `ADMIN | LEASING_OFFICER | VIEWER`.
- TDD: every behavior gets a failing test first. Commit after each green step.

---

## File Structure (this plan)

```
/                         repo root
  package.json            workspaces: ["client", "server"]
  .gitignore
  server/
    package.json
    .env.example
    prisma/
      schema.prisma       User + all core models (models added now, used later)
      seed.js             seeds an initial ADMIN user
    src/
      index.js            Express app bootstrap
      app.js              app factory (exported for tests)
      lib/prisma.js       Prisma client singleton
      middleware/
        auth.js           verifyJwt + requireRole
        error.js          central error handler
      services/
        authService.js    register, login, hashing, token issue
      controllers/
        authController.js
      routes/
        authRoutes.js
    tests/
      authService.test.js
      authRoutes.test.js
  client/
    package.json
    index.html
    vite.config.js
    src/
      main.js
      App.vue
      router/index.js
      stores/auth.js       Pinia auth store (token, user, role)
      lib/api.js           Axios instance w/ token interceptor
      views/LoginView.vue
      views/DashboardView.vue  placeholder, guarded route
```

---

### Task 1: Monorepo scaffold + git

**Files:**
- Create: `package.json`, `.gitignore`, `server/package.json`, `client/package.json`

**Interfaces:**
- Produces: npm workspaces `client` and `server`; root scripts `dev:server`, `dev:client`.

- [ ] **Step 1: Initialize git and root workspace**

```bash
cd "RBU Leasing App"
git init
```

Create `package.json`:

```json
{
  "name": "rbu-leasing",
  "private": true,
  "workspaces": ["client", "server"],
  "scripts": {
    "dev:server": "npm --workspace server run dev",
    "dev:client": "npm --workspace client run dev"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.env
dist/
*.log
```

- [ ] **Step 3: Create server + client package manifests**

`server/package.json`:

```json
{
  "name": "server",
  "type": "module",
  "scripts": {
    "dev": "node src/index.js",
    "test": "vitest run",
    "prisma:migrate": "prisma migrate dev",
    "seed": "node prisma/seed.js"
  }
}
```

`client/package.json`:

```json
{
  "name": "client",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo with client/server workspaces"
```

---

### Task 2: Prisma schema + client singleton

**Files:**
- Create: `server/prisma/schema.prisma`, `server/src/lib/prisma.js`, `server/.env.example`

**Interfaces:**
- Produces: Prisma models `User, UnitOwner, Unit, Tenant, Lease, Payment` with enums `Role, UnitType, UnitStatus, LeaseStatus, PaymentStatus`; `prisma` client export from `src/lib/prisma.js`.

- [ ] **Step 1: Install deps**

```bash
npm --workspace server install express prisma @prisma/client bcrypt jsonwebtoken cors dotenv
npm --workspace server install -D vitest supertest
```

- [ ] **Step 2: Write `server/.env.example`**

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rbu_leasing?schema=public"
JWT_SECRET="change-me-in-prod"
JWT_EXPIRES_IN="1d"
PORT=4000
```

Copy to `.env` and set a real secret before running.

- [ ] **Step 3: Write `server/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role { ADMIN LEASING_OFFICER VIEWER }
enum UnitType { STUDIO ONE_BR TWO_BR THREE_BR OTHER }
enum UnitStatus { VACANT OCCUPIED }
enum LeaseStatus { ACTIVE EXPIRED TERMINATED }
enum PaymentStatus { PAID PENDING OVERDUE }

model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  role         Role     @default(VIEWER)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model UnitOwner {
  id        String   @id @default(cuid())
  name      String
  email     String?
  phone     String?
  address   String?
  units     Unit[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Unit {
  id         String     @id @default(cuid())
  owner      UnitOwner  @relation(fields: [ownerId], references: [id])
  ownerId    String
  unitNumber String
  building   String?
  floor      String?
  type       UnitType   @default(OTHER)
  sizeSqm    Decimal?
  baseRent   Decimal
  status     UnitStatus @default(VACANT)
  leases     Lease[]
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
}

model Tenant {
  id        String   @id @default(cuid())
  name      String
  email     String?
  phone     String?
  address   String?
  leases    Lease[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Lease {
  id          String      @id @default(cuid())
  unit        Unit        @relation(fields: [unitId], references: [id])
  unitId      String
  tenant      Tenant      @relation(fields: [tenantId], references: [id])
  tenantId    String
  startDate   DateTime
  endDate     DateTime
  monthlyRent Decimal
  deposit     Decimal     @default(0)
  status      LeaseStatus @default(ACTIVE)
  payments    Payment[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

model Payment {
  id          String        @id @default(cuid())
  lease       Lease         @relation(fields: [leaseId], references: [id])
  leaseId     String
  periodMonth DateTime
  amount      Decimal
  dueDate     DateTime
  paidDate    DateTime?
  status      PaymentStatus @default(PENDING)
  method      String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}
```

- [ ] **Step 4: Generate client + run first migration**

```bash
cd server
npx prisma migrate dev --name init
```

Expected: migration created, `@prisma/client` generated.

- [ ] **Step 5: Write `server/src/lib/prisma.js`**

```js
import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add prisma schema and client singleton"
```

---

### Task 3: Auth service (hashing, register, login, token)

**Files:**
- Create: `server/src/services/authService.js`, `server/tests/authService.test.js`

**Interfaces:**
- Consumes: `prisma` from `src/lib/prisma.js`.
- Produces:
  - `hashPassword(plain) -> Promise<string>`
  - `verifyPassword(plain, hash) -> Promise<boolean>`
  - `issueToken({ id, role }) -> string`
  - `registerUser({ name, email, password, role }) -> Promise<{ id, name, email, role }>`
  - `loginUser({ email, password }) -> Promise<{ token, user }>` (throws `Error('INVALID_CREDENTIALS')` on failure)

- [ ] **Step 1: Write the failing test**

`server/tests/authService.test.js`:

```js
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, issueToken } from "../src/services/authService.js";
import jwt from "jsonwebtoken";

describe("authService pure helpers", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("secret123");
    expect(hash).not.toBe("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("issues a JWT carrying id and role", () => {
    process.env.JWT_SECRET = "test-secret";
    const token = issueToken({ id: "u1", role: "ADMIN" });
    const decoded = jwt.verify(token, "test-secret");
    expect(decoded.userId).toBe("u1");
    expect(decoded.role).toBe("ADMIN");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test`
Expected: FAIL — cannot import `authService.js` (module not found).

- [ ] **Step 3: Write minimal implementation**

`server/src/services/authService.js`:

```js
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function issueToken({ id, role }) {
  return jwt.sign({ userId: id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });
}

export async function registerUser({ name, email, password, role }) {
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: role || "VIEWER" },
  });
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function loginUser({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("INVALID_CREDENTIALS");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new Error("INVALID_CREDENTIALS");
  const token = issueToken({ id: user.id, role: user.role });
  return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test`
Expected: PASS (both helper tests). `registerUser`/`loginUser` are covered by integration tests in Task 6.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/authService.js server/tests/authService.test.js
git commit -m "feat: auth service with hashing, login, and token issuance"
```

---

### Task 4: Auth + role middleware

**Files:**
- Create: `server/src/middleware/auth.js`, `server/src/middleware/error.js`, `server/tests/authMiddleware.test.js`

**Interfaces:**
- Consumes: `issueToken` from authService.
- Produces:
  - `verifyJwt(req, res, next)` — reads `Authorization: Bearer <token>`, sets `req.user = { userId, role }`, else 401.
  - `requireRole(...roles)` — returns middleware; 403 if `req.user.role` not in `roles`.
  - `errorHandler(err, req, res, next)` — maps `INVALID_CREDENTIALS` → 401, else 500.

- [ ] **Step 1: Write the failing test**

`server/tests/authMiddleware.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { verifyJwt, requireRole } from "../src/middleware/auth.js";
import { issueToken } from "../src/services/authService.js";

function mockRes() {
  return { statusCode: 0, body: null,
    status(c){ this.statusCode = c; return this; },
    json(b){ this.body = b; return this; } };
}

describe("auth middleware", () => {
  it("rejects a request with no token", () => {
    const res = mockRes();
    verifyJwt({ headers: {} }, res, () => { throw new Error("should not call next"); });
    expect(res.statusCode).toBe(401);
  });

  it("accepts a valid token and sets req.user", () => {
    process.env.JWT_SECRET = "test-secret";
    const token = issueToken({ id: "u1", role: "ADMIN" });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const next = vi.fn();
    verifyJwt(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.user.role).toBe("ADMIN");
  });

  it("requireRole blocks the wrong role with 403", () => {
    const res = mockRes();
    requireRole("ADMIN")({ user: { role: "VIEWER" } }, res, () => { throw new Error("no"); });
    expect(res.statusCode).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace server test authMiddleware`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`server/src/middleware/auth.js`:

```js
import jwt from "jsonwebtoken";

export function verifyJwt(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userId: decoded.userId, role: decoded.role };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
```

`server/src/middleware/error.js`:

```js
export function errorHandler(err, req, res, next) {
  if (err.message === "INVALID_CREDENTIALS") {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace server test authMiddleware`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/middleware
git commit -m "feat: jwt verify + requireRole + error handler middleware"
```

---

### Task 5: Auth routes, controller, and app factory

**Files:**
- Create: `server/src/controllers/authController.js`, `server/src/routes/authRoutes.js`, `server/src/app.js`, `server/src/index.js`

**Interfaces:**
- Consumes: `loginUser`, `registerUser` (authService); `verifyJwt`, `requireRole` (auth middleware); `errorHandler`.
- Produces:
  - `createApp() -> express app` (exported for Supertest, no `listen`).
  - Routes: `POST /api/auth/login`, `POST /api/auth/register` (ADMIN-only), `GET /api/auth/me` (any authenticated user).

- [ ] **Step 1: Write the controller**

`server/src/controllers/authController.js`:

```js
import { loginUser, registerUser } from "../services/authService.js";

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await loginUser({ email, password });
    res.json(result);
  } catch (err) { next(err); }
}

export async function register(req, res, next) {
  try {
    const user = await registerUser(req.body);
    res.status(201).json(user);
  } catch (err) { next(err); }
}

export async function me(req, res) {
  res.json({ userId: req.user.userId, role: req.user.role });
}
```

- [ ] **Step 2: Write the routes**

`server/src/routes/authRoutes.js`:

```js
import { Router } from "express";
import { login, register, me } from "../controllers/authController.js";
import { verifyJwt, requireRole } from "../middleware/auth.js";

const router = Router();
router.post("/login", login);
router.post("/register", verifyJwt, requireRole("ADMIN"), register);
router.get("/me", verifyJwt, me);
export default router;
```

- [ ] **Step 3: Write the app factory + server bootstrap**

`server/src/app.js`:

```js
import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import { errorHandler } from "./middleware/error.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRoutes);
  app.use(errorHandler);
  return app;
}
```

`server/src/index.js`:

```js
import "dotenv/config";
import { createApp } from "./app.js";

const app = createApp();
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API on :${port}`));
```

- [ ] **Step 4: Smoke test the health route**

Run: `node -e "import('./server/src/app.js').then(m=>{const a=m.createApp();console.log(typeof a)})"`
Expected: prints `function`.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers server/src/routes server/src/app.js server/src/index.js
git commit -m "feat: auth routes, controller, and express app factory"
```

---

### Task 6: Auth integration tests + seed admin

**Files:**
- Create: `server/prisma/seed.js`, `server/tests/authRoutes.test.js`

**Interfaces:**
- Consumes: `createApp`; requires a reachable test database (`DATABASE_URL`).
- Produces: seeded ADMIN user; passing end-to-end login flow.

- [ ] **Step 1: Write the seed script**

`server/prisma/seed.js`:

```js
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/services/authService.js";

async function main() {
  const email = "admin@rbu.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return console.log("admin exists");
  await prisma.user.create({
    data: {
      name: "RBU Admin",
      email,
      passwordHash: await hashPassword("admin123"),
      role: "ADMIN",
    },
  });
  console.log("seeded admin@rbu.local / admin123");
}
main().finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Write the failing integration test**

`server/tests/authRoutes.test.js`:

```js
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/services/authService.js";

const app = createApp();

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: "itest@rbu.local" } });
  await prisma.user.create({
    data: { name: "IT", email: "itest@rbu.local",
      passwordHash: await hashPassword("pw123456"), role: "VIEWER" },
  });
});

describe("POST /api/auth/login", () => {
  it("returns a token for valid credentials", async () => {
    const res = await request(app).post("/api/auth/login")
      .send({ email: "itest@rbu.local", password: "pw123456" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe("VIEWER");
  });

  it("rejects bad credentials with 401", async () => {
    const res = await request(app).post("/api/auth/login")
      .send({ email: "itest@rbu.local", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("blocks a VIEWER from registering users (403)", async () => {
    const login = await request(app).post("/api/auth/login")
      .send({ email: "itest@rbu.local", password: "pw123456" });
    const res = await request(app).post("/api/auth/register")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ name: "X", email: "x@rbu.local", password: "pw123456", role: "VIEWER" });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 3: Run test to verify it fails (before DB ready) / passes (after)**

Run: `npm --workspace server test authRoutes`
Expected: FAIL first if DB not migrated; after `npx prisma migrate dev` + DB reachable, PASS (3 tests).

- [ ] **Step 4: Seed the admin**

```bash
npm --workspace server run seed
```

Expected: prints `seeded admin@rbu.local / admin123`.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/seed.js server/tests/authRoutes.test.js
git commit -m "test: auth integration tests + admin seed"
```

---

### Task 7: Vue client — login flow + guarded route

**Files:**
- Create: `client/index.html`, `client/vite.config.js`, `client/src/main.js`, `client/src/App.vue`, `client/src/router/index.js`, `client/src/stores/auth.js`, `client/src/lib/api.js`, `client/src/views/LoginView.vue`, `client/src/views/DashboardView.vue`

**Interfaces:**
- Consumes: `POST /api/auth/login`, `GET /api/auth/me`.
- Produces: a working login page that stores the JWT in a Pinia store and routes to a guarded placeholder dashboard.

- [ ] **Step 1: Install client deps**

```bash
npm --workspace client install vue vue-router pinia axios
npm --workspace client install -D vite @vitejs/plugin-vue
```

- [ ] **Step 2: Vite entry + config**

`client/index.html`:

```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>RBU Leasing</title></head>
  <body><div id="app"></div><script type="module" src="/src/main.js"></script></body>
</html>
```

`client/vite.config.js`:

```js
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  plugins: [vue()],
  server: { proxy: { "/api": "http://localhost:4000" } },
});
```

- [ ] **Step 3: Axios instance with token interceptor**

`client/src/lib/api.js`:

```js
import axios from "axios";
import { useAuthStore } from "../stores/auth.js";

export const api = axios.create({ baseURL: "/api" });
api.interceptors.request.use((config) => {
  const auth = useAuthStore();
  if (auth.token) config.headers.Authorization = `Bearer ${auth.token}`;
  return config;
});
```

- [ ] **Step 4: Pinia auth store**

`client/src/stores/auth.js`:

```js
import { defineStore } from "pinia";

export const useAuthStore = defineStore("auth", {
  state: () => ({ token: null, user: null }),
  getters: { isAuthenticated: (s) => !!s.token, role: (s) => s.user?.role },
  actions: {
    setSession({ token, user }) { this.token = token; this.user = user; },
    logout() { this.token = null; this.user = null; },
  },
});
```

Note: state is in-memory (resets on refresh) for v1; persisting the token is a later enhancement.

- [ ] **Step 5: Router with auth guard**

`client/src/router/index.js`:

```js
import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import LoginView from "../views/LoginView.vue";
import DashboardView from "../views/DashboardView.vue";

const routes = [
  { path: "/login", component: LoginView },
  { path: "/", component: DashboardView, meta: { requiresAuth: true } },
];

const router = createRouter({ history: createWebHistory(), routes });
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) return "/login";
});
export default router;
```

- [ ] **Step 6: App shell + main + views**

`client/src/App.vue`:

```vue
<template><router-view /></template>
```

`client/src/main.js`:

```js
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router/index.js";

createApp(App).use(createPinia()).use(router).mount("#app");
```

`client/src/views/LoginView.vue`:

```vue
<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../lib/api.js";
import { useAuthStore } from "../stores/auth.js";

const email = ref(""); const password = ref(""); const error = ref("");
const router = useRouter(); const auth = useAuthStore();

async function submit() {
  error.value = "";
  try {
    const { data } = await api.post("/auth/login", { email: email.value, password: password.value });
    auth.setSession(data);
    router.push("/");
  } catch {
    error.value = "Invalid email or password.";
  }
}
</script>

<template>
  <form @submit.prevent="submit">
    <h1>RBU Leasing — Sign in</h1>
    <input v-model="email" type="email" placeholder="Email" />
    <input v-model="password" type="password" placeholder="Password" />
    <button type="submit">Log in</button>
    <p v-if="error">{{ error }}</p>
  </form>
</template>
```

`client/src/views/DashboardView.vue`:

```vue
<script setup>
import { useAuthStore } from "../stores/auth.js";
const auth = useAuthStore();
</script>

<template>
  <main>
    <h1>Dashboard</h1>
    <p>Signed in as {{ auth.user?.email }} ({{ auth.role }})</p>
    <p>Metrics arrive in Plan 4.</p>
    <button @click="auth.logout()">Log out</button>
  </main>
</template>
```

- [ ] **Step 7: Manual verification**

```bash
npm run dev:server   # terminal 1
npm run dev:client   # terminal 2
```

Open the Vite URL, log in with `admin@rbu.local` / `admin123`, confirm you land on the Dashboard placeholder and can log out.

- [ ] **Step 8: Commit**

```bash
git add client
git commit -m "feat: vue login flow with guarded dashboard route"
```

---

## Self-Review

**Spec coverage (this plan's slice):** Monorepo + layered server (Task 1, 5) ✓; Prisma models for all six records (Task 2) ✓; JWT auth + `ADMIN|LEASING_OFFICER|VIEWER` roles + guards (Tasks 3–5) ✓; unit tests on service/middleware + integration tests on auth/role guards (Tasks 3,4,6) ✓; Vue 3 + Vite + Pinia + Router + Axios foundation with login (Task 7) ✓. Dashboard, Executive Summary, CRUD, and Reports are intentionally deferred to Plans 2–6.

**Placeholder scan:** No TBD/TODO; every code step contains full code. The Dashboard view is a labeled placeholder by design, not an unfinished step.

**Type consistency:** `issueToken({ id, role })` emits `{ userId, role }`; `verifyJwt` reads `decoded.userId`/`decoded.role` and sets `req.user.userId`/`req.user.role`; `me` returns those same fields — consistent. `loginUser` returns `{ token, user }`, which `setSession` and the login test both consume — consistent.

## Later Plans (preview)

- **Plan 2 — CRUD:** owners, units, tenants, leases, payments (services + routes + Vue screens, role-guarded writes).
- **Plan 3 — Dashboard metrics:** occupancy, income, expiring windows, overdue/outstanding, new-this-month, counts.
- **Plan 4 — Executive Summary:** period selection + prior-period comparison service.
- **Plan 5 — Excel reports:** rent roll, collections, lease expiry, owner statement via ExcelJS.
- **Plan 6 — Hardening:** token persistence, pagination, validation, polish.
