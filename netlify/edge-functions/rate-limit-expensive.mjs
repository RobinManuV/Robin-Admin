export default async function rateLimitExpensive(_request, context) {
  return context.next();
}

export const config = {
  path: [
    '/api/onboarding/dni/extract',
    '/api/chat',
    '/api/admin/assistant',
    '/api/admin/career-suggestions',
    '/api/admin/historial/add',
    '/api/documents/upload-ticket',
    '/api/documents/upload',
    '/api/bookings/availability',
    '/api/bookings/create',
  ],
  rateLimit: {
    windowLimit: 12,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
