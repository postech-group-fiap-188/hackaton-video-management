import { ApiProperty } from '@nestjs/swagger';

export enum VideoStatusDto {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

export class VideoStatusSchemaDto {
  @ApiProperty({ enum: VideoStatusDto, example: VideoStatusDto.PENDING })
  status!: VideoStatusDto;
}
