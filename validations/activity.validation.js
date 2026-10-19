const { z, strict } = require('./common');

const list = strict({
  limit: z.coerce.number().int().min(1).max(200).default(30),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

module.exports = { list };
