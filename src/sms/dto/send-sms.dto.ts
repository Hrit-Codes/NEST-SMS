import { IsNotEmpty, IsString } from "class-validator";

export class SendSmsDto{
    @IsNotEmpty()
    to:string | string[];

    @IsNotEmpty()
    @IsString()
    body:string;
}