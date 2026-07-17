import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage,
  WebSocketGateway, WebSocketServer, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';

// 判题 worker 写完一条 submission 状态后,publish 到 Redis 频道
// `oj:submission:<id>`。本 gateway 订阅 pattern,把 payload 推给已加入
// `submission-<id>` room 的所有客户端,前端 SubmissionDetail 实时刷新。

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class SubmissionsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer() server: Server;
  private sub?: import('ioredis').default;

  constructor(private redis: RedisService) {}

  async onModuleInit() {
    this.sub = this.redis.client.duplicate();
    // 关键:加 error 监听,不然 ECONNRESET 会作为 'Unhandled error event' 刷屏日志
    this.sub.on('error', (e) => {
      console.warn('[ws-pubsub] redis sub error:', e?.message);
    });
    await this.sub.psubscribe('oj:submission:*');
    this.sub.on('pmessage', (_pattern, channel, message) => {
      const id = channel.replace('oj:submission:', '');
      try {
        this.server.to(`submission-${id}`).emit('submission:update', JSON.parse(message));
      } catch {
        /* ignore */
      }
    });
  }

  async onModuleDestroy() {
    if (this.sub) {
      await this.sub.punsubscribe('oj:submission:*').catch(() => {});
      await this.sub.quit().catch(() => {});
    }
  }

  handleConnection(_client: Socket) { /* noop */ }
  handleDisconnect(_client: Socket) { /* noop */ }

  @SubscribeMessage('subscribe')
  onSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { submissionId: number },
  ) {
    if (!body?.submissionId) return;
    client.join(`submission-${body.submissionId}`);
  }

  @SubscribeMessage('unsubscribe')
  onUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { submissionId: number },
  ) {
    if (!body?.submissionId) return;
    client.leave(`submission-${body.submissionId}`);
  }
}
