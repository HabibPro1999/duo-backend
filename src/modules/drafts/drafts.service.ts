import { prisma } from '@/database/client.js';
import { AppError } from '@shared/errors/app-error.js';
import { ErrorCodes } from '@shared/errors/error-codes.js';
import { randomBytes } from 'crypto';
import type { SaveDraftInput } from './drafts.schema.js';
import type { RegistrationDraft, Prisma } from '@prisma/client';

// Default draft expiration: 7 days
const DEFAULT_DRAFT_EXPIRY_DAYS = 7;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a secure session token for draft identification.
 */
function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Calculate draft expiration date.
 */
function calculateExpiryDate(days: number = DEFAULT_DRAFT_EXPIRY_DAYS): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Save a new draft or update existing one by session token.
 */
export async function saveDraft(
  input: SaveDraftInput,
  existingSessionToken?: string
): Promise<RegistrationDraft> {
  const { formId, formData, currentStep, email, accessSelections, sponsorshipCode } = input;

  // Validate form exists
  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form) {
    throw new AppError('Form not found', 404, true, ErrorCodes.NOT_FOUND);
  }

  // If session token provided, try to update existing draft
  if (existingSessionToken) {
    const existing = await prisma.registrationDraft.findUnique({
      where: { sessionToken: existingSessionToken },
    });

    if (existing) {
      // Verify draft is for the same form
      if (existing.formId !== formId) {
        throw new AppError(
          'Session token belongs to a different form',
          400,
          true,
          ErrorCodes.DRAFT_INVALID_SESSION
        );
      }

      // Check if draft has expired
      if (existing.expiresAt < new Date()) {
        // Delete expired draft and create new one
        await prisma.registrationDraft.delete({ where: { id: existing.id } });
      } else {
        // Update existing draft
        return prisma.registrationDraft.update({
          where: { id: existing.id },
          data: {
            formData: formData as Prisma.InputJsonValue,
            currentStep,
            email: email ?? existing.email,
            accessSelections: (accessSelections as Prisma.InputJsonValue) ?? existing.accessSelections,
            sponsorshipCode: sponsorshipCode ?? existing.sponsorshipCode,
            expiresAt: calculateExpiryDate(), // Extend expiry on update
          },
        });
      }
    }
  }

  // Create new draft
  const sessionToken = generateSessionToken();

  return prisma.registrationDraft.create({
    data: {
      formId,
      sessionToken,
      formData: formData as Prisma.InputJsonValue,
      currentStep,
      email: email ?? null,
      accessSelections: (accessSelections as Prisma.InputJsonValue) ?? null,
      sponsorshipCode: sponsorshipCode ?? null,
      expiresAt: calculateExpiryDate(),
    },
  });
}

/**
 * Get draft by session token.
 */
export async function getDraftBySessionToken(
  sessionToken: string
): Promise<RegistrationDraft | null> {
  const draft = await prisma.registrationDraft.findUnique({
    where: { sessionToken },
  });

  // Return null and delete if expired
  if (draft && draft.expiresAt < new Date()) {
    await prisma.registrationDraft.delete({ where: { id: draft.id } });
    return null;
  }

  return draft;
}

/**
 * Get draft by email and formId (for resuming registration).
 */
export async function getDraftByEmail(
  email: string,
  formId: string
): Promise<RegistrationDraft | null> {
  const draft = await prisma.registrationDraft.findFirst({
    where: {
      email,
      formId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return draft;
}

/**
 * Delete draft by session token.
 */
export async function deleteDraft(sessionToken: string): Promise<void> {
  const draft = await prisma.registrationDraft.findUnique({
    where: { sessionToken },
  });

  if (!draft) {
    throw new AppError('Draft not found', 404, true, ErrorCodes.DRAFT_NOT_FOUND);
  }

  await prisma.registrationDraft.delete({ where: { id: draft.id } });
}

/**
 * Delete draft by ID (called after successful registration).
 */
export async function deleteDraftById(id: string): Promise<void> {
  await prisma.registrationDraft.delete({ where: { id } }).catch(() => {
    // Ignore if already deleted
  });
}

/**
 * Clean up expired drafts (to be called by scheduled job).
 */
export async function cleanupExpiredDrafts(): Promise<number> {
  const result = await prisma.registrationDraft.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  return result.count;
}

/**
 * Check if a draft exists for a given session token.
 */
export async function draftExists(sessionToken: string): Promise<boolean> {
  const draft = await prisma.registrationDraft.findUnique({
    where: { sessionToken },
    select: { id: true, expiresAt: true },
  });
  return draft !== null && draft.expiresAt > new Date();
}
