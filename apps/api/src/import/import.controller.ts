import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ImportFormat, ImportService } from './import.service';
import { UpfProblem } from './upf';

@Controller('admin/import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SETTER', 'ADMIN')
export class ImportController {
  constructor(private svc: ImportService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 * 1024 } }))
  preview(
    @UploadedFile() file: { originalname: string; buffer: Buffer },
    @Query('format') format: ImportFormat = 'auto',
  ) {
    return this.svc.preview(file.originalname, file.buffer, format);
  }

  /** 同步 confirm — 小批量,直接发 problems[] */
  @Post('confirm')
  confirm(
    @Body() body: { problems?: UpfProblem[]; previewId?: string; onConflict?: 'skip' | 'overwrite' },
  ) {
    return this.svc.confirm({
      problems: body.problems,
      previewId: body.previewId,
      onConflict: body.onConflict ?? 'skip',
    });
  }

  /** 异步 confirm,推荐用 previewId 而不是 problems[](避免 200MB body) */
  @Post('confirm/async')
  confirmAsync(
    @Body() body: { problems?: UpfProblem[]; previewId?: string; onConflict?: 'skip' | 'overwrite' },
  ) {
    return this.svc.enqueueConfirm({
      problems: body.problems,
      previewId: body.previewId,
      onConflict: body.onConflict ?? 'skip',
    });
  }

  @Get('tasks/:id')
  async task(@Param('id') id: string) {
    const t = await this.svc.getTask(id);
    if (!t) throw new NotFoundException('任务不存在或已过期');
    return t;
  }
}
