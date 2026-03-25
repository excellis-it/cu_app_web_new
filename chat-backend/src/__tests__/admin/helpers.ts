import bcrypt from "bcrypt";
import request from "supertest";
import User from "../../db/schemas/users.schema";
import { app } from "../../app";

export async function seedAdmin(): Promise<{ email: string; password: string }> {
  const email = "admin@test.com";
  const password = "password123";
  const hashed = bcrypt.hashSync(password, 10);
  // Use upsert to avoid duplicate key errors if seeded multiple times
  await User.updateOne(
    { email },
    {
      $set: {
        name: "Admin",
        email,
        password: hashed,
        userType: "SuperAdmin",
        sl: 1,
        accountStatus: "Active",
      },
    },
    { upsert: true }
  );
  return { email, password };
}

export async function signInAdmin(): Promise<string> {
  const creds = await seedAdmin();
  const res: any = await request(app)
    .post("/api/admin/users/sign-in")
    .send({ email: creds.email, password: creds.password });

  if (!res.body || !res.body.data || !res.body.data.token) {
    throw new Error("Failed to sign in admin in test helper");
  }
  return res.body;
}

export default { seedAdmin, signInAdmin };
