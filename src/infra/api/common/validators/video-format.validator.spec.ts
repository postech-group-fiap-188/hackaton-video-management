import { validateVideoFormat } from './video-format.validator';

describe('validateVideoFormat', () => {
  it('does not throw for allowed extension and contentType', () => {
    expect(() =>
      validateVideoFormat('video.mp4', 'video/mp4'),
    ).not.toThrow();
    expect(() =>
      validateVideoFormat('video.mov', 'video/quicktime'),
    ).not.toThrow();
    expect(() =>
      validateVideoFormat('video.mkv', 'video/x-matroska'),
    ).not.toThrow();
    expect(() =>
      validateVideoFormat('video.webm', 'video/webm'),
    ).not.toThrow();
  });

  it('throws INVALID_VIDEO_EXTENSION for disallowed extension', () => {
    expect(() =>
      validateVideoFormat('file.exe', 'video/mp4'),
    ).toThrow(/INVALID_VIDEO_EXTENSION/);

    try {
      validateVideoFormat('file.txt', 'video/mp4');
    } catch (e: any) {
      expect(e.code).toBe('INVALID_VIDEO_EXTENSION');
      expect(e.statusCode).toBe(400);
    }
  });

  it('throws INVALID_VIDEO_MIMETYPE for disallowed contentType', () => {
    expect(() =>
      validateVideoFormat('video.mp4', 'application/json'),
    ).toThrow(/INVALID_VIDEO_MIMETYPE/);

    try {
      validateVideoFormat('video.mp4', 'text/plain');
    } catch (e: any) {
      expect(e.code).toBe('INVALID_VIDEO_MIMETYPE');
      expect(e.statusCode).toBe(400);
    }
  });
});
