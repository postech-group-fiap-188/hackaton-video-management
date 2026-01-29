import { MongooseVideoRepositoryAdapter } from './video-repository.adapter';
import type { Model } from 'mongoose';
import { UserContext } from 'src/contexts/video/domain/value-objects/user-context';

type VideoLean = {
  id: string;
  userId: string;
  inputBucket: string;
  inputKey: string;
  originalFileName: string;
  contentType: string;
  size: number;
  status: 'PENDING' | 'SUCCEEDED' | 'ERROR';
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
};

function makeLean(overrides: Partial<VideoLean> = {}): VideoLean {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: overrides.id ?? 'v1',
    userId: overrides.userId ?? 'u1',
    inputBucket: overrides.inputBucket ?? 'in-bucket',
    inputKey: overrides.inputKey ?? 'in-key',
    originalFileName: overrides.originalFileName ?? 'video.mp4',
    contentType: overrides.contentType ?? 'video/mp4',
    size: overrides.size ?? 123,
    status: overrides.status ?? 'PENDING',
    errorMessage: overrides.errorMessage,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

const makeUser = (id = 'u1') => UserContext.create({ id });

describe('MongooseVideoRepositoryAdapter', () => {
  const createMock = jest.fn();
  const findMock = jest.fn();
  const findOneMock = jest.fn();
  const updateOneMock = jest.fn();

  const sortMock = jest.fn();
  const leanMock = jest.fn();

  let model: Partial<Model<any>>;
  let repo: MongooseVideoRepositoryAdapter;

  beforeEach(() => {
    jest.clearAllMocks();

    leanMock.mockReset();
    sortMock.mockReset().mockReturnValue({ lean: leanMock });

    findMock.mockReset().mockReturnValue({ sort: sortMock });

    model = {
      create: createMock,
      find: findMock as any,
      findOne: findOneMock as any,
      updateOne: updateOneMock as any,
    };

    repo = new MongooseVideoRepositoryAdapter(model as Model<any>);
  });

  it('createPending: cria doc com status PENDING + userId (do VO) e retorna domínio com user VO', async () => {
    const lean = makeLean({ status: 'PENDING' });

    const toObject = jest.fn().mockReturnValue(lean);
    createMock.mockResolvedValue({ toObject });

    const result = await repo.createPending({
      id: 'v1',
      user: makeUser('u1'),
      inputBucket: 'in-bucket',
      inputKey: 'in-key',
      originalFileName: 'video.mp4',
      contentType: 'video/mp4',
      size: 123,
      errorMessage: undefined,
      createdAt: lean.createdAt,
      updatedAt: lean.updatedAt,
    } as any);

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'v1',
        userId: 'u1',
        status: 'PENDING',
      }),
    );
    expect(toObject).toHaveBeenCalled();

    expect(result.id).toBe('v1');
    expect(result.user.id).toBe('u1');
    expect(result.status).toBe('PENDING');
    expect(result.inputBucket).toBe('in-bucket');
    expect(result.inputKey).toBe('in-key');
  });

  it('listByUserId: busca, ordena e mapeia para domínio com user VO', async () => {
    const docs = [makeLean({ id: 'v1' }), makeLean({ id: 'v2' })];
    leanMock.mockResolvedValue(docs);

    const result = await repo.listByUserId('u1');

    expect(findMock).toHaveBeenCalledWith({ userId: 'u1' });
    expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
    expect(leanMock).toHaveBeenCalled();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('v1');
    expect(result[0].user.id).toBe('u1');
    expect(result[1].id).toBe('v2');
    expect(result[1].user.id).toBe('u1');
  });

  it('findById: retorna domínio quando encontrar (branch doc true)', async () => {
    const found = makeLean({ id: 'v1', userId: 'u1' });

    const lean = jest.fn().mockResolvedValue(found);
    findOneMock.mockReturnValue({ lean });

    const result = await repo.findById('v1');

    expect(findOneMock).toHaveBeenCalledWith({ id: 'v1' });
    expect(lean).toHaveBeenCalled();

    expect(result).not.toBeNull();
    expect(result!.id).toBe('v1');
    expect(result!.user.id).toBe('u1');
  });

  it('findById: retorna null quando não encontrar (branch doc false)', async () => {
    const lean = jest.fn().mockResolvedValue(null);
    findOneMock.mockReturnValue({ lean });

    const result = await repo.findById('missing');

    expect(findOneMock).toHaveBeenCalledWith({ id: 'missing' });
    expect(lean).toHaveBeenCalled();

    expect(result).toBeNull();
  });

  it('updateStatus: retorna true quando matchedCount === 1', async () => {
    updateOneMock.mockResolvedValue({ matchedCount: 1 });

    const ok = await repo.updateStatus({
      videoId: 'v1',
      status: 'SUCCEEDED',
    });

    expect(updateOneMock).toHaveBeenCalledWith(
      { id: 'v1' },
      { $set: { status: 'SUCCEEDED', errorMessage: undefined } },
    );
    expect(ok).toBe(true);
  });

  it('updateStatus: retorna false quando matchedCount !== 1', async () => {
    updateOneMock.mockResolvedValue({ matchedCount: 0 });

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
