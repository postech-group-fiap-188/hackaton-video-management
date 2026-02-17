import { ApiProperty } from '@nestjs/swagger';

export class PresignedUploadUserMetaDto {
  @ApiProperty({ example: 'user-123' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'User Name', required: false })
  name?: string;
}

export class PresignedUploadItemDto {
  @ApiProperty({ example: '4be5af76-3e8a-43e4-86be-7d78f5870c7d' })
  videoId!: string;

  @ApiProperty({ example: 'https://bucket.s3.region.amazonaws.com/key?X-Amz-...' })
  uploadUrl!: string;

  @ApiProperty({ example: 300 })
  expiresIn!: number;

  @ApiProperty({ example: 'user-123-4be5af76-3e8a-43e4-86be-7d78f5870c7d-source.mp4' })
  inputKey!: string;

  @ApiProperty({ example: 'user-123-4be5af76-3e8a-43e4-86be-7d78f5870c7d-processed.zip' })
  outputZipKey!: string;

  @ApiProperty({ type: () => PresignedUploadUserMetaDto })
  user!: PresignedUploadUserMetaDto;
}

export class PresignedUploadResponseDto {
  @ApiProperty({ type: () => [PresignedUploadItemDto] })
  items!: PresignedUploadItemDto[];
}
