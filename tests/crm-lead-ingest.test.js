// Automated checks for crm lead ingest test; external services should remain outside this test boundary.
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectedCourse, isFirstBachillerato } = require('../lib/crm-lead-ingest');

test('recognizes first-year Bachillerato variants for automatic 2028-29 routing', () => {
  for (const value of ['1º de Bachillerato', '1º Bachillerato', '1 Bach', '1o de bachillerato', 'Primero de Bachillerato', 'Primer Bachillerato']) {
    assert.equal(isFirstBachillerato(value), true, value);
  }
  for (const value of ['2º de Bachillerato', 'ESO', 'Universidad', '1º de carrera']) {
    assert.equal(isFirstBachillerato(value), false, value);
  }
});

test('extracts the course from website, Meta and labelled comment payloads', () => {
  assert.equal(detectedCourse({ course: '1º de Bachillerato' }), '1º de Bachillerato');
  assert.equal(detectedCourse({ payload: { questionnaire: { curso_actual: '1 Bach' } } }), '1 Bach');
  assert.equal(detectedCourse({ payload: { field_data: { en_que_curso_estas: 'Primero de Bachillerato' } } }), 'Primero de Bachillerato');
  assert.equal(detectedCourse({ comment: 'Interés: Business\nCurso: 1º Bachillerato' }), '1º Bachillerato');
});
