import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { SmsController } from './sms.controller';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports:[ProvidersModule],
  controllers: [SmsController],
  providers: [SmsService],
})
export class SmsModule {}
