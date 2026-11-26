/** Lab option lists. Dependency-free so browser code can import them without server code. */
export const PLATFORM_TYPES = ['prediction_market', 'spot_exchange', 'perpetual_exchange', 'dex', 'wallet', 'bridge', 'nft_marketplace', 'lending'] as const;
export const TEST_AREAS = ['registration', 'wallet_connection', 'navigation', 'transaction_submission', 'pending_transactions', 'failed_transactions', 'mobile', 'order_placement', 'order_cancellation', 'market_selection', 'portfolio_updates', 'error_messages', 'accessibility'] as const;
export const FEEDBACK_CATEGORIES = ['ui', 'ux', 'performance', 'accessibility', 'mobile', 'wallet_connection', 'transaction_status', 'navigation', 'error_handling', 'onboarding'] as const;
export const OUTREACH_CHANNELS = ['email', 'discord', 'telegram', 'x', 'form', 'other'] as const;
export const OFFER_TYPES = ['product_testing', 'bug_reporting', 'ux_feedback', 'qa', 'development', 'design', 'community_support', 'product_research'] as const;
