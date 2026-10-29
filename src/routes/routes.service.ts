import { Injectable } from '@nestjs/common';
import { ProvidersService } from '../providers/providers.service';

@Injectable()
export class RoutesService {
    constructor (private providerService:ProvidersService){}

    async getHealth(){
        return this.providerService.getRouteHealth();
    }
}
