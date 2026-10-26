import rateLimit from "express-rate-limit";

// Throttles for the endpoints anyone can reach without a token. Counted per
// client address, in memory — enough to stop a script guessing passwords or
// flooding the intake, without any extra infrastructure.
//
// Off under the unit-test runner, whose hundreds of logins would otherwise be
// throttled. Everything else — including the demo and end-to-end scripts — runs
// with them on. RATE_LIMIT=on turns them back on under the runner, which is how
// the real routes are tested.
const off = () => process.env.RATE_LIMIT !== "on" && (process.env.NODE_ENV === "test" || !!process.env.VITEST);

export function makeLimiter({ windowMs, limit, message, skipSuccessfulRequests = false, skip = off }) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    skip,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // The app's own { error } shape, so the client shows it like any other refusal.
    message: { error: message },
  });
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Only FAILED sign-ins count: a successful login never uses up the allowance, so
// a busy office behind one address is not locked out by its own staff signing in.
export const loginLimiter = makeLimiter({
  windowMs: 15 * MINUTE,
  limit: 20,
  skipSuccessfulRequests: true,
  message: "Too many failed sign-in attempts. Please wait a few minutes and try again.",
});

export const signupLimiter = makeLimiter({
  windowMs: HOUR,
  limit: 30,
  message: "Too many applications from this address. Please try again later.",
});

export const inquiryLimiter = makeLimiter({
  windowMs: HOUR,
  limit: 60,
  message: "Too many inquiries from this address. Please try again later.",
});
