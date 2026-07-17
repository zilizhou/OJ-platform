import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PostKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// 列表用:从 markdown body 派生 ~140 字摘要 + 识别使用的语言
const LANG_ALIASES: Record<string, string> = {
  cpp: 'C++', 'c++': 'C++', cxx: 'C++',
  c: 'C', java: 'Java',
  py: 'Python', python: 'Python', python3: 'Python',
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
  go: 'Go', golang: 'Go', rust: 'Rust', rs: 'Rust',
  kotlin: 'Kotlin', kt: 'Kotlin', swift: 'Swift', scala: 'Scala',
  ruby: 'Ruby', rb: 'Ruby', php: 'PHP', csharp: 'C#', 'c#': 'C#', cs: 'C#',
};

function makeExcerpt(md: string, maxLen: number): string {
  if (!md) return '';
  let s = md;
  // 去代码块(摘要主要给思路文字看)
  s = s.replace(/```[\s\S]*?```/g, ' ');
  // 去图片
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  // 链接保留文字
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // 行内代码
  s = s.replace(/`([^`]+)`/g, '$1');
  // 标题 #
  s = s.replace(/^#{1,6}\s*/gm, '');
  // 加粗/斜体
  s = s.replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1');
  // 引用 >
  s = s.replace(/^>\s?/gm, '');
  // 列表项 - / 1.
  s = s.replace(/^\s*([-*+]|\d+\.)\s+/gm, '');
  // HTML 标签
  s = s.replace(/<\/?[a-z][^>]*>/gi, '');
  // HTML 实体 &nbsp; 等
  s = s.replace(/&[a-z#0-9]+;/gi, ' ');
  // 折叠空白
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen).trimEnd() + '…';
}

function detectLanguages(md: string): string[] {
  if (!md) return [];
  const found = new Set<string>();
  const re = /```\s*([a-zA-Z+#]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const k = m[1].toLowerCase();
    if (LANG_ALIASES[k]) found.add(LANG_ALIASES[k]);
  }
  return [...found];
}

export interface PostInput {
  kind?: PostKind;
  title: string;
  body: string;
  problemId?: number;
  contestId?: number;
}

@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}

  async list(params: {
    problemId?: number;
    contestId?: number;
    kind?: PostKind;
    q?: string;
    sortBy?: 'time' | 'comments';
  }) {
    const { problemId, contestId, kind, q, sortBy } = params;
    if (!problemId && !contestId) {
      throw new BadRequestException('需指定 problemId 或 contestId');
    }
    const where: any = { problemId, contestId, kind };
    if (q) where.title = { contains: q, mode: 'insensitive' };

    const orderBy: any[] =
      sortBy === 'comments'
        ? [{ pinned: 'desc' }, { comments: { _count: 'desc' } }, { createdAt: 'desc' }]
        : [{ pinned: 'desc' }, { createdAt: 'desc' }];

    // body 拿来派生 excerpt + languages 后丢弃,保持原"列表不回 body"语义
    const posts = await this.prisma.post.findMany({
      where,
      orderBy,
      select: {
        id: true,
        kind: true,
        title: true,
        pinned: true,
        createdAt: true,
        body: true,
        author: { select: { id: true, username: true } },
        _count: { select: { comments: true } },
      },
    });

    return posts.map((p) => ({
      id: p.id,
      kind: p.kind,
      title: p.title,
      pinned: p.pinned,
      createdAt: p.createdAt,
      author: p.author,
      _count: p._count,
      excerpt: makeExcerpt(p.body, 140),
      languages: detectLanguages(p.body),
    }));
  }

  async get(id: number, viewerId?: number) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, username: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, username: true } } },
        },
      },
    });
    if (!post) throw new NotFoundException('帖子不存在');

    // 题解剧透门禁:必须自己 AC 过对应题目才能看 body
    let spoilerGuarded = false;
    if (post.kind === 'EDITORIAL' && post.problemId) {
      if (!viewerId) {
        spoilerGuarded = true;
      } else {
        const acked = await this.prisma.submission.findFirst({
          where: { userId: viewerId, problemId: post.problemId, status: 'AC' },
          select: { id: true },
        });
        if (!acked) spoilerGuarded = true;
      }
    }
    if (spoilerGuarded) {
      return { ...post, body: '', spoilerGuarded: true, comments: [] };
    }
    return { ...post, spoilerGuarded: false };
  }

  async create(authorId: number, input: PostInput, viewer?: { userId: number; role: string }) {
    if (!input.problemId && !input.contestId) {
      throw new BadRequestException('需挂载到题目或比赛');
    }
    // 写题解门禁:必须自己 AC 过对应题目;管理员/出题人豁免
    if (input.kind === 'EDITORIAL' && input.problemId && viewer?.role !== 'ADMIN' && viewer?.role !== 'SETTER') {
      const acked = await this.prisma.submission.findFirst({
        where: { userId: authorId, problemId: input.problemId, status: 'AC' },
        select: { id: true },
      });
      if (!acked) {
        throw new ForbiddenException('只有 AC 通过本题后才能发布题解');
      }
    }
    return this.prisma.post.create({
      data: {
        authorId,
        kind: input.kind ?? 'DISCUSSION',
        title: input.title,
        body: input.body,
        problemId: input.problemId,
        contestId: input.contestId,
      },
      include: { author: { select: { id: true, username: true } } },
    });
  }

  async update(id: number, viewer: { userId: number; role: string }, patch: Partial<PostInput>) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('帖子不存在');
    if (post.authorId !== viewer.userId && viewer.role !== 'ADMIN') {
      throw new ForbiddenException('无权编辑');
    }
    return this.prisma.post.update({
      where: { id },
      data: { title: patch.title, body: patch.body, kind: patch.kind },
    });
  }

  async delete(id: number, viewer: { userId: number; role: string }) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('帖子不存在');
    if (post.authorId !== viewer.userId && viewer.role !== 'ADMIN') {
      throw new ForbiddenException('无权删除');
    }
    await this.prisma.post.delete({ where: { id } });
    return { ok: true };
  }

  async pin(id: number, viewer: { role: string }, pinned: boolean) {
    if (viewer.role !== 'ADMIN') throw new ForbiddenException('仅管理员可置顶');
    return this.prisma.post.update({ where: { id }, data: { pinned } });
  }

  async addComment(postId: number, authorId: number, body: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('帖子不存在');
    return this.prisma.comment.create({
      data: { postId, authorId, body },
      include: { author: { select: { id: true, username: true } } },
    });
  }

  async deleteComment(id: number, viewer: { userId: number; role: string }) {
    const c = await this.prisma.comment.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('评论不存在');
    if (c.authorId !== viewer.userId && viewer.role !== 'ADMIN') {
      throw new ForbiddenException('无权删除');
    }
    await this.prisma.comment.delete({ where: { id } });
    return { ok: true };
  }
}
