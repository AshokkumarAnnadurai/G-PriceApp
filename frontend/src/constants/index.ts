export const ROUTES = {
  HOME: '/',
  ITEM_MASTER: '/items',
  VENDOR_MASTER: '/vendors',
  CUSTOMER_LIST: '/customers',
  RM_MASTER: '/rm-master',
  PRICING_UPDATE: '/pricing',
  ITEM_PRICING_APPROVAL: '/item-pricing-approval',
  CUSTOMER_PRICING: '/customer-pricing',
  DC_RAISE_DISPUTE: '/disputes',
  ORDER_PRICE_AUDIT: '/order-price-audit',
  PRICE_HISTORY: '/price-history',
  PRICING_COMPARISON: '/pricing-comparison',
  FORMULAS: '/formulas',
  USER_MANAGEMENT: '/management/users',
  ROLE_MANAGEMENT: '/management/roles',
  SCREEN_MANAGEMENT: '/management/screens',
  API_MANAGEMENT: '/management/apis',
  AUDIT_LOGS: '/management/audit-logs',
} as const;

/** Single source of truth for all brand/interactive colors. */
export const BRAND = {
  RED:        '#cc0000',
  RED_HOVER:  '#b30000',
  RED_LIGHT:  '#f3f4f6',
  RED_BORDER: '#ffcccc',
  WHITE:      '#ffffff',
  GRAY_TEXT:  '#6b7280',
  BORDER:     '#e5e7eb',
} as const;

export const BATCH_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const BATCH_STATUS_COLOR: Record<string, string> = {
  draft:    '#64748b',
  pending:  '#d97706',
  approved: '#16a34a',
  rejected: '#dc2626',
};

export const PAGE_SIZE = 100;

export * from './pageHeaders';
export * from './messages';
