import jwt from "jsonwebtoken";

function decode(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      unitOwnerId: decoded.unitOwnerId ?? null,
      tenantId: decoded.tenantId ?? null,
      // Tokens issued before this shipped carry no status. Treating them as
      // approved is correct: they could only have been issued to an approved
      // account, since nothing else could sign in.
      status: decoded.status ?? "APPROVED",
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Admits any authenticated account, approved or not. Use ONLY on the
// application-status routes — this is the opt-in half of the gate.
export function verifyJwtAllowPending(req, res, next) {
  return decode(req, res, next);
}

// The default, and deliberately the strict one. verifyJwt is applied per route
// file across ~20 mounts; a `requireApproved` that each of them had to opt into
// would gate nothing the day someone forgets one. Failing closed here means a
// new route is protected by default and widening access is a visible edit.
export function verifyJwt(req, res, next) {
  return decode(req, res, () => {
    if (req.user.status !== "APPROVED") {
      return res.status(403).json({ error: "Your account is not approved yet" });
    }
    next();
  });
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

export const requireWrite = requireRole("ADMIN", "LEASING_OFFICER");
export const requireStaff = requireRole("ADMIN", "LEASING_OFFICER", "VIEWER");
