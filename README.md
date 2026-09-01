# BD Commercial Operating System

**Partnership Pipeline · CPO Proposal Lifecycle · BD Tracker · Claims Library**

The BD-to-Technology operating model for managing $GIFT distribution partnerships — from prospecting through to external release.

## Architecture

```
partnership-pipeline/
├── api/        Express + SQLite backend (port 3003)
├── web/        Vue 3 + Tailwind frontend (served at /partnerships/)
├── data/       SQLite database (auto-created on first run)
└── docs/       Health checks & documentation
```

## Quick Start

```bash
# API
cd api
npm install
npm run dev          # starts on http://localhost:3003

# Web (separate terminal)
cd web
npm install
npm run dev          # starts on http://localhost:3335, proxies /api to :3003
```

## Routes

| URL | Page |
|---|---|
| `/partnerships/` or `/pipeline` | Pipeline Register |
| `/partnerships/intake` | Intake Form |
| `/partnerships/proposals` | CPO Commercial Control Tower |
| `/partnerships/proposals/:id` | Proposal Detail (full workspace) |
| `/partnerships/executive` | Executive Dashboard |
| `/partnerships/archetypes` | Archetype Library |
| `/partnerships/claims-library` | Claims Library |
| `/partnerships/deals/:id` | Deal Detail |

## Deploy (PM2)

```bash
pm2 start ecosystem.config.cjs
```

## Built With

- **Backend:** Express, better-sqlite3, docx
- **Frontend:** Vue 3, Vue Router, Tailwind CSS, Vite
- **Database:** SQLite (single-file, auto-initialises)