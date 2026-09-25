/**
 * Wake the API so it sends the qualified-pipeline digest, then exit.
 * Cron machines have no database volume. A 409 outside the send window is success.
 */

const slot = process.env.DIGEST_SLOT || '';
const secret = process.env.PIPELINE_DIGEST_SECRET || '';
const base = process.env.DIGEST_URL || 'https://lani-crm-api.fly.dev/api/partnerships/jobs/pipeline-digest';

if (!secret) {
  console.error('[digest] PIPELINE_DIGEST_SECRET is not set');
  process.exit(1);
}

const url = new URL(base);
if (slot) url.searchParams.set('slot', slot);

const res = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${secret}` },
});
const text = await res.text();
console.log(`[digest] ${res.status} ${text.slice(0, 500)}`);
process.exit(res.ok || res.status === 409 ? 0 : 1);
