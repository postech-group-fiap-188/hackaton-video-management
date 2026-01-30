import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VideoMetadata } from 'src/video/domain/video-metadata';
import { VideoModel } from '../schemas/video.schema';
import { UserContext } from 'src/video/domain/entities/user-context';
import { VideoStatus } from 'src/video/domain/enums/video-status';

type VideoLean = {
  id: string;
  userId: string;
  inputBucket: string;
  inputKey: string;
  originalFileName: string;
  contentType: string;
  size: number;
  status: VideoStatus;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
};

export class MongooseVideoRepositoryAdapter {
  constructor(
    @InjectModel(VideoModel.name) private readonly model: Model<VideoModel>,
  ) {}

  async createPending(
    input: Omit<VideoMetadata, 'status'>,
  ): Promise<VideoMetadata> {
    const { user, ...rest } = input;

    const doc = await this.model.create({
      ...rest,
      userId: user.id,
      status: VideoStatus.PENDING,
    });

    return toDomain(doc.toObject() as VideoLean);
  }

  async listByUserId(userId: string): Promise<VideoMetadata[]> {
    const docs = await this.model
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean<VideoLean[]>();

    return docs.map(toDomain);
  }

  async findById(videoId: string): Promise<VideoMetadata | null> {
    const doc = await this.model
      .findOne({ id: videoId })
      .lean<VideoLean | null>();
    return doc ? toDomain(doc) : null;
  }

  async updateStatus(input: {
    videoId: string;
    status: VideoStatus;
    errorMessage?: string;
  }): Promise<boolean> {
    const res = await this.model.updateOne(
      { id: input.videoId },
      { $set: { status: input.status, errorMessage: input.errorMessage } },
    );
    return res.matchedCount === 1;
  }
}

function toDomain(d: VideoLean): VideoMetadata {
  return {
    id: d.id,
    user: UserContext.create({ id: d.userId }),

    inputBucket: d.inputBucket,
    inputKey: d.inputKey,

    originalFileName: d.originalFileName,
    contentType: d.contentType,
    size: d.size,

    status: d.status,
    errorMessage: d.errorMessage,

    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}
