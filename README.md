<p align="center">
  <h1 align="center">🔬 AWA Insight Platform</h1>
  <p align="center">
    <strong>AI-Powered Intelligence for Animal Welfare Act Enforcement</strong>
  </p>
  <p align="center">
    Automated USDA record harvesting, OCR document processing, and investigative analytics — built for legal teams, investigators, and advocacy organizations.
  </p>
  <p align="center">
    <a href="#features">Features</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#deployment">Deployment</a> •
    <a href="#api-reference">API</a> •
    <a href="#contributing">Contributing</a>
  </p>
</p>

---

## The Problem

Investigators and advocates working on Animal Welfare Act (AWA) enforcement lose thousands of hours navigating fragmented USDA databases, manually scanning illegible PDF inspection reports, and tracking scattered enforcement histories across disconnected systems. There is no centralized, searchable, evidence-linked platform to support investigative workflows.

## The Solution

**AWA Insight** centralizes and digitizes the entire USDA AWA ecosystem. It automatically harvests public inspection records, extracts structured data from PDFs using OCR and NLP, and surfaces actionable intelligence through AI-generated summaries — all with full source traceability back to the original documents.

---

## Features

### 🏢 Facility Intelligence
- **Comprehensive Profiles** — Aggregated views of facility ownership, license history, animal inventory, and site locations
- **Inspection Timelines** — Chronological inspection records with violation breakdowns
- **Risk Scoring** — Automated risk assessment engine with multi-factor analysis
- **Facility Comparison** — Side-by-side comparison across any metrics

### 🔍 Search & Discovery
- **Full-Text Search** — Search across 10,000+ facilities by name, certificate number, city, state, or customer ID
- **Advanced Filtering** — Filter by state, license type, violation severity, and inspection outcomes
- **Fuzzy Matching** — PostgreSQL trigram-based fuzzy search for handling inconsistent naming

### 📄 Document Processing Pipeline
- **Automated PDF Harvesting** — Playwright-based scraper downloads inspection reports and enforcement PDFs from USDA
- **OCR Extraction** — Tesseract OCR + pdfplumber for text extraction from scanned documents
- **Entity Recognition** — spaCy NLP pipeline for extracting inspectors, dates, violation codes, and animal species
- **Source Preservation** — SHA-256 hashing for document integrity and legal chain of custody

### 🤖 AI-Powered Analytics
- **Violation Summaries** — LLM-generated narrative summaries of complex multi-year violation histories
- **Linked Citations** — Every AI claim hyperlinked directly to the source inspection paragraph
- **Legal Memo Generation** — AI-drafted enforcement memos with evidence citations
- **Inspector Analytics** — Leniency/stringency pattern analysis across inspectors

### 📊 Dashboard & Reporting
- **National Overview** — Aggregate statistics, violation trends, and geographic distribution
- **Enforcement Tracker** — Monitor enforcement actions, penalties, and compliance orders
- **Advocacy Reports** — Exportable, evidence-backed reports for legal and advocacy use

### 🔐 Authentication & Security
- **Supabase Auth** — Secure email/password authentication with session management
- **Protected Routes** — Role-based access control for investigative features
- **Rate Limiting** — SlowAPI-based rate limiting to prevent abuse

---

## Architecture

```
awa-platform/
├── frontend/              # React SPA (Vite + React Router)
│   ├── src/
│   │   ├── pages/         # 9 page components
│   │   ├── components/    # Reusable UI components
│   │   ├── context/       # Auth & Search context providers
│   │   ├── services/      # API client (OpenAPI-typed)
│   │   └── lib/           # Utility functions
│   └── vercel.json        # Vercel deployment config
│
├── backend/               # FastAPI REST API
│   ├── app/
│   │   ├── routers/       # API endpoints
│   │   │   ├── facilities.py
│   │   │   ├── inspectors.py
│   │   │   ├── dashboard.py
│   │   │   ├── violations.py
│   │   │   ├── documents.py
│   │   │   └── enforcement.py
│   │   ├── services/      # Business logic
│   │   │   ├── scraper.py       # USDA data harvester
│   │   │   ├── pipeline.py      # Document processing pipeline
│   │   │   ├── ai_assistant.py  # LLM integration (Groq/OpenRouter)
│   │   │   ├── risk_engine.py   # Facility risk scoring
│   │   │   ├── ocr.py           # OCR text extraction
│   │   │   ├── extractor.py     # Entity extraction (spaCy)
│   │   │   └── scheduler.py     # APScheduler background jobs
│   │   ├── models.py      # SQLAlchemy ORM models
│   │   ├── schemas.py     # Pydantic request/response schemas
│   │   └── database.py    # Database connection
│   └── alembic/           # Database migrations
│
├── docker-compose.yml     # PostgreSQL + Redis
└── .github/workflows/     # CI pipeline
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite 5, React Router 6, TanStack Query, Recharts |
| **Backend** | FastAPI, SQLAlchemy, Pydantic, APScheduler |
| **Database** | PostgreSQL 15 (Supabase), Redis 7 |
| **AI/ML** | Groq (Llama 3.1/3.3 70B), OpenRouter, spaCy |
| **Document Processing** | pdfplumber, Tesseract OCR, pdf2image, Pillow |
| **Scraping** | Playwright, Requests |
| **Auth** | Supabase Auth (JWT) |
| **Deployment** | Vercel (frontend), Render/Railway (backend) |
| **CI/CD** | GitHub Actions, Dependabot |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.11
- **Docker** & **Docker Compose** (for local PostgreSQL + Redis)
- **Tesseract OCR** (`brew install tesseract` on macOS)

### 1. Clone the Repository

```bash
git clone https://github.com/Ayushmangela/AWA-Records-Data-Harvesting-Analysis-Platform.git
cd AWA-Records-Data-Harvesting-Analysis-Platform
```

### 2. Start Infrastructure

```bash
docker-compose up -d
```

This starts PostgreSQL (port 5432) and Redis (port 6379).

### 3. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your credentials (see Environment Variables below)

# Run database migrations
alembic upgrade head

# Start the API server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

The frontend will be available at `http://localhost:5173`.

### Environment Variables

Create `backend/.env` with the following:

```env
# Database
DATABASE_URL=postgresql://awa_user:awa_password@localhost:5432/awa_db

# Supabase (Auth + Hosted DB)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_DB_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres

# AI Providers
LLM_PROVIDER=groq              # or "openrouter"
GROQ_API_KEY=your-groq-key
OPENROUTER_API_KEY=your-key    # optional, for OpenRouter

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:5173,https://your-domain.vercel.app

# Redis (rate limiting)
REDIS_URL=redis://localhost:6379
```

---

## Data Pipeline

The platform includes an automated data harvesting and processing pipeline:

```
USDA Website → Scraper → PDF Download → OCR → Entity Extraction → Database → AI Summaries
```

### Seed the Database

```bash
cd backend

# 1. Scrape facility data and inspection records from USDA
python -m app.services.scraper

# 2. Import CSV data (if available)
python -m app.services.csv_importer
```

### Scheduled Jobs

The backend uses APScheduler to run background tasks:
- **Document Processing** — Automatically processes queued PDFs through OCR and entity extraction
- **Risk Score Updates** — Recalculates facility risk scores periodically

---

## Testing

Tests require a PostgreSQL instance (SQLite is **not** supported due to `pg_trgm` and PostgreSQL-specific functions).

```bash
cd backend

# Start the test database
docker-compose -f docker-compose.test.yml up -d

# Run the test suite
DATABASE_URL=postgresql://postgres:test_password@localhost:5432/awa_test pytest

# Tear down
docker-compose -f docker-compose.test.yml down
```

---

## Deployment

### Frontend (Vercel)

The frontend is configured for Vercel deployment:

1. Import the repository in [Vercel](https://vercel.com)
2. Set **Root Directory** to `frontend`
3. Framework will be auto-detected as **Vite**
4. Deploy — `vercel.json` handles build commands and SPA routing

### Backend

Deploy the FastAPI backend to any Python hosting platform:

- **Render** — Connect repo, set root to `backend/`, start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Railway** — Similar setup with environment variables configured in dashboard

> **Important:** Set `CORS_ALLOWED_ORIGINS` to include your frontend's production URL.

---

## API Reference

The API is documented with OpenAPI. Once the backend is running:

- **Interactive docs:** `http://localhost:8000/docs`
- **OpenAPI spec:** `http://localhost:8000/openapi.json`

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/facilities/` | List/search facilities with filtering |
| `GET` | `/facilities/{id}` | Facility detail with inspections |
| `GET` | `/facilities/{id}/risk-score` | Computed risk assessment |
| `POST` | `/facilities/{id}/ai-summary` | Generate AI violation summary |
| `POST` | `/facilities/{id}/legal-memo` | Generate legal enforcement memo |
| `GET` | `/inspectors/` | Inspector directory |
| `GET` | `/inspectors/{id}` | Inspector profile with stats |
| `GET` | `/dashboard/stats` | Aggregate platform statistics |
| `GET` | `/violations/` | Violation search and filtering |
| `GET` | `/enforcement/` | Enforcement action records |
| `GET` | `/documents/` | Document processing queue |

---

## Data Assets

For repository performance, large data assets (`inspections.csv`, `inspections-citations.csv`, database dumps) are excluded from version control via `.gitignore`.

To regenerate or seed your local database, follow the [Data Pipeline](#data-pipeline) instructions above.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'feat: add new feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

### Code Quality

- **Backend:** Linted with [Ruff](https://docs.astral.sh/ruff/) and formatted with Black
- **Frontend:** Linted with ESLint, formatted with Prettier
- **CI:** GitHub Actions runs lint + tests on every PR

---

## License

This project is open source. Investigative data is derived from public USDA records.

---

<p align="center">
  Built with ❤️ for animal welfare accountability
</p>
