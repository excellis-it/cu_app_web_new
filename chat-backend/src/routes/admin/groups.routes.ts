import { Router } from "express";
import adminMiddleware from "../../middleware/adminMiddleware";
import { GetGroups } from "../../controller/admin/group/getGroups";
import serverResponse from "../../helpers/serverResponse";
import { updateGroup } from "../../controller/admin/group/updateGroup";
import multer from "multer";
import { deleteGroup } from "../../controller/admin/group/deleteGroup";

const uploadFile = multer({ storage: multer.memoryStorage() });
const adminGroupRouter = Router();

adminGroupRouter.post(
  "/get-all",
  adminMiddleware,
  async (req: any, res: any) => {
    try {
      serverResponse(
        true,
        "Groups fetched successfully",
        await GetGroups(req.body, req.user),
        res
      );
    } catch (error: any) {
      serverResponse(false, "Error fetching groups", error.message, res);
    }
  }
);

adminGroupRouter.post(
  "/update",
  uploadFile.single("file"),
  async (req: any, res: any) => {
    try {
      serverResponse(
        true,
        "Groups Updated successfully",
        await updateGroup(req.body, req.file,req),
        res
      );
    } catch (error: any) {
      serverResponse(false, error.message, error, res);
    }
  }
);


adminGroupRouter.delete(
  "/delete-group",
  adminMiddleware,
  async (req: any, res: any) => {
    try {
      serverResponse(
        true,
        "Group deleted successfully",
        await deleteGroup(req.query),
        res
      );
    } catch (error: any) {
      serverResponse(false, "Error deleting user", error, res);
    }
  }
);

export default adminGroupRouter;
