import { ApiProperty } from '@nestjs/swagger';

export class InitUploadFileItemDto {
  @ApiProperty({ example: 'my-video.mp4' })
  originalFileName!: string;

  @ApiProperty({ example: 'video/mp4' })
  contentType!: string;
}

export class InitUploadRequestDto {
  @ApiProperty({ type: () => [InitUploadFileItemDto] })
  files!: InitUploadFileItemDto[];
}
