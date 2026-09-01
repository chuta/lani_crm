/**
 * Audit helper service — shared across CPO routes.
 */
import db from '../db.js';

export function audit(proposalId: string, eventType: string, actor: string | null, description: string, metadata?: any) {
  db.prepare(`INSERT INTO proposal_audit_events (proposal_id, event_type, actor, description, metadata) VALUES (?,?,?,?,?)`).run(
    proposalId, eventType, actor, description, metadata ? JSON.stringify(metadata) : null
  );
}