
const express = require('express');

const route = express.Router();

const {
  insertSchool,
  updateSchool,
  deleteSchool,
  getSchools
} = require('../Controller/schoolController.js');

route.post('/', insertSchool);
route.get('/', getSchools);
route.patch('/:id', updateSchool);
route.delete('/:id', deleteSchool);


module.exports = route;