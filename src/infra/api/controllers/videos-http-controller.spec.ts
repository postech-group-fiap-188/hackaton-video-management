import type { Request } from 'express';

import { VideoStatusDto } from '../dtos/video-status.dto';

type EnvInput = {
  MAX_FILES_PER_REQUEST?: string;
  MAX_VIDEO_BYTES?: string;
};

function makeReq(headers?: Record<string, unknown>): Request {
  return { headers: headers as any } as unknown as Request;
}

function makeFile(input: {
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
}): Express.Multer.File {
  return input as unknown as Express.Multer.File;
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

describe('VideosHttpController (100% coverage)', () => {
  let capturedFilesInterceptorOpts: any;
  let capturedMaxFiles: number | undefined;

  const uploadMock = jest.fn();
  const listMock = jest.fn();
  const downloadZipMock = jest.fn();

  const existsSyncMock = jest.fn();
  const mkdirSyncMock = jest.fn();

  let restoreEnv: (() => void) | null = null;

  afterEach(() => {
    if (restoreEnv) restoreEnv();
    restoreEnv = null;
  });

  function bootWithEnv(env?: EnvInput) {
    jest.resetModules();

    const saved = { ...process.env };

    process.env = { ...saved };
    delete process.env.MAX_FILES_PER_REQUEST;
    delete process.env.MAX_VIDEO_BYTES;

    if (env && Object.prototype.hasOwnProperty.call(env, 'MAX_FILES_PER_REQUEST')) {
      if (env.MAX_FILES_PER_REQUEST !== undefined) {
        process.env.MAX_FILES_PER_REQUEST = env.MAX_FILES_PER_REQUEST;
      }
    }
    if (env && Object.prototype.hasOwnProperty.call(env, 'MAX_VIDEO_BYTES')) {
      if (env.MAX_VIDEO_BYTES !== undefined) {
        process.env.MAX_VIDEO_BYTES = env.MAX_VIDEO_BYTES;
      }
    }

    restoreEnv = () => {
      process.env = saved;
    };

    capturedFilesInterceptorOpts = undefined;
    capturedMaxFiles = undefined;

    uploadMock.mockReset();
    listMock.mockReset();
    downloadZipMock.mockReset();
    existsSyncMock.mockReset();
    mkdirSyncMock.mockReset();

    const controllerMockFactory = () => ({
      __esModule: true,
      VideoController: jest.fn().mockImplementation(() => ({
        upload: uploadMock,
        list: listMock,
        downloadProcessedZip: downloadZipMock,
      })),
    });

    jest.doMock('src/adapters/controllers/video-controller', controllerMockFactory);
    jest.doMock(
      'src/adapters/controllers/video-controller',
      controllerMockFactory,
    );

    jest.doMock('fs', () => ({
      __esModule: true,
      default: {
        existsSync: (...args: any[]) => existsSyncMock(...args),
        mkdirSync: (...args: any[]) => mkdirSyncMock(...args),
      },
      existsSync: (...args: any[]) => existsSyncMock(...args),
      mkdirSync: (...args: any[]) => mkdirSyncMock(...args),
    }));

    jest.doMock('multer', () => ({
      diskStorage: (opts: any) => opts,
    }));

    jest.doMock('@nestjs/platform-express', () => ({
      FilesInterceptor: (_field: string, max: number, opts: any) => {
        capturedMaxFiles = max;
        capturedFilesInterceptorOpts = opts;
        return class DummyInterceptor {};
      },
    }));

    let mod: any;
    jest.isolateModules(() => {
      mod = require('./videos-http.controller');
    });

    return mod;
  }

  describe('FilesInterceptor config', () => {
    it('destination: cria pasta quando não existe', () => {
      bootWithEnv();

      existsSyncMock.mockReturnValue(false);

      const destination = capturedFilesInterceptorOpts.storage.destination as (
        req: any,
        file: any,
        cb: (err: any, dir: string) => void,
      ) => void;

      const cb = jest.fn();
      destination({}, {}, cb);

      expect(existsSyncMock).toHaveBeenCalledWith('/tmp/uploads');
      expect(mkdirSyncMock).toHaveBeenCalledWith('/tmp/uploads', {
        recursive: true,
      });
      expect(cb).toHaveBeenCalledWith(null, '/tmp/uploads');
    });

    it('destination: não recria pasta quando já existe', () => {
      bootWithEnv();

      existsSyncMock.mockReturnValue(true);

      const destination = capturedFilesInterceptorOpts.storage.destination as (
        req: any,
        file: any,
        cb: (err: any, dir: string) => void,
      ) => void;

      const cb = jest.fn();
      destination({}, {}, cb);

      expect(existsSyncMock).toHaveBeenCalledWith('/tmp/uploads');
      expect(mkdirSyncMock).not.toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith(null, '/tmp/uploads');
    });

    it('filename: sanitiza nome e prefixa Date.now()', () => {
      bootWithEnv();

      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(123);

      const filename = capturedFilesInterceptorOpts.storage.filename as (
        req: any,
        file: any,
        cb: (err: any, name: string) => void,
      ) => void;

      const cb = jest.fn();
      filename({}, { originalname: 'Meu vídeo (1) !!.mp4' }, cb);

      expect(cb).toHaveBeenCalledWith(null, '123-Meu_vídeo_(1)_.mp4');

      nowSpy.mockRestore();
    });
  });

  describe('decorator env branches', () => {
    it('usa defaults quando env não está setado', () => {
      bootWithEnv();

      expect(capturedMaxFiles).toBe(3);
      expect(capturedFilesInterceptorOpts.limits.fileSize).toBe(2147483648);
    });

    it('usa env quando setado', () => {
      bootWithEnv({ MAX_FILES_PER_REQUEST: '9', MAX_VIDEO_BYTES: '77' });

      expect(capturedMaxFiles).toBe(9);
      expect(capturedFilesInterceptorOpts.limits.fileSize).toBe(77);
    });
  });

  describe('métodos do controller + parsing do x-user-*', () => {
    it('list: 400 quando x-user-id ausente', async () => {
      const { VideosHttpController } = bootWithEnv();
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

    it('list: 400 quando x-user-id é só espaços', async () => {
      const { VideosHttpController } = bootWithEnv();
      const controller = new (VideosHttpController as any)(
        {} as any,
        {} as any,
        {} as any,
        makeConfig(),
        makeLogger(),
      );

      await expect(
        controller.list(
          makeReq({ 'x-user-id': '   ', 'x-user-email': 'u1@mail.com' }),
        ),
      ).rejects.toMatchObject({ status: 400 });

      expect(listMock).not.toHaveBeenCalled();
    });

    it('upload: 400 quando x-user-id ausente', async () => {
      const { VideosHttpController } = bootWithEnv();
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
          [
            makeFile({
              originalname: 'a.mp4',
              mimetype: 'video/mp4',
              size: 1,
              path: '/tmp/a.mp4',
            }),
          ],
        ),
      ).rejects.toMatchObject({ status: 400 });

      expect(uploadMock).not.toHaveBeenCalled();
    });

    it('upload: 400 quando files undefined', async () => {
      const { VideosHttpController } = bootWithEnv();
      const controller = new (VideosHttpController as any)(
        {} as any,
        {} as any,
        {} as any,
        makeConfig(),
        makeLogger(),
      );

      await expect(
        controller.upload(makeReq({ 'x-user-id': 'u1' }), undefined as any),
      ).rejects.toMatchObject({ status: 400 });

      expect(uploadMock).not.toHaveBeenCalled();
    });

    it('upload: 400 quando não envia arquivos', async () => {
      const { VideosHttpController } = bootWithEnv();
      const controller = new (VideosHttpController as any)(
        {} as any,
        {} as any,
        {} as any,
        makeConfig(),
        makeLogger(),
      );

      await expect(
        controller.upload(makeReq({ 'x-user-id': 'u1' }), [] as any),
      ).rejects.toMatchObject({ status: 400 });

      expect(uploadMock).not.toHaveBeenCalled();
    });

    it('upload: parseia headers, mapeia files e passa validator', async () => {
      const { VideosHttpController } = bootWithEnv({ MAX_VIDEO_BYTES: '100' });

      uploadMock.mockResolvedValue({
        items: [
          {
            ok: true,
            videoId: 'v1',
            inputKey: 'u1-v1-source.mp4',
            outputZipKey: 'u1-v1-processed.zip',
            status: 'PENDING',
          },
          {
            ok: false,
            originalFileName: 'bad.exe',
            status: 'ERROR',
            errorMessage: 'INVALID_VIDEO_EXTENSION',
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
        makeReq({
          'x-user-id': 'u1',
          'x-user-email': 'u1@mail.com',
          'x-user-is-admin': 'true',
          'x-user-empty': '   ',
          'x-user-': 'x',
          'x-user-non-string': 123,
        }),
        [
          makeFile({
            originalname: 'a.mp4',
            mimetype: 'video/mp4',
            size: 10,
            path: '/tmp/uploads/a.mp4',
          }),
        ],
      );

      const [userArg, mappedArg, validator] = uploadMock.mock.calls[0];

      expect(userArg).toEqual(
        expect.objectContaining({
          id: 'u1',
          email: 'u1@mail.com',
          attributes: { 'is-admin': 'true' },
        }),
      );

      expect(mappedArg).toEqual([
        {
          originalFileName: 'a.mp4',
          contentType: 'video/mp4',
          size: 10,
          tempFilePath: '/tmp/uploads/a.mp4',
        },
      ]);

      expect(() =>
        validator({
          originalFileName: 'x.exe',
          contentType: 'video/mp4',
          size: 10,
        }),
      ).toThrow('INVALID_VIDEO_EXTENSION');

      expect(() =>
        validator({
          originalFileName: 'ok.mp4',
          contentType: 'application/json',
          size: 10,
        }),
      ).toThrow('INVALID_VIDEO_MIMETYPE');

      expect(() =>
        validator({
          originalFileName: 'ok.mp4',
          contentType: 'video/mp4',
          size: 0,
        }),
      ).toThrow('INVALID_VIDEO_SIZE');

      expect(() =>
        validator({
          originalFileName: 'ok.mp4',
          contentType: 'video/mp4',
          size: 101,
        }),
      ).toThrow('VIDEO_TOO_LARGE');

      expect(() =>
        validator({
          originalFileName: 'ok.mp4',
          contentType: 'video/mp4',
          size: 10,
        }),
      ).not.toThrow();

      expect(res).toEqual({
        items: [
          {
            ok: true,
            videoId: 'v1',
            inputKey: 'u1-v1-source.mp4',
            outputZipKey: 'u1-v1-processed.zip',
            status: VideoStatusDto.PENDING,
          },
        ],
      });
    });

    it('list: chama controller core e converte status', async () => {
      const { VideosHttpController } = bootWithEnv();

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
        makeReq({
          'x-user-id': 'u1',
          'x-user-email': 'u1@mail.com',
        }),
      );

      expect(listMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1', email: 'u1@mail.com' }),
      );

      expect(res.items[0].status).toBe(VideoStatusDto.SUCCEEDED);
    });

    it('download: chama controller core', async () => {
      const { VideosHttpController } = bootWithEnv();

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
        makeReq({
          'x-user-id': 'u1',
          'x-user-email': 'u1@mail.com',
        }),
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
