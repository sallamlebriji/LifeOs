import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import { type Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  role: 'USER' | 'ADMIN';
}

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };

export const IS_PUBLIC_KEY = 'isPublic';
/** Opts a route out of the global JWT guard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AuthenticatedUser['role'][]) => SetMetadata(ROLES_KEY, roles);

/**
 * The authenticated principal. The user id ALWAYS comes from the verified
 * token — never from client-supplied params or bodies (IDOR protection).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.user;
  },
);

export function clientIp(req: Request): string | undefined {
  return req.ip ?? req.socket.remoteAddress ?? undefined;
}
