// ============================================================================
// Reports Module - Service
// ============================================================================

import { prisma } from '@/database/client.js';
import { Prisma } from '@prisma/client';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import type {
  ReportQuery,
  FinancialReportResponse,
  FinancialSummary,
  PaymentStatusBreakdownItem,
  AccessBreakdownItem,
  DailyTrendItem,
  ExportQuery,
} from './reports.schema.js';

// ============================================================================
// Financial Report
// ============================================================================

interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}

function buildDateFilter(query: ReportQuery): DateRange {
  return {
    startDate: query.startDate ? new Date(query.startDate) : null,
    endDate: query.endDate ? new Date(query.endDate) : null,
  };
}

export async function getFinancialReport(
  eventId: string,
  query: ReportQuery
): Promise<FinancialReportResponse> {
  // Verify event exists
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });

  if (!event) {
    throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  const dateRange = buildDateFilter(query);

  // Build where clause for date filtering
  const dateWhere = {
    ...(dateRange.startDate && { submittedAt: { gte: dateRange.startDate } }),
    ...(dateRange.endDate && {
      submittedAt: { ...(dateRange.startDate ? { gte: dateRange.startDate } : {}), lte: dateRange.endDate },
    }),
  };

  const baseWhere = {
    eventId,
    ...dateWhere,
  };

  // Run all aggregation queries in parallel
  const [summary, byPaymentStatus, byAccessType, dailyTrend] = await Promise.all([
    getFinancialSummary(eventId, baseWhere),
    getPaymentStatusBreakdown(eventId, baseWhere),
    getAccessBreakdown(eventId, dateRange),
    getDailyTrend(eventId, dateRange),
  ]);

  return {
    eventId,
    generatedAt: new Date().toISOString(),
    dateRange: {
      startDate: dateRange.startDate?.toISOString() ?? null,
      endDate: dateRange.endDate?.toISOString() ?? null,
    },
    summary,
    byPaymentStatus,
    byAccessType,
    dailyTrend,
  };
}

// ============================================================================
// Summary Aggregation
// ============================================================================

async function getFinancialSummary(
  _eventId: string,
  where: Record<string, unknown>
): Promise<FinancialSummary> {
  // Get aggregated financial data
  const aggregation = await prisma.registration.aggregate({
    where,
    _sum: {
      totalAmount: true,
      paidAmount: true,
      baseAmount: true,
      accessAmount: true,
      discountAmount: true,
      sponsorshipAmount: true,
    },
    _avg: {
      totalAmount: true,
    },
    _count: true,
  });

  // Get pending amount (not yet paid)
  const pendingAgg = await prisma.registration.aggregate({
    where: {
      ...where,
      paymentStatus: 'PENDING',
    },
    _sum: {
      totalAmount: true,
      paidAmount: true,
    },
  });

  // Get refunded amount
  const refundedAgg = await prisma.registration.aggregate({
    where: {
      ...where,
      paymentStatus: 'REFUNDED',
    },
    _sum: {
      totalAmount: true,
    },
  });

  const pendingAmount =
    (pendingAgg._sum.totalAmount ?? 0) - (pendingAgg._sum.paidAmount ?? 0);

  return {
    totalRevenue: aggregation._sum.paidAmount ?? 0,
    totalPending: pendingAmount,
    totalRefunded: refundedAgg._sum.totalAmount ?? 0,
    averageRegistrationValue: Math.round(aggregation._avg.totalAmount ?? 0),
    baseRevenue: aggregation._sum.baseAmount ?? 0,
    accessRevenue: aggregation._sum.accessAmount ?? 0,
    discountsGiven: aggregation._sum.discountAmount ?? 0,
    sponsorshipsApplied: aggregation._sum.sponsorshipAmount ?? 0,
    registrationCount: aggregation._count,
  };
}

// ============================================================================
// Payment Status Breakdown
// ============================================================================

async function getPaymentStatusBreakdown(
  _eventId: string,
  where: Record<string, unknown>
): Promise<PaymentStatusBreakdownItem[]> {
  const groups = await prisma.registration.groupBy({
    by: ['paymentStatus'],
    where,
    _count: true,
    _sum: {
      totalAmount: true,
    },
  });

  return groups.map((g) => ({
    paymentStatus: g.paymentStatus,
    count: g._count,
    totalAmount: g._sum.totalAmount ?? 0,
  }));
}

// ============================================================================
// Access Type Breakdown
// ============================================================================

async function getAccessBreakdown(
  eventId: string,
  dateRange: DateRange
): Promise<AccessBreakdownItem[]> {
  // Build the query with optional date conditions
  const startDateCondition = dateRange.startDate
    ? Prisma.sql`AND r.submitted_at >= ${dateRange.startDate}`
    : Prisma.empty;
  const endDateCondition = dateRange.endDate
    ? Prisma.sql`AND r.submitted_at <= ${dateRange.endDate}`
    : Prisma.empty;

  // Query access breakdown from priceBreakdown JSON using raw SQL
  // This unnests the accessItems array from priceBreakdown JSON
  const accessData = await prisma.$queryRaw<
    { access_id: string; count: bigint; total_amount: bigint }[]
  >(Prisma.sql`
    SELECT
      (item->>'accessId')::TEXT AS access_id,
      COUNT(*) AS count,
      COALESCE(SUM((item->>'subtotal')::INTEGER), 0) AS total_amount
    FROM registrations r,
    LATERAL jsonb_array_elements(r.price_breakdown->'accessItems') AS item
    WHERE r.event_id = ${eventId}
      AND jsonb_array_length(COALESCE(r.price_breakdown->'accessItems', '[]'::jsonb)) > 0
      ${startDateCondition}
      ${endDateCondition}
    GROUP BY (item->>'accessId')::TEXT
  `);

  // Get access names
  const accessIds = accessData.map((a) => a.access_id);
  if (accessIds.length === 0) return [];

  const accessItems = await prisma.eventAccess.findMany({
    where: { id: { in: accessIds } },
    select: {
      id: true,
      name: true,
      type: true,
    },
  });

  const accessMap = new Map(accessItems.map((a) => [a.id, a]));

  return accessData.map((g) => {
    const access = accessMap.get(g.access_id);
    return {
      accessType: access?.name ?? access?.type ?? 'Unknown',
      count: Number(g.count),
      totalAmount: Number(g.total_amount),
    };
  });
}

// ============================================================================
// Daily Trend
// ============================================================================

async function getDailyTrend(
  eventId: string,
  dateRange: DateRange
): Promise<DailyTrendItem[]> {
  // Default to last 30 days if no range provided
  const endDate = dateRange.endDate ?? new Date();
  const startDate = dateRange.startDate ?? new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Use raw query for date grouping (Prisma doesn't support DATE() grouping natively)
  const results = await prisma.$queryRaw<
    { date: Date; count: bigint; total_amount: bigint }[]
  >`
    SELECT
      DATE(submitted_at) as date,
      COUNT(*) as count,
      COALESCE(SUM(total_amount), 0) as total_amount
    FROM registrations
    WHERE event_id = ${eventId}
      AND submitted_at >= ${startDate}
      AND submitted_at <= ${endDate}
    GROUP BY DATE(submitted_at)
    ORDER BY date ASC
  `;

  return results.map((r) => ({
    date: r.date.toISOString().split('T')[0],
    count: Number(r.count),
    totalAmount: Number(r.total_amount),
  }));
}

// ============================================================================
// CSV Export
// ============================================================================

interface RegistrationExportRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  paymentStatus: string;
  paymentMethod: string | null;
  totalAmount: number;
  paidAmount: number;
  baseAmount: number;
  accessAmount: number;
  discountAmount: number;
  sponsorshipCode: string | null;
  sponsorshipAmount: number;
  submittedAt: Date;
  paidAt: Date | null;
}

export async function exportRegistrations(
  eventId: string,
  query: ExportQuery
): Promise<{ filename: string; contentType: string; data: string }> {
  // Verify event exists
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, slug: true },
  });

  if (!event) {
    throw new AppError('Event not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  const dateRange = buildDateFilter(query);

  // Build where clause
  const where: Record<string, unknown> = { eventId };
  if (dateRange.startDate) {
    where.submittedAt = { gte: dateRange.startDate };
  }
  if (dateRange.endDate) {
    where.submittedAt = {
      ...(where.submittedAt as Record<string, Date> | undefined),
      lte: dateRange.endDate,
    };
  }

  // Fetch all registrations
  const registrations = await prisma.registration.findMany({
    where,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      paymentStatus: true,
      paymentMethod: true,
      totalAmount: true,
      paidAmount: true,
      baseAmount: true,
      accessAmount: true,
      discountAmount: true,
      sponsorshipCode: true,
      sponsorshipAmount: true,
      submittedAt: true,
      paidAt: true,
    },
    orderBy: { submittedAt: 'desc' },
  });

  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `${event.slug}-registrations-${timestamp}`;

  if (query.format === 'json') {
    return {
      filename: `${filename}.json`,
      contentType: 'application/json',
      data: JSON.stringify(registrations, null, 2),
    };
  }

  // Generate CSV
  const csv = generateCSV(registrations);

  return {
    filename: `${filename}.csv`,
    contentType: 'text/csv',
    data: csv,
  };
}

function generateCSV(registrations: RegistrationExportRow[]): string {
  const headers = [
    'ID',
    'Email',
    'First Name',
    'Last Name',
    'Phone',
    'Payment Status',
    'Payment Method',
    'Total Amount',
    'Paid Amount',
    'Base Amount',
    'Access Amount',
    'Discount Amount',
    'Sponsorship Code',
    'Sponsorship Amount',
    'Submitted At',
    'Paid At',
  ];

  const rows = registrations.map((r) => [
    r.id,
    r.email,
    r.firstName ?? '',
    r.lastName ?? '',
    r.phone ?? '',
    r.paymentStatus,
    r.paymentMethod ?? '',
    r.totalAmount.toString(),
    r.paidAmount.toString(),
    r.baseAmount.toString(),
    r.accessAmount.toString(),
    r.discountAmount.toString(),
    r.sponsorshipCode ?? '',
    r.sponsorshipAmount.toString(),
    r.submittedAt.toISOString(),
    r.paidAt?.toISOString() ?? '',
  ]);

  // Escape CSV values
  const escapeCSV = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const csvLines = [
    headers.join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ];

  return csvLines.join('\n');
}
