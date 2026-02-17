jest.mock('node:crypto', () => ({ randomUUID: jest.fn() }));

import { randomUUID } from 'node:crypto';

import { GetPresignedUploadUrls } from './get-presigned-upload-urls';
import type { VideoGateway } from '../gateways/video-gateway';

type GatewayMock = {
  createVideoMetaData: jest.Mock;
  presignPutObject: jest.Mock;
};

const makeGateway = (): GatewayMock => ({
  createVideoMetaData: jest.fn(),
  presignPutObject: jest.fn(),
});

const makeLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe('GetPresignedUploadUrls', () => {
  const randomUUIDMock = randomUUID as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty items when files array is empty', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    const usecase = new GetPresignedUploadUrls(
      gateway as unknown as VideoGateway,
      { inputBucket: 'in-bucket', outputBucket: 'out-bucket' },
      logger as never,
    );

    const res = await usecase.execute({
      user: { id: 'u1', email: 'u1@mail.com' },
      files: [],
    });

    expect(res.items).toEqual([]);
    expect(gateway.createVideoMetaData).not.toHaveBeenCalled();
    expect(gateway.presignPutObject).not.toHaveBeenCalled();
  });

  it('validates and returns one presigned item', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    randomUUIDMock.mockReturnValueOnce('vid-1');
    gateway.createVideoMetaData.mockResolvedValue(undefined);
    gateway.presignPutObject.mockResolvedValue('https://s3.example.com/signed');

    const usecase = new GetPresignedUploadUrls(
      gateway as unknown as VideoGateway,
      { inputBucket: 'in-bucket', outputBucket: 'out-bucket' },
      logger as never,
    );

    const res = await usecase.execute({
      user: { id: 'u1', email: 'u1@mail.com', name: 'Test User' },
      files: [
        { originalFileName: 'video.mp4', contentType: 'video/mp4' },
      ],
    });

    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toEqual({
      videoId: 'vid-1',
      uploadUrl: 'https://s3.example.com/signed',
      expiresIn: 300,
      inputKey: 'u1-vid-1-source.mp4',
      outputZipKey: 'u1-vid-1-processed.zip',
      user: { id: 'u1', email: 'u1@mail.com', name: 'Test User' },
    });

    expect(gateway.createVideoMetaData).toHaveBeenCalledTimes(1);
    const createdVideo = gateway.createVideoMetaData.mock.calls[0][0];
    expect(createdVideo.id).toBe('vid-1');
    expect(createdVideo.user.id).toBe('u1');
    expect(createdVideo.inputKey).toBe('u1-vid-1-source.mp4');
    expect(createdVideo.size).toBe(0);
    expect(createdVideo.status).toBe('PENDING');

    expect(gateway.presignPutObject).toHaveBeenCalledWith({
      bucket: 'in-bucket',
      key: 'u1-vid-1-source.mp4',
      contentType: 'video/mp4',
      expiresInSeconds: 300,
      metadata: {
        'user-id': 'u1',
        'user-email': 'u1@mail.com',
        'user-name': 'Test User',
        'output-zip-key': 'u1-vid-1-processed.zip',
        'video-id': 'vid-1',
      },
    });
  });

  it('processes multiple files and returns presigned URLs for each', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    randomUUIDMock
      .mockReturnValueOnce('vid-1')
      .mockReturnValueOnce('vid-2');
    gateway.createVideoMetaData.mockResolvedValue(undefined);
    gateway.presignPutObject
      .mockResolvedValueOnce('https://s3.example.com/signed1')
      .mockResolvedValueOnce('https://s3.example.com/signed2');

    const usecase = new GetPresignedUploadUrls(
      gateway as unknown as VideoGateway,
      { inputBucket: 'in-bucket', outputBucket: 'out-bucket' },
      logger as never,
    );

    const res = await usecase.execute({
      user: { id: 'u1', email: 'u1@mail.com' },
      files: [
        { originalFileName: 'a.mp4', contentType: 'video/mp4' },
        { originalFileName: 'b.mov', contentType: 'video/quicktime' },
      ],
    });

    expect(res.items).toHaveLength(2);
    expect(res.items[0].videoId).toBe('vid-1');
    expect(res.items[0].inputKey).toBe('u1-vid-1-source.mp4');
    expect(res.items[0].uploadUrl).toBe('https://s3.example.com/signed1');
    expect(res.items[0].user).toEqual({ id: 'u1', email: 'u1@mail.com', name: undefined });
    expect(res.items[1].videoId).toBe('vid-2');
    expect(res.items[1].inputKey).toBe('u1-vid-2-source.mov');
    expect(res.items[1].uploadUrl).toBe('https://s3.example.com/signed2');
    expect(res.items[1].user).toEqual({ id: 'u1', email: 'u1@mail.com', name: undefined });

    expect(gateway.createVideoMetaData).toHaveBeenCalledTimes(2);
    expect(gateway.presignPutObject).toHaveBeenCalledTimes(2);
  });

  it('throws on invalid extension before creating any record', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    const usecase = new GetPresignedUploadUrls(
      gateway as unknown as VideoGateway,
      { inputBucket: 'in-bucket', outputBucket: 'out-bucket' },
      logger as never,
    );

    await expect(
      usecase.execute({
        user: { id: 'u1', email: 'u1@mail.com' },
        files: [
          { originalFileName: 'video.exe', contentType: 'video/mp4' },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_VIDEO_EXTENSION',
      statusCode: 400,
    });

    expect(gateway.createVideoMetaData).not.toHaveBeenCalled();
    expect(gateway.presignPutObject).not.toHaveBeenCalled();
  });

  it('throws on invalid contentType before creating any record', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    const usecase = new GetPresignedUploadUrls(
      gateway as unknown as VideoGateway,
      { inputBucket: 'in-bucket', outputBucket: 'out-bucket' },
      logger as never,
    );

    await expect(
      usecase.execute({
        user: { id: 'u1', email: 'u1@mail.com' },
        files: [
          { originalFileName: 'video.mp4', contentType: 'application/json' },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_VIDEO_MIMETYPE',
      statusCode: 400,
    });

    expect(gateway.createVideoMetaData).not.toHaveBeenCalled();
    expect(gateway.presignPutObject).not.toHaveBeenCalled();
  });

  it('validates all files first and throws on second invalid without creating', async () => {
    const gateway = makeGateway();
    const logger = makeLogger();

    const usecase = new GetPresignedUploadUrls(
      gateway as unknown as VideoGateway,
      { inputBucket: 'in-bucket', outputBucket: 'out-bucket' },
      logger as never,
    );

    await expect(
      usecase.execute({
        user: { id: 'u1', email: 'u1@mail.com' },
        files: [
          { originalFileName: 'a.mp4', contentType: 'video/mp4' },
          { originalFileName: 'b.txt', contentType: 'text/plain' },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_VIDEO_EXTENSION',
      statusCode: 400,
    });

    expect(gateway.createVideoMetaData).not.toHaveBeenCalled();
  });
});
