import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma:PrismaService,
    private jwtService:JwtService,
  ){}

  async register(registerDto:RegisterDto){
    const {email, password}= registerDto;

    const existingUser=await this.prisma.user.findUnique({
      where:{email}
    });

    if(existingUser){
      throw new ConflictException("User already exists");
    }

    const passwordHash= await bcrypt.hash(password,10);

    const user=await this.prisma.user.create({
      data:{
        email,
        passwordHash,
        wallet:{
          create:{ balance:50}
        }
      },
      include:{wallet:true}
    });

    const payload= {email:user.email, sub:user.id};
    const token=this.jwtService.sign(payload);

    return{
      user:{
        id:user.id,
        email:user.email,
        wallet:user.wallet
      },
      token
    }
  }

  async login(loginDto:LoginDto){
    const {email,password}=loginDto;

    const user=await this.prisma.user.findUnique({
      where:{email},
      include:{wallet:true}
    })

    if(!user){
      throw new UnauthorizedException("Invalid credentials");
    }

    const isPasswordValid=await bcrypt.compare(password, user.passwordHash);

    if(!isPasswordValid){
      throw new UnauthorizedException("Invalid credentials")
    }

    const payload={email:user.email, sub:user.id};
    const token=this.jwtService.sign(payload);

    return{
      user:{
       id:user.id,
       email:user.email,
       wallet:user.wallet 
      },
      token
    }
  }
}
