import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { RoutesService } from './routes.service';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get("health")
  @HttpCode(HttpStatus.OK)
  async getHealth(){
    return this.routesService.getHealth();
  }
}
