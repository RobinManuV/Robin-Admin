export default async function rateLimitIdentity(_request, context) {
  return context.next();
}

export const config = {
  path: [
    '/api/auth/login',
    '/api/auth/change-password',
  ],
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
