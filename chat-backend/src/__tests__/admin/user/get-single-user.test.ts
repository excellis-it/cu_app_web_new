import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";

jest.setTimeout(20000);

describe("Admin Get Single User", () => {
  it("GET /api/v1/admin/get-single-user/:id → should return one user by id", async () => {
    const data:any = await signInAdmin();
    const email = `test+${Date.now()}@example.com`;
    const createRes:any = await request(app)
          .post("/api/admin/users/create-user")
          .set("access-token", data.data.token)
          .send({
            name: "Created User",
            email,
            password: "password123",
            userType: "user",
            sl: 2,
          });
        expect(createRes.status).toBe(200);
        expect(createRes.body.data).toHaveProperty("_id");
        expect(createRes.body.data.email).toMatch(/@example.com$/);
        expect(createRes.body.success).toBe(true);
    const createdId = createRes.body.data._id;

    const getRes = await request(app)
      .get(`/api/admin/users/get-single-user?id=${createdId}`)
      .set("access-token", data.data.token);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.email).toBe(email);
  });
});
