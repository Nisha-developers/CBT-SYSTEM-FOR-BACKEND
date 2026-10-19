const mammoth = require('mammoth');
const env = require('../config/env');
const { badRequest, unprocessable } = require('../utils/errors');
const examService = require('./exam.service');

// ------------------------------------------------------------------
// 1. Extract raw text from the uploaded PDF / Word file
// ------------------------------------------------------------------
// The file's real type must match its extension (don't trust names or MIME types alone).
function assertRealFormat(file) {
  const head = file.buffer.subarray(0, 5).toString('latin1');
  const isPdf = head.startsWith('%PDF');
  const isZip = head.startsWith('PK');
  const name = (file.originalname || '').toLowerCase();
  if ((name.endsWith('.pdf') && !isPdf) || (name.endsWith('.docx') && !isZip)) {
    throw badRequest('That file is not a valid PDF or Word document.');
  }
}

async function extractText(file) {
  assertRealFormat(file);
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.docx')) {
    const out = await mammoth.extractRawText({ buffer: file.buffer });
    return out.value || '';
  }
  if (name.endsWith('.pdf')) {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(file.buffer) });
    try {
      const out = await parser.getText();
      return out.text || '';
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
  throw badRequest('Only PDF and Word (.docx) files are supported.');
}

// ------------------------------------------------------------------
// 2. Rule-based parser (always available, no API key needed)
//    Understands:   1. Question ...        A. option   B) option ...
//                   Answer: C    (or "Ans: C", "Correct answer: C")
//                   plus an optional answer-key block at the end ("1. C  2. B ...")
// ------------------------------------------------------------------
const QUESTION_RE = /^\s*(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.):\-]\s*(\S.*)$/i;
const OPTION_RE = /^\s*\(?([A-Da-d])\s*[.):\]]\s*(\S.*)$/;
const ANSWER_RE = /^\s*(?:correct\s+)?(?:answer|ans|key)\s*(?:is)?\s*[:\-=]?\s*\(?([A-Da-d])\)?\b/i;
const KEY_HEADER_RE = /^\s*(?:answers?|answer\s*key|marking\s*scheme|key)\s*[:\-]?\s*$/i;

// "A. 3  B. 4  C. 5  D. 6" on one line → separate options
function splitInlineOptions(line) {
  const matches = [...line.matchAll(/(?:^|\s)\(?([A-Da-d])[.)]\s+/g)];
  if (matches.length < 2) return null;
  const parts = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : line.length;
    parts.push({ key: matches[i][1].toUpperCase(), text: line.slice(start, end).trim() });
  }
  return parts;
}

function parseObjective(text) {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const questions = [];
  let cur = null;
  let lastOpt = null;
  let keyMode = false;
  const keyMap = {};

  const push = () => { if (cur) questions.push(cur); cur = null; lastOpt = null; };

  for (const line of lines) {
    if (KEY_HEADER_RE.test(line) && questions.length) { push(); keyMode = true; continue; }
    if (keyMode) {
      for (const m of line.matchAll(/(\d{1,3})\s*[.:\-)]?\s*\(?([A-Da-d])\)?(?=\s|,|;|$)/g)) {
        keyMap[Number(m[1])] = m[2].toUpperCase();
      }
      continue;
    }

    const ans = ANSWER_RE.exec(line);
    if (ans && cur) { cur.correctOption = ans[1].toUpperCase(); lastOpt = null; continue; }

    const inline = cur && splitInlineOptions(line);
    if (inline) { inline.forEach((o) => { cur.options[o.key] = o.text; }); lastOpt = inline[inline.length - 1].key; continue; }

    const opt = cur && OPTION_RE.exec(line);
    if (opt) { lastOpt = opt[1].toUpperCase(); cur.options[lastOpt] = opt[2].trim(); continue; }

    const q = QUESTION_RE.exec(line);
    // a numbered line only starts a new question if it is not an answer-key style "3. C"
    if (q && !/^[A-Da-d]$/.test(q[2].trim())) {
      push();
      cur = { number: Number(q[1]), text: q[2].trim(), options: { A: '', B: '', C: '', D: '' }, correctOption: '' };
      continue;
    }

    // continuation line
    if (cur) {
      if (lastOpt) cur.options[lastOpt] = `${cur.options[lastOpt]} ${line}`.trim();
      else cur.text = `${cur.text} ${line}`.trim();
    }
  }
  push();

  return questions.map((q) => ({
    text: q.text,
    options: q.options,
    correctOption: q.correctOption || keyMap[q.number] || '',
  }));
}

function parseTheory(text) {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const out = [];
  let cur = null;
  for (const line of lines) {
    const q = QUESTION_RE.exec(line);
    if (q) { if (cur) out.push(cur); cur = { text: q[2].trim() }; }
    else if (cur) cur.text = `${cur.text} ${line}`.trim();
  }
  if (cur) out.push(cur);
  return out;
}

// ------------------------------------------------------------------
// 3. Optional AI refinement (set ANTHROPIC_API_KEY). Always falls back
//    to the rule-based parser, and the teacher reviews everything anyway.
// ------------------------------------------------------------------
async function aiExtract(text, type, trueOrFalse) {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const shape = type === 'OBJ'
    ? `[{"text": "...", "options": {"A": "...", "B": "...", "C": "...", "D": "..."}, "correctOption": "A"}]`
    : `[{"text": "..."}]`;
  const prompt = `Extract every exam question from the document below.
Return ONLY a JSON array (no prose, no code fences) in exactly this shape:
${shape}
Rules: keep the original wording; ${type === 'OBJ'
    ? `${trueOrFalse ? 'these are True/False questions: use options A (True) and B (False) only; ' : ''}if the correct answer is not stated, use an empty string for correctOption; never guess.`
    : 'one entry per question, including any sub-parts in the same entry.'}

DOCUMENT:
${text.slice(0, 60000)}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`AI request failed (${res.status})`);
    const data = await res.json();
    const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
      .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch (err) {
    console.warn('AI extraction unavailable, using rule-based parser:', err.message);
    return null;
  }
}

// ------------------------------------------------------------------
// PUBLIC: preview only — nothing is saved until the teacher confirms.
// ------------------------------------------------------------------
async function previewImport(rawExamId, file) {
  if (!file) throw badRequest('Please choose a PDF or Word file to upload.');
  const { t, row } = await examService.loadRow(rawExamId);

  const text = (await extractText(file)).trim();
  if (!text) throw unprocessable('Could not read any text from that file. Is it a scanned image?');

  let questions = await aiExtract(text, t.type, !!row.true_or_false);
  let method = 'ai';
  if (!questions || !questions.length) {
    questions = t.type === 'OBJ' ? parseObjective(text) : parseTheory(text);
    method = 'rules';
  }
  if (!questions.length) {
    throw unprocessable('No questions were found. Number them like "1. Question text" with options "A. ..." underneath.');
  }

  const cleaned = questions.map((q) => {
    if (t.type === 'THEORY') return { text: String(q.text || '').trim() };
    const o = q.options || {};
    return {
      text: String(q.text || '').trim(),
      options: { A: o.A || '', B: o.B || '', C: o.C || '', D: o.D || '' },
      correctOption: String(q.correctOption || '').toUpperCase().slice(0, 1),
    };
  }).filter((q) => q.text);

  const room = row.total_question_set - row.uploaded;
  return {
    preview: cleaned,
    method,
    room,
    warning: cleaned.length > room
      ? `Found ${cleaned.length} questions but this exam only has room for ${room} more. Remove the extras before confirming.`
      : null,
  };
}

module.exports = { previewImport, parseObjective, parseTheory };
