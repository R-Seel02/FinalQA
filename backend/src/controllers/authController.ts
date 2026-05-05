import { Request, Response } from 'express';
import { registerUser, loginUser } from '../services/authService';
import { ValidationError } from '../utils/errors';

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password, shippingAddress } = req.body ?? {};
  if (!email || !password) {
    throw new ValidationError('email and password are required');
  }
  const result = await registerUser({ email, password, shippingAddress });
  res.status(201).json(result);
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    throw new ValidationError('email and password are required');
  }
  const result = await loginUser({ email, password });
  res.status(200).json(result);
}
