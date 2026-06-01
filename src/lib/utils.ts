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
  
  // Normalize spaces inside N / A or N/A patterns
  let cleaned = name.replace(/\bN\s*\/\s*A\b/gi, 'N/A');
  
  const rawParts = cleaned.split('/');
  const filteredParts: string[] = [];
  
  for (let i = 0; i < rawParts.length; i++) {
    const p = rawParts[i].trim();
    const upper = p.toUpperCase();
    
    // Skip empty, default, N/A, or generic placeholders
    if (!p || upper === 'N/A' || upper === 'SEM VARIAÇÃO' || upper === 'SEM VARIACOES' || upper === 'NA') {
      continue;
    }
    
    // If this part is 'N' and next is 'A' (e.g. from split N / A), skip both
    if (upper === 'N' && i + 1 < rawParts.length && rawParts[i + 1].trim().toUpperCase() === 'A') {
      i++;
      continue;
    }
    
    filteredParts.push(p);
  }
  
  return filteredParts.join(' / ');
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
