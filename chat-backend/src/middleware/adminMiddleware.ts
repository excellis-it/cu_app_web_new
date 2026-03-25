import { adminUserTypes } from "../helpers/constants";
import serverResponse from "../helpers/serverResponse";
import decodeToken from "./decodeToken";

export default async function adminMiddleware(req: any, res: any, next: any) {
  try {
    const token = req.headers["access-token"] || req.cookies["access-token"];
    if (!req.user?._id) {
      const user = await decodeToken(token);
      if (adminUserTypes.includes(user?.userType)) {
        req.user = user;
        next();
      } else throw { message: "User not found", code: 1004047 };
    } else {
      if (adminUserTypes.includes(req.user?.userType)) next();
      else throw { message: "User not found", code: 1004048 };
    }
  } catch (error: any) {
    return serverResponse(false, "Unauthorized", error.message, res);
  }
}
