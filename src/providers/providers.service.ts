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

    async getRouteHealth() {
    // Calculate the timestamp for 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const providers = await this.prisma.provider.findMany({
        include: {
        attempts: {
            where: {
            createdAt: { gte: twentyFourHoursAgo }, 
            },
        },
        },
    });

    return providers.map((provider) => {
        const recentAttempts = provider.attempts;
        const totalAttempts = recentAttempts.length;
        const successfulAttempts = recentAttempts.filter((a) => a.success).length;
        
        const actualSuccessRate = totalAttempts > 0 ? successfulAttempts / totalAttempts : 1;
        
        // Balance score: 0.0 to 1.0
        const balanceScore = provider.balance / provider.maxBalance;

        // We multiply by 100 to get a percentage
        const healthScore = ((actualSuccessRate * 0.7) + (balanceScore * 0.3)) * 100;

        return {
        provider: provider.name,
        priority: provider.priority,
        balance: provider.balance,
        maxBalance: provider.maxBalance,
        failureRateConfig: provider.failureRate, 
        attemptsLast24h: totalAttempts,
        recentSuccessRate: Math.round(actualSuccessRate * 10000) / 100, 
        healthScore: Math.round(healthScore * 100) / 100,
        };
    });
    }
}
