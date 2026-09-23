# LANI Commercial Operating System

**Commercial intelligence · Account map · Partnership ecosystem · Qualified pipeline**

The BD operating model for Lani Consulting — mapping organisations, sectors and programmes where LANI can solve real problems, then moving qualified opportunities toward revenue.

## Architecture

```
bd-commercial-operating-system/
├── api/        Express + SQLite backend (port 3003)
├── web/        Vue 3 + Tailwind frontend (served at /partnerships/)
├── data/       SQLite database (auto-created on first run)
└── docs/       Health checks & documentation
```

CPO / Claims / $GIFT proposal workspaces are frozen and hidden. Pipeline data lives in local SQLite.

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
| `/partnerships/` or `/accounts` | Account Map (home) |
| `/partnerships/ecosystem` | Partnership ecosystem — channel, delivery, institutional, innovation |
| `/partnerships/intake` | Opportunity intake — upserts account + linked deal |
| `/partnerships/pipeline` | Qualified pipeline — four lanes, one conversion path |
| `/partnerships/executive` | Executive dashboard |
| `/partnerships/archetypes` | LANI commercial library (all BD users) |
| `/partnerships/deals/:id` | Opportunity detail |
| `/partnerships/users` | User admin (Root Admin) |

## Client archetypes

A Government MDAs · B Financial institutions & fintech · C Large corporates · D SMEs · E Donors & DFIs · F NGOs & social enterprises

Plus sector overlays, partnership roles (end client / channel / delivery / institutional / ecosystem), Nigeria-first geography (ECOWAS / Global optional), and four commercial lanes (Immediate Revenue, Strategic Accounts, Partnership Channels, Emerging Markets).

Opportunities share one conversion path with accounts: Intelligence → Qualified → In conversation → Proposal → Verbal / commit → Won / Lost / On hold.

Working records (Qualified → Verbal) need a next action. Proposal-or-later needs an expected decision date; consortium opportunities need a named delivery partner. Partners carry a commercial model (direct, referral, consortium, joint delivery, MoU, programme, joint market) — not every organisation is an end client.

## Built With

- **Backend:** Express, better-sqlite3
- **Frontend:** Vue 3, Vue Router, Tailwind CSS, Vite
- **Database:** SQLite (local pipeline) · Supabase (auth / profiles)
