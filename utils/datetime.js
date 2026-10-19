const env = require('../config/env');

const FMT = { month: 'short', day: 'numeric', year: 'numeric' };

// 'YYYY-MM-DD' → 'Oct 14, 2026'
const fmtDate = (iso) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { ...FMT, timeZone: 'UTC' }) : 'N/A';

const fmtDateTime = (d) => new Date(d).toLocaleDateString('en-US', FMT);
const hhmm = (t) => String(t).slice(0, 5);

// School-local date + time → absolute instant
const schoolInstant = (date, time) => new Date(`${date}T${String(time).slice(0, 8)}${env.SCHOOL_TZ_OFFSET}`);

const dayLabel = (date) => {
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(new Date(date))) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return fmtDateTime(date);
};

const timeAgo = (date) => {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `${days} day${days === 1 ? '' : 's'} ago` : fmtDateTime(date);
};

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

module.exports = { fmtDate, fmtDateTime, hhmm, schoolInstant, dayLabel, timeAgo, round1, round2 };
