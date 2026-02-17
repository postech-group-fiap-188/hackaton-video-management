import path from 'node:path';
import { AppError } from 'src/domain/errors/app-error';

const ALLOWED_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
]);
const ALLOWED_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm']);

/**
 * Validates that the file is an allowed video format by extension and contentType.
 * Does not validate size. Throws AppError (400) for invalid extension or mimetype.
 */
export function validateVideoFormat(
  originalFileName: string,
  contentType: string,
): void {
  const ext = path.extname(originalFileName).toLowerCase();

  if (!ALLOWED_EXT.has(ext)) {
    throw new AppError(
      'INVALID_VIDEO_EXTENSION',
      'INVALID_VIDEO_EXTENSION',
      400,
      { ext },
    );
  }

  if (!ALLOWED_MIME.has(contentType)) {
    throw new AppError(
      'INVALID_VIDEO_MIMETYPE',
      'INVALID_VIDEO_MIMETYPE',
      400,
      { mimetype: contentType },
    );
  }
}
