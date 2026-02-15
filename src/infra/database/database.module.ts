import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { VideoModel, VideoSchema } from './mongoose/schemas/video.schema';
import { MongooseVideoRepositoryAdapter } from './mongoose/repositories/video-repository.adapter';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('MONGO_URI');
        const dbName = config.get<string>('MONGO_DB_COLLECTION');
        if (!uri || !dbName) throw new Error('Missing Mongo env vars');
        return { uri, dbName };
      },
    }),
    MongooseModule.forFeature([{ name: VideoModel.name, schema: VideoSchema }]),
  ],
  providers: [MongooseVideoRepositoryAdapter],
  exports: [MongooseVideoRepositoryAdapter],
})
export class DatabaseModule {}
