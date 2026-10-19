const bcrypt = require('bcrypt');
const crypto = require('crypto');
const env = require('../config/env');

const hashPassword = (plain) => bcrypt.hash(plain, env.BCRYPT_ROUNDS);
const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

// Compared when the account doesn't exist, so "unknown user" and "wrong password"
// take the same time and can't be told apart by timing.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', env.BCRYPT_ROUNDS);
const compareDummy = (plain) => bcrypt.compare(plain, DUMMY_HASH);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

module.exports = { hashPassword, comparePassword, compareDummy, sha256 };
