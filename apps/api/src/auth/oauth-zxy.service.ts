import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const STATE_TTL = 300;

function env(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function publicOrigin(): string {
  return env('OJ_PUBLIC_ORIGIN', 'https://oj.z-xin.net').replace(/\/$/, '');
}

/**
 * 知新芸角色 → OJ 角色
 * - superadmin / school_admin / college_admin → ADMIN（平台/校级管理）
 * - teacher → SETTER（题库管理、导入、比赛）
 * - student / guest / 其他 → USER（学生端，不可见管理功能）
 */
function mapZxyRole(roles: string[]): 'ADMIN' | 'SETTER' | 'USER' {
  const norm = roles.map((r) => r.toLowerCase().trim());
  const has = (...names: string[]) => norm.some((r) => names.includes(r));

  if (has('superadmin', 'school_admin', 'college_admin', 'admin', '管理员')) return 'ADMIN';
  // 含 teacher 即教师（可同时带 guest 等附属角色）
  if (has('teacher', '教师') || norm.some((r) => r.includes('teacher'))) return 'SETTER';
  return 'USER';
}

@Injectable()
export class OauthZxyService {
  private readonly log = new Logger('OAuthZxy');

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private jwt: JwtService,
  ) {}

  /** 生成 authorize URL,把 returnUrl 存 Redis,防 CSRF */
  async startUrl(returnUrl?: string): Promise<string> {
    const state = randomUUID();
    await this.redis.client.set(`oauth:state:${state}`, returnUrl || '/', 'EX', STATE_TTL);
    const u = new URLSearchParams({
      client_id: env('ZXY_CLIENT_ID', 'pending'),
      redirect_uri: env('ZXY_REDIRECT_URI', `${publicOrigin()}/api/auth/oauth/zxy/callback`),
      response_type: 'code',
      state,
      scope: 'profile',
    });
    return `${env('ZXY_AUTHORIZE_URL', 'https://auth.z-xin.net/oauth2/authorize')}?${u}`;
  }

  /** 回调:state 校验 → 换 token → 拉 userinfo → upsert User → 签 OJ JWT */
  async handleCallback(code: string, state: string): Promise<{
    token: string; returnUrl: string;
    user: { id: number; username: string; role: string };
  }> {
    const returnUrl = await this.redis.client.get(`oauth:state:${state}`);
    if (!returnUrl) throw new UnauthorizedException('state 无效或已过期,请重新登录');
    await this.redis.client.del(`oauth:state:${state}`);

    // 1) 换 access_token
    const tokenRes = await fetch(env('ZXY_TOKEN_URL', 'https://auth.z-xin.net/api/oauth2/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: env('ZXY_REDIRECT_URI', `${publicOrigin()}/api/auth/oauth/zxy/callback`),
        client_id: env('ZXY_CLIENT_ID', ''),
        client_secret: env('ZXY_CLIENT_SECRET', ''),
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => '');
      this.log.error(`token 接口 ${tokenRes.status}: ${body.slice(0, 300)}`);
      throw new UnauthorizedException(`token 换取失败 (${tokenRes.status})`);
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) throw new UnauthorizedException('token 响应无 access_token');

    // 2) 拉 userinfo
    const userRes = await fetch(env('ZXY_USERINFO_URL', 'https://auth.z-xin.net/api/oauth2/userinfo'), {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) {
      throw new UnauthorizedException(`拉用户信息失败 (${userRes.status})`);
    }
    const info = (await userRes.json()) as {
      id: string | number; username?: string; name?: string;
      email?: string; school?: string; roles?: string[];
    };

    const user = await this.upsertExtUser(info);
    return this.issueSession(user, returnUrl);
  }

  /** 服务大厅 SSO:跳知新芸 /api/sso/auth */
  startSsoUrl(returnUrl?: string): string {
    const callback = new URL(`${publicOrigin()}/api/auth/sso/zxy/callback`);
    if (returnUrl) callback.searchParams.set('return', returnUrl);
    const ssoAuth = env('ZXY_SSO_AUTH_URL', 'https://auth.z-xin.net/api/sso/auth');
    return `${ssoAuth}?redirect=${encodeURIComponent(callback.toString())}`;
  }

  /** SSO ticket → 本地 JWT */
  async handleSsoTicket(ticket: string, returnUrl?: string): Promise<{
    token: string; returnUrl: string;
    user: { id: number; username: string; role: string };
  }> {
    const checkUrl = env('ZXY_SSO_CHECK_TICKET_URL', 'https://auth.z-xin.net/api/sso/checkTicket');
    const res = await fetch(`${checkUrl}?${new URLSearchParams({ ticket })}`);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.log.error(`checkTicket ${res.status}: ${body.slice(0, 300)}`);
      throw new UnauthorizedException(`SSO ticket 校验失败 (${res.status})`);
    }
    const body = (await res.json()) as {
      code?: number;
      message?: string;
      data?: {
        id: string | number;
        username?: string;
        nickname?: string;
        email?: string;
        school?: string;
        userRole?: string[];
      };
    };
    if (body.code !== 200 || !body.data) {
      throw new UnauthorizedException(body.message || 'SSO ticket 无效或已过期');
    }
    const d = body.data;
    const roles = (d.userRole ?? []).map((r) => r.toLowerCase());
    const user = await this.upsertExtUser({
      id: d.id,
      username: d.username,
      name: d.nickname || d.username,
      email: d.email,
      school: d.school,
      roles,
    });
    return this.issueSession(user, returnUrl || '/');
  }

  private issueSession(
    user: { id: number; username: string; role: string },
    returnUrl: string,
  ) {
    const token = this.jwt.sign({ sub: user.id, username: user.username, role: user.role });
    return {
      token,
      returnUrl: returnUrl || '/',
      user: { id: user.id, username: user.username, role: user.role },
    };
  }

  /** 知新芸常返回「暂无」等占位邮箱，不能当真实 email（库内 email 唯一） */
  private normalizeExtEmail(raw?: string | null): string | undefined {
    if (!raw) return undefined;
    const e = raw.trim();
    if (!e) return undefined;
    const invalid = new Set(['暂无', '无', 'null', 'undefined', 'none', 'n/a', '-']);
    if (invalid.has(e.toLowerCase()) || invalid.has(e)) return undefined;
    if (!e.includes('@')) return undefined;
    return e;
  }

  private async resolveUniqueEmail(preferred: string | undefined, extId: string, selfId?: number) {
    const fallback = `zxy_${extId}@zxy.local`;
    const candidate = preferred || fallback;
    const clash = await this.prisma.user.findFirst({
      where: {
        email: candidate,
        ...(selfId ? { NOT: { id: selfId } } : {}),
      },
      select: { id: true },
    });
    if (!clash) return candidate;
    return `zxy_${extId}_${Date.now()}@zxy.local`;
  }

  /** 给集成 API users/sync 也复用的 upsert 入口 */
  async upsertExtUser(info: {
    id: string | number;
    username?: string;
    name?: string;
    email?: string;
    school?: string;
    roles?: string[];
  }) {
    const extId = String(info.id);
    const roles = (info.roles ?? []).map((r) => r.toLowerCase());
    const role = mapZxyRole(roles);
    const normalizedEmail = this.normalizeExtEmail(info.email);

    const existing = await this.prisma.user.findFirst({
      where: { extProvider: 'zxy', extId },
    });

    if (existing) {
      const data: {
        extName?: string | null;
        extSchool?: string | null;
        extRoles: string[];
        role: 'ADMIN' | 'SETTER' | 'USER';
        email?: string;
      } = {
        extName: info.name ?? existing.extName,
        extSchool: info.school ?? existing.extSchool,
        extRoles: roles,
        role,
      };
      // 仅在拿到「有效且不冲突」的邮箱时才更新，避免把多人「暂无」写进唯一索引
      if (normalizedEmail) {
        data.email = await this.resolveUniqueEmail(normalizedEmail, extId, existing.id);
      } else if (this.normalizeExtEmail(existing.email) === undefined) {
        // 历史脏数据（如 email=暂无）顺手改成唯一占位，减少后续再撞车
        data.email = await this.resolveUniqueEmail(undefined, extId, existing.id);
      }
      return this.prisma.user.update({ where: { id: existing.id }, data });
    }

    // 生成不冲突的本地 username
    const base = `zxy_${(info.username || extId).replace(/[^a-zA-Z0-9_]/g, '_')}`;
    let username = base;
    let suffix = 0;
    while (await this.prisma.user.findUnique({ where: { username } })) {
      suffix++;
      username = `${base}_${suffix}`;
    }
    const email = await this.resolveUniqueEmail(normalizedEmail, extId);
    // 占位密码,OAuth 账号不会走 password 登录
    const passwordHash = await bcrypt.hash(randomUUID(), 4);
    return this.prisma.user.create({
      data: {
        username, email, passwordHash, role,
        extProvider: 'zxy', extId,
        extName: info.name, extSchool: info.school,
        extRoles: roles,
      },
    });
  }
}
