// ============================================================================
// Reports Module - Routes (Protected)
// ============================================================================

import type { AppInstance } from '@shared/types/fastify.js';
import { requireAuth } from '@shared/middleware/auth.middleware.js';
import {
  ReportQuerySchema,
  ExportQuerySchema,
  FinancialReportResponseSchema,
  type ReportQuery,
  type ExportQuery,
} from './reports.schema.js';
import { getFinancialReport, exportRegistrations } from './reports.service.js';

// ============================================================================
// Route Registration
// ============================================================================

export async function reportsRoutes(app: AppInstance): Promise<void> {
  // ----------------------------------------------------------------
  // GET /:eventId/reports/financial - Get financial report
  // ----------------------------------------------------------------
  app.get<{
    Params: { eventId: string };
    Querystring: ReportQuery;
  }>(
    '/:eventId/reports/financial',
    {
      schema: {
        querystring: ReportQuerySchema,
        response: {
          200: FinancialReportResponseSchema,
        },
      },
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const report = await getFinancialReport(eventId, request.query);
      return reply.send(report);
    }
  );

  // ----------------------------------------------------------------
  // GET /:eventId/reports/export - Export registrations
  // ----------------------------------------------------------------
  app.get<{
    Params: { eventId: string };
    Querystring: ExportQuery;
  }>(
    '/:eventId/reports/export',
    {
      schema: {
        querystring: ExportQuerySchema,
      },
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const result = await exportRegistrations(eventId, request.query);

      return reply
        .header('Content-Type', result.contentType)
        .header('Content-Disposition', `attachment; filename="${result.filename}"`)
        .send(result.data);
    }
  );
}
