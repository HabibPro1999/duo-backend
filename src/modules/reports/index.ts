// ============================================================================
// Reports Module - Barrel Export
// ============================================================================

// Services
export { getFinancialReport, exportRegistrations } from './reports.service.js';

// Schemas & Types
export {
  ReportQuerySchema,
  ExportQuerySchema,
  FinancialSummarySchema,
  PaymentStatusBreakdownItemSchema,
  AccessBreakdownItemSchema,
  DailyTrendItemSchema,
  FinancialReportResponseSchema,
  ExportResponseSchema,
  type ReportQuery,
  type ExportQuery,
  type FinancialSummary,
  type PaymentStatusBreakdownItem,
  type AccessBreakdownItem,
  type DailyTrendItem,
  type FinancialReportResponse,
  type ExportResponse,
} from './reports.schema.js';

// Routes
export { reportsRoutes } from './reports.routes.js';
