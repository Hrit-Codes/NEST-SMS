const GSM7_CHARSET =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ !" +
  '"#¤%&\'()*+,-./:;<=>?¡ÄÖÑÜ§¿äöñüà' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'abcdefghijklmnopqrstuvwxyz' +
  '0123456789';

export function countSmsParts(message:string):{
    encoding:"GSM7" | "UNICODE";
    parts:number;
}{
    let isGSM7=true;
    for (let i=0;i<message.length;i++){
        if(GSM7_CHARSET.indexOf(message[i])===-1){
            isGSM7=false;
            break;
        }
    }

    if(isGSM7){
        const length=message.length;
        if(length<=0){
            return { encoding: "GSM7", parts:1}
        }
        if(length<=160){
            return { encoding: "GSM7", parts:1};
        }

        return { encoding:"GSM7", parts:Math.ceil(length/153)};
    }else{
        const length=message.length;
        if(length<=0){
            return { encoding:"UNICODE", parts:1};
        }
        if(length<=70){
            return { encoding:"UNICODE", parts:1};
        }
        return { encoding:"UNICODE", parts:Math.ceil(length/67)};
    }


}