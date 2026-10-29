import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { TopupDto } from './dto/topup.dto';

@Controller('wallet')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get("balance")
  @HttpCode(HttpStatus.OK)
  async getBalance(@GetUser("id") id:string){
    return this.walletService.getBalance(id);
  }

  @Post("topup")
  @HttpCode(HttpStatus.CREATED)
  async topup(@GetUser("id") id:string, @Body() dto:TopupDto){
    return this.walletService.topup(id, dto.amount)
  }

}
