/**
 * Centralized User-facing Messages and Notifications
 */
export const MESSAGES = {
  // Empty states
  EMPTY_CUSTOMER_PRICE_HISTORY: 'No customer price history found. History is recorded when customer pricing batches are approved.',
  EMPTY_VENDOR_PRICE_HISTORY: 'No price history found.',
  EMPTY_ITEMS_FOUND: 'No items found matching the selected filters.',

  // Status & Loaders
  LOADING_DATA: 'Loading data...',
  LOADING_PRICE_HISTORY: 'Loading price history...',

  // Action Success Notifications
  BATCH_CREATED: 'Pricing batch created successfully.',
  BATCH_APPROVED: 'Batch approved successfully.',
  BATCH_REJECTED: 'Batch rejected.',
  BATCH_SUBMITTED: 'Batch submitted for approval.',

  // Error Messages
  GENERIC_ERROR: 'An unexpected error occurred. Please try again.',
  NETWORK_ERROR: 'Unable to connect to the server. Please check your network connection.',
} as const;
