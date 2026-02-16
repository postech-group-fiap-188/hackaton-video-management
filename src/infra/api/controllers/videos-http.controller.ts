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
import fs from 'node:fs';
import path from 'node:path';

import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

import { VideoController } from 'src/adapters/controllers/video-controller';

import type { UserProps } from 'src/domain/entities/user';
import type { VideoStatus } from 'src/domain/enums/video-status';

import { VideoRepositoryDataSource } from 'src/interfaces/video-repository-data-source';
import { VideoStorageProvider } from 'src/interfaces/video-storage-provider';
import { VideoProcessingPublisher } from 'src/interfaces/video-processing-publisher';

import type { UploadResultItem } from 'src/application/usecases/upload-videos';

import { AppLoggerService } from '../common/logger/app-logger.service';
import { ApiUserHeaders } from '../dtos/api-header.dto';

import {
  ListAllVideosResponseDto,
  MyVideoItemResponseDto,
} from '../dtos/list-videos-response.dto';
import {
  UploadVideosResponseDto,
  UploadVideoItemResponseDto,
} from '../dtos/upload-videos-response.dto';
import { GetProcessedZipResponseDto } from '../dtos/get-processed-zip-response.dto';
import { VideoStatusDto } from '../dtos/video-status.dto';
import { AppError } from 'src/domain/errors/app-error';

@ApiTags('videos')
@ApiSecurity('x-user-id')
@ApiSecurity('x-user-email')
@Controller()
export class VideosHttpController {
  private readonly controller: VideoController;

  constructor(
    @Inject(VideoRepositoryDataSource)
    private readonly videoRepositoryDataSource: VideoRepositoryDataSource,

    @Inject(VideoStorageProvider)
    private readonly videoStorageProvider: VideoStorageProvider,

    @Inject(VideoProcessingPublisher)
    private readonly videoProcessingPublisher: VideoProcessingPublisher,

    private readonly config: ConfigService,
    private readonly logger: AppLoggerService,
  ) {
    this.controller = new VideoController(
      this.videoRepositoryDataSource,
      this.videoStorageProvider,
      this.videoProcessingPublisher,
      {
        inputBucket: must(
          this.config.get<string>('S3_INPUT_BUCKET_NAME'),
          'S3_INPUT_BUCKET_NAME',
        ),
        outputBucket: must(
          this.config.get<string>('S3_OUTPUT_BUCKET_NAME'),
          'S3_OUTPUT_BUCKET_NAME',
        ),
      },
      this.logger,
    );
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
            .replaceAll(/[^\p{L}\p{N}._\-()]+/gu, '_');
          cb(null, `${Date.now()}-${safe}`);
        },
      }),
      limits: { fileSize: Number(process.env.MAX_VIDEO_BYTES ?? 2147483648) },
    }),
  )
  async upload(
    @Req() req: Request,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<UploadVideosResponseDto> {
    const user = getUserPropsFromHeaders(req);

    if (!files?.length) throw new BadRequestException('Missing videos');

    const maxBytes = Number(process.env.MAX_VIDEO_BYTES ?? 1024 * 1024 * 50);

    const mapped = files.map((f) => ({
      originalFileName: f.originalname,
      contentType: f.mimetype,
      size: f.size,
      tempFilePath: f.path,
    }));

    const outUnknown: unknown = await this.controller.upload(
      user,
      mapped,
      (m) => validateVideo(m, maxBytes),
    );

    const out = outUnknown as { items: UploadResultItem[] };

    return toUploadVideosResponseDto(out.items);
  }

  @Get('videos')
  @ApiUserHeaders()
  @ApiOkResponse({ type: ListAllVideosResponseDto })
  async list(@Req() req: Request): Promise<ListAllVideosResponseDto> {
    const user = getUserPropsFromHeaders(req);

    const outUnknown: unknown = await this.controller.list(user);
    const out = outUnknown as ListAllVideosResponseDto;

    const items: MyVideoItemResponseDto[] = out.items.map((i) => ({
      ...i,
      status: toVideoStatusDto(String(i.status)),
    }));

    return { items };
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

    const outUnknown: unknown = await this.controller.downloadProcessedZip(
      user,
      videoId,
    );

    const out = outUnknown as GetProcessedZipResponseDto;

    return {
      downloadUrl: out.downloadUrl,
      bucket: out.bucket,
      key: out.key,
    };
  }
}

function must(v: string | undefined, name: string): string {
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function toVideoStatusDto(status: string | VideoStatus): VideoStatusDto {
  return status as unknown as VideoStatusDto;
}

type UploadOkItem = Extract<UploadResultItem, { ok: true }>;

function isUploadOkItem(i: UploadResultItem): i is UploadOkItem {
  return i.ok === true;
}

function toUploadVideosResponseDto(
  items: UploadResultItem[],
): UploadVideosResponseDto {
  const okItems: UploadOkItem[] = items.filter(isUploadOkItem);

  const mapped: UploadVideoItemResponseDto[] = okItems.map((i) => ({
    ok: true,
    videoId: i.videoId,
    inputKey: i.inputKey,
    outputZipKey: i.outputZipKey,
    status: toVideoStatusDto(i.status),
  }));

  return { items: mapped };
}

function getUserPropsFromHeaders(req: Request): UserProps {
  const parsed = parseXUserHeaders(req.headers as Record<string, unknown>);
  if (!parsed.id) throw new BadRequestException('Missing user');

  return {
    id: parsed.id,
    email: parsed.email,
    name: parsed.name,
    attributes: parsed.attributes,
  };
}

type ParsedUserProps = Omit<UserProps, 'id'> & { id?: string };

function parseXUserHeaders(headers: Record<string, unknown>): ParsedUserProps {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;

  const id = readStringHeader(lower, 'x-user-id');
  const email = readStringHeader(lower, 'x-user-email');
  const name = readStringHeader(lower, 'x-user-name');

  const attributes: Record<string, string> = {};

  for (const [k, v] of Object.entries(lower)) {
    if (!k.startsWith('x-user-')) continue;
    if (k === 'x-user-id' || k === 'x-user-email' || k === 'x-user-name')
      continue;
    if (typeof v !== 'string') continue;

    const key = k.slice('x-user-'.length);
    const value = v.trim();

    if (!key || !value) continue;

    attributes[key] = value;
  }

  return {
    id,
    email,
    name,
    attributes: Object.keys(attributes).length ? attributes : undefined,
  };
}

function readStringHeader(
  headers: Record<string, unknown>,
  name: string,
): string | undefined {
  const v = headers[name];
  if (typeof v !== 'string') return undefined;

  const value = v.trim();
  return value;
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
      { ext },
    );

  if (!allowedMime.has(meta.contentType))
    throw new AppError(
      'INVALID_VIDEO_MIMETYPE',
      'INVALID_VIDEO_MIMETYPE',
      400,
      { mimetype: meta.contentType },
    );

  if (meta.size <= 0)
    throw new AppError('INVALID_VIDEO_SIZE', 'INVALID_VIDEO_SIZE', 400);

  if (meta.size > maxBytes)
    throw new AppError('VIDEO_TOO_LARGE', 'VIDEO_TOO_LARGE', 413, {
      maxBytes,
      size: meta.size,
    });
}
