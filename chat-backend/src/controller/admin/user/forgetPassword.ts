import bcrypt from "bcrypt";
const crypto = require("crypto");

import ejs from "ejs";
import USERS from "../../../db/schemas/users.schema";

const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_ID,
    pass: process.env.MAIL_PASSWORD,
  },
});

export default async function forgotPassword(email: string) {
  let otp = generateOTP();
  try {
    let user = await getUserByEmail(email);
    if (!user) throw { message: "User not found", code: 1004044 };
    else {
      let timeStamp = Date.now();
      let update = await USERS.findByIdAndUpdate(
        user._id,
        {
          $set: {
            forgetPassword: {
              otp,
              expiresAt: timeStamp + 10 * 60 * 1000,
              createdAt: timeStamp,
            },
          },
        },
        { new: true }
      );
      if (!update) throw { message: "Error while resetting password" };
      sendForgetPasswordOtp(email, otp);
      return { message: "OTP sent to your email" };
    }
  } catch (error: any) {
    throw error;
  }
}

async function getUserByEmail(email: any) {
  try {
    
      email = decodeURIComponent(email).replace("%40", "@");
    let user = await USERS.findOne({
      email: email,
    });
    if (!user) {
      return { message: "User not found", code: 1004043 };
    }
    return user;
  } catch (error: any) {
    return error;
  }
}

export async function verifyForgetPasswordOtp(data: any) {
  try {
    let { otp, email } = data;
    let user = await getUserByEmail(email);
    if (!user) throw { message: "User not found", code: 1004045 };
    else {
      if (user.forgetPassword.otp == otp) {
        let timeStamp = Date.now();
        if (timeStamp > user.forgetPassword.expiresAt)
          throw { message: "OTP expired" };
        let slug = generateRandomString(16);
        let slugUpdate = await USERS.findByIdAndUpdate(
          user._id,
          { $set: { forgetPassword: { slug } } },
          { new: true }
        );
        if (!slugUpdate) throw { message: "Error while resetting password" };
        return { slug, message: "OTP verified" };
      } else throw { message: "OTP does not match" };
    }
  } catch (error: any) {
    throw error;
  }
}

function generateRandomString(length: number) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const characterCount = characters.length;

  // Generate random bytes
  const randomBytes = crypto.randomBytes(length);

  let randomString = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = randomBytes[i] % characterCount;
    randomString += characters.charAt(randomIndex);
  }

  return randomString;
}

export async function sendForgetPasswordOtp(email: any, otp: any) {
  try {
    ejs.renderFile(
      __dirname + "/../../mail/templates/forgetPassword.ejs",
      { otp, email },
      (err: any, data: any) => {
        if (err) {
          throw err;
        }
        let mailOptions = {
          from: "support@starcap.com",
          to: email,
          subject: "Forget Password OTP",
          template: "/../../mail/templates/forgetPassword.ejs",
          html: data,
          context: {
            otp,
            email,
          },
        };
        transporter.sendMail(mailOptions, (err: any, data: any) => {
          if (err) {
            return false;
          } else {
            return true;
          }
        });
      }
    );
  } catch (error) {
    return false;
  }
}

function generateOTP() {
  // Generate a random 6-digit number
  const randomDigits = crypto.randomBytes(3).readUIntBE(0, 3) % 1000000;

  // Ensure the OTP is exactly 6 digits by padding with leading zeros if necessary
  const otp = String(randomDigits).padStart(6, "0");

  return otp;
}



export async function resetPassword(data :any) {
    try {

        let {email, slug, password ,confirmPassword} = data
        let user = await getUserByEmail(email) || await USERS.findOne({ 'forgetPassword.slug': slug, status: { $ne: 'Deleted' } });
        if (!user) throw { message: 'User not found', code: 1004046 };
        if (user.forgetPassword.slug != slug) throw { message: 'Invalid Session' };
        if (password != confirmPassword) throw { message: 'Passwords do not match' };
        const salt = await bcrypt.genSalt(10);
        var hashPassword = await bcrypt.hash(password, salt);
        let reset = await USERS.findByIdAndUpdate(user._id, { $set: { password: hashPassword, forgetPassword: null, passwordUpdatedAt: Date.now() } }, { new: true });
        if (!reset) throw { message: 'Error while resetting password' };
        return { message: "Password reset successfully", user: reset };
    }
    catch (error:any) {
        throw error
    }
}

