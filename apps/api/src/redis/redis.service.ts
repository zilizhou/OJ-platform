import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: IORedis;

  constructor() {
    this.client = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      maxRetriesPerRequest: null,
    });
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJson(key: string, value: any, ttlSec?: number) {
    const payload = JSON.stringify(value);
    if (ttlSec) await this.client.set(key, payload, 'EX', ttlSec);
    else await this.client.set(key, payload);
  }

  del(key: string) {
    return this.client.del(key);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
