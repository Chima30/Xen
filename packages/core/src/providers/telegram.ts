import { fetchWithRetry, type RequestBudget } from '../http';
import { escapeHtml } from '../text';

/** Telegram Bot API client (https://core.telegram.org/bots/api). */

export interface InlineButton { text: string; url?: string; callback_data?: string }
export type InlineKeyboard = InlineButton[][];

export async function tgCall<T = unknown>(token: string, method: string, payload: object, budget?: RequestBudget): Promise<T> {
  const res = await fetchWithRetry(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), timeoutMs: 15_000, retries: 2, budget,
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? 'unknown'}`);
  return json.result as T;
}

export function sendMessage(token: string, chatId: string | number, html: string, keyboard?: InlineKeyboard, budget?: RequestBudget) {
  return tgCall<{ message_id: number }>(token, 'sendMessage', {
    chat_id: chatId, text: html.slice(0, 4096), parse_mode: 'HTML', link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  }, budget);
}

/** Constant-time compare for the X-Telegram-Bot-Api-Secret-Token header. */
export function verifyWebhookSecret(header: string | null, expected: string | undefined): boolean {
  if (!header || !expected || header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < header.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export interface NotifiableOpportunity {
  id: string; title: string; project_name: string | null; category: string;
  reward_amount: number | null; reward_amount_max: number | null; reward_currency: string | null;
  reward_status: string; capital: string; geo_summary: string; estimated_minutes: number | null;
  deadline_at: string | null; score: number | null; verification: string; description: string | null;
  instructions: string | null; source_url: string; application_url: string | null; project_id?: string | null;
}

const label = (s: string) => s.replace(/_/g, ' ');

export function formatOpportunity(o: NotifiableOpportunity, appUrl?: string): { html: string; keyboard: InlineKeyboard } {
  const reward = o.reward_amount !== null
    ? `${o.reward_amount}${o.reward_amount_max ? `–${o.reward_amount_max}` : ''} ${o.reward_currency ?? ''}`.trim()
    : 'Not stated';
  const deadline = o.deadline_at ? new Date(o.deadline_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }) : 'Not stated';
  const effort = o.estimated_minutes ? (o.estimated_minutes >= 120 ? `~${Math.round(o.estimated_minutes / 60)} h` : `~${o.estimated_minutes} min`) : 'Unknown';
  const lines = [
    `<b>${escapeHtml(o.title)}</b>`,
    `${escapeHtml(o.project_name ?? 'Unknown project')} · ${escapeHtml(label(o.category))}`,
    '',
    `<b>Reward:</b> ${escapeHtml(reward)} (${escapeHtml(label(o.reward_status))})`,
    `<b>Capital:</b> ${escapeHtml(label(o.capital))}`,
    `<b>Eligibility:</b> ${escapeHtml(o.geo_summary)}`,
    `<b>Effort:</b> ${escapeHtml(effort)}   <b>Deadline:</b> ${escapeHtml(deadline)}`,
    `<b>Score:</b> ${o.score ?? '–'}/100   <b>Verification:</b> ${escapeHtml(label(o.verification))}`,
  ];
  if (o.description) lines.push('', escapeHtml(o.description.slice(0, 400)));
  if (o.instructions) lines.push('', `<b>How to participate:</b> ${escapeHtml(o.instructions.slice(0, 400))}`);
  lines.push('', `<a href="${escapeHtml(o.source_url)}">Original announcement</a>`);
  lines.push('<i>Verification reflects available evidence only and is not a guarantee of payment or safety.</i>');

  const keyboard: InlineKeyboard = [];
  const row1: InlineButton[] = [];
  if (appUrl) row1.push({ text: 'View', url: `${appUrl.replace(/\/$/, '')}/opportunities/${o.id}` });
  row1.push({ text: 'Source', url: o.source_url });
  if (o.application_url) row1.push({ text: 'Apply', url: o.application_url });
  keyboard.push(row1);
  // callback_data limit is 64 bytes: "<action>:<uuid>" fits.
  keyboard.push([{ text: 'Save', callback_data: `sv:${o.id}` }, { text: 'Remind me', callback_data: `rm:${o.id}` }, { text: 'Watch project', callback_data: `wp:${o.id}` }]);
  keyboard.push([{ text: 'Not interested', callback_data: `ni:${o.id}` }, { text: 'Report suspicious', callback_data: `rs:${o.id}` }]);
  return { html: lines.join('\n'), keyboard };
}
