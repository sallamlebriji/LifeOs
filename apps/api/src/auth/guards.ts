import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { type Request } from 'express';
import {
  type AuthenticatedRequest,
  type AuthenticatedUser,
  IS_PUBLIC_KEY,
  ROLES_KEY,
} from '../common/decorators';
import { ACCESS_COOKIE, CLIENT_HEADER, readCookie } from './cookies';
import { type AccessTokenPayload, SessionService } from './session.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function bearerToken(req: Request): string | undefined {
  const header = req.header('authorization');
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/**
 * CSRF defence for cookie-authenticated requests: any state-changing request
 * that relies on cookies must carry the X-LifeOS-Client header. Cross-site
 * forms can't set custom headers, and CORS blocks cross-origin fetches.
 * Bearer-token requests (mobile) are not exposed to CSRF.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method) || bearerToken(req)) return true;
    if (!req.header(CLIENT_HEADER)) {
      throw new ForbiddenException('Missing X-LifeOS-Client header');
    }
    return true;
  }
}

/** Global authentication guard. Routes opt out with @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(req) ?? readCookie(req, ACCESS_COOKIE);
    if (!token) throw new UnauthorizedException('Authentication required');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    // Server-side revocation check so logout / password reset take effect immediately.
    if (!(await this.sessions.isActive(payload.sid, payload.sub))) {
      throw new UnauthorizedException('Session has ended');
    }
    req.user = { userId: payload.sub, sessionId: payload.sid, role: payload.role };
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AuthenticatedUser['role'][] | undefined>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!roles?.length) return true;
    const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
