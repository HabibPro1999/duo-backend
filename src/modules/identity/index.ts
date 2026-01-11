// Services
export { createUser, getUserById, updateUser, listUsers, deleteUser } from './users.service.js';

// Types & Permissions
export { UserRole, type UserRoleType } from './permissions.js';

export {
  CreateUserSchema,
  UpdateUserSchema,
  ListUsersQuerySchema,
  UserIdParamSchema,
  UserResponseSchema,
  UsersListResponseSchema,
  type CreateUserInput,
  type UpdateUserInput,
  type ListUsersQuery,
  type UserResponse,
  type UsersListResponse,
} from './users.schema.js';

// Routes
export { usersRoutes } from './users.routes.js';
