import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import filterUser from "../../../helpers/filterUser";
import USERS from "../../../db/schemas/users.schema";
import { adminUserTypes } from "../../../helpers/constants";

export default async function signIn(data: any) {
  try {
    const { id, password } = data;
    const user = await USERS.findOne({
      $or: [{ email: id }, { username: id }],
    }).lean();
    if (!user) throw new Error("User not found");
    if (!adminUserTypes.includes(user.userType))
      throw new Error("User is not Authorized");

    if (user.accountStatus === "Inactive") {
      throw new Error("Account is Inactive");
    }
    if (!comparePassword(password, user.password || ""))
      throw new Error("Email or password is incorrect");
    const JWT = await generateJWT(user);
    if (!JWT) throw new Error("Error generating token");
    return { user: filterUser(user), token: JWT, userType: user.userType };
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
