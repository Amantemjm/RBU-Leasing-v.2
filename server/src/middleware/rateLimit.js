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

// The allowances, exported so the tests pin the real numbers rather than copies.
export const LIMITS = { login: 20, signup: 30, inquiry: 60 };

// Only FAILED sign-ins count: successful logins never use up the allowance, so
// staff signing in normally are not throttled by each other.
//
// The trade-off: the key is the client address alone. On a plain LAN each PC has
// its own address, so this is per person. Behind NAT or a proxy everyone shares
// one address, so twenty typos across the office in fifteen minutes would
// refuse everyone — correct passwords included — until the window passes.
export const loginLimiter = makeLimiter({
  windowMs: 15 * MINUTE,
  limit: LIMITS.login,
  skipSuccessfulRequests: true,
  message: "Too many failed sign-in attempts. Please wait a few minutes and try again.",
});

export const signupLimiter = makeLimiter({
  windowMs: HOUR,
  limit: LIMITS.signup,
  message: "Too many applications from this address. Please try again later.",
});

export const inquiryLimiter = makeLimiter({
  windowMs: HOUR,
  limit: LIMITS.inquiry,
  message: "Too many inquiries from this address. Please try again later.",
});
