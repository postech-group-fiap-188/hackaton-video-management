import type { Request } from 'express';

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

function makeDs(maxVideoBytes = 100) {
  return {
    config: { maxVideoBytes },
  } as any;
}

describe('VideosHttpController (100% coverage)', () => {
  let capturedFilesInterceptorOpts: any;
  let capturedMaxFiles: number | undefined;

  const uploadMock = jest.fn();
  const listMock = jest.fn();
  const downloadZipMock = jest.fn();

  const existsSyncMock = jest.fn();
  const mkdirSyncMock = jest.fn();

  function bootWithEnv(env?: EnvInput) {
    jest.resetModules();
    jest.clearAllMocks();

    if (env?.MAX_FILES_PER_REQUEST !== undefined)
      process.env.MAX_FILES_PER_REQUEST = env.MAX_FILES_PER_REQUEST;
    else delete process.env.MAX_FILES_PER_REQUEST;

    if (env?.MAX_VIDEO_BYTES !== undefined)
      process.env.MAX_VIDEO_BYTES = env.MAX_VIDEO_BYTES;
    else delete process.env.MAX_VIDEO_BYTES;

    capturedFilesInterceptorOpts = undefined;
    capturedMaxFiles = undefined;

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

    jest.doMock(
      'src/contexts/video/adapters/controllers/video-controller',
      () => ({
        VideoController: jest.fn().mockImplementation(() => ({
          upload: uploadMock,
          list: listMock,
          downloadProcessedZip: downloadZipMock,
        })),
      }),
    );

    let VideosHttpController: any;
    let AppError: any;

    jest.isolateModules(() => {
      VideosHttpController =
        require('./videos-http.controller').VideosHttpController;
      AppError =
        require('src/contexts/video/application/errors/app-error').AppError;
    });

    return { VideosHttpController, AppError };
  }

  describe('decorator storage callbacks', () => {
    it('destination: cria /tmp/uploads quando não existe', () => {
      bootWithEnv();

      existsSyncMock.mockReturnValue(false);

      const destination = capturedFilesInterceptorOpts.storage.destination as (
        req: any,
        file: any,
        cb: (err: any, dest: string) => void,
      ) => void;

      const cb = jest.fn();
      destination({}, {}, cb);

      expect(existsSyncMock).toHaveBeenCalledWith('/tmp/uploads');
      expect(mkdirSyncMock).toHaveBeenCalledWith('/tmp/uploads', {
        recursive: true,
      });
      expect(cb).toHaveBeenCalledWith(null, '/tmp/uploads');
    });

    it('destination: NÃO cria diretório quando já existe', () => {
      bootWithEnv();

      existsSyncMock.mockReturnValue(true);

      const destination = capturedFilesInterceptorOpts.storage.destination as (
        req: any,
        file: any,
        cb: (err: any, dest: string) => void,
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

    it('usa valores do env quando setado', () => {
      bootWithEnv({ MAX_FILES_PER_REQUEST: '7', MAX_VIDEO_BYTES: '999' });

      expect(capturedMaxFiles).toBe(7);
      expect(capturedFilesInterceptorOpts.limits.fileSize).toBe(999);
    });
  });

  describe('métodos do controller + parsing do x-user-*', () => {
    it('list: 400 quando x-user-id ausente', async () => {
      const { VideosHttpController } = bootWithEnv();
      const controller = new VideosHttpController(makeDs(100));

      await expect(
        controller.list(makeReq({ 'x-user-email': 'u1@mail.com' })),
      ).rejects.toMatchObject({
        status: 400,
      });

      expect(listMock).not.toHaveBeenCalled();
    });

    it('upload: 400 quando x-user-id ausente', async () => {
      const { VideosHttpController } = bootWithEnv();
      const controller = new VideosHttpController(makeDs(100));

      await expect(
        controller.upload(makeReq({ 'x-user-email': 'u1@mail.com' }), [
          makeFile({
            originalname: 'a.mp4',
            mimetype: 'video/mp4',
            size: 10,
            path: '/tmp/a',
          }),
        ]),
      ).rejects.toMatchObject({ status: 400 });

      expect(uploadMock).not.toHaveBeenCalled();
    });

    it('upload: 400 quando files vazio', async () => {
      const { VideosHttpController } = bootWithEnv();
      const controller = new VideosHttpController(makeDs(100));

      await expect(
        controller.upload(makeReq({ 'x-user-id': 'u1' }), []),
      ).rejects.toMatchObject({ status: 400 });

      expect(uploadMock).not.toHaveBeenCalled();
    });

    it('upload: mapeia files e chama VideoController.upload com user props', async () => {
      const { VideosHttpController, AppError } = bootWithEnv();
      const controller = new VideosHttpController(makeDs(100));

      uploadMock.mockResolvedValue({ ok: true });

      const files = [
        makeFile({
          originalname: 'a.mp4',
          mimetype: 'video/mp4',
          size: 10,
          path: '/tmp/uploads/a.mp4',
        }),
      ];

      const res = await controller.upload(
        makeReq({
          'content-type': 'multipart/form-data',
          'x-user-empty': '',
          'x-user-': 'x',
          'x-user-id': 'u1',
          'x-user-email': 'u1@mail.com',
          'x-user-is-admin': 'true',
        }),
        files,
      );

      expect(res).toEqual({ ok: true });
      expect(uploadMock).toHaveBeenCalledTimes(1);

      const [userArg, mappedArg, validator] = uploadMock.mock.calls[0];

      expect(userArg).toEqual(
        expect.objectContaining({
          id: 'u1',
          email: 'u1@mail.com',
          isAdmin: 'true',
        }),
      );

      expect((userArg as any)['']).toBe('x');

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
      ).toThrow(AppError);

      expect(() =>
        validator({
          originalFileName: 'x.mp4',
          contentType: 'application/json',
          size: 10,
        }),
      ).toThrow(AppError);

      expect(() =>
        validator({
          originalFileName: 'x.mp4',
          contentType: 'video/mp4',
          size: 0,
        }),
      ).toThrow(AppError);

      expect(() =>
        validator({
          originalFileName: 'x.mp4',
          contentType: 'video/mp4',
          size: 101,
        }),
      ).toThrow(AppError);

      expect(() =>
        validator({
          originalFileName: 'ok.mp4',
          contentType: 'video/mp4',
          size: 10,
        }),
      ).not.toThrow();
    });

    it('list: chama VideoController.list com user props', async () => {
      const { VideosHttpController } = bootWithEnv();
      const controller = new VideosHttpController(makeDs(100));

      listMock.mockResolvedValue([{ id: 'v1' }]);

      const res = await controller.list(
        makeReq({
          'x-user-id': 'u1',
          'x-user-email': 'u1@mail.com',
        }),
      );

      expect(res).toEqual([{ id: 'v1' }]);
      expect(listMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1', email: 'u1@mail.com' }),
      );
    });

    it('downloadProcessedZip: chama VideoController.downloadProcessedZip com user props', async () => {
      const { VideosHttpController } = bootWithEnv();
      const controller = new VideosHttpController(makeDs(100));

      downloadZipMock.mockResolvedValue({ url: 'signed-url' });

      const res = await controller.downloadProcessedZip(
        makeReq({
          'x-user-id': 'u1',
          'x-user-email': 'u1@mail.com',
        }),
        'vid-1',
      );

      expect(res).toEqual({ url: 'signed-url' });
      expect(downloadZipMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1', email: 'u1@mail.com' }),
        'vid-1',
      );
    });
  });
});
