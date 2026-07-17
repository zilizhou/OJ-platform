import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post as HttpPost, Put, Query,
  Req, UseGuards,
} from '@nestjs/common';
import { PostKind } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt.guard';
import { PostsService } from './posts.service';

class CreatePostDto {
  @IsOptional() @IsEnum(['DISCUSSION', 'EDITORIAL']) kind?: PostKind;
  @IsString() @MaxLength(200) title: string;
  @IsString() @MaxLength(64 * 1024) body: string;
  @IsOptional() @IsInt() problemId?: number;
  @IsOptional() @IsInt() contestId?: number;
}

class UpdatePostDto {
  @IsOptional() @IsEnum(['DISCUSSION', 'EDITORIAL']) kind?: PostKind;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() body?: string;
}

class CommentDto {
  @IsString() @MaxLength(8 * 1024) body: string;
}

@Controller()
export class PostsController {
  constructor(private posts: PostsService) {}

  @Get('posts')
  list(
    @Query('problemId') problemId?: string,
    @Query('contestId') contestId?: string,
    @Query('kind') kind?: PostKind,
    @Query('q') q?: string,
    @Query('sortBy') sortBy?: 'time' | 'comments',
  ) {
    return this.posts.list({
      problemId: problemId ? Number(problemId) : undefined,
      contestId: contestId ? Number(contestId) : undefined,
      kind,
      q,
      sortBy,
    });
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('posts/:id')
  get(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.posts.get(id, req.user?.userId);
  }

  @UseGuards(JwtAuthGuard)
  @HttpPost('posts')
  create(@Req() req: any, @Body() dto: CreatePostDto) {
    return this.posts.create(req.user.userId, dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put('posts/:id')
  update(@Param('id', ParseIntPipe) id: number, @Req() req: any, @Body() dto: UpdatePostDto) {
    return this.posts.update(id, req.user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('posts/:id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.posts.delete(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('posts/:id/pin')
  pin(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Body() body: { pinned: boolean },
  ) {
    return this.posts.pin(id, req.user, body.pinned);
  }

  @UseGuards(JwtAuthGuard)
  @HttpPost('posts/:id/comments')
  comment(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Body() dto: CommentDto,
  ) {
    return this.posts.addComment(id, req.user.userId, dto.body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('comments/:id')
  removeComment(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.posts.deleteComment(id, req.user);
  }
}
