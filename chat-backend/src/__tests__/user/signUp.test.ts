import request from 'supertest';
import { app } from '../../app';
import User from '../../db/schemas/users.schema';

describe('User Signup', () => {
  it('should create a new user with valid data', async () => {
    const userData = {
      name: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      password: 'password123',
      phone: '+1234567890'
    };

    const response = await request(app)
      .post('/api/auth/signup')
      .send(userData)
      .expect(201);

    // Check if user was created in database
    const user = await User.findOne({ email: userData.email });
    expect(user).toBeTruthy();
    expect(user?.name).toBe(userData.name);
    expect(user?.email).toBe(userData.email);

    // Check response structure
    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('user');
    expect(response.body.user.email).toBe(userData.email);
  });

  it('should not create user with existing email', async () => {
    const userData = {
      name: 'Test',
      lastName: 'User',
      email: 'existing@example.com',
      password: 'password123',
      phone: '+1234567890'
    };

    // Create first user
    await request(app)
      .post('/api/auth/signup')
      .send(userData);

    // Try to create second user with same email
    const response = await request(app)
      .post('/api/auth/signup')
      .send(userData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should not create user with invalid email format', async () => {
    const userData = {
      name: 'Test',
      lastName: 'User',
      email: 'invalid-email',
      password: 'password123',
      phone: '+1234567890'
    };

    const response = await request(app)
      .post('/api/auth/signup')
      .send(userData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should not create user without required fields', async () => {
    const userData = {
      name: 'Test User'
      // missing email and password
    };

    const response = await request(app)
      .post('/api/auth/signup')
      .send(userData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });
});
