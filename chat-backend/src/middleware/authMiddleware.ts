import serverResponse from "../helpers/serverResponse";
import decodeToken from "./decodeToken";

export default async function authMiddleware(req: any, res: any, next: any) {
    try {
        const token = req.headers['access-token'] || req.cookies['access-token'];
        const user = await decodeToken(token);
        if (!user) throw { message: "User not found", code: 1004049 }
        req.user = user;
        next();
    } catch (error: any) {
        error.status = 401;
        return serverResponse(false, "Unauthorized", error, res)
    }
}