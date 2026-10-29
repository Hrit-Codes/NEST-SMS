import { BadRequestException } from "@nestjs/common";

export function normalizePhone(input:string):string{
    if(!input || typeof input!=="string"){
        throw new BadRequestException(`Invalid phone number ${input}`);
    }

    let cleaned=input.trim();

    if(cleaned.startsWith("+977")){
        cleaned=cleaned.substring(4);
    }

    else if (cleaned.startsWith("977")){
        cleaned=cleaned.substring(3);
    }

    // Check if it's all digits
    if (!/^\d+$/.test(cleaned)) {
        throw new BadRequestException(`Invalid phone number: ${input}`);
    }

    if(cleaned.length!==10 || (!cleaned.startsWith("97") && !cleaned.startsWith("98"))){
        throw new BadRequestException(`Invalid phone number : ${input}`)
    }

    return cleaned;
}