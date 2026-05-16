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

export function cleanObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  
  // Only clean plain objects and arrays
  const isPlainObject = obj.constructor === Object;
  const isArray = Array.isArray(obj);

  if (!isPlainObject && !isArray) return obj;

  if (isArray) {
    return obj.map(item => cleanObject(item));
  }
  
  const cleaned: any = {};
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    if (value !== undefined) {
      cleaned[key] = cleanObject(value);
    }
  });
  return cleaned;
}
