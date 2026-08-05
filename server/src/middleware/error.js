export function errorHandler(err, req, res, next) {
  if (err.message === "INVALID_CREDENTIALS") {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
