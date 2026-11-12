// utils/names.js
// OSM sometimes stores two names in one field, separated by ';' (for example an Urdu and an English name).
// Prefers the part that contains Latin letters, otherwise the first part.
function cleanName(name) {
  if (typeof name !== 'string') return '';
  const parts = name.split(';').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.find((p) => /[A-Za-z]/.test(p)) || parts[0];
}

// Key used to spot duplicates: case and extra spaces do not matter.
const normalizeName = (name) => cleanName(name).toLowerCase().replace(/\s+/g, ' ');

module.exports = { cleanName, normalizeName };
