export const ErrorCodes = {
  // Auth (1xxx)
  UNAUTHORIZED: 'AUTH_1001',
  INVALID_TOKEN: 'AUTH_1002',
  TOKEN_EXPIRED: 'AUTH_1003',
  FORBIDDEN: 'AUTH_1004',

  // Validation (2xxx)
  VALIDATION_ERROR: 'VAL_2001',

  // Resource (3xxx)
  NOT_FOUND: 'RES_3001',
  CONFLICT: 'RES_3002',
  BAD_REQUEST: 'RES_3003',

  // Rate Limit (4xxx)
  RATE_LIMITED: 'RATE_4001',

  // Server (5xxx)
  INTERNAL_ERROR: 'SRV_5001',
  DATABASE_ERROR: 'SRV_5002',

  // Pricing (6xxx)
  EXTRA_CAPACITY_EXCEEDED: 'PRC_6001',
  PRICE_MISMATCH: 'PRC_6002',
  EXTRA_NOT_AVAILABLE: 'PRC_6003',
  INVALID_SPONSORSHIP_CODE: 'PRC_6004',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
