// Extracts raw text from an uploaded PDF/Word file, then (optionally)
// asks an LLM to structure it into { text, options, correctOption } items.
//
// This is a starting point, not a finished pipeline — wire in your own
// LLM call (Anthropic API, OpenAI, etc.) where marked below. Until then
// it falls back to a naive text split so the upload -> preview -> edit ->
// confirm flow works end-to-end for testing.

const fs = require('fs');
const path = require('path');

async function extractRawText(filePath, mimetype) {
  if (mimetype === 'application/pdf') {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (
    mimetype ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const mammoth = require('mammoth');
    const { value } = await mammoth.extractRawText({ path: filePath });
    return value;
  }

  throw Object.assign(new Error('Unsupported file type for question import'), { status: 400 });
}

async function extractQuestionsFromFile(filePath, mimetype) {
  const rawText = await extractRawText(filePath, mimetype);

  // ── Plug your LLM call in here ──────────────────────────
  // const structured = await callLLMToStructureQuestions(rawText);
  // return structured; // [{ text, options: {A,B,C,D}, correctOption }, ...]

  // Naive fallback so the pipeline is testable without an LLM key:
  // treats each non-empty line as a question with no options, and
  // flags it for review so the teacher must fill in the rest.
  return rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ text, options: { A: '', B: '', C: '', D: '' }, correctOption: '', needsReview: true }));
}

module.exports = { extractQuestionsFromFile, extractRawText };
