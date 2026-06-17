/** Normalised error shape surfaced to the application from the HTTP layer. */
export interface AppError {
  /** Human-readable message safe to show in the UI. */
  message: string;
  /** HTTP status code, or 0 for network/transport failures. */
  status: number;
  /** Original error for diagnostics. */
  cause: unknown;
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AppError).message === 'string' &&
    typeof (value as AppError).status === 'number'
  );
}
