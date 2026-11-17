import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthResponse } from '@lifeos/shared';
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
  loginSchema,
  type LoginInput,
  refreshSchema,
  type RefreshInput,
  registerSchema,
  type RegisterInput,
  resetPasswordSchema,
  type ResetPasswordInput,
  verifyEmailSchema,
  type VerifyEmailInput,
} from '@lifeos/validation';
import { type Request, type Response } from 'express';
import {
  type AuthenticatedUser,
  clientIp,
  CurrentUser,
  Public,
} from '../common/decorators';
import { ApiZodBody } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AppConfig } from '../config/app-config.service';
import { AuthService } from './auth.service';
import {
  clearAuthCookies,
  isMobileClient,
  readCookie,
  REFRESH_COOKIE,
  setAuthCookies,
} from './cookies';
import { type IssuedTokens } from './session.service';

/** Strict limits on credential endpoints: 10 attempts / 15 min / IP. */
const CREDENTIAL_LIMIT = { default: { limit: 10, ttl: 15 * 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  private client(req: Request) {
    return { userAgent: req.header('user-agent'), ipAddress: clientIp(req) };
  }

  private respond(
    req: Request,
    res: Response,
    result: { user: AuthResponse['user']; tokens: IssuedTokens },
  ): AuthResponse {
    setAuthCookies(res, {
      secure: this.config.get('COOKIE_SECURE'),
      accessToken: result.tokens.accessToken,
      accessExpiresAt: result.tokens.accessExpiresAt,
      refreshToken: result.tokens.refreshToken,
      refreshExpiresAt: result.tokens.refreshExpiresAt,
    });
    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      accessTokenExpiresAt: result.tokens.accessExpiresAt.toISOString(),
      // Browsers keep the refresh token in an httpOnly cookie only.
      ...(isMobileClient(req) ? { refreshToken: result.tokens.refreshToken } : {}),
    };
  }

  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post('register')
  @ApiOperation({ summary: 'Create an account and start a session' })
  @ApiZodBody(registerSchema)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(req, res, await this.auth.register(body, this.client(req)));
  }

  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiZodBody(loginSchema)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(req, res, await this.auth.login(body, this.client(req)));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  @ApiZodBody(refreshSchema, 'Mobile clients send refreshToken; web uses the httpOnly cookie.')
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const token = body.refreshToken ?? readCookie(req, REFRESH_COOKIE);
    if (!token) throw new UnauthorizedException('No session');
    try {
      return this.respond(req, res, await this.auth.refresh(token, this.client(req)));
    } catch (err) {
      clearAuthCookies(res, this.config.get('COOKIE_SECURE'));
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End the current session' })
  async logout(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = body.refreshToken ?? readCookie(req, REFRESH_COOKIE);
    await this.auth.logout(undefined, token, clientIp(req));
    clearAuthCookies(res, this.config.get('COOKIE_SECURE'));
  }

  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Confirm an email address with the emailed token' })
  @ApiZodBody(verifyEmailSchema)
  async verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput) {
    await this.auth.verifyEmail(body.token);
  }

  @Throttle({ default: { limit: 3, ttl: 15 * 60_000 } })
  @Post('resend-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Send a fresh verification email to the signed-in user' })
  async resendVerification(@CurrentUser() user: AuthenticatedUser) {
    await this.auth.resendVerification(user.userId);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Email a password-reset link (same response for unknown emails)' })
  @ApiZodBody(forgotPasswordSchema)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() req: Request,
  ) {
    await this.auth.forgotPassword(body.email, clientIp(req));
    return { message: 'If an account exists for this email, a reset link is on its way.' };
  }

  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a new password with a reset token (signs out all sessions)' })
  @ApiZodBody(resetPasswordSchema)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.resetPassword(body, clientIp(req));
    clearAuthCookies(res, this.config.get('COOKIE_SECURE'));
  }
}
