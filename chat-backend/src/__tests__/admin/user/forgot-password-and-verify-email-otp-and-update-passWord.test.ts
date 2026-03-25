import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";
import USERS from "../../../db/schemas/users.schema";
describe("Admin Forgot & Verify Password Flow", () => {
  it("should request OTP and then verify it", async () => {
    const data:any = await signInAdmin();

    const forgotRes:any = await request(app)
      .post("/api/admin/users/forgot-password")
      .set("access-token", data.data.token)
      .send({ email: data.data.user.email });
    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body.success).toBe(true);
    const user:any = await USERS.findOneAndUpdate({ email: data.data.user.email }, { $set: { forgetPassword: { otp: "123456", expiresAt: Date.now() + 10 * 60 * 1000, createdAt: Date.now() } } }, { new: true }); 
    const otp = user.forgetPassword.otp; 
    const verifyRes:any = await request(app)
      .post("/api/admin/users/verify-email-otp")
      .set("access-token", data.data.token)
      .send({
        email: data.data.user.email,
        otp,
      });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data).toHaveProperty("slug");
    const updatePasswordRes:any = await request(app)
      .post("/api/admin/users/update-password")
      .set("access-token", data.data.token)
      .send({
        email: data.data.user.email,
        slug: verifyRes.body.data.slug,
        password: "newpassword123",
        confirmPassword: "newpassword123",
      });
    expect(updatePasswordRes.status).toBe(200);
    expect(updatePasswordRes.body.success).toBe(true);
    expect(updatePasswordRes.body.data).toHaveProperty("message");
    expect(updatePasswordRes.body.data.message).toBe("Password reset successfully");
  });
});
