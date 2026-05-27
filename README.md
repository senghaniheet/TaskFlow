# TaskFlow 📋

TaskFlow is a production-grade SaaS Project Management and Task Tracking boilerplate. It provides a robust, highly scalable starting point for building team-based productivity applications, featuring full multi-tenant Workspaces, Projects, and Kanban-style Task tracking.

## 🚀 Tech Stack

**Frontend:**
- **React 18** (Functional Components, Hooks)
- **Vite** (Next-generation lightning-fast bundler)
- **Context API + useReducer** (Redux-pattern global state management)
- **Axios** (Configured with interceptors for auth & error handling)
- **Vanilla CSS Tokens** (Scalable, dynamic design system)

**Backend:**
- **Node.js & Express.js**
- **MongoDB** (Hosted/Containerized)
- **Mongoose ODM** (Strict schemas, validation, pre/post hooks)
- **Winston** (Structured JSON logging for observability)
- **express-validator** (Strict route payload validation)

**Infrastructure:**
- **Docker Compose** (Containerized orchestration for DB, Web, and API)

---

## 🏗️ Project Structure

This repository is defined as a monorepo containing two distinct application domains:

```text
├── client/                 # React Frontend
│   ├── src/
│   │   ├── api/            # Centralized Axios setup and resource APIs
│   │   ├── components/     # Reusable UI building blocks (Sidebar, TaskCard, etc.)
│   │   ├── context/        # Global AppContext and reducer
│   │   ├── hooks/          # Custom hooks handling logic & API hydration
│   │   ├── pages/          # Full page views (Board, Dashboard)
│   │   └── index.css       # Token-based CSS Design System
│   ├── Dockerfile          # Multi-stage production frontend container
│   └── nginx.conf          # Nginx production configuration
│
├── server/                 # Express Backend
│   ├── src/
│   │   ├── config/         # DB connection logic setup
│   │   ├── controllers/    # API request handling logic
│   │   ├── middleware/     # Global error catching, validation normalization
│   │   ├── models/         # Mongoose Schemas (Task, Project, Workspace)
│   │   ├── routes/         # Express endpoint definitions
│   │   ├── scripts/        # Standalone operations (migrate.js, seed.js)
│   │   └── utils/          # Logger, Standard API Responses
│   └── Dockerfile          # Secure, non-root production Node.js container
│
└── docker-compose.yml      # Orchestrates all 3 containers internally
```

---

## ⚙️ Getting Started

You can run TaskFlow using Docker (Recommended) or locally on your machine via NPM.

### Method A: Docker Compose (Recommended)

1. Make sure [Docker Desktop](https://www.docker.com/products/docker-desktop/) is running.
2. At the root of the project, run:
```bash
docker compose up --build
```
3. The cluster will spin up 3 containers: `taskflow_mongo` (27017), `taskflow_server` (5000), and `taskflow_client` (Nginx serving on port 80, mapped to host port 3000).
4. Access the application by opening `http://localhost:3000` in your browser. All API requests to `/api/*` are automatically reverse-proxied by Nginx internally to the backend server.

*(Note: Data written to MongoDB inside Docker will perfectly persist across restarts via internal volumes)*

### Method B: Manual Setup

**Requirements:** You must have a MongoDB server running locally on `mongodb://localhost:27017`.

**1. Setup the Server:**
```bash
cd server
npm install
cp .env.example .env
npm run dev
```

**2. Setup the Client:**
Open a separate terminal window:
```bash
cd client
npm install
npm run dev
```

---

## 🗄️ Database Management & Seeding

The server includes explicit scripts to track schema evolution and provide local sandbox data.

Run these scripts from inside the `server/` directory:

```bash
# Safely apply indexes and structural migrations to your DB
npm run migrate

# DROP ALL existing data and insert a hyper-realistic nested dataset 
# (Workspaces -> Projects -> Kanban Tasks)
npm run seed

# Run both in sequence (Great for freshly cloned environments)
npm run migrate:seed
```

> **Warning:** `npm run seed` drops entire collections. Built-in logic prevents this script from executing if `NODE_ENV=production`.

---

## 🛡️ Architecture & Design Principles

### Backend
- **Envelope API Responses**: Every API returns a predictable shape: `{ success, statusCode, message, data }`.
- **Global Error Handling**: Unhandled exceptions and explicit `ApiError` throws are caught by a final middleware returning consistent 4xx and 5xx payloads to the client.
- **Relational Integrity**: Workspaces, Projects, and Tasks are linked utilizing `ObjectId` referencing. Advanced endpoints take advantage of `.populate()` chains to serve fully denormalized views in a single HTTP request.

### Frontend
- **Stable Dispatch Pattern**: Context API uses a stable `useCallback` referenced `dispatch` function to prevent unneeded component re-rendering.
- **Hook-Driven Data**: React Components barely handle direct API logic. Using custom hooks like `useTasks()` keeps layout components perfectly clean.
- **Aesthetics First**: A ground-up `index.css` file implements a gorgeous, modern aesthetic leveraging CSS color mixing variables and fluid shadows. 

---

## 🚢 DevOps & Deployment Guide

For operations and DevOps teams, TaskFlow is designed to be easily integrated into modern CI/CD pipelines (GitHub Actions, GitLab CI, AWS CodePipeline).

### 1. Environment Variables Reference
To run this application in production, ensure the following environment variables are securely injected into your containers or deployment environments:

**Server Environment (API):**
- `NODE_ENV`: Set to `production` (enables optimized logging, disables nodemon auto-reloads, and disables destructive CLI tools like `npm run seed`).
- `PORT`: (Default `5000`)
- `MONGO_URI`: A valid MongoDB connection string (e.g., Atlas, DocumentDB).
- `JWT_SECRET`: A long, cryptographically secure random string.
- `JWT_EXPIRES_IN`: E.g., `7d` or `24h`.
- `ALLOWED_ORIGINS`: Used by CORS middleware (e.g., `https://app.yourdomain.com`).

**Client Environment (React Built via Vite):**
- `VITE_API_URL`: Optional. The fully qualified public URL pointing to your backend endpoint (e.g., `https://api.yourdomain.com/api`).
- **Nginx Reverse Proxy Benefit**: In standard setups where the frontend and backend are deployed in the same cluster or single host, Nginx automatically reverse-proxies `/api` routes directly to the backend. In this case, `VITE_API_URL` is omitted and the browser utilizes relative path requests (`/api/*`), removing any cross-origin resource sharing (CORS) complexity.

### 2. Building for Production

TaskFlow is preconfigured with optimized, production-ready Dockerfiles.

#### Backend Container Architecture (`server/Dockerfile`)
- **Security-First**: The container runs under a dedicated, non-root `node` user instead of `root` to prevent privilege escalation.
- **Dependency Optimization**: Uses `npm ci --omit=dev` to only install required production dependencies, significantly shrinking the image size and leaving out testing packages (like Jest or memory DB servers).
- **Process Signals**: Runs Node directly (`CMD ["node", "src/index.js"]`) ensuring `SIGTERM` and `SIGINT` signals are handled gracefully for zero-downtime rolling updates.

To build and run:
```bash
cd server
docker build -t taskflow-api:latest .
docker run -d -p 5000:5000 --env-file .env.production --name taskflow-api-server taskflow-api:latest
```

#### Frontend Container Architecture (`client/Dockerfile`)
- **Multi-Stage Build**:
  - **Stage 1 (Builder)**: Installs development dependencies and compiles Vite production assets.
  - **Stage 2 (Nginx)**: Packs the static HTML/JS/CSS assets into a lightweight, hardened `nginx:stable-alpine` image.
- **Production Routing**: Uses Nginx's `try_files` routing rule to handle React Router client-side path fallbacks.
- **Compression**: Gzip compression is enabled natively for optimal client payload loading speeds.
- **Built-in Proxying**: Automatically reverse proxies `/api` requests to the backend API service (`taskflow_server:5000`).

To build and run:
```bash
cd client
docker build -t taskflow-web:latest .
# Run on the same network as the api container to support direct internal Nginx routing
docker run -d -p 3000:80 --name taskflow-web-client taskflow-web:latest
```

### 3. CI/CD Pipeline Hooks

We recommend running the following verification steps in your CI pipelines *before* building your Docker containers:
1. **Linting:** Ensure code quality standards.
   - Client: `cd client && npm run lint`
2. **Testing:** Run isolated unit & integration tests.
   - Server: `cd server && npm run test`
   - Client: `cd client && npm run test`

---

## 🧪 Testing Methodology

TaskFlow now includes a comprehensive automated test suite for both frontend and backend domains. 

> **Tip:** The test suite is designed to be fully isolated. You do not need to drop or restart your databases to run tests locally.

### Backend Tests (Jest + Supertest)
The backend test suite uses `jest` and `supertest` to run integration tests against the Express API, mocking HTTP requests seamlessly. We use `mongodb-memory-server` which dynamically spins up an isolated, temporary MongoDB instance *just* for the test runner. 
- Run Backend Tests:
  ```bash
  cd server
  npm run test
  ```

### Frontend Tests (Vitest + React Testing Library)
The frontend uses `vitest` (which shares the existing Vite configuration natively) alongside `jsdom` and `@testing-library/react`. We test our React component rendering, interactive behaviors, and custom React hook (`useTasks`) context boundaries safely.
- Run Frontend Tests:
  ```bash
  cd client
  npm run test
  ```

---

## 📝 License
MIT License - Free to use and scale!
