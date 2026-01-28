
import type { Request } from 'express';

type EnvInput = {
  MAX_FILES_PER_REQUEST?: string;
  MAX_VIDEO_BYTES?: string;
  reflectMetadata?: 'on' | 'off';
};

function makeReq(userId?: string): Request {
  return { user: userId ? { sub: userId } : undefined } as unknown as Request;
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


    if (env?.reflectMetadata === 'on') {
  
      try {
        Object.defineProperty(Reflect as any, 'metadata', {
          configurable: true,
          writable: true,
          value: (Reflect as any).metadata ?? (() => () => undefined),
        });
      } catch {
        (Reflect as any).metadata = (Reflect as any).metadata ?? (() => () => undefined);
      }
    } else {
  
      try {
        delete (Reflect as any).metadata;
      } catch {
        try {
          Object.defineProperty(Reflect as any, 'metadata', {
            configurable: true,
            writable: true,
            value: undefined,
          });
        } catch {
          (Reflect as any).metadata = undefined;
        }
      }
    }


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


    jest.doMock('src/infra/auth/cognito-auth.guard', () => ({
      CognitoAuthGuard: class CognitoAuthGuard {},
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

  describe('decorator metadata branch (Reflect.metadata on/off)', () => {
    it('importa módulo com Reflect.metadata OFF (branch false)', () => {
      bootWithEnv({ reflectMetadata: 'off' });
      expect(capturedFilesInterceptorOpts).toBeDefined();
    });

    it('importa módulo com Reflect.metadata ON (branch true)', () => {
      bootWithEnv({ reflectMetadata: 'on' });
      expect(typeof (Reflect as any).metadata).toBe('function');
      expect(capturedFilesInterceptorOpts).toBeDefined();
    });
  });

  describe('decorator storage callbacks', () => {
    it('destination: cria /tmp/uploads quando não existe', () => {
      bootWithEnv({ reflectMetadata: 'on' });

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
      bootWithEnv({ reflectMetadata: 'on' });

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
      bootWithEnv({ reflectMetadata: 'on' });

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
      bootWithEnv({ reflectMetadata: 'on' });

      expect(capturedMaxFiles).toBe(3);
      expect(capturedFilesInterceptorOpts.limits.fileSize).toBe(2147483648);
    });

    it('usa valores do env quando setado', () => {
      bootWithEnv({
        reflectMetadata: 'on',
        MAX_FILES_PER_REQUEST: '7',
        MAX_VIDEO_BYTES: '999',
      });

      expect(capturedMaxFiles).toBe(7);
      expect(capturedFilesInterceptorOpts.limits.fileSize).toBe(999);
    });
  });

  describe('métodos do controller', () => {
    it('upload: 400 quando req.user ausente', async () => {
      const { VideosHttpController } = bootWithEnv({ reflectMetadata: 'on' });
      const controller = new VideosHttpController(makeDs(100));

      try {
        await controller.upload(
          makeReq(undefined),
          [
            makeFile({
              originalname: 'a.mp4',
              mimetype: 'video/mp4',
              size: 10,
              path: '/tmp/a',
            }),
          ],
        );
        fail('should throw');
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.getResponse()).toMatchObject({
          statusCode: 400,
          message: 'Missing user',
        });
      }

      expect(uploadMock).not.toHaveBeenCalled();
    });

    it('upload: 400 quando req.user existe mas sub ausente', async () => {
      const { VideosHttpController } = bootWithEnv({ reflectMetadata: 'on' });
      const controller = new VideosHttpController(makeDs(100));

      const req = { user: {} } as any;

      try {
        await controller.upload(
          req,
          [
            makeFile({
              originalname: 'a.mp4',
              mimetype: 'video/mp4',
              size: 10,
              path: '/tmp/a',
            }),
          ],
        );
        fail('should throw');
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.getResponse()).toMatchObject({
          statusCode: 400,
          message: 'Missing user',
        });
      }

      expect(uploadMock).not.toHaveBeenCalled();
    });

    it('upload: 400 quando files vazio', async () => {
      const { VideosHttpController } = bootWithEnv({ reflectMetadata: 'on' });
      const controller = new VideosHttpController(makeDs(100));

      try {
        await controller.upload(makeReq('u1'), []);
        fail('should throw');
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.getResponse()).toMatchObject({
          statusCode: 400,
          message: 'videos is required',
        });
      }

      expect(uploadMock).not.toHaveBeenCalled();
    });

    it('upload: 400 quando files undefined (branch !files)', async () => {
      const { VideosHttpController } = bootWithEnv({ reflectMetadata: 'on' });
      const controller = new VideosHttpController(makeDs(100));

      try {
        await controller.upload(makeReq('u1'), undefined as any);
        fail('should throw');
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.getResponse()).toMatchObject({
          statusCode: 400,
          message: 'videos is required',
        });
      }

      expect(uploadMock).not.toHaveBeenCalled();
    });

    it('upload: mapeia files e valida validator (inclui caminho OK)', async () => {
      const { VideosHttpController, AppError } = bootWithEnv({
        reflectMetadata: 'on',
      });
      const controller = new VideosHttpController(makeDs(100));

      uploadMock.mockResolvedValue({ ok: true });

      const files = [
        makeFile({
          originalname: 'a.mp4',
          mimetype: 'video/mp4',
          size: 10,
          path: '/tmp/uploads/a.mp4',
        }),
        makeFile({
          originalname: 'b.mov',
          mimetype: 'video/quicktime',
          size: 20,
          path: '/tmp/uploads/b.mov',
        }),
      ];

      const result = await controller.upload(makeReq('u1'), files);

      expect(result).toEqual({ ok: true });
      expect(uploadMock).toHaveBeenCalledTimes(1);

      const [userId, mapped, validator] = uploadMock.mock.calls[0] as [
        string,
        Array<{
          originalFileName: string;
          contentType: string;
          size: number;
          tempFilePath: string;
        }>,
        (m: { originalFileName: string; contentType: string; size: number }) => void,
      ];

      expect(userId).toBe('u1');
      expect(mapped).toEqual([
        {
          originalFileName: 'a.mp4',
          contentType: 'video/mp4',
          size: 10,
          tempFilePath: '/tmp/uploads/a.mp4',
        },
        {
          originalFileName: 'b.mov',
          contentType: 'video/quicktime',
          size: 20,
          tempFilePath: '/tmp/uploads/b.mov',
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

    it('list: 400 quando userId ausente', async () => {
      const { VideosHttpController } = bootWithEnv({ reflectMetadata: 'on' });
      const controller = new VideosHttpController(makeDs(100));

      try {
        await controller.list(makeReq(undefined));
        fail('should throw');
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.getResponse()).toMatchObject({
          statusCode: 400,
          message: 'Missing user',
        });
      }

      expect(listMock).not.toHaveBeenCalled();
    });

    it('list: chama VideoController.list', async () => {
      const { VideosHttpController } = bootWithEnv({ reflectMetadata: 'on' });
      const controller = new VideosHttpController(makeDs(100));

      listMock.mockResolvedValue([{ id: 'v1' }]);

      const result = await controller.list(makeReq('u1'));

      expect(result).toEqual([{ id: 'v1' }]);
      expect(listMock).toHaveBeenCalledWith('u1');
    });

    it('downloadProcessedZip: 400 quando userId ausente', async () => {
      const { VideosHttpController } = bootWithEnv({ reflectMetadata: 'on' });
      const controller = new VideosHttpController(makeDs(100));

      try {
        await controller.downloadProcessedZip(makeReq(undefined), 'vid-1');
        fail('should throw');
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.getResponse()).toMatchObject({
          statusCode: 400,
          message: 'Missing user',
        });
      }

      expect(downloadZipMock).not.toHaveBeenCalled();
    });

    it('downloadProcessedZip: chama VideoController.downloadProcessedZip', async () => {
      const { VideosHttpController } = bootWithEnv({ reflectMetadata: 'on' });
      const controller = new VideosHttpController(makeDs(100));

      downloadZipMock.mockResolvedValue({ url: 'signed-url' });

      const result = await controller.downloadProcessedZip(
        makeReq('u1'),
        'vid-1',
      );

      expect(result).toEqual({ url: 'signed-url' });
      expect(downloadZipMock).toHaveBeenCalledWith('u1', 'vid-1');
    });
  });
});
