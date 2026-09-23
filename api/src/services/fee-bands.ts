import db from '../db.js';
import {
  LANI_FEE_BANDS,
  isFeeBandId,
  type FeeBandCatalogEntry,
  type FeeBandId,
} from '../catalog.js';

export interface FeeBandRecord extends FeeBandCatalogEntry {
  archived: boolean;
  updated_at: string | null;
  updated_by: string | null;
  catalog_default: Omit<FeeBandCatalogEntry, 'id'>;
}

export class FeeBandError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type FeeBandRow = {
  id: string;
  name: string;
  horizon: string;
  typical_work: string;
  currency: string;
  min_m: number;
  max_m: number;
  when_to_use: string;
  archived: number;
  updated_at: string | null;
  updated_by: string | null;
};

export function seedFeeBands(): number {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO fee_bands (
      id, name, horizon, typical_work, currency, min_m, max_m, when_to_use
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  const tx = db.transaction(() => {
    for (const band of LANI_FEE_BANDS) {
      const info = stmt.run(
        band.id,
        band.name,
        band.horizon,
        band.typical_work,
        band.currency,
        band.min_m,
        band.max_m,
        band.when,
      );
      inserted += info.changes;
    }
  });
  tx();
  return inserted;
}

function rowById(id: FeeBandId): FeeBandRow | undefined {
  return db.prepare('SELECT * FROM fee_bands WHERE id = ?').get(id) as FeeBandRow | undefined;
}

function shape(def: FeeBandCatalogEntry, row?: FeeBandRow): FeeBandRecord {
  return {
    id: def.id,
    name: row?.name ?? def.name,
    horizon: row?.horizon ?? def.horizon,
    typical_work: row?.typical_work ?? def.typical_work,
    currency: 'NGN',
    min_m: row ? Number(row.min_m) : def.min_m,
    max_m: row ? Number(row.max_m) : def.max_m,
    when: row?.when_to_use ?? def.when,
    archived: Boolean(row?.archived),
    updated_at: row?.updated_at ?? null,
    updated_by: row?.updated_by ?? null,
    catalog_default: {
      name: def.name,
      horizon: def.horizon,
      typical_work: def.typical_work,
      currency: def.currency,
      min_m: def.min_m,
      max_m: def.max_m,
      when: def.when,
    },
  };
}

export function listFeeBands(): FeeBandRecord[] {
  return LANI_FEE_BANDS.map((def) => shape(def, rowById(def.id)));
}

export function getFeeBand(id: string): FeeBandRecord {
  if (!isFeeBandId(id)) {
    throw new FeeBandError(404, 'not_found', 'Unknown fee band. IDs are frozen.');
  }
  const def = LANI_FEE_BANDS.find((b) => b.id === id)!;
  return shape(def, rowById(id));
}

function trimText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new FeeBandError(400, 'validation_error', `${field} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new FeeBandError(400, 'validation_error', `${field} is required`);
  }
  if (trimmed.length > max) {
    throw new FeeBandError(400, 'validation_error', `${field} is too long`);
  }
  return trimmed;
}

function money(value: unknown, field: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new FeeBandError(400, 'validation_error', `${field} must be a number`);
  }
  if (n < 0) {
    throw new FeeBandError(400, 'validation_error', `${field} cannot be negative`);
  }
  return n;
}

export interface FeeBandPatch {
  name?: unknown;
  horizon?: unknown;
  typical_work?: unknown;
  min_m?: unknown;
  max_m?: unknown;
  when?: unknown;
  archived?: unknown;
  restore?: unknown;
}

export function updateFeeBand(id: string, patch: FeeBandPatch, updatedBy?: string | null): FeeBandRecord {
  const current = getFeeBand(id);
  const def = LANI_FEE_BANDS.find((b) => b.id === current.id)!;

  const next: FeeBandCatalogEntry & { archived: boolean } = patch.restore
    ? { ...def, archived: false }
    : {
        ...current,
        name: patch.name !== undefined ? trimText(patch.name, 'name', 120) : current.name,
        horizon: patch.horizon !== undefined ? trimText(patch.horizon, 'horizon', 80) : current.horizon,
        typical_work: patch.typical_work !== undefined
          ? trimText(patch.typical_work, 'typical_work', 240)
          : current.typical_work,
        min_m: patch.min_m !== undefined ? money(patch.min_m, 'min_m') : current.min_m,
        max_m: patch.max_m !== undefined ? money(patch.max_m, 'max_m') : current.max_m,
        when: patch.when !== undefined ? trimText(patch.when, 'when', 280) : current.when,
        archived: patch.archived !== undefined ? Boolean(patch.archived) : current.archived,
        currency: 'NGN',
      };

  if (next.max_m < next.min_m) {
    throw new FeeBandError(400, 'validation_error', 'max_m must be greater than or equal to min_m');
  }

  db.prepare(`
    INSERT INTO fee_bands (
      id, name, horizon, typical_work, currency, min_m, max_m, when_to_use, archived, updated_at, updated_by
    ) VALUES (?, ?, ?, ?, 'NGN', ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      horizon = excluded.horizon,
      typical_work = excluded.typical_work,
      currency = 'NGN',
      min_m = excluded.min_m,
      max_m = excluded.max_m,
      when_to_use = excluded.when_to_use,
      archived = excluded.archived,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).run(
    next.id,
    next.name,
    next.horizon,
    next.typical_work,
    next.min_m,
    next.max_m,
    next.when,
    next.archived ? 1 : 0,
    updatedBy || null,
  );

  return getFeeBand(next.id);
}
