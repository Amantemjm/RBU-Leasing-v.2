import { loginUser, registerUser } from "../services/authService.js";

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await loginUser({ email, password });
    res.json(result);
  } catch (err) { next(err); }
}

export async function register(req, res, next) {
  try {
    const user = await registerUser(req.body);
    res.status(201).json(user);
  } catch (err) { next(err); }
}

export async function me(req, res) {
  res.json({ userId: req.user.userId, role: req.user.role });
}
