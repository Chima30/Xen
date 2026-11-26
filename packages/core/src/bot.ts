import type { ServerEnv } from './env';
import { integrationStatus } from './env';
import { tgCall, sendMessage, type InlineKeyboard } from './providers/telegram';
import type { Repo } from './pipeline/repo';
import { escapeHtml, sha256Hex } from './text';

/** XEN Pulse — Telegram bot command + callback handling. */

export interface TgUpdate {
  update_id: number;
  message?: { message_id: number; chat: { id: number; type: string }; from?: { id: number; username?: string }; text?: string };
  callback_query?: { id: string; from: { id: number }; message?: { chat: { id: number } }; data?: string };
}

const CATEGORY_COMMANDS: Record<string, { label: string; categories?: string[]; filter?: Record<string, string> }> = {
  paid: { label: 'Confirmed paid opportunities', filter: { reward_status: 'confirmed' } },
  free: { label: 'Zero-capital opportunities', filter: { capital: 'none' } },
  prediction: { label: 'Prediction market opportunities', categories: ['prediction_market_testing'] },
  trading: { label: 'Trading platform opportunities', categories: ['dex_testing', 'perp_testing', 'spot_trading_testing', 'trading_competition'] },
  testnet: { label: 'Incentivized testnets', categories: ['incentivized_testnet'] },
  early: { label: 'Early-stage projects', categories: ['early_project', 'upcoming_launch', 'waitlist'] },
  bounties: { label: 'Bounties', categories: ['bug_bounty', 'bug_reporting', 'writing_bounty'] },
  hackathons: { label: 'Hackathons', categories: ['hackathon'] },
  jobs: { label: 'Jobs and gigs', categories: ['freelance', 'development', 'design', 'community_management', 'ambassador'] },
  grants: { label: 'Grants', categories: ['grant'] },
};

const HELP = `<b>XEN</b> — Discover opportunities before the crowd.

/today — best open opportunities
/paid /free /prediction /trading /testnet /early
/bounties /hackathons /jobs /grants
/search &lt;words&gt; — search stored opportunities
/deadlines — closing within 7 days
/saved /tasks /watchlist /earnings — your records (linked account)
/watch &lt;project&gt; — add a project to your watchlist
/status — system and integration status
/settings — notification settings

Link your dashboard account: open Settings → Telegram on the web app and send the /start code shown there.`;

interface Ctx { env: ServerEnv; repo: Repo; chatId: number; tgUserId: number }

async function reply(c: Ctx, html: string, kb?: InlineKeyboard) {
  await sendMessage(c.env.TELEGRAM_BOT_TOKEN!, c.chatId, html, kb);
}

/** Returns the linked XEN user id for this chat, or null. */
async function linkedUser(c: Ctx): Promise<string | null> {
  const r = await c.repo.db.from('telegram_accounts').select('user_id').eq('chat_id', c.chatId).eq('telegram_user_id', c.tgUserId).maybeSingle();
  return r.data?.user_id ?? null;
}

function isOwnerChat(c: Ctx) { return !!c.env.TELEGRAM_CHAT_ID && String(c.chatId) === c.env.TELEGRAM_CHAT_ID; }

function fmtRow(o: { id: string; title: string; project_name: string | null; score: number | null; reward_amount: number | null; reward_currency: string | null; reward_status: string; deadline_at: string | null; source_url: string }) {
  const reward = o.reward_amount !== null ? `${o.reward_amount} ${o.reward_currency ?? ''}`.trim() : o.reward_status.replace('_', ' ');
  const dl = o.deadline_at ? ` · closes ${new Date(o.deadline_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })}` : '';
  return `• <b>${escapeHtml(o.title)}</b> (${escapeHtml(o.project_name ?? '?')})\n   ${o.score ?? '–'}/100 · ${escapeHtml(reward)}${dl} · <a href="${escapeHtml(o.source_url)}">source</a>`;
}

const LIST_COLS = 'id, title, project_name, score, reward_amount, reward_currency, reward_status, deadline_at, source_url';

async function listOpportunities(c: Ctx, label: string, build: (q: any) => any) {
  const q = build(c.repo.db.from('opportunities').select(LIST_COLS).eq('is_active', true).not('verification', 'in', '(suspicious,expired)'))
    .order('score', { ascending: false, nullsFirst: false }).limit(8);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  if (!data?.length) return reply(c, `<b>${escapeHtml(label)}</b>\nNothing matching right now. XEN only lists opportunities it has actually found.`);
  return reply(c, `<b>${escapeHtml(label)}</b>\n\n${data.map(fmtRow).join('\n\n')}`);
}

export async function handleUpdate(env: ServerEnv, repo: Repo, u: TgUpdate): Promise<'duplicate' | 'handled' | 'ignored'> {
  // Idempotency: Telegram may redeliver an update.
  const ins = await repo.db.from('telegram_updates').insert({ update_id: u.update_id });
  if (ins.error) return ins.error.code === '23505' ? 'duplicate' : (() => { throw new Error(ins.error!.message); })();

  if (u.callback_query) return handleCallback(env, repo, u.callback_query);
  const m = u.message;
  if (!m?.text || !m.from || m.chat.type !== 'private') return 'ignored';
  const c: Ctx = { env, repo, chatId: m.chat.id, tgUserId: m.from.id };
  const [rawCmd, ...rest] = m.text.trim().split(/\s+/);
  const cmd = rawCmd!.toLowerCase().replace(/@\w+$/, '');
  const arg = rest.join(' ').slice(0, 200);

  if (cmd === '/start' && arg) return (await linkAccount(c, arg, m.from.username)), 'handled';
  if (cmd === '/start' || cmd === '/help') return (await reply(c, HELP)), 'handled';

  const userId = await linkedUser(c);
  // Only linked accounts or the configured owner chat may use the bot.
  if (!userId && !isOwnerChat(c)) {
    await reply(c, 'This bot is private. Link your XEN account from the web dashboard (Settings → Telegram) to use it.');
    return 'handled';
  }

  const catCmd = CATEGORY_COMMANDS[cmd.slice(1)];
  if (catCmd) {
    await listOpportunities(c, catCmd.label, (q) => {
      if (catCmd.categories) q = q.in('category', catCmd.categories);
      for (const [k, v] of Object.entries(catCmd.filter ?? {})) q = q.eq(k, v);
      return q;
    });
    return 'handled';
  }

  switch (cmd) {
    case '/today':
      await listOpportunities(c, 'Today — top open opportunities', (q) => q.gte('score', 50).gte('discovered_at', new Date(Date.now() - 7 * 86400_000).toISOString()));
      break;
    case '/deadlines':
      await listOpportunities(c, 'Closing within 7 days', (q) => q.gte('deadline_at', new Date().toISOString()).lte('deadline_at', new Date(Date.now() + 7 * 86400_000).toISOString()));
      break;
    case '/search':
    case '/research': {
      if (!arg) { await reply(c, 'Usage: /search prediction market testers'); break; }
      const term = arg.replace(/[%_,()]/g, ' ').trim();
      await listOpportunities(c, `Results for “${term}”`, (q) => q.or(`title.ilike.%${term}%,description.ilike.%${term}%,project_name.ilike.%${term}%`));
      if (cmd === '/research') await reply(c, '<i>Live external research from Telegram is not enabled yet; results above come from the XEN database only.</i>');
      break;
    }
    case '/saved':
    case '/tasks':
    case '/watchlist':
    case '/earnings':
    case '/watch':
      if (!userId) { await reply(c, 'Link your dashboard account first (Settings → Telegram).'); break; }
      await personal(c, cmd, arg, userId);
      break;
    case '/status':
      await status(c);
      break;
    case '/settings':
      await reply(c, `Notification settings are managed on the dashboard${env.APP_URL ? `: ${escapeHtml(env.APP_URL)}/settings` : '.'}`);
      break;
    case '/report':
      await reply(c, `Use the Testing Lab to draft a bug report from your own observations${env.APP_URL ? `: ${escapeHtml(env.APP_URL)}/lab` : '.'}`);
      break;
    default: {
      // Natural language → database search over stored opportunities.
      const words = m.text.toLowerCase().match(/[a-z0-9]{4,}/g)?.filter((w) => !['find', 'show', 'with', 'that', 'what', 'need', 'some', 'opportunities', 'paying', 'today'].includes(w)).slice(0, 3) ?? [];
      if (!words.length) { await reply(c, HELP); break; }
      await listOpportunities(c, `Matches for “${words.join(' ')}”`, (q) => q.or(words.map((w) => `title.ilike.%${w}%,description.ilike.%${w}%`).join(',')));
    }
  }
  return 'handled';
}

async function personal(c: Ctx, cmd: string, arg: string, userId: string) {
  const db = c.repo.db;
  if (cmd === '/saved') {
    const r = await db.from('saved_opportunities').select(`opportunities(${LIST_COLS})`).eq('user_id', userId).eq('hidden', false).limit(10);
    const rows = (r.data ?? []).map((x: any) => x.opportunities).filter(Boolean);
    return reply(c, rows.length ? `<b>Saved</b>\n\n${rows.map(fmtRow).join('\n\n')}` : 'No saved opportunities yet.');
  }
  if (cmd === '/tasks') {
    const r = await db.from('tasks').select('title, due_at').eq('user_id', userId).eq('done', false).order('due_at', { ascending: true, nullsFirst: false }).limit(15);
    return reply(c, r.data?.length ? `<b>Open tasks</b>\n${r.data.map((t) => `• ${escapeHtml(t.title)}${t.due_at ? ` — due ${new Date(t.due_at).toLocaleDateString('en-GB')}` : ''}`).join('\n')}` : 'No open tasks.');
  }
  if (cmd === '/watchlist') {
    const r = await db.from('watchlists').select('projects(name, stage, website)').eq('user_id', userId).limit(30);
    const rows = (r.data ?? []).map((x: any) => x.projects).filter(Boolean);
    return reply(c, rows.length ? `<b>Watchlist</b>\n${rows.map((p: any) => `• ${escapeHtml(p.name)} — ${escapeHtml(p.stage)}`).join('\n')}` : 'Your watchlist is empty. Use /watch <project>.');
  }
  if (cmd === '/earnings') {
    const r = await db.from('earnings').select('amount_usd, status').eq('user_id', userId);
    const sum = (s: string) => (r.data ?? []).filter((e) => e.status === s).reduce((a, e) => a + Number(e.amount_usd ?? 0), 0);
    return reply(c, `<b>Earnings (USD, where recorded)</b>\nReceived: $${sum('received').toFixed(2)}\nPending: $${sum('pending').toFixed(2)}\nExpected: $${sum('expected').toFixed(2)}\n<i>Expected and pending amounts are not income until received.</i>`);
  }
  if (cmd === '/watch') {
    if (!arg) return reply(c, 'Usage: /watch <project name>');
    const p = await db.from('projects').select('id, name').ilike('name', arg.replace(/[%_]/g, '')).maybeSingle();
    if (!p.data) return reply(c, `XEN has no profile for “${escapeHtml(arg)}” yet. Add it with its website from the dashboard (Watchlist).`);
    await db.from('watchlists').upsert({ user_id: userId, project_id: p.data.id }, { onConflict: 'user_id,project_id', ignoreDuplicates: true });
    return reply(c, `Watching <b>${escapeHtml(p.data.name)}</b>.`);
  }
}

async function status(c: Ctx) {
  const integ = integrationStatus(c.env);
  const day = new Date().toISOString().slice(0, 10);
  const usage = await c.repo.db.from('api_usage').select('provider, requests, failures, units').eq('day', day);
  const lastScan = await c.repo.db.from('source_health').select('checked_at, ok, adapter_id').order('checked_at', { ascending: false }).limit(1).maybeSingle();
  const count = await c.repo.db.from('opportunities').select('id', { count: 'exact', head: true }).eq('is_active', true);
  const lines = ['<b>XEN status</b>', `Active opportunities: ${count.count ?? 0}`,
    `Last scan: ${lastScan.data ? `${new Date(lastScan.data.checked_at).toISOString().slice(0, 16)}Z (${lastScan.data.adapter_id}, ${lastScan.data.ok ? 'ok' : 'failed'})` : 'never'}`, '',
    '<b>Integrations</b> (configured ≠ tested)', ...Object.entries(integ).map(([k, v]) => `• ${k}: ${v}`), '',
    '<b>Usage today (UTC)</b>', ...((usage.data ?? []).map((u) => `• ${u.provider}: ${u.units} units, ${u.failures} failures`)), (usage.data?.length ? '' : '• none')];
  await reply(c, lines.join('\n'));
}

async function linkAccount(c: Ctx, code: string, username?: string) {
  const hash = await sha256Hex(code.trim());
  const row = await c.repo.db.from('telegram_accounts').select('user_id, link_code_expires_at').eq('link_code', hash).maybeSingle();
  if (!row.data || !row.data.link_code_expires_at || new Date(row.data.link_code_expires_at) < new Date()) {
    await reply(c, 'That link code is invalid or expired. Generate a new one from the dashboard.');
    return;
  }
  const upd = await c.repo.db.from('telegram_accounts').update({ telegram_user_id: c.tgUserId, chat_id: c.chatId, username: username ?? null, link_code: null, link_code_expires_at: null, linked_at: new Date().toISOString() }).eq('user_id', row.data.user_id);
  if (upd.error) { await reply(c, 'This Telegram account is already linked to another XEN user.'); return; }
  await c.repo.db.from('audit_logs').insert({ actor_user_id: row.data.user_id, actor: 'telegram', action: 'telegram.linked', target: String(c.tgUserId) });
  await reply(c, 'Linked. You will now receive XEN alerts here. Send /help for commands.');
}

async function handleCallback(env: ServerEnv, repo: Repo, q: NonNullable<TgUpdate['callback_query']>): Promise<'handled'> {
  const answer = (text: string) => tgCall(env.TELEGRAM_BOT_TOKEN!, 'answerCallbackQuery', { callback_query_id: q.id, text: text.slice(0, 200) });
  const chatId = q.message?.chat.id;
  const m = q.data?.match(/^(sv|rm|wp|ni|rs):([0-9a-f-]{36})$/);
  if (!m || !chatId) { await answer('Unknown action'); return 'handled'; }
  const [, action, oppId] = m as unknown as [string, string, string];
  const link = await repo.db.from('telegram_accounts').select('user_id').eq('chat_id', chatId).eq('telegram_user_id', q.from.id).maybeSingle();
  const userId = link.data?.user_id;
  if (!userId) { await answer('Link your dashboard account first (Settings → Telegram).'); return 'handled'; }
  const opp = (await repo.db.from('opportunities').select('id, project_id, deadline_at, title').eq('id', oppId).maybeSingle()).data;
  if (!opp) { await answer('Opportunity not found'); return 'handled'; }

  switch (action) {
    case 'sv':
      await repo.db.from('saved_opportunities').upsert({ user_id: userId, opportunity_id: oppId, hidden: false });
      await repo.db.from('applications').insert({ user_id: userId, opportunity_id: oppId, title: opp.title, status: 'saved' });
      await answer('Saved');
      break;
    case 'ni':
      await repo.db.from('saved_opportunities').upsert({ user_id: userId, opportunity_id: oppId, hidden: true });
      await answer('Hidden. XEN will use this to tune ranking.');
      break;
    case 'rm': {
      const dl = opp.deadline_at ? new Date(opp.deadline_at).getTime() : null;
      const at = dl && dl - 86400_000 > Date.now() ? new Date(dl - 86400_000) : new Date(Date.now() + 86400_000);
      await repo.db.from('reminders').insert({ user_id: userId, opportunity_id: oppId, remind_at: at.toISOString(), message: `Reminder: ${opp.title}` });
      await answer(`Reminder set for ${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
      break;
    }
    case 'wp':
      if (!opp.project_id) { await answer('No project profile linked to this opportunity'); break; }
      await repo.db.from('watchlists').upsert({ user_id: userId, project_id: opp.project_id }, { onConflict: 'user_id,project_id', ignoreDuplicates: true });
      await answer('Project added to your watchlist');
      break;
    case 'rs':
      await repo.db.from('audit_logs').insert({ actor_user_id: userId, actor: 'telegram', action: 'opportunity.reported_suspicious', target: oppId });
      await repo.enqueue('reverify', { opportunityId: oppId }, `reverify:${oppId}:${new Date().toISOString().slice(0, 10)}`, 90);
      await answer('Reported. XEN will re-check this opportunity.');
      break;
  }
  return 'handled';
}
