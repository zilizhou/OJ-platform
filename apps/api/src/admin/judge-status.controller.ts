import { Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { JudgeStatusService } from './judge-status.service';

@Controller('admin/judge')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class JudgeStatusController {
  constructor(private svc: JudgeStatusService) {}

  @Get('status')
  status() {
    return this.svc.status();
  }

  @Post('rejudge/:submissionId')
  rejudge(@Param('submissionId', ParseIntPipe) id: number) {
    return this.svc.rejudge(id);
  }
}
