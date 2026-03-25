import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";

jest.setTimeout(20000);

describe("Admin Get Single User", () => {
  it("GET /api/admin/users/get-user → should return one user by id", async () => {
    const data:any = await signInAdmin();
    const getRes = await request(app)
      .get(`/api/admin/users/get-user`)
      .set("access-token", data.data.token);
    console.log("Create user response:", data.data.user);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.user.email).toBe(data.data.user.email);
  });
});

