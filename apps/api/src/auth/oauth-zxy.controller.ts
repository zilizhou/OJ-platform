import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OauthZxyService } from './oauth-zxy.service';

@Controller('auth/oauth/zxy')
export class OauthZxyController {
  constructor(private svc: OauthZxyService) {}

  /** 入口:用户点 "知新芸登录" 时打 GET 这里,302 到知新芸 authorize 页 */
  @Get('start')
  async start(@Query('return') returnUrl: string | undefined, @Res() res: Response) {
    const url = await this.svc.startUrl(returnUrl);
    res.redirect(url);
  }

  /** 知新芸 callback 跳到这里:换 token + upsert + 签自己 JWT,然后跳回 SPA */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') err: string | undefined,
    @Res() res: Response,
  ) {
    if (err) return res.redirect(`/login?error=${encodeURIComponent(err)}`);
    try {
      const r = await this.svc.handleCallback(code, state);
      const payload = Buffer.from(JSON.stringify(r.user)).toString('base64url');
      // 让 SPA 拿到 token/user 并存入 zustand,然后跳 returnUrl
      res.redirect(
        `/oauth/finish?token=${encodeURIComponent(r.token)}` +
        `&user=${payload}` +
        `&return=${encodeURIComponent(r.returnUrl)}`,
      );
    } catch (e: any) {
      res.redirect(`/login?error=${encodeURIComponent(e?.message || 'oauth_failed')}`);
    }
  }
}
