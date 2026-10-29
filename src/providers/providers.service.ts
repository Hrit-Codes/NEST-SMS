import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProvidersService {
    constructor(private prisma:PrismaService){}

    async getProvidersByPriority(){
        return this.prisma.provider.findMany({
            orderBy:{priority:"asc"}
        })
    }

    async trySendWithProvider(provider:any, to:string, body:string){
        const shouldFail=Math.random()<provider.failureRate;

        if(shouldFail){
            throw new Error(`Provider ${provider.name} failed to send`);
        }

        return{
            success:true,
            providerId:provider.id
        }
    }

    async send(provider:{id:string; name:string; failureRate:number}, message:{to:string; body:string}){
        try{
            await this.trySendWithProvider(provider, message.to, message.body);
            return { success:true };
        }catch(error){
            return {
                success:false,
                error:error instanceof Error? error.message:`Provider ${provider.name} failed to send`,
            };
        }
    }

    async getRouteHealth(){
        const providers=await this.prisma.provider.findMany({
            include:{
                attempts:{
                    take:100,
                    orderBy:{createdAt:"desc"}
                }
            }
        });

        return providers.map((provider)=>{
            const recentAttempts=provider.attempts;
            const totalAttempts=recentAttempts.length;
            const successfulAttempts=recentAttempts.filter((a)=>a.success).length;
            const successRate=totalAttempts>0?successfulAttempts/totalAttempts:1;
            const healthScore=(provider.balance/provider.maxBalance)*100*(1-provider.failureRate);

            return{
                provider:provider.name,
                priority:provider.priority,
                balance:provider.balance,
                maxBalance:provider.maxBalance,
                failureRate:provider.failureRate,
                recentSuccessRate:successRate,
                healthScore:Math.round(healthScore*100)/100
            }
        })
    }
}
