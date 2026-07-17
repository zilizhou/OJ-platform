import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { CreateAssignmentDto, IntegrationsService } from './integrations.service';

@Controller('integrations')
@UseGuards(ApiKeyGuard)
export class IntegrationsController {
  constructor(private svc: IntegrationsService) {}

  // --- 题库浏览 ---

  @Get('problems')
  problems(
    @Query('q') q?: string,
    @Query('difficulty') difficulty?: string,
    @Query('tags') tags?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.svc.listProblems({
      q,
      difficulty: difficulty ? Number(difficulty) : undefined,
      tags: tags ? tags.split(',').filter(Boolean) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  // --- 账号同步 ---

  @Post('users/sync')
  syncUsers(@Body() body: {
    users: { extId: string; username?: string; name?: string; email?: string; roles?: string[] }[];
  }) {
    return this.svc.syncUsers(body.users || []);
  }

  // --- 作业 CRUD ---

  @Post('assignments')
  createAssignment(@Body() dto: CreateAssignmentDto) {
    return this.svc.createAssignment(dto);
  }

  @Patch('assignments/:id')
  updateAssignment(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateAssignmentDto>) {
    return this.svc.updateAssignment(id, dto);
  }

  // --- 进度 + 成绩 ---

  @Get('assignments/:id/progress')
  progress(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getProgress(id);
  }

  @Get('assignments/:id/leaderboard')
  leaderboard(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getLeaderboard(id);
  }
}
