import { ApiProperty } from '@nestjs/swagger';
import { VideoStatusDto } from './video-status.dto';

export class UploadVideoItemResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;

  @ApiProperty({
    example: '4be5af76-3e8a-43e4-86be-7d78f5870c7d',
    required: false,
  })
  videoId?: string;

  @ApiProperty({
    example: '123-4be5af76-3e8a-43e4-86be-7d78f5870c7d-source.mov',
    required: false,
  })
  inputKey?: string;

  @ApiProperty({
    example: '123-4be5af76-3e8a-43e4-86be-7d78f5870c7d-processed.zip',
    required: false,
  })
  outputZipKey?: string;

  @ApiProperty({ example: 'my-video.mov', required: false })
  originalFileName?: string;

  @ApiProperty({ example: 'Invalid video type', required: false })
  errorMessage?: string;

  @ApiProperty({ enum: VideoStatusDto, example: VideoStatusDto.PENDING })
  status!: VideoStatusDto;
}

export class UploadVideosResponseDto {
  @ApiProperty({ type: () => [UploadVideoItemResponseDto] })
  items!: UploadVideoItemResponseDto[];
}
