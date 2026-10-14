import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

/** Every API error answers: what happened, what it means, what to do next. Shape fixed by D-014. */
export interface ApiErrorBody {
  error: { code: string; message: string; what: string; next: string };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly what: string,
    readonly next: string,
  ) {
    super(what);
  }
}

export const notFound: RequestHandler = (req, _res, next) => {
  next(
    new ApiError(
      404,
      'not_found',
      `There is no endpoint at ${req.method} ${req.path}.`,
      'Check the URL or see the API routes in the README.',
    ),
  );
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody['error'];

  if (err instanceof ApiError) {
    status = err.status;
    body = { code: err.code, message: err.what, what: err.what, next: err.next };
  } else if (err instanceof ZodError) {
    status = 400;
    const what = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    body = { code: 'invalid_request', message: what, what, next: 'Correct the highlighted fields and try again.' };
  } else {
    console.error(err);
    body = {
      code: 'internal_error',
      message: 'Something went wrong on our side.',
      what: 'Something went wrong on our side.',
      next: 'Nothing was changed. Try again in a moment.',
    };
  }
  res.status(status).json({ error: body } satisfies ApiErrorBody);
};
