const termModel = require('../models/term.model');
const { TERM_NAMES } = require('../constants');
const { notFound } = require('../utils/errors');

// Nigerian school calendar: Sep–Dec = 1st term, Jan–Apr = 2nd, May–Aug = 3rd.
function defaultSessionAndTerm(now = new Date()) {
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  if (m >= 9) return { session: `${y}/${y + 1}`, term: 'First Term' };
  if (m <= 4) return { session: `${y - 1}/${y}`, term: 'Second Term' };
  return { session: `${y - 1}/${y}`, term: 'Third Term' };
}

async function ensureTermId(sessionName, termName, conn) {
  const sessionId = (await termModel.findSessionId(sessionName, conn)) ?? (await termModel.insertSession(sessionName, conn));
  return (await termModel.findTermId(sessionId, termName, conn)) ?? (await termModel.insertTerm(sessionId, termName, conn));
}

// Make (session, term) the one current term.
async function setCurrentTerm(sessionName, termName, conn) {
  const termId = await ensureTermId(sessionName, termName, conn);
  await termModel.setCurrent(termId, conn);
  return termId;
}

const toTerm = (row) => ({ id: row.id, term: row.term, session: row.session, sessionId: row.session_id });

// The current term; creates a sensible default the first time it's needed.
async function getCurrentTerm(conn) {
  let row = await termModel.findCurrent(conn);
  if (!row) {
    const d = defaultSessionAndTerm();
    await setCurrentTerm(d.session, d.term, conn);
    row = await termModel.findCurrent(conn);
  }
  return toTerm(row);
}

// Resolve optional { session, term } (names) to a term; both missing → current term.
async function resolveTerm({ session, term } = {}) {
  const current = await getCurrentTerm();
  if (!session && !term) return current;
  const sessionName = session || current.session;
  const termName = term || current.term;
  const row = await termModel.findByNames(sessionName, termName);
  if (!row) throw notFound(`No records exist for ${termName}, ${sessionName}.`);
  return toTerm(row);
}

async function listSessions() {
  const rows = await termModel.listSessionsWithTerms();
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.session_id)) map.set(r.session_id, { id: r.session_id, name: r.session, terms: [] });
    if (r.term_id) map.get(r.session_id).terms.push({ id: r.term_id, name: r.term, isCurrent: !!r.is_current });
  }
  const sessions = [...map.values()];
  sessions.forEach((s) => s.terms.sort((a, b) => TERM_NAMES.indexOf(a.name) - TERM_NAMES.indexOf(b.name)));
  return sessions;
}

const getTermInfo = async (termId) => {
  const row = await termModel.findInfo(termId);
  return row ? toTerm(row) : null;
};

module.exports = {
  defaultSessionAndTerm, setCurrentTerm, getCurrentTerm, resolveTerm, listSessions, getTermInfo,
  findPreviousTermId: termModel.findPreviousId,
};
