import { ApiProperty } from '@nestjs/swagger';

export class GetProcessedZipResponseDto {
  @ApiProperty({
    example:
      'https://videos-processed.s3.us-east-1.amazonaws.com/u1-00b4739f-c64d-45e3-a89f-c5e25c89df97-processed.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA...%2F20260201%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260201T120000Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=...',
    description: 'Pre-signed download URL (valid for a limited time)',
  })
  downloadUrl!: string;

  @ApiProperty({ example: 'videos-processed' })
  bucket!: string;

  @ApiProperty({
    example: 'u1-00b4739f-c64d-45e3-a89f-c5e25c89df97-processed.zip',
  })
  key!: string;
}
