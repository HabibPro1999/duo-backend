import { vi } from 'vitest';
import { firebaseAuthMock, createMockDecodedToken } from '../mocks/firebase.js';
import { prismaMock } from '../mocks/prisma.js';
import { createMockUser, createMockSuperAdmin, UserRole } from './factories.js';
import type { User } from '@/generated/prisma/client.js';

// ============================================================================
// Types
// ============================================================================

export interface MockAuthenticatedUserOptions {
  id?: string;
  email?: string;
  name?: string;
  role?: 0 | 1;
  clientId?: string | null;
  active?: boolean;
}

export interface MockAuthResult {
  user: User;
  token: string;
  headers: Record<string, string>;
}

// ============================================================================
// Auth Helpers
// ============================================================================

/**
 * Mock an authenticated user for testing.
 * Sets up Firebase token verification and Prisma user lookup.
 *
 * @example
 * const { user, headers } = mockAuthenticatedUser({ role: 0 }); // Super admin
 * const response = await app.inject({
 *   method: 'GET',
 *   url: '/api/users/me',
 *   headers,
 * });
 */
export function mockAuthenticatedUser(
  options: MockAuthenticatedUserOptions = {}
): MockAuthResult {
  const user =
    options.role === UserRole.SUPER_ADMIN
      ? createMockSuperAdmin({
          id: options.id,
          email: options.email,
          name: options.name,
          active: options.active ?? true,
        })
      : createMockUser({
          id: options.id,
          email: options.email,
          name: options.name,
          role: options.role ?? UserRole.CLIENT_ADMIN,
          clientId: options.clientId ?? undefined,
          active: options.active ?? true,
        });

  const token = `mock-token-${user.id}`;

  // Setup Firebase mock to verify token
  const decodedToken = createMockDecodedToken({
    uid: user.id,
    email: user.email,
  });
  firebaseAuthMock.verifyIdToken.mockResolvedValue(decodedToken);

  // Setup Prisma mock to return user
  prismaMock.user.findUnique.mockResolvedValue(user);

  return {
    user,
    token,
    headers: {
      authorization: `Bearer ${token}`,
    },
  };
}

/**
 * Configure mocks to simulate an unauthenticated request.
 * The Firebase token verification will reject.
 */
export function mockUnauthenticated(): void {
  firebaseAuthMock.verifyIdToken.mockRejectedValue(
    new Error('Firebase ID token has expired')
  );
}

/**
 * Configure mocks to simulate an inactive user.
 * Token validates but user is disabled.
 */
export function mockInactiveUser(options: MockAuthenticatedUserOptions = {}): MockAuthResult {
  return mockAuthenticatedUser({
    ...options,
    active: false,
  });
}

/**
 * Configure mocks to simulate a user not found in database.
 * Token validates but no matching user in Prisma.
 */
export function mockUserNotFound(): void {
  const decodedToken = createMockDecodedToken({
    uid: 'unknown-user-id',
  });
  firebaseAuthMock.verifyIdToken.mockResolvedValue(decodedToken);
  prismaMock.user.findUnique.mockResolvedValue(null);
}

/**
 * Create auth headers from an existing user.
 * Useful when you've already set up the user mock separately.
 */
export function createAuthHeaders(user: User): Record<string, string> {
  return {
    authorization: `Bearer mock-token-${user.id}`,
  };
}

/**
 * Reset all auth-related mocks.
 */
export function resetAuthMocks(): void {
  vi.clearAllMocks();
}
