import { Controller, Get, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt.guard';
import { ProblemsService } from './problems.service';

@Controller('problems')
export class ProblemsController {
  constructor(private problems: ProblemsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  list(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('difficulty') difficulty?: string,
    @Query('tags') tags?: string,           // 逗号分隔
    @Query('status') status?: 'AC' | 'ATTEMPTED' | 'TODO',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.problems.list({
      q,
      difficulty: difficulty ? Number(difficulty) : undefined,
      tags: tags ? tags.split(',').filter(Boolean) : undefined,
      status,
      viewerId: req.user?.userId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('tags')
  tags() {
    return this.problems.tags();
  }

  @Get('daily')
  daily() {
    return this.problems.daily();
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/visual-solution')
  visualSolution(@Param('id', ParseIntPipe) id: number) {
    return this.problems.getVisualSolution(id);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.problems.get(id, req.user?.userId);
  }
}
