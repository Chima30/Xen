/** Client-safe constants for personal management (no server imports). */
export const APPLICATION_STATUSES = [
  'discovered', 'saved', 'interested', 'applied', 'accepted', 'in_progress', 'submitted',
  'under_review', 'completed', 'payment_pending', 'paid', 'rejected', 'expired', 'archived',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Kanban columns: each groups a few statuses so the board stays readable. Closed work sits apart. */
export const APPLICATION_STAGES: { key: string; label: string; statuses: ApplicationStatus[] }[] = [
  { key: 'considering', label: 'Considering', statuses: ['discovered', 'saved', 'interested'] },
  { key: 'applied', label: 'Applied', statuses: ['applied'] },
  { key: 'working', label: 'Working on it', statuses: ['accepted', 'in_progress'] },
  { key: 'review', label: 'Submitted', statuses: ['submitted', 'under_review'] },
  { key: 'payment', label: 'Awaiting payment', statuses: ['completed', 'payment_pending'] },
  { key: 'paid', label: 'Paid', statuses: ['paid'] },
];
export const CLOSED_STATUSES: ApplicationStatus[] = ['rejected', 'expired', 'archived'];

export const EARNING_STATUSES = ['expected', 'pending', 'received', 'rejected', 'unpaid'] as const;
export type EarningStatus = (typeof EARNING_STATUSES)[number];
export const EARNING_STATUS_LABEL: Record<EarningStatus, string> = {
  expected: 'Expected (not yet earned)',
  pending: 'Payment pending',
  received: 'Received',
  rejected: 'Rejected',
  unpaid: 'Unpaid',
};

export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const;

export const statusLabel = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
