const { FAQ_ITEMS } = require('./faq-knowledge');

const FAQ_TOKEN = /\[\[FAQ:(\d+)\]\]/g;

function formatFaqKnowledge(items = FAQ_ITEMS) {
  return items.map((faq, index) => (
    `[[FAQ:${index + 1}]]\nPregunta: ${faq.question}\nRespuesta: ${faq.answer}`
  )).join('\n\n');
}

function extractFaqCitations(content, items = FAQ_ITEMS) {
  const citations = [];
  const seen = new Set();
  const cleanContent = String(content || '').replace(FAQ_TOKEN, (_token, rawNumber) => {
    const number = Number(rawNumber);
    const faq = items[number - 1];
    if (faq && !seen.has(number)) {
      seen.add(number);
      citations.push({ number, question: faq.question, category: faq.category });
    }
    return '';
  }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { content: cleanContent, citations };
}

function toPublicMessages(rows) {
  return rows.map((message) => {
    if (message.role !== 'assistant') return message;
    const parsed = extractFaqCitations(message.content);
    return { ...message, content: parsed.content, faq_citations: parsed.citations };
  });
}

module.exports = { extractFaqCitations, formatFaqKnowledge, toPublicMessages };
