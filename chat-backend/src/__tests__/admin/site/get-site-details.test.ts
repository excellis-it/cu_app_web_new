import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";
import SiteSettings from "../../../db/schemas/site-settings.schema";


jest.setTimeout(20000);

describe("Admin Get Site Details", () => {
  it("GET /api/admin/site/get-site-details → should return site details", async () => {
    const data:any = await signInAdmin();
    const siteSettings = new SiteSettings({
     "siteName": "CU",
        "siteLogo": "https://etexcellisit.s3.ap-south-1.amazonaws.com/1709020370236logo2.png",
        "siteDescription": "HELLO CU",
        "siteMainImage": "https://etexcellisit.s3.ap-south-1.amazonaws.com/1709025358856OIG3.TWD7.CLMxpz3fVktgdLU.jpg",
    });
    await siteSettings.save();
    const res = await request(app)
      .get("/api/admin/site/get-site-details")
      .set("access-token", data.data.token);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("siteName");
    expect(res.body.data).toHaveProperty("siteDescription");
    expect(res.body.data).toHaveProperty("siteLogo");
    expect(res.body.data).toHaveProperty("siteMainImage");
    expect(res.body.data.siteName).toBe("CU");
    expect(res.body.data.siteDescription).toBe("HELLO CU");
    expect(res.body.data.siteLogo).toBe("https://etexcellisit.s3.ap-south-1.amazonaws.com/1709020370236logo2.png");
    expect(res.body.data.siteMainImage).toBe("https://etexcellisit.s3.ap-south-1.amazonaws.com/1709025358856OIG3.TWD7.CLMxpz3fVktgdLU.jpg");
  });
});
