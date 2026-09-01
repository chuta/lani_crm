/**
 * Teams Notification Service
 * Sends proactive DMs to users via the Bot Framework REST API
 * when deals change stage or triage responses are due.
 */

import db from '../db.js';

const TENANT_ID = process.env.PARTNERSHIP_TEAMS_TENANT_ID || '20ecdbd9-e8ec-4cc8-9c50-b64a59617e9f';
const APP_ID = process.env.PARTNERSHIP_TEAMS_APP_ID || process.env.TEAMS_APP_ID || '';
const APP_PASSWORD = process.env.PARTNERSHIP_TEAMS_APP_PASSWORD || process.env.TEAMS_APP_PASSWORD || '';
const BOT_SERVICE_URL = 'https://smba.trafficmanager.net/amer/';
const BOT_NAME = 'MindHela · Ubuntu Tribe';

interface TeamsUser {
  id: string;       // AAD object ID
  name: string;
}

async function getBotToken(): Promise<string> {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: APP_ID,
    client_secret: APP_PASSWORD,
    grant_type: 'client_credentials',
    scope: 'https://api.botframework.com/.default',
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[notifications] Bot token request failed: ${res.status} ${text.slice(0, 200)}`);
    return '';
  }

  const data = await res.json() as any;
  return data.access_token || '';
}

/**
 * Create a 1:1 conversation with a Teams user and send them a message.
 * Uses the Bot Framework v3 API to proactively start a conversation.
 */
async function sendDirectMessage(user: TeamsUser, card: any): Promise<boolean> {
  if (!APP_ID || !APP_PASSWORD) {
    console.warn('[notifications] Teams bot not configured — skipping DM');
    return false;
  }

  const token = await getBotToken();
  if (!token) return false;

  // Step 1: Create conversation
  const createUrl = `${BOT_SERVICE_URL}v3/conversations`;
  const createBody = {
    bot: { id: APP_ID, name: BOT_NAME },
    members: [{ id: user.id }],
    channelData: {},
    isGroup: false,
    activity: undefined,
  };

  let convoRes: Response;
  try {
    convoRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createBody),
    });
  } catch (e: any) {
    console.error(`[notifications] Failed to create conversation: ${e?.message || e}`);
    return false;
  }

  if (!convoRes.ok) {
    // If 429, skip silently — retry isn't appropriate for real-time notifications
    const text = await convoRes.text().catch(() => '');
    if (convoRes.status !== 429) {
      console.error(`[notifications] Create conversation failed: ${convoRes.status} ${text.slice(0, 200)}`);
    }
    return false;
  }

  const convoData = await convoRes.json() as any;
  const conversationId = convoData.id;
  if (!conversationId) return false;

  // Step 2: Send activity (Adaptive Card)
  const sendUrl = `${BOT_SERVICE_URL}v3/conversations/${conversationId}/activities`;
  const activity = {
    type: 'message',
    from: { id: APP_ID, name: BOT_NAME },
    conversation: { id: conversationId },
    recipient: { id: user.id, name: user.name },
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: card,
      },
    ],
  };

  try {
    const sendRes = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(activity),
    });
    if (!sendRes.ok && sendRes.status !== 429) {
      const text = await sendRes.text().catch(() => '');
      console.error(`[notifications] Send message failed: ${sendRes.status} ${text.slice(0, 200)}`);
    }
    return sendRes.ok;
  } catch (e: any) {
    console.error(`[notifications] Send message error: ${e?.message || e}`);
    return false;
  }
}

/**
 * Build an Adaptive Card for a stage-change notification.
 */
function buildStageChangeCard(dealName: string, stage: string, owner: string): any {
  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'TextBlock',
        text: '🔁 **Deal Stage Update**',
        weight: 'bolder',
        size: 'medium',
        color: 'accent',
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'Partner / Deal', value: dealName },
          { title: 'Current Stage', value: stage },
          { title: 'Owner', value: owner },
        ],
      },
      {
        type: 'TextBlock',
        text: `The deal has moved to **Stage ${stage}**. Next actions may be required from you.`,
        wrap: true,
        size: 'small',
        color: 'good',
      },
    ],
  };
}

/**
 * Build an Adaptive Card for a triage-reminder notification.
 */
function buildTriageReminderCard(dealName: string, archetype: string, daysRemaining: number): any {
  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'TextBlock',
        text: '⏰ **Tech Triage Reminder**',
        weight: 'bolder',
        size: 'medium',
        color: 'warning',
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'Partner / Deal', value: dealName },
          { title: 'Archetype', value: `Archetype ${archetype}` },
          { title: 'Days Remaining', value: `${daysRemaining} business day(s)` },
        ],
      },
      {
        type: 'TextBlock',
        text: 'Please confirm or correct the archetype classification and flag novelty within the 3-business-day triage commitment.',
        wrap: true,
        size: 'small',
      },
    ],
  };
}

/**
 * Notify the assigned owners that a deal has moved to a new stage.
 */
export async function notifyStageChange(
  dealId: string,
  dealName: string,
  stageId: number,
  stageOwner: string,
  bdOwner?: string | null,
  techOwner?: string | null
): Promise<void> {
  const stage = ['Lead', 'Intake & Classification', 'Tech Triage', 'Prioritization',
    'Business Case / Proposal', 'Build', 'Pilot', 'Launch', 'Post-Launch Review'
  ][stageId - 1];

  const card = buildStageChangeCard(dealName, `${stageId} — ${stage}`, stageOwner);

  // Determine who to notify based on the stage owner
  const notifyUsers: TeamsUser[] = [];
  if (bdOwner) notifyUsers.push({ id: bdOwner, name: 'BD Owner' });
  if (techOwner) notifyUsers.push({ id: techOwner, name: 'Tech Owner' });

  for (const user of notifyUsers) {
    await sendDirectMessage(user, card);
  }
}

/**
 * Notify the tech owner that a triage response is due.
 */
export async function notifyTriageDue(
  dealName: string,
  archetype: string,
  techOwner: string
): Promise<void> {
  // On the 3rd business day, this fires
  const card = buildTriageReminderCard(dealName, archetype, 0);
  await sendDirectMessage({ id: techOwner, name: 'Tech Owner' }, card);
}

export { sendDirectMessage, buildStageChangeCard, buildTriageReminderCard };