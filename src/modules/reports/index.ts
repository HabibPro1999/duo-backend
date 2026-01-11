// ============================================================================
// Reports Module - Barrel Export
// ============================================================================

// Services
export { getFinancialReport, exportRegistrations } from './reports.service.js';

// Schemas & Types
export {
  ReportQuerySchema,
  ExportQuerySchema,
  FinancialReportResponseSchema,
  type ReportQuery,
  type ExportQuery,
  type FinancialReportResponse,
} from './reports.schema.js';

// Routes
export { reportsRoutes } from './reports.routes.js';
