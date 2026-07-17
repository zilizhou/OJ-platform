import { Module } from '@nestjs/common';
import { ContestsController } from './contests.controller';
import { ContestsService } from './contests.service';
import { LeaderboardService } from './leaderboard.service';

@Module({
  controllers: [ContestsController],
  providers: [ContestsService, LeaderboardService],
  exports: [ContestsService, LeaderboardService],
})
export class ContestsModule {}
