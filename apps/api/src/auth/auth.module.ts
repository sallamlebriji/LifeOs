import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../config/app-config.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard, JwtAuthGuard, RolesGuard } from './guards';
import { SessionService } from './session.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.get('JWT_ACCESS_SECRET'),
        signOptions: { algorithm: 'HS256', issuer: 'lifeos-api', audience: 'lifeos' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'lifeos-api', audience: 'lifeos' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionService, JwtAuthGuard, CsrfGuard, RolesGuard],
  exports: [AuthService, SessionService, JwtAuthGuard, CsrfGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
