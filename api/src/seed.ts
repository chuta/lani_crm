/**
 * Seed the LANI client archetype library. Idempotent. Never seeds $GIFT deals.
 */

import db from './db.js';
import { CLIENT_ARCHETYPES } from './catalog.js';
import { seedFeeBands } from './services/fee-bands.js';
import { seedCoachStalls } from './services/coach-stalls.js';

export default function seedArchetypes(): void {
  const existing = db.prepare('SELECT COUNT(*) as c FROM archetype_library').get() as { c: number };
  if (existing && existing.c > 0) {
    console.log('[seed] LANI archetype library already seeded, skipping');
  } else {
    const stmt = db.prepare(`
      INSERT INTO archetype_library (
        id, name, one_line_test, typical_organisations, problems, lani_opportunity,
        entry_point, commercial_trigger, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((rows: typeof CLIENT_ARCHETYPES) => {
      for (const row of rows) {
        stmt.run(
          row.id,
          row.name,
          row.one_line_test,
          JSON.stringify(row.typical_organisations),
          JSON.stringify(row.problems),
          JSON.stringify(row.lani_opportunity),
          row.entry_point,
          row.commercial_trigger,
          row.description,
        );
      }
    });

    insertMany(CLIENT_ARCHETYPES);
    console.log(`[seed] Seeded ${CLIENT_ARCHETYPES.length} LANI client archetypes (A–F)`);
  }

  const feeInserted = seedFeeBands();
  if (feeInserted > 0) {
    console.log(`[seed] Seeded ${feeInserted} LANI fee bands`);
  }

  const stallInserted = seedCoachStalls();
  if (stallInserted > 0) {
    console.log(`[seed] Seeded ${stallInserted} LANI stall reasons`);
  }
}
