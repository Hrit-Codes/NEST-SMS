import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const adapter=new PrismaPg({connectionString:process.env.DATABASE_URL});
const prisma=new PrismaClient({adapter})

async function main(){
    
    const providers = [
        {
        name: 'ROUTE_A',
        priority: 1,           // Highest priority (tried first)
        balance: 1000,
        maxBalance: 1000,
        failureRate: 0.30,     // 30% chance of failure
        isActive: true,
        },
        {
        name: 'ROUTE_B',
        priority: 2,           // Fallback
        balance: 500,
        maxBalance: 500,
        failureRate: 0.10,     // 10% chance of failure
        isActive: true,
        },
        {
        name: 'ROUTE_C',
        priority: 3,           // Last resort
        balance: 100,
        maxBalance: 200,
        failureRate: 0.50,     // 50% chance of failure
        isActive: true,
        },
    ];

    for(const provider of providers){
        await prisma.provider.upsert({
            where:{name:provider.name},
            update:provider,
            create:provider
        })
    }

    console.log("Database seeded with default prooviders");
}

main()
    .catch((e)=>{
        console.log("Seeding failed::",e);
        process.exit(1);
    })
    .finally(async()=>{
        await prisma.$disconnect();
    })