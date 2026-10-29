import { Transform } from "class-transformer";
import { IsInt, IsNotEmpty, Min } from "class-validator";

export class TopupDto{
    @IsNotEmpty()
    @Transform(({value})=>parseInt(value))
    @IsInt()
    @Min(1)
    amount:number
}