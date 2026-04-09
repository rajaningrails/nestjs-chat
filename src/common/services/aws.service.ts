import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3PresignedUrlService {
  private readonly logger = new Logger(S3PresignedUrlService.name);
  private readonly s3Client: S3Client;
  private readonly PRIVATE_BUCKET_IDENTIFIER = 'veda-app-private';
  private readonly S3_BASE_URL = 'https://s3.veda-app.com';

  constructor(private readonly configService: ConfigService) {
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
    if (!this.isPrivateS3Url(url)) return url;

    const key = this.extractKeyFromUrl(url);
    if (!key) {
      this.logger.warn(`Could not parse S3 key from URL: ${url}`);
      return url;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.configService.getOrThrow<string>('AWS_BUCKET'),
        Key: key,
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiryTime,
      });

      return signedUrl;
    } catch (err) {
      this.logger.error(
        `Failed to generate presigned URL for key: ${key}`,
        err,
      );
      return url;
    }
  }

  async generatePresignedUrls(
    urls: string[],
    expiryTime = 600,
  ): Promise<string[]> {
    return Promise.all(
      urls.map((url) => this.generatePresignedUrl(url, expiryTime)),
    );
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
          result[field] = (await this.generatePresignedUrl(
            value,
          )) as T[keyof T];
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
    const match = url.match(
      /^https:\/\/s3\.veda-app\.com\/veda-app-private\/(.+)$/,
    );
    return match?.[1] ?? null;
  }
}
