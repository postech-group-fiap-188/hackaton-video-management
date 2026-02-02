import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VideoModel } from '../schemas/video.schema';
import { VideoStatus } from 'src/domain/enums/video-status';

import {
  VideoRepositoryDataSource,
  VideoRecord,
  VideoStatusRecord,
} from 'src/interfaces/video-repository-data-source';

type VideoLean = VideoRecord;

export class MongooseVideoRepositoryAdapter extends VideoRepositoryDataSource {
  constructor(
    @InjectModel(VideoModel.name)
    private readonly model: Model<VideoModel>,
  ) {
    super();
  }

  async createVideoMetaData(
    input: Omit<VideoRecord, 'status'>,
  ): Promise<VideoRecord> {
    const doc = await this.model.create({
      ...input,
      status: VideoStatus.PENDING,
    });

    return toRecord(doc.toObject() as VideoLean);
  }

  async listByUserId(userId: string): Promise<VideoRecord[]> {
    const docs = await this.model
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean<VideoLean[]>();

    return docs.map(toRecord);
  }

  async findById(videoId: string): Promise<VideoRecord | null> {
    const doc = await this.model
      .findOne({ id: videoId })
      .lean<VideoLean | null>();
    return doc ? toRecord(doc) : null;
  }

  async updateStatus(input: {
    videoId: string;
    status: VideoStatusRecord;
    errorMessage?: string;
  }): Promise<boolean> {
    const res = await this.model.updateOne(
      { id: input.videoId },
      {
        $set: {
          status: input.status as unknown as VideoStatus,
          errorMessage: input.errorMessage,
        },
      },
    );

    return res.matchedCount === 1;
  }
}

function toRecord(d: VideoLean): VideoRecord {
  return {
    id: d.id,
    userId: d.userId,

    inputBucket: d.inputBucket,
    inputKey: d.inputKey,

    originalFileName: d.originalFileName,
    contentType: d.contentType,
    size: d.size,

    status: d.status as unknown as VideoStatusRecord,
    errorMessage: d.errorMessage,

    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}
