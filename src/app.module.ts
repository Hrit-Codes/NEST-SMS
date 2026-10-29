import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WalletModule } from './wallet/wallet.module';
import { ProvidersModule } from './providers/providers.module';
import { SmsModule } from './sms/sms.module';
import { RoutesModule } from './routes/routes.module';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 60 }],
      getTracker: (req) => req.user?.id ?? req.ip ?? 'unknown',
      generateKey: (_context, tracker, name) => `${name}:${tracker}`,
    }),
    PrismaModule,
    AuthModule,
    WalletModule,
    ProvidersModule,
    SmsModule,
    RoutesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
