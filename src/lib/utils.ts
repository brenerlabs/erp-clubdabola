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

export function cleanVariationName(name: string | null | undefined): string {
  if (!name) return '';
  const parts = name.split('/').map(v => v.trim()).filter(v => v && v !== '' && v.toUpperCase() !== 'N/A' && v.toUpperCase() !== 'SEM VARIAÇÃO' && v.toUpperCase() !== 'SEM VARIACOES');
  return parts.join(' / ');
}

export function cleanObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => cleanObject(item));
  }

  const isPlainObject = obj !== null && typeof obj === 'object' && obj.constructor === Object;
  if (!isPlainObject) return obj;

  const cleaned: any = {};
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    if (value !== undefined) {
      const cleanedValue = cleanObject(value);
      if (typeof cleanedValue === 'number' && isNaN(cleanedValue)) {
        cleaned[key] = 0;
      } else {
        cleaned[key] = cleanedValue;
      }
    }
  });
  return cleaned;
}
