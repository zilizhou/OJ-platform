import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AdminContestsService, ContestInput } from './admin-contests.service';

@Controller('admin/contests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SETTER', 'ADMIN')
export class AdminContestsController {
  constructor(private svc: AdminContestsService) {}

  @Get() list() { return this.svc.list(); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.svc.get(id); }

  @Post()
  create(@Req() req: any, @Body() body: ContestInput) {
    return this.svc.create(req.user.userId, body);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<ContestInput>) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.delete(id); }

  @Post(':id/unfreeze')
  unfreeze(@Param('id', ParseIntPipe) id: number) { return this.svc.unfreeze(id); }
}
