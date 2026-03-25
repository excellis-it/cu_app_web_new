import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";

jest.setTimeout(20000);

describe("Admin Get All Users", () => {
  it("POST /api/admin/users/get-all-users → should return all users", async () => {
    const data:any  = await signInAdmin();

    const res = await request(app)
      .post("/api/admin/users/all-users")
      .set("access-token", data.data.token);
    console.log("Get all users response:", res.body);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
