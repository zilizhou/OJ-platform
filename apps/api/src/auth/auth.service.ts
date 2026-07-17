import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async register(username: string, email: string, password: string) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existing) throw new ConflictException('用户名或邮箱已被占用');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { username, email, passwordHash },
    });
    return this.makeToken(user.id, user.username, user.role);
  }

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new UnauthorizedException('用户名或密码错误');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('用户名或密码错误');
    return this.makeToken(user.id, user.username, user.role);
  }

  private makeToken(sub: number, username: string, role: string) {
    const token = this.jwt.sign({ sub, username, role });
    return { token, user: { id: sub, username, role } };
  }
}
