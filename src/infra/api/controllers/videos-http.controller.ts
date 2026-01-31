import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  PayloadTooLargeException,
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

import { VideoController } from 'src/video/adapters/controllers/video-controller';
import type { VideoDataSource } from 'src/interfaces/video-data-source';
import { VIDEO_DATA_SOURCE } from 'src/interfaces/video-data-source.token';
import { AppError } from 'src/video/application/errors/app-error';
import type { UserContextProps } from 'src/video/domain/entities/user-context';
import { ApiUserHeaders } from '../dtos/api-header.dto';

import { UploadVideosResponseDto } from '../dtos/upload-videos-response.dto';
import { GetProcessedZipResponseDto } from '../dtos/get-processed-zip-response.dto';
import { ListAllVideosResponseDto } from '../dtos/list-videos-response.dto';

type ParsedUserContextProps = Omit<UserContextProps, 'id'> & { id?: string };

function getEnvInt(
  name: string,
  def: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : def;

  if (!Number.isFinite(n)) return def;

  const i = Math.floor(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

const MAX_FILES_PER_REQUEST = getEnvInt('MAX_FILES_PER_REQUEST', 3, 1, 10);
const MAX_VIDEO_BYTES = getEnvInt(
  'MAX_VIDEO_BYTES',
  200 * 1024 * 1024,
  1,
  2_147_483_648,
);

const MULTIPART_OVERHEAD_BYTES = 5 * 1024 * 1024;

const MAX_REQUEST_BYTES =
  MAX_VIDEO_BYTES * MAX_FILES_PER_REQUEST + MULTIPART_OVERHEAD_BYTES;

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
        videos: {
          type: 'array',
          maxItems: MAX_FILES_PER_REQUEST,
          items: { type: 'string', format: 'binary' },
        },
      },
      required: ['videos'],
    },
  })
  @ApiOkResponse({ type: UploadVideosResponseDto })
  @UseInterceptors(
    FilesInterceptor('videos', MAX_FILES_PER_REQUEST, {
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
      limits: {
        fileSize: MAX_VIDEO_BYTES,
        files: MAX_FILES_PER_REQUEST,
      },
    }),
  )
  async upload(
    @Req() req: Request,
    /* c8 ignore next */
    @UploadedFiles() files: Array<Express.Multer.File>,
  ): Promise<UploadVideosResponseDto> {
    const user = getUserPropsFromHeaders(req);

    const contentLength = Number(req.headers['content-length'] ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      throw new PayloadTooLargeException('Payload too large');
    }

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
  const parsed = parseXUserHeaders(headers);

  const id = (parsed.id ?? '').trim();
  if (!id) throw new BadRequestException('Missing user');

  return {
    id,
    email: parsed.email,
    attributes: parsed.attributes,
  };
}

function getHeaderString(
  headers: Record<string, unknown>,
  name: string,
): string | undefined {
  const v = headers[name];
  if (typeof v === 'string') return v.trim() || undefined;
  if (Array.isArray(v) && typeof v[0] === 'string')
    return v[0].trim() || undefined;
  return undefined;
}

function parseXUserHeaders(
  headers: Record<string, unknown>,
): ParsedUserContextProps {
  const lower = toLowerHeaderMap(headers);

  const id = getHeaderString(lower, 'x-user-id');
  const email = getHeaderString(lower, 'x-user-email');

  const attributes = extractUserAttributes(lower);

  return {
    id,
    email,
    attributes: Object.keys(attributes).length ? attributes : undefined,
  };
}

function toLowerHeaderMap(
  headers: Record<string, unknown>,
): Record<string, unknown> {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) {
    lower[k.toLowerCase()] = v;
  }
  return lower;
}

function extractUserAttributes(
  lower: Record<string, unknown>,
): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const [k, v] of Object.entries(lower)) {
    const suffix = getUserAttributeSuffix(k);
    if (!suffix) continue;

    const cleaned = (readHeaderValue(v) ?? '').trim();
    if (!cleaned) continue;

    attributes[suffix] = cleaned;
  }

  return attributes;
}

function getUserAttributeSuffix(key: string): string | null {
  const prefix = 'x-user-';
  if (!key.startsWith(prefix)) return null;

  const suffix = key.slice(prefix.length).trim();
  if (!suffix) return null;
  if (suffix === 'id' || suffix === 'email') return null;

  return suffix;
}

function readHeaderValue(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
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
