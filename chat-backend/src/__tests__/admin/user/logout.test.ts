import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";

jest.setTimeout(20000);

describe("Admin Logout", () => {
  it("POST /api/admin/users/logout → should logout admin and clear cookie", async () => {
    const data:any = await signInAdmin();
    const res = await request(app)
      .post("/api/admin/users/logout")
      .set("Authorization", `Bearer ${data.data.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeNull();
    expect(res.body).toHaveProperty("message");
  });
});
