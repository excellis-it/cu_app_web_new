import express from 'express';
import { User } from '../db/models/user';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const router = express.Router();

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { name, lastName, email, password } = req.body;
    // Accept both `phone` and `phoneNumber` from clients/tests
    const phoneNumber = req.body.phoneNumber || req.body.phone;

    if (!name || !email || !password || !phoneNumber) {
      return res.status(400).json({ error: 'Please provide all required fields' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Create new user
    const nextSl = (await User.countDocuments()) + 1;
    const user = await User.create({
      name,
      email,
      password,
      phoneNumber,
      // Provide sensible defaults expected by schema
      userType: 'student',
      sl: nextSl
    });

    // Generate token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1d' }
    );

    // Send response
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber
      }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Sign in
router.post('/signin', async (req, res) => {
  try {
    const email = req.body.email || req.body.id; // tests send `id` as email
    const { password } = req.body;

    // Check if all fields are provided
    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide all required fields' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    // Use model method if available; fallback to bcrypt compare for safety
    const isMatch = typeof (user as any).comparePassword === 'function'
      ? await (user as any).comparePassword(password)
      : await bcrypt.compare(password, (user as any).password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1d' }
    );

    // Send response
    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber
      }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
