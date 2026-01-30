// src/video/adapters/http/dtos/get-processed-zip-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class GetProcessedZipResponseDto {
  @ApiProperty({
    example:
      'http://localstack:4566/videos-processed/123-00b4739f-c64d-45e3-a89f-c5e25c89df97-processed.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&...',
  })
  downloadUrl!: string;

  @ApiProperty({ example: 'videos-processed' })
  bucket!: string;

  @ApiProperty({
    example: '123-00b4739f-c64d-45e3-a89f-c5e25c89df97-processed.zip',
  })
  key!: string;
}
