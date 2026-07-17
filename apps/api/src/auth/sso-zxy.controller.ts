import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OauthZxyService } from './oauth-zxy.service';

@Controller('auth/sso/zxy')
export class SsoZxyController {
  constructor(private svc: OauthZxyService) {}

  /** 服务大厅 / 登录页入口 → 跳转知新芸 SSO */
  @Get('entry')
  async entry(@Query('return') returnUrl: string | undefined, @Res() res: Response) {
    const url = this.svc.startSsoUrl(returnUrl);
    res.redirect(url);
  }

  /** 知新芸 SSO 回跳:带 ticket,换本地会话 */
  @Get('callback')
  async callback(
    @Query('ticket') ticket: string | undefined,
    @Query('return') returnUrl: string | undefined,
    @Query('error') err: string | undefined,
    @Res() res: Response,
  ) {
    if (err) return res.redirect(`/login?error=${encodeURIComponent(err)}`);
    if (!ticket) return res.redirect('/login?error=missing_sso_ticket');
    try {
      const r = await this.svc.handleSsoTicket(ticket, returnUrl);
      const payload = Buffer.from(JSON.stringify(r.user)).toString('base64url');
      res.redirect(
        `/oauth/finish?token=${encodeURIComponent(r.token)}` +
        `&user=${payload}` +
        `&return=${encodeURIComponent(r.returnUrl)}`,
      );
    } catch (e: any) {
      res.redirect(`/login?error=${encodeURIComponent(e?.message || 'sso_failed')}`);
    }
  }
}
