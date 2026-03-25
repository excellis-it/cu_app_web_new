import request from "supertest";
import { app } from "../../../app";
import { signInAdmin } from "../helpers";

jest.setTimeout(20000);

describe("Admin Delete User", () => {
  it("DELETE /api/admin/users/delete-user/:id → should delete a user by id", async () => {
    const data:any = await signInAdmin();
    const email = `del+${Date.now()}@example.com`;

    const createRes = await request(app)
      .post("/api/admin/users/create-user")
      .set("access-token", data.data.token)
      .send({
        name: "Delete User",
        email,
        password: "password123",
        userType: "user",
        sl: 4,
      });

    expect(createRes.status).toBe(200);
    expect(createRes.body).toHaveProperty('success')
    expect(createRes.body.success).toBe(true)
    expect(createRes.body.data).toHaveProperty('_id')
    
    const createdId = createRes.body.data._id;

    const delRes = await request(app)
      .delete(`/api/admin/users/delete-user?id=${createdId}`)
      .set("access-token", data.data.token);
    expect(delRes.status).toBe(200);
    expect(delRes.body).toHaveProperty("message");
    expect(delRes.body.data.delete_user).toHaveProperty("_id");
    expect(delRes.body.data.statusCode).toBe(200);
    expect(delRes.body.success).toBe(true);
  });
});
