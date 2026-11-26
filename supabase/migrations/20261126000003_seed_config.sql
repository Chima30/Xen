-- Configuration seed (not opportunity data). Adapters reflect honest support status.

insert into source_adapters (id, name, kind, requires_credentials, supported, notes) values
  ('tavily',      'Tavily Search',          'search',   array['TAVILY_API_KEY'], true,  'Primary web discovery. Free plan: 1,000 credits/month.'),
  ('gemini_grounding','Gemini Google Search grounding','search', array['GEMINI_API_KEY'], true, 'Not available on the free tier for Gemini 3.x; disabled by default.'),
  ('rss',         'RSS / Atom feeds',       'feed',     '{}', true,  'Official blogs, Medium (/feed/@user), Mirror, Substack.'),
  ('reddit',      'Reddit public JSON',     'social',   '{}', true,  'Public subreddit listings; rate limited, needs descriptive User-Agent.'),
  ('github',      'GitHub releases',        'api',      array['GITHUB_TOKEN'], true, 'Token optional; unauthenticated limit is 60 req/hour.'),
  ('defillama',   'DefiLlama',              'api',      '{}', true,  'Public protocols endpoint, used for new-protocol detection.'),
  ('firecrawl',   'Firecrawl extraction',   'api',      array['FIRECRAWL_API_KEY'], true, 'Optional content extraction fallback.'),
  ('telegram_channel','Telegram channels',  'social',   '{}', false, 'Bots only receive posts from channels where they are added as admin. No arbitrary channel reading.'),
  ('discord',     'Discord announcements',  'social',   array['DISCORD_BOT_TOKEN'], false, 'Requires the bot to be invited to the server with read permission on the channel. Not yet implemented.'),
  ('x',           'X (Twitter)',            'social',   array['X_BEARER_TOKEN'], false, 'Search requires a paid API tier. Optional; disabled.'),
  ('superteam',   'Superteam Earn',         'platform', '{}', false, 'No documented public API verified yet; discovered via Tavily.'),
  ('immunefi',    'Immunefi',               'platform', '{}', false, 'Discovered via Tavily; no public API verified.'),
  ('code4rena',   'Code4rena',              'platform', '{}', false, 'Discovered via Tavily.'),
  ('sherlock',    'Sherlock',               'platform', '{}', false, 'Discovered via Tavily.'),
  ('cantina',     'Cantina',                'platform', '{}', false, 'Discovered via Tavily.'),
  ('dorahacks',   'DoraHacks',              'platform', '{}', false, 'Discovered via Tavily.'),
  ('ethglobal',   'ETHGlobal',              'platform', '{}', false, 'Discovered via Tavily.'),
  ('galxe',       'Galxe',                  'platform', '{}', false, 'Discovered via Tavily.'),
  ('layer3',      'Layer3',                 'platform', '{}', false, 'Discovered via Tavily.'),
  ('web3career',  'Web3.career',            'platform', '{}', false, 'Discovered via Tavily.'),
  ('wellfound',   'Wellfound',              'platform', '{}', false, 'No public API; discovered via Tavily.'),
  ('rootdata',    'RootData',               'platform', '{}', false, 'API is paid; not integrated.'),
  ('cryptorank',  'CryptoRank',             'platform', '{}', false, 'API key required; free-tier terms not yet verified.'),
  ('producthunt', 'Product Hunt',           'api',      '{}', false, 'GraphQL API requires an OAuth app; not yet implemented.');

-- Default monitored sources
insert into sources (adapter_id, name, config, priority, scan_interval_minutes) values
  ('tavily', 'Tier 1 rotating discovery', '{"mode":"rotate","tier":"tier1","queriesPerRun":2}', 90, 120),
  ('tavily', 'Tier 3 early intelligence', '{"mode":"rotate","tier":"tier3","queriesPerRun":1}', 40, 360),
  ('reddit', 'r/CryptoCurrency new', '{"subreddit":"CryptoCurrency","filter":true}', 30, 60),
  ('reddit', 'r/ethdev new', '{"subreddit":"ethdev","filter":true}', 30, 120),
  ('defillama', 'New protocols', '{"lookbackDays":14}', 40, 360);

-- DefiLlama's protocol list is several MB: too heavy for the Workers Free CPU limit.
-- Enable once PIPELINE_RUNNER_URL (Vercel) is configured.
update sources set status = 'paused' where adapter_id = 'defillama';

insert into search_queries (query, tier) values
  ('looking for beta testers crypto', 'tier1'),
  ('paid beta testing web3', 'tier1'),
  ('earn USDC for feedback', 'tier1'),
  ('help us test our platform crypto rewards', 'tier1'),
  ('prediction market beta testers', 'tier1'),
  ('prediction market tester recruitment', 'tier1'),
  ('DEX alpha testing rewards', 'tier1'),
  ('perpetual exchange testnet incentivized', 'tier1'),
  ('paid user research web3', 'tier1'),
  ('web3 product testing paid', 'tier1'),
  ('bug reporting rewards testnet', 'tier1'),
  ('QA testers wanted crypto', 'tier1'),
  ('crypto usability testing paid', 'tier1'),
  ('web3 feedback bounty', 'tier1'),
  ('trading platform early access testers', 'tier1'),
  ('incentivized testnet launched', 'tier2'),
  ('trading competition testnet rewards', 'tier2'),
  ('web3 hackathon prizes', 'tier2'),
  ('ecosystem grants open applications', 'tier2'),
  ('upcoming prediction markets', 'tier3'),
  ('upcoming perpetual exchanges', 'tier3'),
  ('newly funded DeFi startup seed round', 'tier3'),
  ('trading platform beta launch', 'tier3');

insert into system_settings (key, value) values
  ('budgets', '{"tavily_daily_credits":30,"gemini_daily_requests":200,"firecrawl_daily_requests":10,"github_daily_requests":500}'),
  ('search_cache_hours', '24'),
  ('timezone', '"Africa/Lagos"');
