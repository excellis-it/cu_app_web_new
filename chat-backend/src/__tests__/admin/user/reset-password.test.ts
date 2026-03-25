import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";



describe("Admin Reset Password", () => {
  it("POST /api/admin/users/reset-password → should reset the user password when called by admin", async () => {
    const data:any = await signInAdmin();
    const res:any = await request(app)
      .post("/api/admin/users/reset-password")
      .set("access-token", data.data.token)
      .send({
        password: "newpassword123",
      });
      console.log("Response===========>:", res.body);
    expect(res.status).toBe(200);
    // expect(res.body.success).toBe(true);
    // expect(res.body.data).toHaveProperty("_id");
    // expect(res.body.data.password).toBe("newpassword123");
  });
});


