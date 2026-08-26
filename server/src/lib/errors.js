export class AppError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") { super(message, 404, "NOT_FOUND"); }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") { super(message, 409, "CONFLICT"); }
}

export class InvalidReferenceError extends AppError {
  constructor(message = "Invalid reference") { super(message, 400, "INVALID_REFERENCE"); }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") { super(message, 400, "VALIDATION"); }
}

// Correct credentials but the account is not usable yet. 403 rather than 401:
// the caller proved who they are, they are simply not allowed through.
export class AccountPendingError extends AppError {
  constructor(message = "Your account is awaiting approval by the leasing team.") {
    super(message, 403, "ACCOUNT_PENDING");
  }
}

export class AccountRejectedError extends AppError {
  constructor(message = "This account was not approved. Please contact the leasing team.") {
    super(message, 403, "ACCOUNT_REJECTED");
  }
}
