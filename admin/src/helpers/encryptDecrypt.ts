import crypto from "crypto";

const key1:any = process.env.EKEY1;
const key2:any = process.env.EKEY2;

export const createSignature = (text: string) => {
    const timeStamp = Date.now();
    let data = {
        text,
        timeStamp,
    }
    const key = key1 + text.toLowerCase() + key2 + timeStamp.toString(32);
    const signature = crypto.createHmac("sha256", key).update(JSON.stringify(data)).digest().toString("hex");
    return {
        data,
        signature
    }
};


export const verifySignature = (payload:{data: {text:String, timeStamp: Number}, signature:String}) => {
    const {data, signature} = payload;   
    const key = key1 + data.text + key2 + data.timeStamp;
    const newSignature = crypto.createHmac("sha256", key).update(JSON.stringify(data)).digest().toString("hex");
    return signature === newSignature;
}





