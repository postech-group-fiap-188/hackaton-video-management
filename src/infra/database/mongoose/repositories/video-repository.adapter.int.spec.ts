import { MongooseVideoRepositoryAdapter } from './video-repository.adapter';
import type { Model } from 'mongoose';
import type {
  VideoRecord,
  VideoStatusRecord,
} from 'src/interfaces/video-repository-data-source';

describe('MongooseVideoRepositoryAdapter', () => {
  let model: any;
  let repo: MongooseVideoRepositoryAdapter;

  const createMock = jest.fn();
  const findMock = jest.fn();
  const sortMock = jest.fn();
  const leanMock = jest.fn();
  const findOneMock = jest.fn();
  const updateOneMock = jest.fn();

  const now = new Date('2026-01-30T12:00:00.000Z');

  const makeRecord = (overrides: Partial<VideoRecord> = {}): VideoRecord => ({
    id: overrides.id ?? 'v1',
    userId: overrides.userId ?? 'u1',
    inputBucket: overrides.inputBucket ?? 'in-bucket',
    inputKey: overrides.inputKey ?? 'u1-v1-source.mp4',
    originalFileName: overrides.originalFileName ?? 'video.mp4',
    contentType: overrides.contentType ?? 'video/mp4',
    size: overrides.size ?? 123,
    status: overrides.status ?? 'PENDING',
    errorMessage: overrides.errorMessage,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  });

  beforeEach(() => {
    jest.resetAllMocks();

    sortMock.mockReset().mockReturnValue({ lean: leanMock });
    findMock.mockReset().mockReturnValue({ sort: sortMock });
    findOneMock.mockReset().mockReturnValue({ lean: leanMock });

    model = {
      create: createMock,
      find: findMock,
      findOne: findOneMock,
      updateOne: updateOneMock,
    };

    repo = new MongooseVideoRepositoryAdapter(model as unknown as Model<any>);
  });

  it('createPending: cria doc com status PENDING e retorna VideoRecord', async () => {
    const input: Omit<VideoRecord, 'status'> = {
      id: 'v1',
      userId: 'u1',
      inputBucket: 'in-bucket',
      inputKey: 'u1-v1-source.mp4',
      originalFileName: 'video.mp4',
      contentType: 'video/mp4',
      size: 123,
      errorMessage: undefined,
      createdAt: now,
      updatedAt: now,
    };

    createMock.mockResolvedValueOnce({
      toObject: () => ({ ...input, status: 'PENDING' as VideoStatusRecord }),
    });

    const result = await repo.createVideoMetaData(input);

    expect(createMock).toHaveBeenCalledWith({ ...input, status: 'PENDING' });
    expect(result.userId).toBe('u1');
    expect(result.status).toBe('PENDING');
  });

  it('listByUserId: retorna lista ordenada por createdAt desc', async () => {
    const docs = [makeRecord({ id: 'v1' }), makeRecord({ id: 'v2' })];

    leanMock.mockResolvedValueOnce(docs);

    const result = await repo.listByUserId('u1');

    expect(findMock).toHaveBeenCalledWith({ userId: 'u1' });
    expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });

    expect(result).toHaveLength(2);
    expect(result[0].userId).toBe('u1');
    expect(result[1].userId).toBe('u1');
  });

  it('findById: retorna null quando não existe', async () => {
    leanMock.mockResolvedValueOnce(null);

    const result = await repo.findById('v1');

    expect(findOneMock).toHaveBeenCalledWith({ id: 'v1' });
    expect(result).toBeNull();
  });

  it('findById: retorna VideoRecord quando existe', async () => {
    const doc = makeRecord({ id: 'v1' });
    leanMock.mockResolvedValueOnce(doc);

    const result = await repo.findById('v1');

    expect(findOneMock).toHaveBeenCalledWith({ id: 'v1' });
    expect(result?.id).toBe('v1');
    expect(result?.userId).toBe('u1');
  });

  it('updateStatus: retorna true quando encontrou e atualizou', async () => {
    updateOneMock.mockResolvedValueOnce({ matchedCount: 1 });

    const ok = await repo.updateStatus({
      videoId: 'v1',
      status: 'SUCCEEDED',
      errorMessage: undefined,
    });

    expect(updateOneMock).toHaveBeenCalledWith(
      { id: 'v1' },
      { $set: { status: 'SUCCEEDED', errorMessage: undefined } },
    );
    expect(ok).toBe(true);
  });

  it('updateStatus: retorna false quando não encontrou', async () => {
    updateOneMock.mockResolvedValueOnce({ matchedCount: 0 });

    const ok = await repo.updateStatus({
      videoId: 'v1',
      status: 'ERROR',
      errorMessage: 'boom',
    });

    expect(updateOneMock).toHaveBeenCalledWith(
      { id: 'v1' },
      { $set: { status: 'ERROR', errorMessage: 'boom' } },
    );
    expect(ok).toBe(false);
  });
});
