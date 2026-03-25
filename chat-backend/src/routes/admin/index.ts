import { Router } from "express";
import adminUsersRouter from "./users.routes";
import adminMiddleware from "../../middleware/adminMiddleware";
import adminGroupRouter from "./groups.routes";
import adminSiteRouter from "./site.routes";

const adminRouter = Router();
adminRouter.use("/groups", adminMiddleware, adminGroupRouter);
adminRouter.use("/users", adminUsersRouter);
adminRouter.use("/site", adminSiteRouter);
adminRouter.use("/", adminMiddleware);

export default adminRouter;