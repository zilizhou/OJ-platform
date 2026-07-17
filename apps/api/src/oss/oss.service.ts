import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client as MinioClient } from 'minio';
import { randomUUID } from 'crypto';

/**
 * 大于 INLINE_THRESHOLD 的测试数据走 MinIO,小的继续直接存 DB。
 * 解决文档 §2 提到但未落地的"测试数据放对象存储"。
 */
@Injectable()
export class OssService implements OnModuleInit {
  static readonly INLINE_THRESHOLD = 32 * 1024; // 32KB
  static readonly TESTDATA_BUCKET = 'testdata';

  readonly client: MinioClient;

  constructor() {
    this.client = new MinioClient({
      endPoint: process.env.MINIO_HOST || 'minio',
      port: Number(process.env.MINIO_PORT) || 9000,
      useSSL: false,
      accessKey: process.env.MINIO_USER || 'ojadmin',
      secretKey: process.env.MINIO_PASSWORD || 'ojadmin12345',
    });
  }

  async onModuleInit() {
    try {
      const exists = await this.client.bucketExists(OssService.TESTDATA_BUCKET);
      if (!exists) await this.client.makeBucket(OssService.TESTDATA_BUCKET, 'us-east-1');
    } catch (e) {
      // MinIO 暂不可用不要阻塞 API 启动;真正用到才 throw
      console.warn('[oss] bucket setup deferred:', (e as Error).message);
    }
  }

  /** 大于阈值则上传,返回 key;否则返回 undefined,调用方走 DB inline 路径 */
  async maybeUpload(problemId: number, kind: 'in' | 'out', body: string): Promise<string | undefined> {
    if (Buffer.byteLength(body, 'utf-8') < OssService.INLINE_THRESHOLD) return undefined;
    const key = `p${problemId}/${randomUUID()}.${kind}`;
    await this.client.putObject(OssService.TESTDATA_BUCKET, key, Buffer.from(body, 'utf-8'));
    return key;
  }

  async download(key: string): Promise<string> {
    const stream = await this.client.getObject(OssService.TESTDATA_BUCKET, key);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString('utf-8');
  }

  async delete(key: string): Promise<void> {
    await this.client.removeObject(OssService.TESTDATA_BUCKET, key).catch(() => {});
  }
}
