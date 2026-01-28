import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'videos', timestamps: true })
export class VideoModel {
  @Prop({ required: true, unique: true })
  id!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true })
  inputBucket!: string;

  @Prop({ required: true })
  inputKey!: string;

  @Prop({ required: true })
  originalFileName!: string;

  @Prop({ required: true })
  contentType!: string;

  @Prop({ required: true })
  size!: number;

  @Prop({ required: true, enum: ['PENDING', 'SUCCEEDED', 'ERROR'] })
  status!: 'PENDING' | 'SUCCEEDED' | 'ERROR';

  @Prop()
  errorMessage?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const VideoSchema = SchemaFactory.createForClass(VideoModel);
VideoSchema.index({ userId: 1, createdAt: -1 });
