/**
 * lib/anthropic-chat.js
 * Helper compartido para llamar a Claude para chat / resumen / historial.
 */
const Anthropic = require('@anthropic-ai/sdk');

async function chatCompletion({ system, messages, model, maxTokens = 2048 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada');
  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: model || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system: system || '',
    messages,
  });
  const text = (resp.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return { text, raw: resp };
}

module.exports = { chatCompletion };
