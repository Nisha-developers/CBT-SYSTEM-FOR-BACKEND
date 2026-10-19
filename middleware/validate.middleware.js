const { unprocessable } = require('../utils/errors');

// validate({ params, query, body }) → parsed, trusted values land in req.valid.{params,query,body}.
// Controllers read req.valid only, never raw req.body.
const validate = (schemas) => (req, res, next) => {
  req.valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const input = part === 'body' && (req.body === undefined || req.body === null) ? {} : req[part];
    const result = schemas[part].safeParse(input);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      const first = details[0];
      return next(unprocessable(first.path ? `${first.path}: ${first.message}` : first.message, details));
    }
    req.valid[part] = result.data;
  }
  return next();
};

module.exports = { validate };
