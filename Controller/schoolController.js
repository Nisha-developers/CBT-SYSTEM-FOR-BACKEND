// CREATE
 exports.insertSchool = (req, res) => {
  console.log('inserted');
  res.status(201).json({ message: 'School created' });
};

// READ
exports.getSchools = (req, res) => {
  res.json({ message: 'Get all schools' });
};

// UPDATE
exports.updateSchool = (req, res) => {
  res.json({ message: 'School updated' });
};

// DELETE
exports.deleteSchool = (req, res) => {
  res.json({ message: 'School deleted' });
};