import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SmsService } from './sms.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { SendSmsDto } from './dto/send-sms.dto';
import { QueryLogsDto } from './dto/query-logs.dto';

@Controller('sms')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Post("send")
  @HttpCode(HttpStatus.CREATED)
  async sendSms(@GetUser("id") id:string, @Body() dto:SendSmsDto){
    return this.smsService.sendSms(id, dto.to, dto.body);
  }

  @Get("logs")
  @HttpCode(HttpStatus.OK)
  async getLogs(
    @GetUser("id") id:string,
    @Query() query:QueryLogsDto
  ){
    return this.smsService.getLogs(id, query)
  }

  @Get("messages/:id")
  @HttpCode(HttpStatus.OK)
  async getMessage(
    @GetUser('id') userId:string,
    @Param("id") id:string
  ){
    return this.smsService.getMessage(userId, id);
  }
}
