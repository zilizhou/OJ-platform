import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AdminProblemsService, ProblemInput } from './admin-problems.service';

@Controller('admin/problems')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SETTER', 'ADMIN')
export class AdminProblemsController {
  constructor(private svc: AdminProblemsService) {}

  @Get() list(@Req() req: any) { return this.svc.list(req.user); }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.svc.get(id, req.user);
  }

  @Post()
  create(@Req() req: any, @Body() body: ProblemInput) {
    return this.svc.create(req.user, body);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Req() req: any, @Body() body: Partial<ProblemInput>) {
    return this.svc.update(id, req.user, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.svc.delete(id, req.user);
  }
}
