import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  // K8s readiness/liveness 用。任何依赖不通就 503。
  @Get()
  async health() {
    const checks: Record<string, string> = {};
    let ok = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.postgres = 'ok';
    } catch (e: any) {
      checks.postgres = `error: ${e.message?.slice(0, 100)}`;
      ok = false;
    }
    try {
      const pong = await this.redis.client.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'unexpected';
    } catch (e: any) {
      checks.redis = `error: ${e.message?.slice(0, 100)}`;
      ok = false;
    }
    return { status: ok ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() };
  }
}
