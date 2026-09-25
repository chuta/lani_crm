/**
 * Monday and Friday qualified-pipeline emails.
 * Owners receive their own book. The root admin receives the full book.
 */

import db from '../db.js';
import { COMMERCIAL_LANES, conversionStageLabel } from '../catalog.js';
import { getSupabase } from '../supabase.js';

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const ACCOUNT_URL = 'https://lanicrm.netlify.app/partnerships/accounts?open=';

export type DigestSlot = 'monday' | 'friday';

export interface DigestProfile {
  email: string;
  full_name: string | null;
  role: string;
}

export interface DigestAccount {
  id: string;
  organisation: string;
  lane: string;
  current_stage: number;
  relationship_owner: string | null;
  estimated_value: number | null;
  expected_decision_date: string | null;
  next_action: string | null;
  internal_priority: number | null;
}

export interface DigestRunOptions {
  force?: boolean;
  slot?: string | null;
  now?: Date;
}

interface OutboundMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function lagosParts(now = new Date()): { date: string; weekday: number; minutes: number } {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const date = `${lagos.getUTCFullYear()}-${pad(lagos.getUTCMonth() + 1)}-${pad(lagos.getUTCDate())}`;
  return {
    date,
    weekday: lagos.getUTCDay(),
    minutes: lagos.getUTCHours() * 60 + lagos.getUTCMinutes(),
  };
}

export function slotInWindow(slot: DigestSlot, parts: { weekday: number; minutes: number }): boolean {
  // Fly schedules are hourly, not a minute-specific cron, so the send stays open for the clock hour.
  if (slot === 'monday') return parts.weekday === 1 && parts.minutes >= 6 * 60 && parts.minutes < 7 * 60;
  return parts.weekday === 5 && parts.minutes >= 18 * 60 && parts.minutes < 19 * 60;
}

export function inferSlot(parts: { weekday: number; minutes: number }): DigestSlot | null {
  if (slotInWindow('monday', parts)) return 'monday';
  if (slotInWindow('friday', parts)) return 'friday';
  return null;
}

function norm(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

export function matchOwner(owner: string | null, profiles: DigestProfile[]): DigestProfile | null {
  const key = norm(owner);
  if (!key) return null;
  const approved = profiles.filter((p) => p.role === 'bd_user' || p.role === 'root_admin');
  return approved.find((p) => norm(p.full_name) === key)
    || approved.find((p) => norm(p.email.split('@')[0]) === key)
    || approved.find((p) => norm(p.email) === key)
    || null;
}

export function daysUntil(dateStr: string | null, lagosDate: string): number | null {
  if (!dateStr) return null;
  const target = String(dateStr).slice(0, 10);
  const start = Date.parse(`${lagosDate}T00:00:00Z`);
  const end = Date.parse(`${target}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86400000);
}

export function decisionLine(dateStr: string | null, lagosDate: string): string {
  const days = daysUntil(dateStr, lagosDate);
  if (days == null) return 'No decision date';
  if (days === 0) return `Due today (${dateStr!.slice(0, 10)})`;
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} left (${dateStr!.slice(0, 10)})`;
  const overdue = Math.abs(days);
  return `${overdue} day${overdue === 1 ? '' : 's'} overdue (${dateStr!.slice(0, 10)})`;
}

function laneName(id: string): string {
  return COMMERCIAL_LANES.find((lane) => lane.id === id)?.name || id;
}

function money(value: number | null): string {
  if (value == null || !Number.isFinite(Number(value))) return 'No estimate';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isUrgent(account: DigestAccount, lagosDate: string): boolean {
  const days = daysUntil(account.expected_decision_date, lagosDate);
  return !String(account.next_action || '').trim() || (days != null && days < 0);
}

function sortAccounts(accounts: DigestAccount[], slot: DigestSlot, lagosDate: string): DigestAccount[] {
  const copy = [...accounts];
  if (slot !== 'friday') {
    return copy.sort((a, b) => (b.internal_priority || 0) - (a.internal_priority || 0));
  }
  return copy.sort((a, b) => {
    const urgent = Number(isUrgent(b, lagosDate)) - Number(isUrgent(a, lagosDate));
    if (urgent) return urgent;
    return (b.internal_priority || 0) - (a.internal_priority || 0);
  });
}

const LOGO_URL = 'https://bwkhfsbjgljiiawwawlh.supabase.co/storage/v1/object/public/brand/lani_logo.png';
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

function emailShell(title: string, intro: string, bodyHtml: string): string {
  return `<div style="margin:0;padding:32px 12px;background:#F3F5F1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7ebe6;">
          <tr>
            <td style="height:4px;background:#00843D;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td align="center" style="padding:32px 36px 12px;">
              <img src="${LOGO_URL}" alt="Lani Consulting" height="56" style="height:56px;width:auto;max-width:240px;display:block;border:0;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 36px 8px;font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:0.08em;color:#6b7280;text-transform:uppercase;">
              B2B Partnership Engine
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px 8px;font-family:${SANS};">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#1c1917;">${escapeHtml(title)}</h1>
              ${intro ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#44403c;">${escapeHtml(intro)}</p>` : ''}
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 36px 28px;border-top:1px solid #f0f2ee;font-family:${SANS};font-size:12px;line-height:1.5;color:#9ca3af;">
              Lani Consulting · B2B Partnership Engine
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
}

function accountBlock(account: DigestAccount, lagosDate: string): { text: string; html: string } {
  const next = String(account.next_action || '').trim() || 'No next action';
  const decision = decisionLine(account.expected_decision_date, lagosDate);
  const link = `${ACCOUNT_URL}${encodeURIComponent(account.id)}`;
  const lines = [
    account.organisation,
    `Next step: ${next}`,
    `${conversionStageLabel(account.current_stage)} · ${laneName(account.lane)}`,
    `Estimated value: ${money(account.estimated_value)}`,
    `Expected decision: ${decision}`,
    link,
  ];
  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;border:1px solid #e7ebe6;border-radius:12px;">
      <tr>
        <td style="padding:14px 16px;font-family:${SANS};">
          <div style="font-size:16px;font-weight:700;color:#1c1917;">${escapeHtml(account.organisation)}</div>
          <div style="margin-top:8px;font-size:14px;line-height:1.5;color:#1c1917;"><strong>Next step:</strong> ${escapeHtml(next)}</div>
          <div style="margin-top:6px;font-size:13px;line-height:1.5;color:#44403c;">${escapeHtml(conversionStageLabel(account.current_stage))} · ${escapeHtml(laneName(account.lane))}</div>
          <div style="margin-top:4px;font-size:13px;line-height:1.5;color:#44403c;">Estimated value: ${escapeHtml(money(account.estimated_value))}</div>
          <div style="margin-top:4px;font-size:13px;line-height:1.5;color:#44403c;">Expected decision: ${escapeHtml(decision)}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px;">
            <tr>
              <td style="border-radius:8px;background:#00843D;">
                <a href="${link}" style="display:inline-block;padding:10px 16px;font-family:${SANS};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Open account</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
  return { text: lines.join('\n'), html };
}

function subjectFor(slot: DigestSlot, audience: 'owner' | 'admin'): string {
  const when = slot === 'monday' ? 'week ahead' : 'week close';
  return audience === 'admin'
    ? `Qualified pipeline — ${when} (full book)`
    : `Qualified pipeline — ${when}`;
}

function introFor(slot: DigestSlot, audience: 'owner' | 'admin', count: number): string {
  if (audience === 'admin' && count === 0) return 'No qualified opportunities this week.';
  if (slot === 'friday') {
    return audience === 'admin'
      ? 'Close of week. Overdue decisions and missing next steps are listed first.'
      : 'Close of week. Act on the next step. Overdue decisions and missing next steps are listed first.';
  }
  return audience === 'admin'
    ? 'Week ahead for the qualified book. The next step on each account is the action that moves it.'
    : 'Week ahead. The next step on each account is the action that moves it.';
}

export function renderDigest(opts: {
  slot: DigestSlot;
  lagosDate: string;
  accounts: DigestAccount[];
  audience: 'owner' | 'admin';
  ownerLabel?: string;
  heading?: string;
}): { subject: string; text: string; html: string } {
  const accounts = sortAccounts(opts.accounts, opts.slot, opts.lagosDate);
  const intro = opts.heading ? '' : introFor(opts.slot, opts.audience, accounts.length);
  const blocks = accounts.map((account) => accountBlock(account, opts.lagosDate));
  const heading = opts.heading
    || (opts.audience === 'admin'
      ? 'Qualified Commercial Pipeline'
      : `Your qualified opportunities${opts.ownerLabel ? ` — ${opts.ownerLabel}` : ''}`);
  const text = [heading, '', intro, '', blocks.map((b) => b.text).join('\n\n') || 'None.']
    .filter((line) => line !== undefined)
    .join('\n');
  const html = emailShell(
    heading,
    intro,
    blocks.map((b) => b.html).join('') || '<p style="margin:0;font-size:15px;color:#44403c;">None.</p>',
  );
  return { subject: subjectFor(opts.slot, opts.audience), text, html };
}

function loadQualifiedAccounts(): DigestAccount[] {
  return db.prepare(`
    SELECT id, organisation, lane, current_stage, relationship_owner,
      estimated_value, expected_decision_date, next_action, internal_priority
    FROM accounts
    WHERE is_archived = 0 AND current_stage >= 2 AND current_stage <= 5
    ORDER BY internal_priority DESC, organisation ASC
  `).all() as DigestAccount[];
}

async function loadProfiles(): Promise<DigestProfile[]> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('email, full_name, role');
  if (error) throw new Error(`profiles: ${error.message}`);
  return (data || []) as DigestProfile[];
}

async function sendMail(mail: OutboundMail): Promise<void> {
  const key = process.env.RESEND_API_KEY || '';
  const fromEmail = process.env.MAIL_FROM || '';
  const fromName = process.env.MAIL_FROM_NAME || 'Partnership Pipeline';
  if (!key || !fromEmail) throw new Error('RESEND_API_KEY and MAIL_FROM are required');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
}

function alreadySent(slot: DigestSlot, lagosDate: string): boolean {
  const row = db.prepare(
    'SELECT 1 AS ok FROM pipeline_digest_sends WHERE slot = ? AND lagos_date = ?'
  ).get(slot, lagosDate) as { ok: number } | undefined;
  return Boolean(row);
}

function recordSend(slot: DigestSlot, lagosDate: string): void {
  db.prepare(
    'INSERT INTO pipeline_digest_sends (slot, lagos_date) VALUES (?, ?)'
  ).run(slot, lagosDate);
}

export async function runPipelineDigest(options: DigestRunOptions = {}): Promise<{
  ok: true;
  slot: DigestSlot;
  lagos_date: string;
  skipped?: 'already_sent';
  owner_emails: number;
  admin_sent: boolean;
  accounts: number;
}> {
  const now = options.now || new Date();
  const parts = lagosParts(now);
  const requested = options.slot === 'monday' || options.slot === 'friday' ? options.slot : null;
  const slot = requested || inferSlot(parts);
  if (!slot) {
    const err = new Error('outside_window') as Error & { status?: number };
    err.status = 409;
    throw err;
  }
  if (!options.force && !slotInWindow(slot, parts)) {
    const err = new Error('outside_window') as Error & { status?: number };
    err.status = 409;
    throw err;
  }

  if (alreadySent(slot, parts.date)) {
    return {
      ok: true,
      slot,
      lagos_date: parts.date,
      skipped: 'already_sent',
      owner_emails: 0,
      admin_sent: false,
      accounts: 0,
    };
  }

  const adminEmail = (process.env.ROOT_ADMIN_EMAIL || '').trim();
  if (!adminEmail) throw new Error('ROOT_ADMIN_EMAIL is not set');

  const accounts = loadQualifiedAccounts();
  const profiles = await loadProfiles();
  const byOwner = new Map<string, { profile: DigestProfile; accounts: DigestAccount[] }>();
  const unassigned: DigestAccount[] = [];

  for (const account of accounts) {
    const profile = matchOwner(account.relationship_owner, profiles);
    if (!profile) {
      unassigned.push(account);
      continue;
    }
    const key = profile.email.toLowerCase();
    const group = byOwner.get(key) || { profile, accounts: [] };
    group.accounts.push(account);
    byOwner.set(key, group);
  }

  let ownerEmails = 0;
  for (const group of byOwner.values()) {
    if (!group.accounts.length) continue;
    if (group.profile.email.toLowerCase() === adminEmail.toLowerCase()) continue;
    const body = renderDigest({
      slot,
      lagosDate: parts.date,
      accounts: group.accounts,
      audience: 'owner',
      ownerLabel: group.profile.full_name || group.profile.email,
    });
    await sendMail({ to: group.profile.email, ...body });
    ownerEmails += 1;
  }

  const adminAccounts = [
    ...[...byOwner.values()].flatMap((group) => group.accounts.map((account) => ({
      ...account,
      relationship_owner: account.relationship_owner || group.profile.full_name || group.profile.email,
    }))),
    ...unassigned.map((account) => ({
      ...account,
      relationship_owner: 'Unassigned',
    })),
  ];
  const adminBody = renderAdminDigest(slot, parts.date, adminAccounts);
  await sendMail({ to: adminEmail, ...adminBody });
  recordSend(slot, parts.date);

  return {
    ok: true,
    slot,
    lagos_date: parts.date,
    owner_emails: ownerEmails,
    admin_sent: true,
    accounts: accounts.length,
  };
}

export function renderAdminDigest(slot: DigestSlot, lagosDate: string, accounts: DigestAccount[]): { subject: string; text: string; html: string } {
  const groups = new Map<string, DigestAccount[]>();
  for (const account of accounts) {
    const label = String(account.relationship_owner || 'Unassigned').trim() || 'Unassigned';
    const list = groups.get(label) || [];
    list.push(account);
    groups.set(label, list);
  }
  if (groups.size === 0) {
    return renderDigest({ slot, lagosDate, accounts: [], audience: 'admin' });
  }
  const sections = [...groups.entries()].map(([label, rows]) => {
    const sorted = sortAccounts(rows, slot, lagosDate);
    const blocks = sorted.map((account) => accountBlock(account, lagosDate));
    return {
      label,
      text: [label, '', blocks.map((block) => block.text).join('\n\n')].join('\n'),
      html: blocks.map((block) => block.html).join(''),
    };
  });
  const intro = introFor(slot, 'admin', accounts.length);
  const subject = subjectFor(slot, 'admin');
  const body = sections.map((section) => `
    <h2 style="margin:8px 0 12px;font-size:16px;line-height:1.3;color:#1c1917;font-family:${SANS};">${escapeHtml(section.label)}</h2>
    ${section.html}
  `).join('');
  return {
    subject,
    text: ['Qualified Commercial Pipeline', '', intro, '', sections.map((s) => s.text).join('\n\n')].join('\n'),
    html: emailShell('Qualified Commercial Pipeline', intro, body),
  };
}
