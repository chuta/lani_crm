/**
 * Partnership Pipeline API — Express server
 * Listens on PORT 3003 by default.
 * Proxied by nginx at /api/partnerships/*
 */

import 'dotenv/config';
import './auth-types.js';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { initializeDatabase, initializeCPOTables } from './db.js';
import { aiPublicStatus } from './services/llm.js';
import seedArchetypes from './seed.js';
import { requireAppUser, requireAuth } from './middleware/auth.js';
import usersRouter from './routes/users.js';
import intakeRouter from './routes/intake.js';
import dealsRouter from './routes/deals.js';
import triageRouter from './routes/triage.js';
import executiveRouter from './routes/executive.js';
import metricsRouter from './routes/metrics.js';
import archetypesRouter from './routes/archetypes.js';
import proposalsRouter from './routes/proposals.js';
import claimsRouter from './routes/claims.js';
import approvalsRouter from './routes/approvals.js';
import economicsRouter from './routes/economics.js';
import releaseRouter from './routes/release.js';
import bdProspectingRouter from './routes/bd-prospecting.js';
import accountsRouter from './routes/accounts.js';
import jobsRouter from './routes/jobs.js';

const PORT = Number(process.env.PARTNERSHIP_PORT || 3003);
const HOST = process.env.PARTNERSHIP_HOST || '127.0.0.1';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Logging
app.use((req: Request, _res: Response, next) => {
  const start = Date.now();
  _res.on('finish', () => {
    const dur = Date.now() - start;
    if (dur > 200 || _res.statusCode >= 400) {
      console.log(`[pipeline-api] ${req.method} ${req.url} → ${_res.statusCode} ${dur}ms`);
    }
  });
  next();
});

// Health check — separate prefix to avoid route conflicts
const healthRouter = express.Router();
healthRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ service: 'partnership-pipeline-api', status: 'ok', timestamp: new Date().toISOString() });
});
app.use('/api/partnerships', healthRouter);

app.use('/api/partnerships', (req, res, next) => {
  if (req.path === '/health' || req.path === '/jobs/pipeline-digest') {
    next();
    return;
  }
  requireAuth(req, res, next);
});

app.get('/api/partnerships/me', (req, res) => {
  res.json({ ok: true, user: req.auth });
});

app.use('/api/partnerships/users', usersRouter);

app.use('/api/partnerships', (req, res, next) => {
  if (req.path === '/health' || req.path === '/me' || req.path.startsWith('/users') || req.path === '/jobs/pipeline-digest') {
    next();
    return;
  }
  requireAppUser(req, res, next);
});

app.use('/api/partnerships/jobs', jobsRouter);

// Routes (existing)
app.use('/api/partnerships/accounts', accountsRouter);
app.use('/api/partnerships/intake', intakeRouter);
app.use('/api/partnerships/deals', dealsRouter);
app.use('/api/partnerships/triage', triageRouter);
app.use('/api/partnerships/executive', executiveRouter);
app.use('/api/partnerships/metrics', metricsRouter);
app.use('/api/partnerships/archetypes', archetypesRouter);

// CPO Routes
app.use('/api/partnerships/claims', claimsRouter);
app.use('/api/partnerships/proposals', proposalsRouter);
app.use('/api/partnerships/proposals/:proposal_id/approvals', approvalsRouter);
app.use('/api/partnerships/proposals/:proposal_id/economics', economicsRouter);
app.use('/api/partnerships/proposals/:proposal_id/release', releaseRouter);

// BD Prospecting Tracker
app.use('/api/partnerships/bd-prospecting', bdProspectingRouter);

// Root
app.get('/', (_req: Request, res: Response) => {
  res.json({ service: 'partnership-pipeline-api', version: '1.0.0', status: 'ok' });
});

// Initialize
initializeDatabase();
initializeCPOTables();
seedArchetypes();

const server = app.listen(PORT, HOST, () => {
  console.log(`[partnership-pipeline-api] listening on http://${HOST}:${PORT}`);
  if (process.env.SUPABASE_URL) {
    console.log(`[supabase] project ${process.env.SUPABASE_URL}`);
  } else {
    console.log('[supabase] SUPABASE_URL not set — using local SQLite');
  }
  if (process.env.ROOT_ADMIN_EMAIL) {
    console.log('[auth] Root Admin bootstrap email is configured');
  } else {
    console.warn('[auth] ROOT_ADMIN_EMAIL is not set — new accounts stay pending until a Root Admin approves them');
  }
  const ai = aiPublicStatus();
  if (ai.configured) {
    console.log(`[ai] Research ready (${ai.provider} / ${ai.model})`);
  } else {
    console.warn('[ai] Research disabled — set OPENAI_API_KEY on the API');
  }
});

const shutdown = (sig: string) => {
  console.log(`[partnership-pipeline-api] received ${sig}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;