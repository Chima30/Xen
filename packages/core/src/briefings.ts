import type { ServerEnv } from './env';
import type { Repo } from './pipeline/repo';
import { sendMessage } from './providers/telegram';
import { escapeHtml } from './text';

/** Notification Agent: briefings, deadline alerts and reminders. Never invents items to fill a message. */

const COLS = 'id, title, project_name, score, reward_amount, reward_currency, reward_status, capital, deadline_at, source_url';

function row(o: any) {
  const reward = o.reward_amount !== null ? `${o.reward_amount} ${o.reward_currency ?? ''}`.trim() : o.reward_status.replace('_', ' ');
  const dl = o.deadline_at ? ` · closes ${new Date(o.deadline_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })}` : '';
  return `• <b>${escapeHtml(o.title)}</b> — ${escapeHtml(o.project_name ?? '?')}\n   ${o.score}/100 · ${escapeHtml(reward)} · capital: ${o.capital}${dl} · <a href="${escapeHtml(o.source_url)}">source</a>`;
}

async function recipients(env: ServerEnv, repo: Repo, prefKey: 'morning_briefing' | 'evening_summary' | 'weekly_report'): Promise<string[]> {
  const out = new Set<string>();
  if (env.TELEGRAM_CHAT_ID) out.add(env.TELEGRAM_CHAT_ID);
  const linked = await repo.db.from('telegram_accounts').select('chat_id, user_id').not('chat_id', 'is', null);
  for (const a of linked.data ?? []) {
    const p = (await repo.db.from('notification_preferences').select(prefKey).eq('user_id', a.user_id).maybeSingle()).data as Record<string, boolean> | null;
    if (!p || p[prefKey] !== false) out.add(String(a.chat_id));
  }
  return [...out];
}

/** Sends at most once per chat per slot thanks to the notifications dedupe key. */
async function deliver(env: ServerEnv, repo: Repo, chats: string[], kind: string, slot: string, html: string): Promise<number> {
  let sent = 0;
  for (const chat of chats) {
    const claim = await repo.db.from('notifications').insert({ chat_id: chat, kind, dedupe_key: `${kind}:${slot}:${chat}`, status: 'pending' }).select('id').single();
    if (claim.error) continue;
    try {
      await sendMessage(env.TELEGRAM_BOT_TOKEN!, chat, html);
      await repo.db.from('notifications').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', claim.data.id);
      sent++;
    } catch (e) {
      await repo.db.from('notifications').update({ status: 'failed', error: String(e).slice(0, 500) }).eq('id', claim.data.id);
    }
  }
  return sent;
}

export async function sendBriefing(env: ServerEnv, repo: Repo, kind: 'morning' | 'evening' | 'weekly', now = new Date()): Promise<number> {
  if (!env.TELEGRAM_BOT_TOKEN) return 0;
  const since = new Date(now.getTime() - (kind === 'weekly' ? 7 : 1) * 86400_000).toISOString();
  const base = () => repo.db.from('opportunities').select(COLS).eq('is_active', true).not('verification', 'in', '(suspicious,expired)');
  const [fresh, closing, stats] = await Promise.all([
    base().gte('discovered_at', since).gte('score', 50).order('score', { ascending: false }).limit(kind === 'weekly' ? 10 : 6),
    base().gte('deadline_at', now.toISOString()).lte('deadline_at', new Date(now.getTime() + 3 * 86400_000).toISOString()).order('deadline_at').limit(5),
    repo.db.from('opportunities').select('id', { count: 'exact', head: true }).gte('discovered_at', since),
  ]);
  const title = kind === 'morning' ? 'Morning briefing' : kind === 'evening' ? 'Evening summary' : 'Weekly report';
  const parts = [`<b>XEN — ${title}</b>`, `${stats.count ?? 0} opportunities discovered ${kind === 'weekly' ? 'this week' : 'in the last 24h'}.`];
  if (fresh.data?.length) parts.push('', '<b>Worth your time</b>', ...fresh.data.map(row));
  if (closing.data?.length) parts.push('', '<b>Closing within 3 days</b>', ...closing.data.map(row));
  if (!fresh.data?.length && !closing.data?.length) parts.push('', 'Nothing new that meets your threshold. No filler — XEN will alert you when something real appears.');
  const chats = await recipients(env, repo, kind === 'morning' ? 'morning_briefing' : kind === 'evening' ? 'evening_summary' : 'weekly_report');
  return deliver(env, repo, chats, `briefing_${kind}`, now.toISOString().slice(0, 10), parts.join('\n'));
}

export async function sendDueReminders(env: ServerEnv, repo: Repo, now = new Date()): Promise<number> {
  if (!env.TELEGRAM_BOT_TOKEN) return 0;
  const due = await repo.db.from('reminders').select('id, user_id, message, opportunity_id').is('sent_at', null).lte('remind_at', now.toISOString()).limit(20);
  let sent = 0;
  for (const r of due.data ?? []) {
    const acct = (await repo.db.from('telegram_accounts').select('chat_id').eq('user_id', r.user_id).maybeSingle()).data;
    // Mark first: a reminder is never sent twice even if the send below fails.
    const upd = await repo.db.from('reminders').update({ sent_at: now.toISOString() }).eq('id', r.id).is('sent_at', null).select('id');
    if (!upd.data?.length || !acct?.chat_id) continue;
    try { await sendMessage(env.TELEGRAM_BOT_TOKEN, String(acct.chat_id), `⏰ ${escapeHtml(r.message)}`); sent++; } catch { /* logged by caller */ }
  }
  return sent;
}

/** Marks opportunities past their deadline as expired. */
export async function expireOpportunities(repo: Repo, now = new Date()): Promise<number> {
  const r = await repo.db.from('opportunities').update({ is_active: false, verification: 'expired' }).lt('deadline_at', now.toISOString()).eq('is_active', true).select('id');
  return r.data?.length ?? 0;
}
