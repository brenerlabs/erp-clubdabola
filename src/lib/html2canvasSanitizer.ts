import html2canvas, { Options } from 'html2canvas';

export const parseColorValue = (str: string, percentScale: boolean = false): number => {
  const s = str.trim();
  if (s.toLowerCase() === 'none') return 0;
  if (s.endsWith('%')) {
    return parseFloat(s) / 100;
  }
  const val = parseFloat(s);
  if (percentScale && val > 1) {
    return val / 100;
  }
  return val;
};

export const oklchToRgb = (l: number, c: number, h: number): [number, number, number] => {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const L_lms = l + 0.3963377774 * a + 0.2158037573 * b;
  const M_lms = l - 0.1055613458 * a - 0.0638541728 * b;
  const S_lms = l - 0.0894841775 * a - 1.2914855480 * b;

  const l_cubed = L_lms * L_lms * L_lms;
  const m_cubed = M_lms * M_lms * M_lms;
  const s_cubed = S_lms * S_lms * S_lms;

  const r = +4.0767416621 * l_cubed - 3.3077115913 * m_cubed + 0.2309699292 * s_cubed;
  const g = -1.2684380046 * l_cubed + 2.6097574011 * m_cubed - 0.3413193965 * s_cubed;
  const b_rgb = -0.0041960863 * l_cubed - 0.7034186147 * m_cubed + 1.7076147010 * s_cubed;

  const toSRGB = (cVal: number) => {
    const clamped = Math.max(0, Math.min(1, cVal));
    return clamped <= 0.0031308
      ? clamped * 12.92
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  };

  return [
    Math.round(toSRGB(r) * 255),
    Math.round(toSRGB(g) * 255),
    Math.round(toSRGB(b_rgb) * 255)
  ];
};

export const oklabToRgb = (l: number, a: number, b: number): [number, number, number] => {
  const L_lms = l + 0.3963377774 * a + 0.2158037573 * b;
  const M_lms = l - 0.1055613458 * a - 0.0638541728 * b;
  const S_lms = l - 0.0894841775 * a - 1.2914855480 * b;

  const l_cubed = L_lms * L_lms * L_lms;
  const m_cubed = M_lms * M_lms * M_lms;
  const s_cubed = S_lms * S_lms * S_lms;

  const r = +4.0767416621 * l_cubed - 3.3077115913 * m_cubed + 0.2309699292 * s_cubed;
  const g = -1.2684380046 * l_cubed + 2.6097574011 * m_cubed - 0.3413193965 * s_cubed;
  const b_rgb = -0.0041960863 * l_cubed - 0.7034186147 * m_cubed + 1.7076147010 * s_cubed;

  const toSRGB = (cVal: number) => {
    const clamped = Math.max(0, Math.min(1, cVal));
    return clamped <= 0.0031308
      ? clamped * 12.92
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  };

  return [
    Math.round(toSRGB(r) * 255),
    Math.round(toSRGB(g) * 255),
    Math.round(toSRGB(b_rgb) * 255)
  ];
};

export const replaceOklch = (cssText: string): string => {
  if (!cssText || typeof cssText !== 'string') {
    return cssText;
  }
  let result = cssText;

  if (result.toLowerCase().includes('oklch')) {
    result = result.replace(/oklch\(([^)]+)\)/gi, (match, inner) => {
      try {
        const parts = inner.trim().split(/[\s,+/]+/);
        const filteredParts = parts.filter(p => p !== '');
        if (filteredParts.length >= 3) {
          const l = parseColorValue(filteredParts[0], true);
          const c = parseColorValue(filteredParts[1]);
          const h = parseColorValue(filteredParts[2]);
          if (isNaN(l) || isNaN(c) || isNaN(h)) {
            return 'rgba(0, 0, 0, 0)';
          }
          let alpha = 1;
          if (filteredParts[3]) {
            alpha = parseColorValue(filteredParts[3], filteredParts[3].endsWith('%'));
          }
          const [r, g, b] = oklchToRgb(l, c, h);
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
      } catch {
        // fallback
      }
      return 'rgba(0, 0, 0, 0)';
    });
  }

  if (result.toLowerCase().includes('oklab')) {
    result = result.replace(/oklab\(([^)]+)\)/gi, (match, inner) => {
      try {
        const parts = inner.trim().split(/[\s,+/]+/);
        const filteredParts = parts.filter(p => p !== '');
        if (filteredParts.length >= 3) {
          const l = parseColorValue(filteredParts[0], true);
          const a = parseColorValue(filteredParts[1]);
          const b = parseColorValue(filteredParts[2]);
          if (isNaN(l) || isNaN(a) || isNaN(b)) {
            return 'rgba(0, 0, 0, 0)';
          }
          let alpha = 1;
          if (filteredParts[3]) {
            alpha = parseColorValue(filteredParts[3], filteredParts[3].endsWith('%'));
          }
          const [r, g, b_rgb] = oklabToRgb(l, a, b);
          return `rgba(${r}, ${g}, ${b_rgb}, ${alpha})`;
        }
      } catch {
        // fallback
      }
      return 'rgba(0, 0, 0, 0)';
    });
  }

  return result;
};

export const createStyleProxy = (style: CSSStyleDeclaration) => {
  return new Proxy(style, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol') {
        return Reflect.get(target, prop, receiver);
      }
      const val = (target as any)[prop];
      if (typeof val === 'function') {
        return function(this: any, ...args: any[]) {
          if (prop === 'getPropertyValue') {
            const propName = args[0];
            const originalVal = target.getPropertyValue(propName);
            if (originalVal && (originalVal.toLowerCase().includes('oklch') || originalVal.toLowerCase().includes('oklab'))) {
              return replaceOklch(originalVal);
            }
            return originalVal;
          }
          return val.apply(target, args);
        };
      }
      if (typeof val === 'string') {
        if (val.toLowerCase().includes('oklch') || val.toLowerCase().includes('oklab')) {
          return replaceOklch(val);
        }
      }
      return val;
    }
  });
};

/**
 * Safe wrapper around html2canvas that automatically patches getComputedStyle 
 * and sanitizes all CSS stylesheets in the cloned document so oklch/oklab errors do not occur.
 */
export async function safeHtml2Canvas(element: HTMLElement, options: Partial<Options> = {}) {
  const originalGetComputedStyle = window.getComputedStyle;

  const patchedGetComputedStyle = (elt: Element, pseudoElt?: string | null) => {
    const style = originalGetComputedStyle(elt, pseudoElt);
    return createStyleProxy(style);
  };

  // Temporarily override window.getComputedStyle during rendering
  window.getComputedStyle = patchedGetComputedStyle;

  try {
    return await html2canvas(element, {
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#0b0f19',
      ...options,
      onclone: (clonedDoc) => {
        // Call user onclone if provided
        if (options.onclone) {
          options.onclone(clonedDoc);
        }

        if (clonedDoc.defaultView) {
          const originalClonedGetComputedStyle = clonedDoc.defaultView.getComputedStyle;
          clonedDoc.defaultView.getComputedStyle = (elt: Element, pseudoElt?: string | null) => {
            const style = originalClonedGetComputedStyle(elt, pseudoElt);
            return createStyleProxy(style);
          };
        }

        // 1. Gather all CSS
        let combinedCSS = '';
        Array.from(document.styleSheets).forEach((sheet) => {
          try {
            const rules = Array.from(sheet.cssRules || sheet.rules);
            rules.forEach((rule) => {
              combinedCSS += rule.cssText + '\n';
            });
          } catch {
            // Ignore cross-origin stylesheet limits
          }
        });

        Array.from(document.querySelectorAll('style')).forEach((st) => {
          try {
            if (st.textContent) {
              combinedCSS += st.textContent + '\n';
            }
          } catch {
            // Ignore
          }
        });

        // 2. Remove all existing style and link tags in clone
        const allStyleAndLinkElements = Array.from(clonedDoc.querySelectorAll('style, link[rel="stylesheet"]'));
        allStyleAndLinkElements.forEach((node) => {
          node.parentNode?.removeChild(node);
        });

        // 3. Inject safe, converted CSS
        if (combinedCSS.trim()) {
          const cleanStyle = clonedDoc.createElement('style');
          cleanStyle.textContent = replaceOklch(combinedCSS);
          clonedDoc.head.appendChild(cleanStyle);
        }

        // 4. Sanitize element inline styles
        const styledEls = clonedDoc.querySelectorAll('[style]');
        styledEls.forEach((el) => {
          const htmlEl = el as HTMLElement;
          const styleAttr = htmlEl.getAttribute('style');
          if (styleAttr && (styleAttr.toLowerCase().includes('oklch') || styleAttr.toLowerCase().includes('oklab'))) {
            htmlEl.setAttribute('style', replaceOklch(styleAttr));
          }
        });

        // 5. Convert SVG attributes
        const svgProperties = clonedDoc.querySelectorAll('[fill], [stroke]');
        svgProperties.forEach((el) => {
          const fill = el.getAttribute('fill');
          if (fill && (fill.toLowerCase().includes('oklch') || fill.toLowerCase().includes('oklab'))) {
            el.setAttribute('fill', replaceOklch(fill));
          }
          const stroke = el.getAttribute('stroke');
          if (stroke && (stroke.toLowerCase().includes('oklch') || stroke.toLowerCase().includes('oklab'))) {
            el.setAttribute('stroke', replaceOklch(stroke));
          }
        });
      }
    });
  } finally {
    // Restore window.getComputedStyle
    window.getComputedStyle = originalGetComputedStyle;
  }
}
