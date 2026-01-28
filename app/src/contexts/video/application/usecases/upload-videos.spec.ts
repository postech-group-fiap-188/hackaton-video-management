import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import pLimit from 'p-limit';

import { UploadVideos } from './upload-videos';
import type { VideoGateway } from '../gateways/video-gateway';
import type { VideoMetadata } from '../../domain/video-metadata';

const tmpFilePath = (name: string) =>
  path.join(os.tmpdir(), `${Date.now()}-${Math.random()}-${name}`);

// wrapper arrow para evitar "unbound-method" no eslint
const statFile = (p: string) => fs.stat(p);

function makeGateway(): jest.Mocked<VideoGateway> {
  const gateway: jest.Mocked<VideoGateway> = {
    createPending: jest.fn<
      ReturnType<VideoGateway['createPending']>,
      Parameters<VideoGateway['createPending']>
    >(),
    listByUserId: jest.fn<
      ReturnType<VideoGateway['listByUserId']>,
      Parameters<VideoGateway['listByUserId']>
    >(),
    findById: jest.fn<
      ReturnType<VideoGateway['findById']>,
      Parameters<VideoGateway['findById']>
    >(),
    updateStatus: jest.fn<
      ReturnType<VideoGateway['updateStatus']>,
      Parameters<VideoGateway['updateStatus']>
    >(),
    uploadMultipartFromPath: jest.fn<
      ReturnType<VideoGateway['uploadMultipartFromPath']>,
      Parameters<VideoGateway['uploadMultipartFromPath']>
    >(),
    presignGetObject: jest.fn<
      ReturnType<VideoGateway['presignGetObject']>,
      Parameters<VideoGateway['presignGetObject']>
    >(),
    publishProcessingEvent: jest.fn<
      ReturnType<VideoGateway['publishProcessingEvent']>,
      Parameters<VideoGateway['publishProcessingEvent']>
    >(),
  };

  return gateway;
}

describe('UploadVideos', () => {
  it('uploads + creates pending + enqueues and returns ok item', async () => {
    const gateway = makeGateway();

    gateway.createPending.mockImplementation((input) => {
      const meta: VideoMetadata = { ...input, status: 'PENDING' };
      return Promise.resolve(meta);
    });

    gateway.uploadMultipartFromPath.mockResolvedValue(undefined);
    gateway.publishProcessingEvent.mockResolvedValue(undefined);

    const filePath = tmpFilePath('video.mp4');
    await fs.writeFile(filePath, Buffer.from('abc'));

    const uc = new UploadVideos(gateway, {
      inputBucket: 'in-bucket',
      outputBucket: 'out-bucket',
      perRequestParallel: 1,
      globalLimiter: pLimit(999),
    });

    const res = await uc.execute({
      userId: 'u1',
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 3,
          tempFilePath: filePath,
        },
      ],
      validate: () => undefined,
    });

    expect(res.items).toHaveLength(1);

    const item = res.items[0];
    expect(item.ok).toBe(true);

    if (item.ok) {
      expect(item.status).toBe('PENDING');
      expect(item.videoId).toBeTruthy();
      expect(item.inputKey).toContain('u1-');
      expect(item.outputZipKey).toContain('-processed.zip');
    } else {
      throw new Error('expected ok=true');
    }

    expect(gateway.createPending).toHaveBeenCalledTimes(1);
    expect(gateway.uploadMultipartFromPath).toHaveBeenCalledTimes(1);
    expect(gateway.publishProcessingEvent).toHaveBeenCalledTimes(1);

    // evita unbound-method usando wrapper arrow
    await expect(statFile(filePath)).rejects.toBeTruthy();
  });

  it('returns error item when validate throws (no updateStatus because videoId not created yet)', async () => {
    const gateway = makeGateway();

    const filePath = tmpFilePath('bad.mp4');
    await fs.writeFile(filePath, Buffer.from('abc'));

    const uc = new UploadVideos(gateway, {
      inputBucket: 'in-bucket',
      outputBucket: 'out-bucket',
      perRequestParallel: 1,
      globalLimiter: pLimit(999),
    });

    const res = await uc.execute({
      userId: 'u1',
      files: [
        {
          originalFileName: 'bad.mp4',
          contentType: 'video/mp4',
          size: 3,
          tempFilePath: filePath,
        },
      ],
      validate: () => {
        throw new Error('invalid');
      },
    });

    expect(res.items).toHaveLength(1);

    const item = res.items[0];
    expect(item.ok).toBe(false);

    if (!item.ok) {
      expect(item.originalFileName).toBe('bad.mp4');
      expect(item.errorMessage).toBe('invalid');
      expect(item.status).toBe('ERROR');
      expect(item.videoId).toBeUndefined();
    } else {
      throw new Error('expected ok=false');
    }

    expect(gateway.updateStatus).not.toHaveBeenCalled();

    await expect(statFile(filePath)).rejects.toBeTruthy();
  });

  it('updates status when upload throws after pending created', async () => {
    const gateway = makeGateway();

    gateway.createPending.mockImplementation((input) => {
      const meta: VideoMetadata = { ...input, status: 'PENDING' };
      return Promise.resolve(meta);
    });

    gateway.uploadMultipartFromPath.mockRejectedValueOnce(new Error('s3_down'));
    gateway.updateStatus.mockResolvedValue(true);

    const filePath = tmpFilePath('video.mp4');
    await fs.writeFile(filePath, Buffer.from('abc'));

    const uc = new UploadVideos(gateway, {
      inputBucket: 'in-bucket',
      outputBucket: 'out-bucket',
      perRequestParallel: 1,
      globalLimiter: pLimit(999),
    });

    const res = await uc.execute({
      userId: 'u1',
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 3,
          tempFilePath: filePath,
        },
      ],
      validate: () => undefined,
    });

    expect(res.items).toHaveLength(1);

    const item = res.items[0];
    expect(item.ok).toBe(false);

    if (!item.ok) {
      expect(item.status).toBe('ERROR');
      expect(item.errorMessage).toBe('s3_down');
      expect(item.videoId).toBeTruthy();
    } else {
      throw new Error('expected ok=false');
    }

    expect(gateway.createPending).toHaveBeenCalledTimes(1);
    expect(gateway.updateStatus).toHaveBeenCalledTimes(1);

    const call = gateway.updateStatus.mock.calls[0]?.[0];
    expect(call?.status).toBe('ERROR');
    expect(call?.errorMessage).toBe('s3_down');

    await expect(statFile(filePath)).rejects.toBeTruthy();
  });

  it('swallows updateStatus errors if it fails in catch (does not throw)', async () => {
    const gateway = makeGateway();

    gateway.createPending.mockImplementation((input) => {
      const meta: VideoMetadata = { ...input, status: 'PENDING' };
      return Promise.resolve(meta);
    });

    gateway.uploadMultipartFromPath.mockRejectedValueOnce(new Error('boom'));
    gateway.updateStatus.mockRejectedValueOnce(new Error('mongo_down'));

    const filePath = tmpFilePath('video.mp4');
    await fs.writeFile(filePath, Buffer.from('abc'));

    const uc = new UploadVideos(gateway, {
      inputBucket: 'in-bucket',
      outputBucket: 'out-bucket',
      perRequestParallel: 1,
      globalLimiter: pLimit(999),
    });

    const res = await uc.execute({
      userId: 'u1',
      files: [
        {
          originalFileName: 'video.mp4',
          contentType: 'video/mp4',
          size: 3,
          tempFilePath: filePath,
        },
      ],
      validate: () => undefined,
    });

    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.ok).toBe(false);

    await expect(statFile(filePath)).rejects.toBeTruthy();
  });
});
