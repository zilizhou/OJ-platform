import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * 简易 M2M 鉴权:校验 X-OJ-API-Key 头是否匹配 env.INTEGRATION_API_KEY。
 * 知新芸服务端调 /api/integrations/* 时带这个头。生产可叠加 IP 白名单。
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.INTEGRATION_API_KEY;
    if (!expected) throw new ForbiddenException('服务端尚未配置 INTEGRATION_API_KEY,集成 API 禁用');
    const req = ctx.switchToHttp().getRequest();
    const got = req.headers['x-oj-api-key'] || req.headers['X-OJ-API-Key'];
    if (got !== expected) throw new ForbiddenException('Invalid API Key');
    return true;
  }
}
