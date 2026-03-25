import { Router } from "express";
import serverResponse from "../../helpers/serverResponse";
import multer from "multer";
import authMiddleware from "../../middleware/authMiddleware";
import { getSiteDetails, updateSite } from "../../controller/admin/site/updateSite";

const uploadFile = multer({ storage: multer.memoryStorage() });
const adminSiteRouter = Router();

adminSiteRouter.get("/get-site-details", authMiddleware, uploadFile.single('file'), async (req: any, res: any) => {
    try {
        serverResponse(true, "Site Details fetched successfully", await getSiteDetails(), res);
    } catch (error: any) {
        serverResponse(false, "Error fetching Site Details", error.message, res);
    }
});
adminSiteRouter.post("/update-site-details", authMiddleware, uploadFile.fields([{ name: 'siteLogo', maxCount: 1 }, { name: 'siteMainImage', maxCount: 1 }]), async (req: any, res: any) => {
    try {
        let siteLogo = req.files && req.files['siteLogo'] ? req.files['siteLogo'][0] : undefined;
        let siteMainImage = req.files && req.files['siteMainImage'] ? req.files['siteMainImage'][0] : undefined;

        // Pass undefined for optional files if they don't exist
        serverResponse(true, "Site Details Updated successfully", await updateSite(req.body, siteLogo, siteMainImage), res);
    } catch (error: any) {
        serverResponse(false, "Error Updating Site Details", error.message, res);
    }
});

export default adminSiteRouter;