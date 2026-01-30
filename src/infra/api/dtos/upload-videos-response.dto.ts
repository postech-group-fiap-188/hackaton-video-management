// src/video/adapters/http/dtos/upload-videos-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { VideoStatusDto } from './video-status.dto';

export class UploadVideoItemResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;

  @ApiProperty({ example: '4be5af76-3e8a-43e4-86be-7d78f5870c7d' })
  videoId!: string;

  @ApiProperty({
    example: '123-4be5af76-3e8a-43e4-86be-7d78f5870c7d-source.mov',
  })
  inputKey!: string;

  @ApiProperty({
    example: '123-4be5af76-3e8a-43e4-86be-7d78f5870c7d-processed.zip',
  })
  outputZipKey!: string;

  @ApiProperty({ enum: VideoStatusDto, example: VideoStatusDto.PENDING })
  status!: VideoStatusDto;
}

export class UploadVideosResponseDto {
  @ApiProperty({ type: () => [UploadVideoItemResponseDto] })
  items!: UploadVideoItemResponseDto[];
}
