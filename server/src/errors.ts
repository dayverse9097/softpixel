export class HttpError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** A game upload that failed validation. The message is safe to show to the admin. */
export class UploadRejected extends HttpError {
  constructor(code: string, message: string) {
    super(422, code, message);
    this.name = 'UploadRejected';
  }
}
