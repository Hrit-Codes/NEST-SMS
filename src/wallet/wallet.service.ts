import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
    constructor(private prisma:PrismaService){}

    async getBalance(userId:string){
        const wallet=await this.prisma.wallet.findUnique({
            where:{userId}
        });

        if(!wallet){
            throw new NotFoundException("Wallet not found");
        }

        return{
            balance:wallet.balance
        }
    }

    async topup(userId:string, amount:number){
        let wallet=await this.prisma.wallet.findUnique({
            where:{userId}
        })
        
        if(!wallet){
            throw new NotFoundException("Wallet not found");
        }

        wallet=await this.prisma.wallet.update({
            where:{userId},
            data:{
                balance:{
                    increment:amount
                }
            }
        });

        return{
            balance:wallet.balance
        }
    }
}
