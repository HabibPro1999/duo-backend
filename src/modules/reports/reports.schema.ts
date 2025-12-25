// ============================================================================
// Reports Module - Zod Schemas
// ============================================================================

import { z } from 'zod';

// ============================================================================
// Query Schemas
// ============================================================================

export const ReportQuerySchema = z
  .object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  })
  .strict();

export const ExportQuerySchema = z
  .object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    format: z.enum(['csv', 'json']).default('csv'),
  })
  .strict();

// ============================================================================
// Response Schemas
// ============================================================================

export const FinancialSummarySchema = z.object({
  totalRevenue: z.number(),
  totalPending: z.number(),
  totalRefunded: z.number(),
  averageRegistrationValue: z.number(),
  baseRevenue: z.number(),
  accessRevenue: z.number(),
  discountsGiven: z.number(),
  sponsorshipsApplied: z.number(),
  registrationCount: z.number(),
});

export const StatusBreakdownItemSchema = z.object({
  status: z.string(),
  count: z.number(),
  totalAmount: z.number(),
});

export const PaymentStatusBreakdownItemSchema = z.object({
  paymentStatus: z.string(),
  count: z.number(),
  totalAmount: z.number(),
});

export const AccessBreakdownItemSchema = z.object({
  accessType: z.string(),
  count: z.number(),
  totalAmount: z.number(),
});

export const DailyTrendItemSchema = z.object({
  date: z.string(),
  count: z.number(),
  totalAmount: z.number(),
});

export const FinancialReportResponseSchema = z.object({
  eventId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  dateRange: z.object({
    startDate: z.string().datetime().nullable(),
    endDate: z.string().datetime().nullable(),
  }),
  summary: FinancialSummarySchema,
  byStatus: z.array(StatusBreakdownItemSchema),
  byPaymentStatus: z.array(PaymentStatusBreakdownItemSchema),
  byAccessType: z.array(AccessBreakdownItemSchema),
  dailyTrend: z.array(DailyTrendItemSchema),
});

export const ExportResponseSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  data: z.string(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type ReportQuery = z.infer<typeof ReportQuerySchema>;
export type ExportQuery = z.infer<typeof ExportQuerySchema>;
export type FinancialSummary = z.infer<typeof FinancialSummarySchema>;
export type StatusBreakdownItem = z.infer<typeof StatusBreakdownItemSchema>;
export type PaymentStatusBreakdownItem = z.infer<typeof PaymentStatusBreakdownItemSchema>;
export type AccessBreakdownItem = z.infer<typeof AccessBreakdownItemSchema>;
export type DailyTrendItem = z.infer<typeof DailyTrendItemSchema>;
export type FinancialReportResponse = z.infer<typeof FinancialReportResponseSchema>;
export type ExportResponse = z.infer<typeof ExportResponseSchema>;
