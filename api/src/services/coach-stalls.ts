import db from '../db.js';
import {
  LANI_COACH_STALLS,
  isCoachStallId,
  type CoachStallCatalogEntry,
  type CoachStallId,
} from '../catalog.js';

export interface CoachStallRecord extends CoachStallCatalogEntry {
  archived: boolean;
  updated_at: string | null;
  updated_by: string | null;
  catalog_default: Omit<CoachStallCatalogEntry, 'id' | 'for_stages' | 'severity'>;
}

export class CoachStallError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type CoachStallRow = {
  id: string;
  name: string;
  when_to_use: string;
  owner_move: string;
  archived: number;
  updated_at: string | null;
  updated_by: string | null;
};

export function seedCoachStalls(): number {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO coach_stalls (
      id, name, when_to_use, owner_move
    ) VALUES (?, ?, ?, ?)
  `);

  let inserted = 0;
  const tx = db.transaction(() => {
    for (const stall of LANI_COACH_STALLS) {
      const info = stmt.run(stall.id, stall.name, stall.when, stall.owner_move);
      inserted += info.changes;
    }
  });
  tx();
  return inserted;
}

function rowById(id: CoachStallId): CoachStallRow | undefined {
  return db.prepare('SELECT * FROM coach_stalls WHERE id = ?').get(id) as CoachStallRow | undefined;
}

function shape(def: CoachStallCatalogEntry, row?: CoachStallRow): CoachStallRecord {
  return {
    id: def.id,
    name: row?.name ?? def.name,
    when: row?.when_to_use ?? def.when,
    owner_move: row?.owner_move ?? def.owner_move,
    for_stages: def.for_stages,
    severity: def.severity,
    archived: Boolean(row?.archived),
    updated_at: row?.updated_at ?? null,
    updated_by: row?.updated_by ?? null,
    catalog_default: {
      name: def.name,
      when: def.when,
      owner_move: def.owner_move,
    },
  };
}

export function listCoachStalls(): CoachStallRecord[] {
  return LANI_COACH_STALLS.map((def) => shape(def, rowById(def.id)));
}

export function getCoachStall(id: string): CoachStallRecord {
  if (!isCoachStallId(id)) {
    throw new CoachStallError(404, 'not_found', 'Unknown stall reason. IDs are frozen.');
  }
  const def = LANI_COACH_STALLS.find((s) => s.id === id)!;
  return shape(def, rowById(id));
}

export function isActiveCoachStall(id: string): boolean {
  if (!isCoachStallId(id)) return false;
  return !getCoachStall(id).archived;
}

function trimText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new CoachStallError(400, 'validation_error', `${field} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new CoachStallError(400, 'validation_error', `${field} is required`);
  }
  if (trimmed.length > max) {
    throw new CoachStallError(400, 'validation_error', `${field} is too long`);
  }
  return trimmed;
}

export interface CoachStallPatch {
  name?: unknown;
  when?: unknown;
  owner_move?: unknown;
  archived?: unknown;
  restore?: unknown;
}

export function updateCoachStall(id: string, patch: CoachStallPatch, updatedBy?: string | null): CoachStallRecord {
  const current = getCoachStall(id);
  const def = LANI_COACH_STALLS.find((s) => s.id === current.id)!;

  const next = patch.restore
    ? { name: def.name, when: def.when, owner_move: def.owner_move, archived: false }
    : {
        name: patch.name !== undefined ? trimText(patch.name, 'name', 120) : current.name,
        when: patch.when !== undefined ? trimText(patch.when, 'when', 280) : current.when,
        owner_move: patch.owner_move !== undefined
          ? trimText(patch.owner_move, 'owner_move', 400)
          : current.owner_move,
        archived: patch.archived !== undefined ? Boolean(patch.archived) : current.archived,
      };

  db.prepare(`
    INSERT INTO coach_stalls (
      id, name, when_to_use, owner_move, archived, updated_at, updated_by
    ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      when_to_use = excluded.when_to_use,
      owner_move = excluded.owner_move,
      archived = excluded.archived,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).run(
    current.id,
    next.name,
    next.when,
    next.owner_move,
    next.archived ? 1 : 0,
    updatedBy || null,
  );

  return getCoachStall(current.id);
}
