import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import fs from 'fs';
import path from 'path';

import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { VideoController } from 'src/contexts/video/adapters/controllers/video-controller';
import type { VideoDataSource } from 'src/interfaces/video-data-source';
import { VIDEO_DATA_SOURCE } from 'src/interfaces/video-data-source.token';
import { AppError } from 'src/contexts/video/application/errors/app-error';
import type { UserContextProps } from 'src/contexts/video/domain/value-objects/user-context';
import { ApiUserHeaders } from '../dtos/api-header.dto';

import { UploadVideosResponseDto } from '../dtos/upload-videos-response.dto';
import { GetProcessedZipResponseDto } from '../dtos/get-processed-zip-response.dto';
import { ListAllVideosResponseDto } from '../dtos/list-videos-response.dto';

@ApiTags('videos')
@ApiSecurity('x-user-id')
@ApiSecurity('x-user-email')
@Controller()
export class VideosHttpController {
  private readonly controller: VideoController;

  constructor(@Inject(VIDEO_DATA_SOURCE) private readonly ds: VideoDataSource) {
    this.controller = new VideoController(ds);
  }

  @Post('videos/upload')
  @ApiUserHeaders()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        videos: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
      required: ['videos'],
    },
  })
  @ApiOkResponse({ type: UploadVideosResponseDto })
  @UseInterceptors(
    FilesInterceptor('videos', Number(process.env.MAX_FILES_PER_REQUEST ?? 3), {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = '/tmp/uploads';
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const safe = file.originalname
            .normalize('NFC')
            .replace(/[^\p{L}\p{N}._\-()]+/gu, '_');
          cb(null, `${Date.now()}-${safe}`);
        },
      }),
      limits: { fileSize: Number(process.env.MAX_VIDEO_BYTES ?? 2147483648) },
    }),
  )
  async upload(
    @Req() req: Request,
    /* c8 ignore next */
    @UploadedFiles() files: Array<Express.Multer.File>,
  ): Promise<UploadVideosResponseDto> {
    const user = getUserPropsFromHeaders(req);

    if (!files || files.length === 0) {
      throw new BadRequestException('videos is required');
    }

    const mapped = files.map((f) => ({
      originalFileName: f.originalname,
      contentType: f.mimetype,
      size: f.size,
      tempFilePath: f.path,
    }));

    return (await this.controller.upload(user, mapped, (m) =>
      validateVideo(m, this.ds.config.maxVideoBytes),
    )) as unknown as UploadVideosResponseDto;
  }

  @Get('users/me/videos')
  @ApiUserHeaders()
  @ApiOkResponse({ type: ListAllVideosResponseDto })
  async list(@Req() req: Request): Promise<ListAllVideosResponseDto> {
    const user = getUserPropsFromHeaders(req);
    return (await this.controller.list(
      user,
    )) as unknown as ListAllVideosResponseDto;
  }

  @Get('videos/:videoId/processed-zip')
  @ApiUserHeaders()
  @ApiParam({ name: 'videoId' })
  @ApiOkResponse({ type: GetProcessedZipResponseDto })
  async downloadProcessedZip(
    @Req() req: Request,
    @Param('videoId') videoId: string,
  ): Promise<GetProcessedZipResponseDto> {
    const user = getUserPropsFromHeaders(req);
    return (await this.controller.downloadProcessedZip(
      user,
      videoId,
    )) as unknown as GetProcessedZipResponseDto;
  }
}

function getUserPropsFromHeaders(req: Request): UserContextProps {
  const headers = req.headers as Record<string, unknown>;
  const props = parseXUserHeaders(headers);

  const id = props.id;
  if (!id) throw new BadRequestException('Missing user');

  return props as UserContextProps;
}

function parseXUserHeaders(
  headers: Record<string, unknown>,
): Record<string, string> {
  const props: Record<string, string> = {};

  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    if (!key.startsWith('x-user-')) continue;

    const value = v as string;
    if (!value) continue;

    const suffix = key.slice('x-user-'.length);
    const camel = toCamelCase(suffix);
    props[camel] = value;
  }

  return props;
}

function toCamelCase(input: string): string {
  const parts = input.split('-').filter(Boolean);
  if (parts.length === 0) return input;

  const [first, ...rest] = parts;
  return (
    first + rest.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
  );
}

function validateVideo(
  meta: { originalFileName: string; contentType: string; size: number },
  maxBytes: number,
): void {
  const allowedMime = new Set([
    'video/mp4',
    'video/quicktime',
    'video/x-matroska',
    'video/webm',
  ]);
  const allowedExt = new Set(['.mp4', '.mov', '.mkv', '.webm']);

  const ext = path.extname(meta.originalFileName).toLowerCase();

  if (!allowedExt.has(ext))
    throw new AppError(
      'INVALID_VIDEO_EXTENSION',
      'INVALID_VIDEO_EXTENSION',
      400,
      {
        ext,
      },
    );

  if (!allowedMime.has(meta.contentType))
    throw new AppError(
      'INVALID_VIDEO_MIMETYPE',
      'INVALID_VIDEO_MIMETYPE',
      400,
      {
        mimetype: meta.contentType,
      },
    );

  if (meta.size <= 0)
    throw new AppError('INVALID_VIDEO_SIZE', 'INVALID_VIDEO_SIZE', 400);

  if (meta.size > maxBytes)
    throw new AppError('VIDEO_TOO_LARGE', 'VIDEO_TOO_LARGE', 413, {
      maxBytes,
      size: meta.size,
    });
}
