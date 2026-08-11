import { loginUser, registerUser, listUsers, updateUser, deleteUser } from "../services/authService.js";
import { registerSchema, updateUserSchema } from "../validation/user.js";

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await loginUser({ email, password });
    res.json(result);
  } catch (err) { next(err); }
}

export async function register(req, res, next) {
  try {
    const data = registerSchema.parse(req.body);
    const user = await registerUser(data);
    res.status(201).json(user);
  } catch (err) { next(err); }
}

export async function users(req, res, next) {
  try {
    res.json(await listUsers());
  } catch (err) { next(err); }
}

export async function editUser(req, res, next) {
  try {
    const data = updateUserSchema.parse(req.body);
    res.json(await updateUser(req.params.id, data));
  } catch (err) { next(err); }
}

export async function removeUser(req, res, next) {
  try {
    await deleteUser(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
}

export async function me(req, res) {
  res.json({ userId: req.user.userId, role: req.user.role });
}
