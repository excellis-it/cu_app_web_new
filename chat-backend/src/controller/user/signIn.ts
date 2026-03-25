import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import filterUser from "../../helpers/filterUser";
import USERS from "../../db/schemas/users.schema";

export default async function signIn(data: any) {
  try {
    const { id, password } = data;
    const user = await USERS.findOne({
      $or: [{ email: id }, { username: id }],
    }).lean();
    if (!user) throw new Error("Email or password is incorrect");
    if (user.accountStatus === "Inactive") {
      throw new Error("Account is Inactive");
    }
    if (!comparePassword(password, user.password || ""))
      throw new Error("Email or password is incorrect");
    if (user && data?.firebaseToken) {
      await USERS.updateMany(
        { firebaseToken: data.firebaseToken },
        { $set: { firebaseToken: null } }
      );
      await USERS.findByIdAndUpdate(
        user._id,
        { firebaseToken: data.firebaseToken },
        { new: true }
      );
    }

    if (user && data?.applePushToken) {
      await USERS.updateMany(
        { applePushToken: data.applePushToken },
        { $set: { applePushToken: null } }
      );
      await USERS.findByIdAndUpdate(
        user._id,
        { applePushToken: data.applePushToken },
        { new: true }
      );
    }

    if (user && data?.webPushToken) {
      await USERS.updateMany(
        { webPushToken: data.webPushToken },
        { $set: { webPushToken: null } }
      );
      await USERS.findByIdAndUpdate(
        user._id,
        { webPushToken: data.webPushToken },
        { new: true }
      );
    }

    const JWT = await generateJWT(user);
    if (!JWT) throw new Error("Error generating token");
    return { user: filterUser(user), token: JWT };
  } catch (error) {
    throw error;
  }
}

export function comparePassword(password: string, hashedPassword: string) {
  try {
    return bcrypt.compareSync(password, hashedPassword);
  } catch (error) {
    return false;
  }
}

async function generateJWT(user: any) {
  try {
    const timeStamp = Date.now();
    const sercret = process.env.JWT_SECRET_KEY || "secret";
    const JWT = jwt.sign(
      {
        id: user._id,
        createdAt: timeStamp,
        expiresAt: timeStamp + 1000 * 60 * 60 * 24 * 30,
      },
      sercret,
      { expiresIn: "30d" }
    );
    return JWT;
  } catch (error) {
    return false;
  }
}
