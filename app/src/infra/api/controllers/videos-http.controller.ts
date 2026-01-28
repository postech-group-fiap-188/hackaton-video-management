import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import fs from 'fs';
import path from 'path';

import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { CognitoAuthGuard } from 'src/infra/auth/cognito-auth.guard';
import { VideoController } from 'src/contexts/video/adapters/controllers/video-controller';
import type { VideoDataSource } from 'src/interfaces/video-data-source';
import { VIDEO_DATA_SOURCE } from 'src/interfaces/video-data-source.token';
import { AppError } from 'src/contexts/video/application/errors/app-error';

@ApiTags('videos')
@ApiBearerAuth()
@UseGuards(CognitoAuthGuard)
@Controller()
export class VideosHttpController {
  private readonly controller: VideoController;

  constructor(@Inject(VIDEO_DATA_SOURCE) private readonly ds: VideoDataSource) {
    this.controller = new VideoController(ds);
  }

  @Post('videos/upload')
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
  ) {
    const userId = req.user?.sub;
    if (!userId) throw new BadRequestException('Missing user');
    if (!files || files.length === 0)
      throw new BadRequestException('videos is required');

    const mapped = files.map((f) => ({
      originalFileName: f.originalname,
      contentType: f.mimetype,
      size: f.size,
      tempFilePath: f.path,
    }));

    return this.controller.upload(userId, mapped, (m) =>
      validateVideo(m, this.ds.config.maxVideoBytes),
    );
  }

  @Get('users/me/videos')
  async list(@Req() req: Request) {
    const userId = req.user?.sub;
    if (!userId) throw new BadRequestException('Missing user');
    return this.controller.list(userId);
  }

  @Get('videos/:videoId/processed-zip')
  @ApiParam({ name: 'videoId' })
  async downloadProcessedZip(
    @Req() req: Request,
    @Param('videoId') videoId: string,
  ) {
    const userId = req.user?.sub;
    if (!userId) throw new BadRequestException('Missing user');
    return this.controller.downloadProcessedZip(userId, videoId);
  }
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
      'Invalid video extension',
      'INVALID_VIDEO_EXTENSION',
      400,
      { ext },
    );
  if (!allowedMime.has(meta.contentType))
    throw new AppError(
      'Invalid video mimetype',
      'INVALID_VIDEO_MIMETYPE',
      400,
      { mimetype: meta.contentType },
    );
  if (meta.size <= 0)
    throw new AppError('Invalid video size', 'INVALID_VIDEO_SIZE', 400);
  if (meta.size > maxBytes)
    throw new AppError('Video too large', 'VIDEO_TOO_LARGE', 413, {
      maxBytes,
      size: meta.size,
    });
}
