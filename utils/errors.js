// One error type for every "expected" failure. The error middleware turns it into JSON.
class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

module.exports = {
  HttpError,
  badRequest: (m, d) => new HttpError(400, m, d),
  unauthorized: (m = 'Authentication required') => new HttpError(401, m),
  forbidden: (m = 'You are not allowed to do that.') => new HttpError(403, m),
  notFound: (m = 'Not found') => new HttpError(404, m),
  conflict: (m) => new HttpError(409, m),
  unprocessable: (m, d) => new HttpError(422, m, d),
};
