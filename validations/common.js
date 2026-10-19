const { z } = require('zod');
const { UID_RE } = require('../utils/uid');
const { TERM_NAMES } = require('../constants');

// Reusable, strict building blocks. Every string is trimmed, length-limited and pattern-checked
// so nonsense (control characters, scripts-as-names, huge payloads) never reaches a service.

const NO_CONTROL = /^[^\u0000-\u001F\u007F]*$/;           // single-line text
const NO_CONTROL_MULTILINE = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/; // allows \t \n \r

const uid = z.string().regex(UID_RE, 'Invalid id');

const line = (label, max = 200) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long (max ${max})`)
    .regex(NO_CONTROL, `${label} contains invalid characters`);

const paragraph = (label, max = 5000) =>
  z.string().trim().max(max, `${label} is too long (max ${max})`).regex(NO_CONTROL_MULTILINE, `${label} contains invalid characters`);

// People: letters (any language), spaces, apostrophes, dots, hyphens
const personName = (label) =>
  z.string().trim().min(1, `${label} is required`).max(60, `${label} is too long`)
    .regex(/^[\p{L}][\p{L}\p{M}' .-]*$/u, `${label} can only contain letters, spaces, ' . -`);

// Classes / arms / subjects: letters, numbers and a few separators
const label = (name, max = 60) =>
  z.string().trim().min(1, `${name} is required`).max(max, `${name} is too long (max ${max})`)
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} &/().,'-]*$/u, `${name} contains invalid characters`);

const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address'));

const username = z.string().trim().regex(/^[A-Za-z0-9._-]{3,30}$/, 'Username must be 3–30 letters, numbers, . _ -');

// bcrypt only reads the first 72 bytes, so longer passwords add nothing
const password = z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password needs at least one letter').regex(/\d/, 'Password needs at least one number');

const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number')
  .refine((v) => v.replace(/\D/g, '').length >= 7, 'Enter a valid phone number');

const studentCode = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9/_.-]{0,48}$/, 'Student ID may only contain letters, numbers and / _ . -');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must look like 2026-10-31').refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'That date does not exist');

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Time must look like 09:30');

const sessionName = z.string().trim().regex(/^\d{4}\/\d{4}$/, 'Session must look like 2025/2026')
  .refine((v) => Number(v.slice(5)) === Number(v.slice(0, 4)) + 1, 'Session years must be consecutive, e.g. 2025/2026');

const termName = z.string().trim().refine((v) => TERM_NAMES.includes(v), 'Term must be First Term, Second Term or Third Term');

const page = z.coerce.number().int().min(1).max(100000).default(1);
const pageSize = (max = 100, def = 10) => z.coerce.number().int().min(1).max(max).default(def);

// image logo: https URL, or a PNG/JPEG data URL under ~2 MB
const logo = z.string().max(2_800_000).refine((v) =>
  /^https:\/\/[^\s]{1,480}$/.test(v) || /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(v),
'Logo must be an https link or a PNG/JPEG image');

const strict = (shape) => z.strictObject(shape);          // unknown keys are rejected
const idParam = strict({ id: uid });

module.exports = {
  z, strict, uid, line, paragraph, personName, label, email, username, password, phone, studentCode,
  isoDate, clock, sessionName, termName, page, pageSize, logo, idParam,
};
