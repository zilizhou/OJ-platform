import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // 未登录 / token 无效都放行,只在合法时把 user 挂到 req
  handleRequest(_err: any, user: any) {
    return user || null;
  }
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
