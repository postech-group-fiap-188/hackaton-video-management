import { randomUUID } from 'node:crypto';
import { User } from './user-context';
import { VideoStatus } from '../enums/video-status';

export class Video {
  private readonly _id: string;

  constructor(
    readonly user: User,

    readonly inputBucket: string,
    readonly inputKey: string,

    readonly originalFileName: string,
    readonly contentType: string,
    readonly size: number,

    readonly status: VideoStatus,
    readonly errorMessage: string | undefined,

    readonly createdAt: Date,
    readonly updatedAt: Date,

    id?: string,
  ) {
    this._id = id ?? randomUUID();
  }

  get id(): string {
    return this._id;
  }
}
