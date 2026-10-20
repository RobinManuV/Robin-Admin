// Mantiene la interfaz histórica de Holded mientras la implementación se organiza por dominio.
const { isConfigured } = require('./holded/client');

module.exports = {
  isConfigured,
  ...require('./holded/analytics'),
  ...require('./holded/invoices'),
  ...require('./holded/payment-invoice'),
};
