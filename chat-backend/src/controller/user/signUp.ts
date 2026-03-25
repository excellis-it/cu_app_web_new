import bcrypt from "bcrypt";
import USERS from "../../db/schemas/users.schema";
import { sendMail } from "../../helpers/mailer";

export async function signUp(data: any) {
    try {
        if(!data.email) throw new Error("Email is required");
        data.email = data.email.toLowerCase().replace(/ /g, "");
        let existing = await USERS.findOne({ email: data.email }).lean();
        if (existing) throw new Error("Email already exists");
        const sl = await getNewSl();
        const username = generateUsername(data.name, sl);
        const hashedPassword = await hashPassword(data.password);
        const user = USERS.create({
            sl,
            username,
            email: data.email,
            phone: data.phone,
            password: hashedPassword,
            name: data.name,
            lastName: data.lastName,
            userType: "user",
        });
        await sendMail(data.email, "Welcome to CPSCOM", `Hello ${data.name}, welcome to CPSCOM. please use this email address to log in. Contact your administrator for password and username`)
        return user;
    } catch (error) {
        console.log(error);
        throw error;
    }
}

async function getNewSl() {
    try {
        const last = await USERS.findOne().sort({ sl: -1 }).lean();
        if (!last) return 1;
        return last.sl + 1;
    } catch (error) {
        throw error;
    }
}

function generateUsername(name: string, serial: number) {
    try {
        name = name.toLowerCase().replace(/ /g, "");
        let username = `${name.slice(0,6)}${serial.toString(16)}`.toLowerCase();
        return username;
    } catch (error) {
        throw error;
    }
}

export async function hashPassword(password: string) {
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        return hashedPassword;
    } catch (error) {
        throw error;
    }
}