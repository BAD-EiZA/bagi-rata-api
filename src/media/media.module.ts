import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [GroupsModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
