import { ApiProperty } from '@nestjs/swagger';
import { VideoStatusDto } from './video-status.dto';

export class UserPropsDto {
  @ApiProperty({ example: '123' })
  id!: string;
}

export class UserDto {
  @ApiProperty({ type: () => UserPropsDto })
  props!: UserPropsDto;
}

export class MyVideoItemResponseDto {
  @ApiProperty({ example: '4be5af76-3e8a-43e4-86be-7d78f5870c7d' })
  id!: string;

  @ApiProperty({ type: () => UserDto })
  user!: UserDto;

  @ApiProperty({ example: 'videos-input' })
  inputBucket!: string;

  @ApiProperty({
    example: '123-4be5af76-3e8a-43e4-86be-7d78f5870c7d-source.mov',
  })
  inputKey!: string;

  @ApiProperty({ example: 'video-teste.MOV' })
  originalFileName!: string;

  @ApiProperty({ example: 'video/quicktime' })
  contentType!: string;

  @ApiProperty({ example: 20246889 })
  size!: number;

  @ApiProperty({ enum: VideoStatusDto, example: VideoStatusDto.PENDING })
  status!: VideoStatusDto;

  @ApiProperty({ example: '2026-01-29T19:31:43.571Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-01-29T19:31:43.571Z' })
  updatedAt!: string;
}

export class ListAllVideosResponseDto {
  @ApiProperty({ type: () => [MyVideoItemResponseDto] })
  items!: MyVideoItemResponseDto[];
}
