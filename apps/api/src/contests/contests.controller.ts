import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt.guard';
import { ContestsService } from './contests.service';
import { LeaderboardService } from './leaderboard.service';

class RegisterDto {
  @IsOptional() @IsString() password?: string;
}

@Controller('contests')
export class ContestsController {
  constructor(
    private contests: ContestsService,
    private leaderboard: LeaderboardService,
  ) {}

  @Get()
  list() {
    return this.contests.list();
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.contests.get(id, req.user?.userId);
  }

  @Get(':id/leaderboard')
  leader(@Param('id', ParseIntPipe) id: number) {
    return this.leaderboard.get(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/register')
  register(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Body() dto: RegisterDto,
  ) {
    return this.contests.register(id, req.user.userId, dto.password);
  }
}
