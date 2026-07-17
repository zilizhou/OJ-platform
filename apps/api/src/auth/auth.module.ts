import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { OauthZxyService } from './oauth-zxy.service';
import { OauthZxyController } from './oauth-zxy.controller';
import { SsoZxyController } from './sso-zxy.controller';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController, OauthZxyController, SsoZxyController],
  providers: [AuthService, JwtStrategy, OauthZxyService],
  exports: [AuthService, OauthZxyService],
})
export class AuthModule {}
