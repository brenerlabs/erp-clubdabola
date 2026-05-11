import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function calculateMarkup(cost: number, sell: number) {
  if (!cost || cost === 0) return 0;
  const result = ((sell - cost) / cost) * 100;
  return isFinite(result) ? result : 0;
}

export function calculateMargin(cost: number, sell: number) {
  if (!sell || sell === 0) return 0;
  const result = ((sell - cost) / sell) * 100;
  return isFinite(result) ? result : 0;
}
