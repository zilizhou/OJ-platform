import { Client as MinioClient } from 'minio';

export const TESTDATA_BUCKET = 'testdata';

export const minio = new MinioClient({
  endPoint: process.env.MINIO_HOST || 'minio',
  port: Number(process.env.MINIO_PORT) || 9000,
  useSSL: false,
  accessKey: process.env.MINIO_USER || 'ojadmin',
  secretKey: process.env.MINIO_PASSWORD || 'ojadmin12345',
});

export async function fetchTestcase(key: string): Promise<string> {
  const stream = await minio.getObject(TESTDATA_BUCKET, key);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}
