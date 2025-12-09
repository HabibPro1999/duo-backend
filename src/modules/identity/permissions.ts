export const UserRole = {
  SUPER_ADMIN: 0,
  CLIENT_ADMIN: 1,
} as const;

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];

export function isSuperAdmin(role: number): boolean {
  return role === UserRole.SUPER_ADMIN;
}

export function isClientAdmin(role: number): boolean {
  return role === UserRole.CLIENT_ADMIN;
}

export function canManageUsers(role: number): boolean {
  return role === UserRole.SUPER_ADMIN;
}

export function canAccessClient(
  role: number,
  userClientId: string | null,
  targetClientId: string
): boolean {
  if (role === UserRole.SUPER_ADMIN) return true;
  return userClientId === targetClientId;
}

export function getRoleName(role: number): string {
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return 'super_admin';
    case UserRole.CLIENT_ADMIN:
      return 'client_admin';
    default:
      return 'unknown';
  }
}
