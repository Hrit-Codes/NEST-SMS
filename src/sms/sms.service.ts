import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProvidersService } from '../providers/providers.service';
import { normalizePhone } from '../common/helpers/phone.helper';
import { MessageStatus, Prisma, type Message } from '@prisma/client';
import { countSmsParts } from '../common/helpers/sms-counter.helper';
import { QueryLogsDto } from './dto/query-logs.dto';

@Injectable()
export class SmsService {
    constructor(
        private prisma:PrismaService,
        private providersService:ProvidersService
    ){}

    private normalizeAll(to:string[]){
        const numbers:string[]=[];
        const invalid:string[]=[];

        for(const recipient of to){
            try{
                numbers.push(normalizePhone(recipient));
            }catch{
                invalid.push(String(recipient));
            }
        }

        if(invalid.length>0){
            throw new BadRequestException(`Invalid phone number(s): ${invalid.join(', ')}`);
        }

        return numbers;
    }

    async sendSms(userId:string, to:string | string[], body:string){
        const recipients=Array.isArray(to)? to:[to];

        if(recipients.length===0){
            throw new BadRequestException("At least one recipient is required");
        }

        const numbers=this.normalizeAll(recipients);
        const { encoding, parts }= countSmsParts(body);
        const totalCost=parts*numbers.length;

        const msgs=await this.prisma.$transaction(async(tx)=>{
            const r=await tx.wallet.updateMany({
                where:{userId, balance:{gte:totalCost}},
                data:{balance:{decrement:totalCost}},
            });

            if(r.count===0){
                throw new BadRequestException("Insufficient credits");
            }

            return tx.message.createManyAndReturn({
                data:numbers.map((n)=>({userId, to:n, body, encoding, parts, cost:parts})),
            });
        });

        const results=[];
        for(const m of msgs){
            results.push(await this.deliver(m));
        }

        return { totalCost, messages: results };
    }

    private async deliver(msg:Message){
        const providers=await this.prisma.provider.findMany({
            where:{isActive:true, balance:{gte:msg.parts}},
            orderBy:{priority:"asc"},
        });

        for(const p of providers){
            const reserved=await this.prisma.provider.updateMany({
                where:{id:p.id, isActive:true, balance:{gte:msg.parts}},
                data:{balance:{decrement:msg.parts}},
            });

            if(reserved.count===0){
                continue;
            }

            let res:{success:boolean; error?:string};
            try{
                res=await this.providersService.send(p, msg);
            }catch(error){
                res={
                    success:false,
                    error:error instanceof Error? error.message:`Provider ${p.name} failed`,
                };
            }

            if(!res.success){
                await this.prisma.$transaction([
                    this.prisma.provider.update({
                        where:{id:p.id},
                        data:{balance:{increment:msg.parts}},
                    }),
                    this.prisma.providerAttempt.create({
                        data:{
                            messageId:msg.id,
                            providerId:p.id,
                            success:false,
                            errorReason:res.error??`Provider ${p.name} failed`,
                        },
                    }),
                ]);
                continue;
            }

            await this.prisma.providerAttempt.create({
                data:{
                    messageId:msg.id,
                    providerId:p.id,
                    success:true,
                    errorReason:null,
                },
            });

            return this.prisma.message.update({
                where:{id:msg.id},
                data:{status:"SENT", providerId:p.id},
            });
        }

        return this.refund(msg);
    }

    private refund(msg:Message){
        return this.prisma.$transaction(async(tx)=>{
            const r=await tx.message.updateMany({
                where:{id:msg.id, status:"PENDING", refunded:false},
                data:{status:"FAILED", refunded:true},
            });

            if(r.count===1){
                await tx.wallet.update({
                    where:{userId:msg.userId},
                    data:{balance:{increment:msg.cost}},
                });
            }

            return tx.message.findUniqueOrThrow({where:{id:msg.id}});
        });
    }

    async getLogs(userId:string, query:QueryLogsDto){
        const page=query.page ?? 1;
        const limit=query.limit ?? 20;
        const skip=(page-1)*limit;

        const where:Prisma.MessageWhereInput={
            userId,
            ...(query.status && { status: query.status.toUpperCase() as MessageStatus }),
            ...(query.number && { to: normalizePhone(query.number) }),
            ...((query.dateFrom || query.dateTo) && {
                createdAt: {
                    ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
                    ...(query.dateTo && { lte: new Date(query.dateTo) }),
                },
            }),
        };

        const [messages,total]=await Promise.all([
            this.prisma.message.findMany({
                where,
                skip,
                take:limit,
                orderBy:{createdAt:"desc"},
                include:{
                    attempts:{
                        include:{
                            provider:true
                        }
                    }
                }
            }),
            this.prisma.message.count({
                where
            })
        ])

        return{
            messages,
            pagination:{
                page,
                limit,
                total,
                pages:Math.ceil(total/limit)
            }
        }
    }

    async getMessage(userId:string,messageId:string){
        const message=await this.prisma.message.findUnique({
            where:{
                id:messageId,
                userId
            },
            include:{
                attempts:{
                    include:{
                        provider:true
                    }
                }
            }
        });

        if(!message){
            throw new NotFoundException("Message not found");
        }

        return message;
    }
}
