import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProblemsModule } from './problems/problems.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';
import { ContestsModule } from './contests/contests.module';
import { PostsModule } from './posts/posts.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { OssModule } from './oss/oss.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        // dev 时人类可读;生产保持 JSON 便于聚合
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', singleLine: true } }
            : undefined,
        autoLogging: { ignore: (req) => (req as any).url === '/api/metrics' },
        customProps: () => ({ service: 'oj-api' }),
      },
    }),
    PrismaModule,
    QueueModule,
    RedisModule,
    AuthModule,
    ProblemsModule,
    SubmissionsModule,
    ContestsModule,
    PostsModule,
    UsersModule,
    AdminModule,
    HealthModule,
    MetricsModule,
    OssModule,
    IntegrationsModule,
  ],
})
export class AppModule {}
