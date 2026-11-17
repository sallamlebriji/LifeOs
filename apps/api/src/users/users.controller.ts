import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Module,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  changePasswordSchema,
  type ChangePasswordInput,
  deleteAccountSchema,
  type DeleteAccountInput,
  updateProfileSchema,
  type UpdateProfileInput,
} from '@lifeos/validation';
import { type Response } from 'express';
import { AuthModule } from '../auth/auth.module';
import { clearAuthCookies } from '../auth/cookies';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import { ApiZodBody } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AppConfig } from '../config/app-config.service';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users/me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly config: AppConfig,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current user profile and preferences' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.me(user.userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update display name / avatar' })
  @ApiZodBody(updateProfileSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.users.updateProfile(user.userId, body);
  }

  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change password (signs out other sessions)' })
  @ApiZodBody(changePasswordSchema)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    await this.users.changePassword(user.userId, user.sessionId, body);
  }

  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @Get('export')
  @Header('Content-Disposition', 'attachment; filename="lifeos-export.json"')
  @ApiOperation({ summary: 'Download all of your data as JSON' })
  export(@CurrentUser() user: AuthenticatedUser) {
    return this.users.exportData(user.userId);
  }

  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete your account and all data' })
  @ApiZodBody(deleteAccountSchema)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(deleteAccountSchema)) body: DeleteAccountInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.users.deleteAccount(user.userId, body);
    clearAuthCookies(res, this.config.get('COOKIE_SECURE'));
  }
}

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
