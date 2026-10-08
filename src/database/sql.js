function toCamelCase(row) {
  if (!row) return row;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value,
    ])
  );
}

module.exports = { toCamelCase };
