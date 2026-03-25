import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";
import SiteSettings from "../../../db/schemas/site-settings.schema";
import path from "path";

jest.setTimeout(20000);

describe("Admin Update Site Details", () => {
  it("POST /api/admin/site/update-site-details → should update site details", async () => {
    const data:any = await signInAdmin();
    const existingSettings = new SiteSettings({
        siteName: "Old Site Name",
        siteLogo: "https://example.com/old-logo.png",
        siteDescription: "Old Description",
        siteMainImage: "https://example.com/old-image.jpg",
    });
    await existingSettings.save();

    const res = await request(app)
      .post("/api/admin/site/update-site-details")
      .set("access-token", data.data.token)
      .field("siteName", "Updated Site Name")
      .field("siteDescription", "Updated Description")
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("siteName");
    expect(res.body.data).toHaveProperty("siteDescription");
    expect(res.body.data).toHaveProperty("siteLogo");
    expect(res.body.data).toHaveProperty("siteMainImage");
    expect(res.body.data.siteName).toBe("Updated Site Name");
    expect(res.body.data.siteDescription).toBe("Updated Description");
    
  });
});