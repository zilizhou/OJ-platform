import { Module } from '@nestjs/common';
import { AdminProblemsController } from './admin-problems.controller';
import { AdminProblemsService } from './admin-problems.service';
import { AdminContestsController } from './admin-contests.controller';
import { AdminContestsService } from './admin-contests.service';
import { ContestsModule } from '../contests/contests.module';
import { ImportController } from '../import/import.controller';
import { ImportService } from '../import/import.service';
import { JudgeStatusController } from './judge-status.controller';
import { JudgeStatusService } from './judge-status.service';

@Module({
  imports: [ContestsModule],
  controllers: [
    AdminProblemsController,
    AdminContestsController,
    ImportController,
    JudgeStatusController,
  ],
  providers: [
    AdminProblemsService,
    AdminContestsService,
    ImportService,
    JudgeStatusService,
  ],
})
export class AdminModule {}
