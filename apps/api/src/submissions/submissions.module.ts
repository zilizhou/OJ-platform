import { Module } from '@nestjs/common';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { SubmissionsGateway } from './submissions.gateway';
import { ContestsModule } from '../contests/contests.module';

@Module({
  imports: [ContestsModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, SubmissionsGateway],
})
export class SubmissionsModule {}
