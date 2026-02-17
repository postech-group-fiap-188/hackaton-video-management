import type { Request } from 'express';

import { VideoStatusDto } from '../dtos/video-status.dto';

function makeReq(headers?: Record<string, unknown>): Request {
  return { headers: headers as any } as unknown as Request;
}

function makeConfig(): any {
  return {
    get: (key: string) => {
      if (key === 'S3_INPUT_BUCKET_NAME') return 'in-bucket';
      if (key === 'S3_OUTPUT_BUCKET_NAME') return 'out-bucket';
      return undefined;
    },
  };
}

function makeLogger(): any {
  return { info() {}, warn() {}, error() {} };
}

describe('VideosHttpController', () => {
  const initUploadMock = jest.fn();
  const listMock = jest.fn();
  const downloadZipMock = jest.fn();

  function bootWithMockedController() {
    jest.resetModules();
    initUploadMock.mockReset();
    listMock.mockReset();
    downloadZipMock.mockReset();

    jest.doMock('src/adapters/controllers/video-controller', () => ({
      __esModule: true,
      VideoController: jest.fn().mockImplementation(() => ({
        initUpload: initUploadMock,
        list: listMock,
        downloadProcessedZip: downloadZipMock,
      })),
    }));

    let mod: any;
    jest.isolateModules(() => {
      mod = require('./videos-http.controller');
    });
    return mod;
  }

  describe('upload (init presigned URLs)', () => {
    it('returns 200 and items with uploadUrl, expiresIn, videoId, inputKey, outputZipKey when body.files is valid', async () => {
      const { VideosHttpController } = bootWithMockedController();

      initUploadMock.mockResolvedValue({
        items: [
          {
            videoId: 'vid-1',
            uploadUrl: 'https://s3.example.com/signed',
            expiresIn: 300,
            inputKey: 'u1-vid-1-source.mp4',
            outputZipKey: 'u1-vid-1-processed.zip',
            user: { id: 'u1', email: 'u1@mail.com', name: 'Test' },
          },
        ],
      });

      const controller = new (VideosHttpController as any)(
        {} as any,
        {} as any,
        {} as any,
        makeConfig(),
        makeLogger(),
      );

      const res = await controller.upload(
        makeReq({ 'x-user-id': 'u1', 'x-user-email': 'u1@mail.com' }),
        {
          files: [
            { originalFileName: 'video.mp4', contentType: 'video/mp4' },
          ],
        },
      );

      expect(initUploadMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1', email: 'u1@mail.com' }),
        [{ originalFileName: 'video.mp4', contentType: 'video/mp4' }],
      );
      expect(res).toEqual({
        items: [
          {
            videoId: 'vid-1',
            uploadUrl: 'https://s3.example.com/signed',
            expiresIn: 300,
            inputKey: 'u1-vid-1-source.mp4',
            outputZipKey: 'u1-vid-1-processed.zip',
            user: { id: 'u1', email: 'u1@mail.com', name: 'Test' },
          },
        ],
      });
    });

    it('returns 400 when x-user-id is missing', async () => {
      const { VideosHttpController } = bootWithMockedController();

      const controller = new (VideosHttpController as any)(
        {} as any,
        {} as any,
        {} as any,
        makeConfig(),
        makeLogger(),
      );

      await expect(
        controller.upload(
          makeReq({ 'x-user-email': 'u1@mail.com' }),
          { files: [{ originalFileName: 'a.mp4', contentType: 'video/mp4' }] },
        ),
      ).rejects.toMatchObject({ status: 400 });

      expect(initUploadMock).not.toHaveBeenCalled();
    });

    it('returns 400 when x-user-id is only spaces', async () => {
      const { VideosHttpController } = bootWithMockedController();

      const controller = new (VideosHttpController as any)(
        {} as any,
        {} as any,
        {} as any,
        makeConfig(),
        makeLogger(),
      );

      await expect(
        controller.upload(
          makeReq({
            'x-user-id': '   ',
            'x-user-email': 'u1@mail.com',
          }),
          { files: [{ originalFileName: 'a.mp4', contentType: 'video/mp4' }] },
        ),
      ).rejects.toMatchObject({ status: 400 });

      expect(initUploadMock).not.toHaveBeenCalled();
    });

    it('returns 400 when body.files is missing', async () => {
      const { VideosHttpController } = bootWithMockedController();

      const controller = new (VideosHttpController as any)(
        {} as any,
        {} as any,
        {} as any,
        makeConfig(),
        makeLogger(),
      );

      await expect(
        controller.upload(makeReq({ 'x-user-id': 'u1' }), {} as any),
      ).rejects.toMatchObject({ status: 400 });

      expect(initUploadMock).not.toHaveBeenCalled();
    });

    it('returns 400 when body.files is not an array', async () => {
      const { VideosHttpController } = bootWithMockedController();

      const controller = new (VideosHttpController as any)(
        {} as any,
        {} as any,
        {} as any,
        makeConfig(),
        makeLogger(),
      );

      await expect(
        controller.upload(makeReq({ 'x-user-id': 'u1' }), {
          files: 'not-an-array',
        } as any),
      ).rejects.toMatchObject({ status: 400 });

      expect(initUploadMock).not.toHaveBeenCalled();
    });

    it('returns 400 when body.files is empty array', async () => {
      const { VideosHttpController } = bootWithMockedController();

      const controller = new (VideosHttpController as any)(
        {} as any,
        {} as any,
        {} as any,
        makeConfig(),
        makeLogger(),
      );

      await expect(
        controller.upload(makeReq({ 'x-user-id': 'u1' }), { files: [] }),
      ).rejects.toMatchObject({ status: 400 });

      expect(initUploadMock).not.toHaveBeenCalled();
    });

    it('returns 400 when file has invalid extension', async () => {
      const { VideosHttpController } = bootWithMockedController();

      const controller = new (VideosHttpController as any)(
        {} as any,
        {} as any,
        {} as any,
        makeConfig(),
        makeLogger(),
      );

      initUploadMock.mockRejectedValue({
        statusCode: 400,
        code: 'INVALID_VIDEO_EXTENSION',
      });

      await expect(
        controller.upload(
          makeReq({ 'x-user-id': 'u1', 'x-user-email': 'u1@mail.com' }),
          {
            files: [
              {
                originalFileName: 'video.exe',
                contentType: 'video/mp4',
              },
            ],
          },
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_VIDEO_EXTENSION',
      });

      expect(initUploadMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1', email: 'u1@mail.com' }),
        [
          {
            originalFileName: 'video.exe',
            contentType: 'video/mp4',
          },
        ],
      );
    });

    it('returns 400 when file has invalid contentType', async () => {
      const { VideosHttpController } = bootWithMockedController();

      const controller = new (VideosHttpController as any)(
        {} as any,
        {} as any,
        {} as any,
        makeConfig(),
        makeLogger(),
      );

      initUploadMock.mockRejectedValue({
        statusCode: 400,
        code: 'INVALID_VIDEO_MIMETYPE',
      });

      await expect(
        controller.upload(
          makeReq({ 'x-user-id': 'u1', 'x-user-email': 'u1@mail.com' }),
          {
            files: [
              {
                originalFileName: 'video.mp4',
                contentType: 'application/json',
              },
            ],
          },
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_VIDEO_MIMETYPE',
      });

      expect(initUploadMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1', email: 'u1@mail.com' }),
        [
          {
            originalFileName: 'video.mp4',
            contentType: 'application/json',
          },
        ],
      );
    });
  });

  describe('list', () => {
    it('returns 400 when x-user-id is missing', async () => {
      const { VideosHttpController } = bootWithMockedController();

      const controller = new (VideosHttpController as any)(
        {} as any,
        {} as any,
        {} as any,
        makeConfig(),
        makeLogger(),
      );

      await expect(
        controller.list(makeReq({ 'x-user-email': 'u1@mail.com' })),
      ).rejects.toMatchObject({ status: 400 });

      expect(listMock).not.toHaveBeenCalled();
    });

    it('calls list and converts status', async () => {
      const { VideosHttpController } = bootWithMockedController();

      listMock.mockResolvedValue({
        items: [
          {
            id: 'v1',
            status: 'SUCCEEDED',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      const controller = new (VideosHttpController as any)(
        {} as any,
        {} as any,
        {} as any,
        makeConfig(),
        makeLogger(),
      );

      const res = await controller.list(
        makeReq({ 'x-user-id': 'u1', 'x-user-email': 'u1@mail.com' }),
      );

      expect(listMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1', email: 'u1@mail.com' }),
      );
      expect(res.items[0].status).toBe(VideoStatusDto.SUCCEEDED);
    });
  });

  describe('downloadProcessedZip', () => {
    it('calls downloadProcessedZip and returns downloadUrl, bucket, key', async () => {
      const { VideosHttpController } = bootWithMockedController();

      downloadZipMock.mockResolvedValue({
        downloadUrl: 'signed-url',
        bucket: 'out-bucket',
        key: 'u1-vid-1-processed.zip',
      });

      const controller = new (VideosHttpController as any)(
        {} as any,
        {} as any,
        {} as any,
        makeConfig(),
        makeLogger(),
      );

      const res = await controller.downloadProcessedZip(
        makeReq({ 'x-user-id': 'u1', 'x-user-email': 'u1@mail.com' }),
        'vid-1',
      );

      expect(res).toEqual({
        downloadUrl: 'signed-url',
        bucket: 'out-bucket',
        key: 'u1-vid-1-processed.zip',
      });
      expect(downloadZipMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1', email: 'u1@mail.com' }),
        'vid-1',
      );
    });
  });
});
