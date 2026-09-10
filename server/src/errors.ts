export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  unauthorized: () => new AppError(401, "UNAUTHENTICATED", "Authentication is required."),
  forbidden: () => new AppError(403, "FORBIDDEN", "You do not have permission to perform this action."),
  targetForbidden: () =>
    new AppError(403, "TARGET_NOT_ALLOWED", "The requested target is outside the configured lab allowlist."),
  domainForbidden: () =>
    new AppError(403, "DOMAIN_NOT_ALLOWED", "The requested domain is outside the configured lab allowlist."),
  validation: (message = "Invalid request.") => new AppError(400, "VALIDATION_ERROR", message),
  conflict: (message = "The request could not be completed.") => new AppError(409, "CONFLICT", message),
  locked: () => new AppError(423, "ACCOUNT_LOCKED", "This account is temporarily locked. Try again later."),
  invalidCredentials: () =>
    new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials. Please check your details and try again."),
  notFound: () => new AppError(404, "NOT_FOUND", "The requested resource was not found."),
  rateLimited: () => new AppError(429, "RATE_LIMITED", "Too many requests. Please wait and try again."),
  confirmation: () =>
    new AppError(400, "AUTHORIZATION_REQUIRED", "Authorization confirmation is required before this operation."),
};
