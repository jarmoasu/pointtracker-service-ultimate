'use strict';

// Upper bound for free-text fields shown on public pages (team names, court
// labels, device names, scorer/assist). Keeps payloads small and limits what
// a writer can inject into the UI.
const MAX_TEXT_LENGTH = 60;

function isTooLong(value) {
  return typeof value === 'string' && value.length > MAX_TEXT_LENGTH;
}

module.exports = { MAX_TEXT_LENGTH, isTooLong };
