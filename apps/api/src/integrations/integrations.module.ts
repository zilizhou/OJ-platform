import { Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { ContestsModule } from '../contests/contests.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ContestsModule, AuthModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
})
export class IntegrationsModule {}
