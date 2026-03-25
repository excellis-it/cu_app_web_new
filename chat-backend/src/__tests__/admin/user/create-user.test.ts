import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";

jest.setTimeout(20000);

describe("Admin Create User", () => {
  it("POST /api/admin/users/create-user → should create a new user when called by admin", async () => {
    const data:any = await signInAdmin();
    const res:any = await request(app)
      .post("/api/admin/users/create-user")
      .set("access-token", data.data.token)
      .send({
        name: "Created User",
        email: `test+${Date.now()}@example.com`,
        password: "password123",
        userType: "user",
        sl: 2,
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("_id");
    expect(res.body.data.email).toMatch(/@example.com$/);
    expect(res.body.success).toBe(true);
  });
});
