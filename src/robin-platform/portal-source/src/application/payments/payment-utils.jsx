import React from 'react';
import { Badge } from '../../ui.jsx';

export function eur(value) {
  return Number(value || 0).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €';
}

export function daysBetween(startIso, endIso) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.floor((end - start) / 86400000);
}

export function PaymentStatusBadge({ status }) {
  if (status === 'paid') return <Badge tone="green">Pagado</Badge>;
  if (status === 'unlocked') return <Badge tone="amber">Disponible</Badge>;
  return <Badge tone="slate">Bloqueado</Badge>;
}

export function paymentTitle(payment, total) {
  if (payment && payment.concept) return payment.concept;
  return `Cuota ${payment ? payment.installment : ''} de ${total || 3}`;
}
