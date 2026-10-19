const resultService = require('../services/result.service');
const { ok } = require('../utils/response');

const view = async (req, res) => ok(res, await resultService.view(req.valid.query));
const release = async (req, res) => ok(res, await resultService.setRelease(req.valid.body, req.user));
const theorySheet = async (req, res) => ok(res, await resultService.theorySheet(req.valid.query));
const theoryAnswers = async (req, res) => ok(res, { answers: await resultService.theoryAnswers(req.valid.query) });
const recordTheory = async (req, res) => ok(res, await resultService.recordTheory(req.valid.body, req.user));
const past = async (req, res) => ok(res, { sessions: await resultService.past(req.valid.query) });
const mine = async (req, res) => ok(res, await resultService.mine(req.user));
const getReview = async (req, res) => ok(res, await resultService.getReview(req.valid.query));
const saveReview = async (req, res) => ok(res, await resultService.saveReview(req.valid.body, req.user));

module.exports = { view, release, theorySheet, theoryAnswers, recordTheory, past, mine, getReview, saveReview };
