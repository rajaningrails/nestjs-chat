import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3PresignedUrlService } from 'src/common/services/aws.service';

@Module({
  imports: [ConfigModule],
  providers: [S3PresignedUrlService],
  exports: [S3PresignedUrlService],
})
export class S3Module {}
