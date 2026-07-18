import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubmissionsService } from './submissions.service';

class CreateSubmissionDto {
  @IsInt() problemId: number;
  @IsString() language: string;
  @IsString() @MaxLength(64 * 1024) code: string;
  @IsOptional() @IsInt() contestId?: number;
}

class RunDto {
  @IsInt() problemId: number;
  @IsString() language: string;
  @IsString() @IsOptional() @MaxLength(64 * 1024) code: string;
  @IsString() @IsOptional() customInput?: string;
  @IsString() @IsOptional() customExpected?: string;
}

@Controller('submissions')
export class SubmissionsController {
  constructor(private submissions: SubmissionsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: any, @Body() dto: CreateSubmissionDto) {
    return this.submissions.create(
      req.user.userId,
      dto.problemId,
      dto.language,
      dto.code,
      dto.contestId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('run')
  run(@Req() req: any, @Body() dto: RunDto) {
    return this.submissions.run(
      req.user.userId,
      dto.problemId,
      dto.language,
      dto.code || '',
      dto.customInput,
      dto.customExpected,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @Req() req: any,
    @Query('problemId') problemId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.submissions.list({
      userId: req.user.userId,
      problemId: problemId ? Number(problemId) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.submissions.get(id);
  }
}
