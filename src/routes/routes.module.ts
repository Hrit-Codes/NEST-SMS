import { Module } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { RoutesController } from './routes.controller';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports:[ProvidersModule],
  controllers: [RoutesController],
  providers: [RoutesService],
})
export class RoutesModule {}
