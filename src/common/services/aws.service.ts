import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RedisService } from './redis.service';

@Injectable()
export class S3PresignedUrlService {
  private readonly logger = new Logger(S3PresignedUrlService.name);
  private readonly s3Client: S3Client;
  private readonly PRIVATE_BUCKET_IDENTIFIER = 'veda-app-private';
  private readonly S3_BASE_URL = 'https://s3.veda-app.com';
  // Cache TTL is 10% shorter than the presigned URL expiry so cached URLs
  // are never served after they've expired on S3's side.
  private readonly CACHE_TTL_RATIO = 0.9;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.s3Client = new S3Client({
      region: 'ap-south-1',
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_KEY'),
        secretAccessKey: this.configService.getOrThrow<string>('AWS_SECRET'),
      },
      endpoint: this.configService.get<string>('AWS_ENDPOINT'),
      forcePathStyle: true,
    });
  }

  async generatePresignedUrl(url: string, expiryTime = 600): Promise<string> {
    if (!url || !this.isPrivateS3Url(url)) return url;

    const key = this.extractKeyFromUrl(url);
    if (!key) {
      this.logger.warn(`Could not parse S3 key from URL: ${url}`);
      return url;
    }

    const cacheKey = `s3:presign:${key}:${expiryTime}`;
    try {
      const cached = await this.redisService.get<string>(cacheKey);
      if (cached) return cached;
    } catch {
      // Redis miss or unavailable — fall through to generate fresh URL
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.configService.getOrThrow<string>('AWS_BUCKET'),
        Key: key,
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiryTime,
      });

      const cacheTtl = Math.floor(expiryTime * this.CACHE_TTL_RATIO);
      try {
        await this.redisService.set(cacheKey, signedUrl, cacheTtl);
      } catch {
        // Cache write failure is non-fatal
      }

      return signedUrl;
    } catch (err) {
      this.logger.error(`Failed to generate presigned URL for key: ${key}`, err);
      return url;
    }
  }

  async generatePresignedUrls(urls: string[], expiryTime = 600): Promise<string[]> {
    if (!urls?.length) return [];
    return Promise.all(urls.map((url) => this.generatePresignedUrl(url, expiryTime)));
  }

  async presignObjectFields<T extends Record<string, any>>(
    obj: T,
    fields?: (keyof T)[],
  ): Promise<T> {
    const fieldsToProcess = fields ?? (Object.keys(obj) as (keyof T)[]);
    const result = { ...obj };

    await Promise.all(
      fieldsToProcess.map(async (field) => {
        const value = result[field];
        if (typeof value === 'string' && this.isPrivateS3Url(value)) {
          result[field] = (await this.generatePresignedUrl(value)) as T[keyof T];
        }
      }),
    );

    return result;
  }

  private isPrivateS3Url(url: string): boolean {
    return (
      typeof url === 'string' &&
      url.startsWith(this.S3_BASE_URL) &&
      url.includes(this.PRIVATE_BUCKET_IDENTIFIER)
    );
  }

  private extractKeyFromUrl(url: string): string | null {
    const match = url.match(/^https:\/\/s3\.veda-app\.com\/veda-app-private\/(.+)$/);
    return match?.[1] ?? null;
  }
}
