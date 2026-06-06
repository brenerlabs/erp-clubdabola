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
  
  // Normalize and replace any "n / a", "n/a", "N/ A", "N /A" variation with standard N/A
  let cleaned = name.replace(/\bN\s*\/\s*A\b/gi, 'N/A');
  
  // Also clean up any occurrences of "N/A" with spaces, or "NA" isolated
  const rawParts = cleaned.split('/');
  const filteredParts: string[] = [];
  
  for (let i = 0; i < rawParts.length; i++) {
    const p = rawParts[i].trim();
    const upper = p.toUpperCase();
    
    // Regex checks for "N/A" variations and "NA" or "SEM VARIAÇÃO", etc.
    const isNA = /^\s*N\s*\/\s*A\s*$/i.test(p) || /^\s*NA\s*$/i.test(p);
    const isGenericPlaceholder = 
      !p || 
      isNA ||
      upper === 'N/A' || 
      upper === 'SEM VARIAÇÃO' || 
      upper === 'SEM VARIACOES' || 
      upper === 'NA' ||
      upper === 'SEM VARIAÇÃO' ||
      upper === 'UNICO' ||
      upper === 'ÚNICO' ||
      upper === 'S/V' ||
      upper === 'S/D' ||
      upper === 'N / A';

    if (isGenericPlaceholder) {
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

export function cleanProductNameWithVariation(productName: string | null | undefined): string {
  if (!productName) return '';
  
  // Look for any trailing parenthesis, e.g. "Product Name (Variation Name)"
  const match = productName.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    const baseName = match[1].trim();
    const varName = match[2].trim();
    const cleanedVar = cleanVariationName(varName);
    return cleanedVar ? `${baseName} (${cleanedVar})` : baseName;
  }
  
  // If the string contains " - " and some variation text at the end, clean it too
  const hyphenParts = productName.split(' - ');
  if (hyphenParts.length > 1) {
    const lastPart = hyphenParts[hyphenParts.length - 1].trim();
    const cleanedLast = cleanVariationName(lastPart);
    if (!cleanedLast) {
      // If the last part was just N/A or some placeholder, drop it
      return hyphenParts.slice(0, hyphenParts.length - 1).join(' - ').trim();
    }
  }

  // Fallback replace of any "N/A" or "N / A" in the text
  let cleaned = productName;
  cleaned = cleaned.replace(/\s*\(\s*N\s*\/\s*A\s*\)\s*/gi, ''); // remove (N/A)
  cleaned = cleaned.replace(/\s*-\s*N\s*\/\s*A\s*/gi, ''); // remove - N/A
  cleaned = cleaned.replace(/\s*\(?\s*N\s*\/\s*A\s*\)?/gi, ''); // remove possible N/A boundaries
  cleaned = cleaned.replace(/\s+N\s*\/\s*A\b/gi, ''); // general clean

  return cleaned.trim();
}

export function formatVariationWithGender(
  variationName: string | null | undefined, 
  gender: string | null | undefined
): string {
  const cleanedVar = cleanVariationName(variationName);
  
  let cleanGender = '';
  if (gender) {
    const upperG = gender.trim().toUpperCase();
    if (upperG === 'MASCULINO' || upperG === 'MASC') cleanGender = 'Masculino';
    else if (upperG === 'FEMININO' || upperG === 'FEM') cleanGender = 'Feminino';
    else if (upperG === 'AMBOS' || upperG === 'UNISSEX' || upperG === 'UNI') cleanGender = 'Ambos';
  }

  if (cleanedVar && cleanGender) {
    return `${cleanedVar} / ${cleanGender}`;
  } else if (cleanedVar) {
    return cleanedVar;
  } else if (cleanGender) {
    return cleanGender;
  }
  return '';
}

export function formatProductNameWithGender(
  productName: string | null | undefined, 
  gender: string | null | undefined
): string {
  let cleanedName = cleanProductNameWithVariation(productName);
  
  let cleanGender = '';
  if (gender) {
    const upperG = gender.trim().toUpperCase();
    if (upperG === 'MASCULINO' || upperG === 'MASC') cleanGender = 'Masculino';
    else if (upperG === 'FEMININO' || upperG === 'FEM') cleanGender = 'Feminino';
    else if (upperG === 'AMBOS' || upperG === 'UNISSEX' || upperG === 'UNI') cleanGender = 'Ambos';
  }

  if (!cleanGender) return cleanedName;

  // Handle formats like "Product Name (Variation Name)"
  const match = cleanedName.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    const baseName = match[1].trim();
    const varName = match[2].trim();
    if (varName.includes(cleanGender)) {
      return cleanedName;
    }
    return `${baseName} (${varName} / ${cleanGender})`;
  }

  return `${cleanedName} (${cleanGender})`;
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
