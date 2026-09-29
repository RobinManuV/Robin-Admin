/**
 * Base de conocimiento oficial de Robin sobre estudiar en Países Bajos.
 * La fuente estructurada se comparte con el portal para evitar divergencias.
 */
const FAQ_ITEMS = require('../shared/portal-faqs.json');

const FAQ_TEXT = FAQ_ITEMS
  .map((faq, index) => `${index + 1}. ${faq.question} ${faq.answer}`)
  .join('\n\n');

module.exports = { FAQ_ITEMS, FAQ_TEXT };
