import { Body, Controller, Delete, Get, HttpCode, Module, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type IntegrationStatusDto } from '@lifeos/shared';
import { type Request, type Response } from 'express';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import { AppConfig } from '../config/app-config.service';
import { ApiZodBody } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { type DeviceImport, DeviceCalendarService, deviceImportSchema } from './device-calendar.service';
import { GoogleCalendarService, OAUTH_COOKIE } from './google-calendar.service';

const COOKIE_PATH = '/api/v1/integrations/google';


@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly google: GoogleCalendarService,
    private readonly device: DeviceCalendarService,
    private readonly config: AppConfig,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Calendar integrations and whether this server can offer them' })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<IntegrationStatusDto[]> {
    return [await this.google.status(user.userId), await this.device.status(user.userId)];
  }

  @Get('google/connect')
  @ApiOperation({ summary: 'Start Google OAuth (PKCE). Returns the URL to open; 503 when not configured' })
  connect(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    const { url, cookie } = this.google.connect(user.userId);
    res.cookie(OAUTH_COOKIE, cookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE'),
      path: COOKIE_PATH,
      maxAge: 10 * 60_000,
    });
    return { url };
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'OAuth redirect target; redirects back to Settings' })
  async callback(
    @CurrentUser() user: AuthenticatedUser,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const back = new URL('/settings', this.config.get('WEB_ORIGIN'));
    res.clearCookie(OAUTH_COOKIE, { path: COOKIE_PATH });
    if (error || !code || !state) {
      back.searchParams.set('google', 'cancelled');
      return res.redirect(back.toString());
    }
    try {
      await this.google.callback(user.userId, code, state, (req.cookies as Record<string, string> | undefined)?.[OAUTH_COOKIE]);
      await this.google.sync(user.userId);
      back.searchParams.set('google', 'connected');
    } catch {
      back.searchParams.set('google', 'failed');
    }
    return res.redirect(back.toString());
  }

  @Post('google/sync')
  @ApiOperation({ summary: 'Import from and export to Google Calendar now' })
  sync(@CurrentUser() user: AuthenticatedUser) {
    return this.google.sync(user.userId);
  }

  @Post('apple/import')
  @ApiOperation({ summary: 'Mirror a window of on-device calendar events (sent by the iOS/Android app)' })
  @ApiZodBody(deviceImportSchema)
  importDevice(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(deviceImportSchema)) body: DeviceImport) {
    return this.device.import(user.userId, body);
  }

  @Delete('apple')
  @HttpCode(204)
  async disconnectDevice(@CurrentUser() user: AuthenticatedUser) {
    await this.device.disconnect(user.userId);
  }

  @Delete('google')
  @HttpCode(204)
  @ApiOperation({ summary: 'Disconnect: revoke access, delete credentials and imported events' })
  async disconnect(@CurrentUser() user: AuthenticatedUser) {
    await this.google.disconnect(user.userId);
  }
}

@Module({ controllers: [IntegrationsController], providers: [GoogleCalendarService, DeviceCalendarService], exports: [GoogleCalendarService] })
export class IntegrationsModule {}
