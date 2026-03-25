import request from 'supertest';
import { app } from '../../app';
import User  from '../../db/schemas/users.schema';
import bcrypt from 'bcrypt';

describe('User Signin', () => {
  beforeEach(async () => {
    // Create a test user before each test
    await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: await bcrypt.hash('password123', 10),
      phoneNumber: '+1234567890',
      userType: 'user',
      sl: 1,
      accountStatus: 'Active'
    });
  });

  it('should login with valid credentials', async () => {
    const loginData = {
      id: 'test@example.com',
      password: 'password123'
    };

    const response = await request(app)
      .post('/api/users/sign-in')
      .send(loginData)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('token');
    expect(response.body.data).toHaveProperty('user');
    expect(response.body.data.user.email).toBe('test@example.com');
  });

  it('should not login with incorrect password', async () => {
    const loginData = {
      id: 'test@example.com',
      password: 'wrongpassword'
    };

    const response = await request(app)
      .post('/api/users/sign-in')
      .send(loginData)
      .expect(200);

    expect(response.body.success).toBe(false);
    expect(response.body).toHaveProperty('error');
  });

  it('should not login with non-existent email', async () => {
    const loginData = {
      id: 'nonexistent@example.com',
      password: 'password123'
    };

    const response = await request(app)
      .post('/api/users/sign-in')
      .send(loginData)
      .expect(200);

    expect(response.body.success).toBe(false);
    expect(response.body).toHaveProperty('error');
  });

  it('should not login without required fields', async () => {
    const loginData = {
      id: 'test@example.com'
      // missing password
    };

    const response = await request(app)
      .post('/api/users/sign-in')
      .send(loginData)
      .expect(200);

    expect(response.body.success).toBe(false);
    expect(response.body).toHaveProperty('error');
  });
});
