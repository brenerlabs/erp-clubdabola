import React, { useState, useEffect, useContext, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, writeBatch, orderBy, deleteDoc } from 'firebase/firestore';
import { Product, Customer, SaleItem, Variation, Sale, generatePixPayload, getCustomerLoyaltyTier } from '../types';
import { Search, ShoppingCart, User, Plus, Minus, Trash2, CreditCard, Banknote, QrCode, ClipboardList, Send, X, CheckCircle2, MessageCircle, FileImage, Share2, Receipt, FileText, Sparkles, HelpCircle, Camera, TrendingUp, Truck, Grid, List, LayoutGrid } from 'lucide-react';
import { formatCurrency, cn, cleanObject, cleanVariationName, cleanProductNameWithVariation, formatVariationWithGender, formatProductNameWithGender, smartSearchMatch } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { SidebarContext } from '../App';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { JerseyPreview } from '../components/JerseyPreview';
import html2canvas from 'html2canvas';
import { shareWhatsAppReceipt } from '../lib/whatsappReceipt';

// Helper custom robust copy-to-clipboard for browser sandboxing and iframes
const copyToClipboard = (text: string) => {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      alert("Script de vendas copiado com sucesso! Só colar no WhatsApp do cliente. 💬");
    }).catch(() => {
      fallbackCopyToClipboard(text);
    });
  } else {
    fallbackCopyToClipboard(text);
  }
};

const fallbackCopyToClipboard = (text: string) => {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      alert("Script de vendas copiado com sucesso! Só colar no WhatsApp do cliente. 💬");
    } else {
      alert("Não foi possível copiar automaticamente. Selecione e copie o texto manualmente.");
    }
  } catch (err) {
    alert("Não foi possível copiar automaticamente. Selecione e copie o texto manualmente.");
  }
  document.body.removeChild(textArea);
};

const formatLocalYMD = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const oklchToRgb = (l: number, c: number, h: number): [number, number, number] => {
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

const oklabToRgb = (l: number, a: number, b: number): [number, number, number] => {
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

const parseColorValue = (str: string, percentScale: boolean = false): number => {
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

const replaceOklch = (cssText: string): string => {
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

const createStyleProxy = (style: CSSStyleDeclaration) => {
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

export default function PDV() {
  const { setIsSidebarOpen } = useContext(SidebarContext);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'checkout' | 'prevendas'>('checkout');
  const [loadedPreSaleId, setLoadedPreSaleId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('TODAS');
  const [catalogViewMode, setCatalogViewMode] = useState<'visual' | 'compact' | 'list'>('visual');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [useCustomerBalance, setUseCustomerBalance] = useState<boolean>(false);
  const [shippingRegion, setShippingRegion] = useState<'none' | 'paragominas' | 'saoluis'>('none');
  const [paymentMethod, setPaymentMethod] = useState<'Dinheiro' | 'Cartão' | 'Pix' | 'Fiado'>('Dinheiro');
  const [downPayment, setDownPayment] = useState<string>('');
  const [discountPerc, setDiscountPerc] = useState<string>('0');
  const [discountVal, setDiscountVal] = useState<string>('0');
  const [isFinishing, setIsFinishing] = useState(false);
  const [saleDate, setSaleDate] = useState(formatLocalYMD(new Date()));
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showSizeGuideModal, setShowSizeGuideModal] = useState(false);
  const [generatedSizeGuideImg, setGeneratedSizeGuideImg] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<any>(null);
  const [sendWhatsAppOnFinish, setSendWhatsAppOnFinish] = useState(true);
  const [clickedProductId, setClickedProductId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDirectBillId, setConfirmDirectBillId] = useState<string | null>(null);

  // AI Copilot & Quick Customer states
  const [copilotText, setCopilotText] = useState('');
  const [isCopilotProcessing, setIsCopilotProcessing] = useState(false);
  const [showQuickCustomerModal, setShowQuickCustomerModal] = useState(false);
  const [quickCustName, setQuickCustName] = useState('');
  const [quickCustContact, setQuickCustContact] = useState('');

  useEffect(() => {
    setIsSidebarOpen(false);
    return () => setIsSidebarOpen(true);
  }, [setIsSidebarOpen]);

  useEffect(() => {
    const qProd = query(collection(db, 'products'), orderBy('name', 'asc'));
    const unsubProd = onSnapshot(qProd, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });
    const qCust = query(collection(db, 'customers'), orderBy('name', 'asc'));
    const unsubCust = onSnapshot(qCust, (snapshot) => {
      setCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    });
    const qSales = query(collection(db, 'sales'), orderBy('createdAt', 'desc'));
    const unsubSales = onSnapshot(qSales, (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    });
    const qShipments = query(collection(db, 'shipments'));
    const unsubShipments = onSnapshot(qShipments, (snapshot) => {
      setShipments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'shipments');
    });
    return () => { unsubProd(); unsubCust(); unsubSales(); unsubShipments(); };
  }, []);

  // Helper to calculate the realistic average cost price for a product based on real import batches/shipments (pro-rata)
  const getRealAverageCost = (productId: string, fallbackCost: number): number => {
    // Filter shipments that contain this product
    const productShipments = shipments.filter(s => 
      s.items && s.items.some((item: any) => item.productId === productId || item.productName === products.find(p => p.id === productId)?.name)
    );

    if (productShipments.length === 0) {
      return fallbackCost;
    }

    let totalCalculatedCost = 0;
    let totalItemsCount = 0;

    productShipments.forEach(s => {
      // Find the specific item in this shipment
      const shipItem = s.items.find((item: any) => item.productId === productId || item.productName === products.find(p => p.id === productId)?.name);
      if (shipItem) {
        const itemQty = shipItem.quantity || 1;
        // Correctly detect supplier cost rather than customer purchase price
        let itemSupplierPrice = shipItem.supplierCost !== undefined ? shipItem.supplierCost : null;
        if (itemSupplierPrice === null) {
          const matchingProd = products.find(p => p.id === productId);
          if (matchingProd && matchingProd.costPrice > 0) {
            itemSupplierPrice = matchingProd.costPrice;
          } else {
            // Avoid using selling price for cost if it's way higher than costPrice
            itemSupplierPrice = shipItem.price || 0;
          }
        }

        // Calculate prorated tax for this shipment if hasTax is true
        let unitTax = 0;
        if (s.hasTax && s.taxAmount > 0) {
          const totalPiecesInShipment = s.items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
          if (totalPiecesInShipment > 0) {
            unitTax = s.taxAmount / totalPiecesInShipment;
          }
        }

        // Total cost of this batch item is the purchase price + prorated tax
        const itemUnitCost = itemSupplierPrice + unitTax;
        
        totalCalculatedCost += itemUnitCost * itemQty;
        totalItemsCount += itemQty;
      }
    });

    return totalItemsCount > 0 ? (totalCalculatedCost / totalItemsCount) : fallbackCost;
  };

  const addToCart = (product: Product, variation: Variation) => {
    if (!product.isDropshipping && variation.stock <= 0) return alert('Estoque esgotado!');
    
    const existing = cart.find(item => item.productId === product.id && item.variationId === variation.id);
    if (existing) {
      if (!product.isDropshipping && existing.quantity >= variation.stock) return alert('Limite de estoque atingido!');
      setCart(cart.map(item => 
        (item.productId === product.id && item.variationId === variation.id) 
          ? { ...item, quantity: item.quantity + 1 } 
          : item
      ));
    } else {
      const formattedVariation = cleanVariationName(
        [variation.size, variation.color].join(' / ')
      );

      setCart([...cart, {
        productId: product.id!,
        variationId: variation.id,
        name: product.name,
        variationName: formattedVariation,
        quantity: 1,
        price: product.sellingPrice || 0,
        isDropshipping: product.isDropshipping || false,
        gender: product.gender || 'Ambos'
      }]);
    }
  };

  const handleCopilotSubmit = async () => {
    if (!copilotText.trim()) return;
    setIsCopilotProcessing(true);
    try {
      const res = await fetch('/api/pdv/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: copilotText })
      });
      
      if (!res.ok) {
        let errorMsg = 'Falha ao processar comando com IA';
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errorMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }
      
      const data = await res.json();

      let addedCount = 0;
      // 1. Process items
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: { productSearch: string, quantity: number, size?: string, color?: string }) => {
          // Find matching product using smartSearchMatch
          const matchedProd = products.find(p => {
            const fieldsToSearch = [p.name, p.category, p.id];
            return smartSearchMatch(fieldsToSearch, item.productSearch);
          });

          if (matchedProd) {
            let variation = null;

            if (matchedProd.variations && matchedProd.variations.length > 0) {
              const itemSize = (item.size || '').toUpperCase().trim();
              const itemColor = (item.color || '').toUpperCase().trim();

              if (itemSize || itemColor) {
                variation = matchedProd.variations.find(v => {
                  const vSize = (v.size || '').toUpperCase().trim();
                  const vColor = (v.color || '').toUpperCase().trim();

                  const matchesSize = !itemSize || vSize === itemSize || vSize.includes(itemSize);
                  const matchesColor = !itemColor || vColor === itemColor || vColor.includes(itemColor);

                  return matchesSize && matchesColor;
                });
              }

              // Fallback: match only size
              if (!variation && itemSize) {
                variation = matchedProd.variations.find(v => {
                  const vSize = (v.size || '').toUpperCase().trim();
                  return vSize === itemSize || vSize.includes(itemSize);
                });
              }

              // Fallback: match only color
              if (!variation && itemColor) {
                variation = matchedProd.variations.find(v => {
                  const vColor = (v.color || '').toUpperCase().trim();
                  return vColor === itemColor || vColor.includes(itemColor);
                });
              }

              // Default fallback variation
              if (!variation) {
                variation = matchedProd.variations.find(v => v.stock > 0) || matchedProd.variations[0];
              }
            }

            if (!variation) {
              variation = { id: 'unica', size: 'ÚNICA', color: '', stock: matchedProd.totalStock || 0 };
            }
            
            // Add items corresponding to quantity
            const qtyToAdd = item.quantity || 1;
            for (let i = 0; i < qtyToAdd; i++) {
              addToCart(matchedProd, variation);
            }
            addedCount += qtyToAdd;
          }
        });
      }

      // 2. Process customer Name/WhatsApp
      if (data.customerName) {
        const foundCust = customers.find(c => {
          const cleanStr = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
          const custName = cleanStr(c.name);
          const targetName = cleanStr(data.customerName);
          return targetName && (custName.includes(targetName) || targetName.includes(custName));
        });
        if (foundCust) {
          setSelectedCustomer(foundCust);
        } else {
          // Open quick-customer modal filled!
          setQuickCustName(data.customerName);
          setQuickCustContact(data.customerWhatsapp || '');
          setShowQuickCustomerModal(true);
        }
      }

      if (addedCount > 0) {
        alert(`Copilot processou com sucesso e inseriu ${addedCount} item(ns) no carrinho! ✨`);
      } else {
        alert('Copilot analisou o áudio/texto com IA, mas nenhum item compatível foi localizado no estoque.');
      }
      setCopilotText('');
    } catch (err: any) {
      console.error(err);
      alert('Erro ao processar áudio/texto por IA: ' + (err.message || err));
    } finally {
      setIsCopilotProcessing(false);
    }
  };

  const registerQuickCustomer = async (name: string, contact: string) => {
    if (!name.trim()) return alert('Nome do cliente é obrigatório!');
    try {
      const docRef = await addDoc(collection(db, 'customers'), {
        name: name.trim(),
        contact: contact.trim(),
        totalDebt: 0,
        createdAt: new Date().toISOString()
      });
      const newCust = {
        id: docRef.id,
        name: name.trim(),
        contact: contact.trim(),
        totalDebt: 0
      } as Customer;
      setSelectedCustomer(newCust);
      setShowQuickCustomerModal(false);
      alert(`Cliente ${name} cadastrado com sucesso e selecionado no carrinho! ⚽`);
    } catch (err) {
      console.error(err);
      alert('Erro ao cadastrar cliente de faturamento rápido.');
    }
  };

  const updateQuantity = (pId: string, vId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.productId === pId && item.variationId === vId) {
        const product = products.find(p => p.id === pId);
        const nextQty = item.quantity + delta;
        if (nextQty <= 0) return item;

        if (product && !product.isDropshipping) {
          const variation = product.variations?.find(v => v.id === vId);
          if (variation) {
            if (nextQty > variation.stock) return item;
          } else if (vId === 'unica') {
            if (nextQty > (product.totalStock || 0)) return item;
          }
        }
        return { ...item, quantity: nextQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const updateCustomization = (pId: string, vId: string, updates: Partial<SaleItem>) => {
    setCart(cart.map(item => {
      if (item.productId === pId && item.variationId === vId) {
        return { ...item, ...updates };
      }
      return item;
    }));
  };

  const safeFloat = (val: string | number) => {
    const f = parseFloat(val.toString().replace(',', '.'));
    return isFinite(f) ? f : 0;
  };

  const subtotal = cart.reduce((acc, item) => {
    const productObj = products.find(p => p.id === item.productId);
    const isCamisa = (productObj?.category || '').toLowerCase().includes('camisa') || 
                     (item.name || '').toLowerCase().includes('camisa');
    const customizationFee = (item.isCustomized && isCamisa) ? 30 : 0;
    return acc + ((item.price + customizationFee) * item.quantity);
  }, 0);
  const total = Math.max(0, subtotal - safeFloat(discountVal));

  const freshCustomerForUI = selectedCustomer ? (customers.find(c => c.id === selectedCustomer.id) || selectedCustomer) : null;
  const customerBalanceForUI = freshCustomerForUI ? (freshCustomerForUI.balance !== undefined ? freshCustomerForUI.balance : -(freshCustomerForUI.totalDebt || 0)) : 0;
  const appliedBalanceForUI = (useCustomerBalance && customerBalanceForUI > 0) ? Math.min(customerBalanceForUI, total) : 0;
  const saleTotalForUI = Math.max(0, total - appliedBalanceForUI);

  const handleDiscountPercChange = (valStr: string) => {
    const val = valStr.replace(',', '.');
    setDiscountPerc(valStr);
    const p = parseFloat(val) || 0;
    const v = (subtotal * p) / 100;
    setDiscountVal(v.toFixed(2).replace('.', ','));
  };

  const handleDiscountValChange = (valStr: string) => {
    const val = valStr.replace(',', '.');
    setDiscountVal(valStr);
    const v = parseFloat(val) || 0;
    const p = subtotal > 0 ? (v * 100) / subtotal : 0;
    setDiscountPerc(p.toFixed(1).replace('.', ','));
  };
  const loadPreSale = (preSale: Sale) => {
    setCart(preSale.items);
    
    const customer = customers.find(c => c.id === preSale.customerId);
    setSelectedCustomer(customer || null);
    setUseCustomerBalance(false);
    
    // Set discount values
    if (preSale.discount > 0) {
      setDiscountVal(preSale.discount.toString());
      const sub = preSale.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
      const perc = sub > 0 ? (preSale.discount * 100) / sub : 0;
      setDiscountPerc(perc.toFixed(1).replace('.', ','));
    } else {
      setDiscountVal('0');
      setDiscountPerc('0');
    }
    
    setPaymentMethod(preSale.paymentMethod || 'Dinheiro');
    setDownPayment(preSale.downPayment ? preSale.downPayment.toString() : '');
    
    if (preSale.createdAt) {
      try {
        const d = new Date(preSale.createdAt.seconds ? preSale.createdAt.seconds * 1000 : preSale.createdAt);
        setSaleDate(formatLocalYMD(d));
      } catch (err) {
        setSaleDate(formatLocalYMD(new Date()));
      }
    }
    
    setLoadedPreSaleId(preSale.id || null);
    setActiveTab('checkout');
  };

  const deletePreSale = async (preSaleId: string) => {
    try {
      await deleteDoc(doc(db, 'sales', preSaleId));
      if (loadedPreSaleId === preSaleId) {
        setLoadedPreSaleId(null);
      }
      setConfirmDeleteId(null);
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir pré-venda.");
    }
  };

  const convertPreSaleToSaleDirect = async (preSale: Sale) => {
    setIsFinishing(true);
    try {
      const batch = writeBatch(db);
      const saleRef = doc(db, 'sales', preSale.id!);

      const subtotal = preSale.subtotal;
      const finalDiscount = preSale.discount;
      const finalDownPayment = preSale.downPayment || 0;
      const saleTotal = preSale.total;
      const debtAmount = preSale.paymentMethod === 'Fiado' ? Math.max(0, saleTotal - finalDownPayment) : 0;
      const finalStatus = preSale.paymentMethod === 'Fiado' && debtAmount > 0 ? 'Pendente' : 'Concluída';
      const finalDate = new Date();

      // 1. Update Sale Status & History
      const updatedHistory = [
        ...(preSale.history || []),
        {
          status: finalStatus,
          updatedAt: finalDate,
          notes: 'Orçamento faturado diretamente com um clique'
        }
      ];

      batch.update(saleRef, cleanObject({
        status: finalStatus,
        history: updatedHistory,
        createdAt: finalDate,
        debtAmount
      }));

      // 2. Update Stock (Skip for dropshipping)
      preSale.items.forEach(item => {
        if (item.isDropshipping) return;

        const product = products.find(p => p.id === item.productId);
        if (product) {
          let nextVariations = product.variations || [];
          let nextTotalStock = product.totalStock || 0;
          if (nextVariations.length > 0) {
            nextVariations = nextVariations.map(v => 
              v.id === item.variationId ? { ...v, stock: Math.max(0, v.stock - item.quantity) } : v
            );
            nextTotalStock = nextVariations.reduce((acc, v) => acc + v.stock, 0);
          } else {
            nextTotalStock = Math.max(0, nextTotalStock - item.quantity);
          }

          batch.update(doc(db, 'products', item.productId), cleanObject({
            variations: nextVariations,
            totalStock: nextTotalStock,
            updatedAt: serverTimestamp()
          }));
        }
      });

      // 3. Update Customer Debt & Transactions
      if (preSale.customerId) {
        const customer = customers.find(c => c.id === preSale.customerId);
        if (customer) {
          if (preSale.paymentMethod === 'Fiado') {
            if (finalDownPayment > 0) {
              const entryTransRef = doc(collection(db, 'transactions'));
              batch.set(entryTransRef, cleanObject({
                customerId: preSale.customerId,
                amount: finalDownPayment,
                type: 'payment',
                paymentMethod: 'Dinheiro',
                saleId: preSale.id,
                createdAt: finalDate
              }));
            }

            if (debtAmount > 0) {
              batch.update(doc(db, 'customers', preSale.customerId), cleanObject({
                totalDebt: Math.max(0, (customer.totalDebt || 0) + debtAmount),
                updatedAt: serverTimestamp()
              }));

              const debtTransRef = doc(collection(db, 'transactions'));
              batch.set(debtTransRef, cleanObject({
                customerId: preSale.customerId,
                amount: debtAmount,
                type: 'debt',
                paymentMethod: 'Fiado',
                saleId: preSale.id,
                createdAt: finalDate
              }));
            }
          } else {
            const transRef = doc(collection(db, 'transactions'));
            batch.set(transRef, cleanObject({
              customerId: preSale.customerId,
              amount: saleTotal,
              type: 'payment',
              paymentMethod: preSale.paymentMethod || 'Dinheiro',
              saleId: preSale.id,
              createdAt: finalDate
            }));
          }
        }
      }

      await batch.commit();
      alert(`Orçamento #${preSale.id?.slice(-6).toUpperCase()} faturado e finalizado com sucesso!`);
      
      if (loadedPreSaleId === preSale.id) {
        setLoadedPreSaleId(null);
        setCart([]);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao faturar orçamento diretamente.");
    } finally {
      setIsFinishing(false);
    }
  };

  const finishSale = async (isPreSale = false) => {
    if (cart.length === 0) {
      alert('Selecione pelo menos um produto para finalizar!');
      return;
    }
    if (!isPreSale && paymentMethod === 'Fiado' && !selectedCustomer) {
      alert('Selecione um cliente para venda no Fiado!');
      return;
    }

    setIsFinishing(true);
    try {
      const batch = writeBatch(db);
      
      const subtotal = cart.reduce((acc, item) => {
        const productObj = products.find(p => p.id === item.productId);
        const isCamisa = (productObj?.category || '').toLowerCase().includes('camisa') || 
                         (item.name || '').toLowerCase().includes('camisa');
        const customizationFee = (item.isCustomized && isCamisa) ? 30 : 0;
        return acc + ((item.price + customizationFee) * item.quantity);
      }, 0);
      const finalDiscount = safeFloat(discountVal);
      const finalDownPayment = isPreSale ? 0 : safeFloat(downPayment);
      const saleTotal = Math.max(0, subtotal - finalDiscount);

      // Balance & Credit calculations
      const freshCustomer = selectedCustomer ? (customers.find(c => c.id === selectedCustomer.id) || selectedCustomer) : null;
      const customerBalance = freshCustomer ? (freshCustomer.balance !== undefined ? freshCustomer.balance : -(freshCustomer.totalDebt || 0)) : 0;
      const appliedBalance = (!isPreSale && useCustomerBalance && customerBalance > 0) ? Math.min(customerBalance, saleTotal) : 0;
      const finalSaleTotal = Math.max(0, saleTotal - appliedBalance);

      const debtAmount = !isPreSale && paymentMethod === 'Fiado' ? Math.max(0, finalSaleTotal - finalDownPayment) : 0;

      // Ensure stable date
      let finalDate: Date = new Date();
      if (saleDate) {
        try {
          const [y, m, d] = saleDate.split('-').map(Number);
          const now = new Date();
          finalDate = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
          if (isNaN(finalDate.getTime())) finalDate = new Date();
        } catch (e) {
          finalDate = new Date();
        }
      }

      // 1. Create/Update Sale Record
      const saleRef = loadedPreSaleId ? doc(db, 'sales', loadedPreSaleId) : doc(collection(db, 'sales'));
      const finalStatus = isPreSale ? 'Pré-venda' : (paymentMethod === 'Fiado' && debtAmount > 0 ? 'Pendente' : 'Concluída');
      
      const saleData = {
        customerId: selectedCustomer?.id || null,
        customerName: selectedCustomer?.name || 'Consumidor Final',
        items: cart.map(item => {
          const productObj = products.find(p => p.id === item.productId);
          const isCamisa = (productObj?.category || '').toLowerCase().includes('camisa') || 
                           (item.name || '').toLowerCase().includes('camisa');
          const customizationFee = (item.isCustomized && isCamisa) ? 30 : 0;
          return {
            productId: item.productId || null,
            variationId: item.variationId || null,
            name: item.name || '',
            variationName: item.variationName || '',
            quantity: item.quantity || 0,
            price: (item.price || 0) + customizationFee,
            isDropshipping: !!item.isDropshipping,
            gender: item.gender || null,
            isCustomized: !!item.isCustomized,
            customName: item.customName || null,
            customNumber: item.customNumber || null
          };
        }),
        subtotal,
        discount: finalDiscount,
        total: saleTotal,
        appliedBalance: appliedBalance || 0,
        downPayment: finalDownPayment,
        debtAmount,
        paymentMethod: isPreSale ? 'Dinheiro' : paymentMethod,
        status: finalStatus,
        createdAt: finalDate,
        systemCreatedAt: serverTimestamp(),
        customerContact: selectedCustomer?.contact || null,
        history: [{
          status: finalStatus,
          updatedAt: finalDate,
          notes: isPreSale ? 'Pré-venda gravada' : (loadedPreSaleId ? 'Pré-venda convertida em Venda' : 'Venda finalizada no PDV')
        }]
      };

      batch.set(saleRef, cleanObject(saleData));

      // ONLY for a real sale (not pre-sale):
      if (!isPreSale) {
        // 2. Update Stock (Skip for dropshipping)
        cart.forEach(item => {
          if (item.isDropshipping) return;
          
          const product = products.find(p => p.id === item.productId);
          if (product) {
            let nextVariations = product.variations || [];
            let nextTotalStock = product.totalStock || 0;
            if (nextVariations.length > 0) {
              nextVariations = nextVariations.map(v => 
                v.id === item.variationId ? { ...v, stock: Math.max(0, v.stock - item.quantity) } : v
              );
              nextTotalStock = nextVariations.reduce((acc, v) => acc + v.stock, 0);
            } else {
              nextTotalStock = Math.max(0, nextTotalStock - item.quantity);
            }
            batch.update(doc(db, 'products', item.productId), cleanObject({
              variations: nextVariations,
              totalStock: nextTotalStock,
              updatedAt: serverTimestamp()
            }));
          }
        });

        // 3. Update Customer Debt and Transactions
        if (selectedCustomer) {
          const freshCustomer = customers.find(c => c.id === selectedCustomer.id) || selectedCustomer;
          const currentBalance = freshCustomer.balance !== undefined ? freshCustomer.balance : -(freshCustomer.totalDebt || 0);
          
          // Deduct applied balance and/or add debt
          const nextBalance = currentBalance - appliedBalance - debtAmount;
          const nextDebt = nextBalance < 0 ? Math.abs(nextBalance) : 0;
          
          batch.update(doc(db, 'customers', freshCustomer.id), cleanObject({
            balance: nextBalance,
            totalDebt: nextDebt,
            updatedAt: serverTimestamp()
          }));

          // Record individual transactions
          if (appliedBalance > 0) {
            const balanceTransRef = doc(collection(db, 'transactions'));
            batch.set(balanceTransRef, cleanObject({
              customerId: freshCustomer.id || null,
              amount: appliedBalance,
              type: 'payment',
              paymentMethod: 'Saldo',
              saleId: saleRef.id,
              createdAt: finalDate
            }));
          }

          if (paymentMethod === 'Fiado') {
            if (finalDownPayment > 0) {
              const entryTransRef = doc(collection(db, 'transactions'));
              batch.set(entryTransRef, cleanObject({
                customerId: freshCustomer.id || null,
                amount: finalDownPayment,
                type: 'payment',
                paymentMethod: 'Dinheiro',
                saleId: saleRef.id,
                createdAt: finalDate
              }));
            }

            if (debtAmount > 0) {
              const debtTransRef = doc(collection(db, 'transactions'));
              batch.set(debtTransRef, cleanObject({
                customerId: freshCustomer.id || null,
                amount: debtAmount,
                type: 'debt',
                paymentMethod: 'Fiado',
                saleId: saleRef.id,
                createdAt: finalDate
              }));
            }
          } else {
            // For other payment methods (Pix, Dinheiro, Cartão, etc.)
            // The user pays finalSaleTotal
            if (finalSaleTotal > 0) {
              const paymentTransRef = doc(collection(db, 'transactions'));
              batch.set(paymentTransRef, cleanObject({
                customerId: freshCustomer.id || null,
                amount: finalSaleTotal,
                type: 'payment',
                paymentMethod,
                saleId: saleRef.id,
                createdAt: finalDate
              }));
            }
          }
        } else {
          if (finalSaleTotal > 0) {
            const paymentTransRef = doc(collection(db, 'transactions'));
            batch.set(paymentTransRef, cleanObject({
              customerId: 'Consumidor Final',
              amount: finalSaleTotal,
              type: 'payment',
              paymentMethod,
              saleId: saleRef.id,
              createdAt: finalDate
            }));
          }
        }
      }

      await batch.commit();

      const finishedSale = {
        id: saleRef.id,
        customerName: selectedCustomer?.name || 'Consumidor Final',
        customerContact: selectedCustomer?.contact || null,
        items: [...cart],
        total: saleTotal,
        appliedBalance: appliedBalance,
        downPayment: finalDownPayment,
        debtAmount: debtAmount,
        paymentMethod: isPreSale ? 'Dinheiro' : paymentMethod,
        date: finalDate,
        status: finalStatus
      };

      setLastSale(finishedSale);
      setShowSuccessModal(true);

      // Reset Form
      setCart([]);
      setSelectedCustomer(null);
      setPaymentMethod('Dinheiro');
      setDownPayment('');
      setDiscountPerc('0');
      setDiscountVal('0');
      setSaleDate(formatLocalYMD(new Date()));
      setLoadedPreSaleId(null);

      // Handle Auto WhatsApp (For both real sales and pre-sales / budgets)
      if (sendWhatsAppOnFinish && selectedCustomer?.contact) {
        try {
          shareWhatsApp(finishedSale);
        } catch (e) {
          console.warn("WhatsApp auto-trigger blocked by browser:", e);
        }
      }
    } catch (err: any) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, 'PDV_Batch_Commit');
    } finally {
      setIsFinishing(false);
    }
  };

  const effectiveProducts = useMemo(() => {
    return products.map(product => {
      const activeShipmentsList = shipments.filter(s => s.status !== 'Recebido' && s.status !== 'Entregue');
      
      const updatedVariations = (product.variations || []).map(v => {
        const inTransitQty = activeShipmentsList.reduce((acc, s) => {
          const matchingItems = (s.items || []).filter((item: any) => 
            item.productId === product.id && 
            item.variationId === v.id && 
            item.customerId === 'estoque' && 
            item.showInPDV === true
          );
          return acc + matchingItems.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);
        }, 0);

        return {
          ...v,
          stock: (v.stock || 0) + inTransitQty
        };
      });

      const noVarInTransitQty = activeShipmentsList.reduce((acc, s) => {
        const matchingItems = (s.items || []).filter((item: any) => 
          item.productId === product.id && 
          item.customerId === 'estoque' && 
          item.showInPDV === true &&
          (!item.variationId || item.variationId === '' || item.variationId === 'unica')
        );
        return acc + matchingItems.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);
      }, 0);

      const totalStock = updatedVariations.length > 0 
        ? updatedVariations.reduce((acc, v) => acc + (v.stock || 0), 0)
        : (product.totalStock || 0) + noVarInTransitQty;

      return {
        ...product,
        variations: updatedVariations,
        totalStock
      };
    });
  }, [products, shipments]);

  const filteredProducts = effectiveProducts.filter(p => {
    const matchesSearch = smartSearchMatch([p.name, p.category, p.id], search);
    const matchesCategory = selectedCategory === 'TODAS' || (p.category || '').toUpperCase().trim() === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categoriesList = useMemo(() => {
    const cats = new Set<string>();
    effectiveProducts.forEach(p => {
      if (p.category) {
        cats.add(p.category.toUpperCase().trim());
      }
    });
    return ['TODAS', ...Array.from(cats).sort()];
  }, [effectiveProducts]);

  const shareWhatsApp = (saleToShare?: any) => {
    const sale = saleToShare || lastSale;
    if (!sale) return;
    shareWhatsAppReceipt(sale, products);
  };

  const getBudgetWhatsAppUrl = () => {
    const now = new Date();
    const validityDate = new Date();
    validityDate.setDate(now.getDate() + 7); // Valid for 7 days
    const discountValue = safeFloat(discountVal);

    const textItems = cart.map((i: any) => {
      const itemGender = i.gender || products.find(p => p.id === i.productId || p.name === i.name)?.gender || 'Ambos';
      let row = `- ${formatProductNameWithGender(i.name, itemGender)} [${i.variationName}] x${i.quantity}: ${formatCurrency(i.price * i.quantity)}`;
      if (i.isCustomized && i.customName) {
        row += `\n  └ 👕 Personalizado: NOME: "${i.customName}" | Nº: ${i.customNumber || 'S/N'}`;
      }
      return row;
    }).join('\n');

    const budgetPixPayload = generatePixPayload(total);
    const whatsappText = `⚽ *CLUB DA BOLA - Orçamento* ⚽\n` +
      `-------------------------------------------\n` +
      `👤 *Cliente:* ${selectedCustomer ? selectedCustomer.name : 'Consumidor Final'}\n` +
      `📅 *Data de Emissão:* ${now.toLocaleString('pt-BR')}\n` +
      `⏳ *Validade:* ${validityDate.toLocaleDateString('pt-BR')} (7 dias)\n` +
      `-------------------------------------------\n` +
      `📦 *Itens do Orçamento:*\n${textItems}\n` +
      `-------------------------------------------\n` +
      (discountValue > 0 ? `💵 *Subtotal:* ${formatCurrency(subtotal)}\n` : '') +
      (discountValue > 0 ? `💸 *Desconto Aplicado:* -${formatCurrency(discountValue)}\n` : '') +
      `💰 *VALOR TOTAL: ${formatCurrency(total)}*\n` +
      `-------------------------------------------\n` +
      `💳 *DADOS PARA PAGAMENTO VIA PIX:*\n` +
      `• Beneficiário: *Brener Gomes*\n` +
      `• Chave Celular: \`91993249580\`\n` +
      `-------------------------------------------\n` +
      `📞 *Contato Club da Bola:*\n` +
      `• WhatsApp: (91) 99324-9580\n\n` +
      `*Atenção:* O PDF completo e detalhado do seu orçamento foi gerado e baixado no seu dispositivo. Favor anexá-lo a esta conversa para fechar seu pedido!\n\n_Produzido por: Brener Gomes_`;

    const encoded = encodeURIComponent(whatsappText);
    const phone = selectedCustomer?.contact ? selectedCustomer.contact.replace(/\D/g, '') : '';
    let finalPhone = phone;
    if (phone && phone.length <= 11) {
      finalPhone = '55' + phone;
    }
    return `https://wa.me/${finalPhone}?text=${encoded}`;
  };

  const openBudgetWhatsApp = () => {
    const url = getBudgetWhatsAppUrl();
    try {
      window.open(url, '_blank');
    } catch (err) {
      alert("Não foi possível redirecionar para o WhatsApp automaticamente.");
    }
  };

  const generateBudgetPDF = (isManualDownloadOnly: boolean = false) => {
    if (cart.length === 0) return alert('O carrinho está vazio!');

    const doc = new jsPDF();
    const now = new Date();
    const validityDate = new Date();
    validityDate.setDate(now.getDate() + 7); // Valid for 7 days

    // PDF Page Design & Header
    doc.setFillColor(15, 23, 42); // slate-900 (Dark Slate Background for Header)
    doc.rect(0, 0, 210, 42, 'F');

    // Header Title
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text('CLUB DA BOLA', 14, 18);

    doc.setFontSize(9);
    doc.setTextColor(239, 68, 68); // Soft Red text
    doc.text('ERP SYSTEM • ORÇAMENTO DE PRODUTOS', 14, 25);

    const customLogoUrl = localStorage.getItem('erp-custom-logo');
    let hasLogo = false;

    if (customLogoUrl) {
      try {
        let format = 'PNG';
        if (customLogoUrl.includes('image/jpeg') || customLogoUrl.includes('image/jpg')) {
          format = 'JPEG';
        } else if (customLogoUrl.includes('image/webp')) {
          format = 'WEBP';
        }
        // Place the logo on the right side of the header
        doc.addImage(customLogoUrl, format, 168, 4, 34, 34, undefined, 'FAST');
        hasLogo = true;
      } catch (imgError) {
        console.error("Error drawing custom logo in PDF:", imgError);
      }
    }

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text(`PROPOSTA COMERCIAL / PRÉ-VENDA COMERCIAL`, 14, 32);
    doc.text(`Gerado em: ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')} | Produzido por: Brener Gomes`, hasLogo ? 65 : 100, 32);

    // Club da Bola info section on header right or subheader
    // Let's make an organization details card
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(248, 250, 252); // slate-50
    doc.roundedRect(14, 50, 182, 38, 4, 4, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('DADOS DO DOCUMENTO & CONTATO', 20, 58);

    doc.setDrawColor(226, 232, 240);
    doc.line(20, 62, 190, 62);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);

    doc.text(`Cliente:`, 20, 68);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(selectedCustomer ? selectedCustomer.name : 'Consumidor Final', 60, 68);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Contato Cliente:`, 20, 74);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(selectedCustomer?.contact || 'S/D', 60, 74);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Emissor:`, 20, 80);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Club da Bola`, 60, 80);

    // Contato Club da Bola block
    doc.setFillColor(254, 243, 199); // amber-50
    doc.setDrawColor(245, 158, 11); // amber-500
    doc.roundedRect(132, 65, 58, 15, 3, 3, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(146, 64, 14); // amber-800
    doc.text('CONTATO CLUB DA BOLA', 136, 70);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(146, 64, 14);
    doc.text('WhatsApp: (91) 99324-9580', 136, 75);

    // 3. Financial Summary card in PDF
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, 94, 182, 26, 4, 4, 'FD');

    const discountValue = safeFloat(discountVal);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('SUBTOTAL DOS ITENS', 20, 102);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(subtotal), 20, 111);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('DESCONTOS APLICADOS', 80, 102);
    doc.setFontSize(11);
    doc.setTextColor(discountValue > 0 ? 153 : 15, discountValue > 0 ? 27 : 23, discountValue > 0 ? 27 : 42);
    doc.text(`-${formatCurrency(discountValue)}`, 80, 111);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('TOTAL ESTIMADO', 140, 102);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(total), 140, 111);

    // 4. Detailed Items Table
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('LISTA DE ITENS SELECIONADOS NO ORÇAMENTO', 14, 130);

    const tableRows = cart.map((item, idx) => {
      const pIdx = idx + 1;
      const itemGender = item.gender || products.find(p => p.id === item.productId || p.name === item.name)?.gender || 'Ambos';
      const variationName = formatVariationWithGender(item.variationName, itemGender) || 'Grade Única';
      const productObj = products.find(p => p.id === item.productId);
      const isCamisa = (productObj?.category || '').toLowerCase().includes('camisa') || 
                       (item.name || '').toLowerCase().includes('camisa');
      const customizationFee = (item.isCustomized && isCamisa) ? 30 : 0;
      const finalPrice = item.price + customizationFee;
      const unitPriceStr = formatCurrency(finalPrice);
      const qtyStr = `${item.quantity} UN`;
      const subtotalItemStr = formatCurrency(finalPrice * item.quantity);

      let productName = cleanProductNameWithVariation(item.name);
      if (item.isCustomized && item.customName) {
        productName += `\n[Personalizado: NOME: ${item.customName} | Nº: ${item.customNumber || 'S/N'}]`;
      }

      return [pIdx, productName, variationName, qtyStr, unitPriceStr, subtotalItemStr];
    });

    autoTable(doc, {
      startY: 135,
      head: [['#', 'Produto/SKU', 'Grade/Variação', 'Quantidade', 'Preço Unit.', 'Total Líquido']],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 8.5,
        font: 'Helvetica'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 70 },
        2: { cellWidth: 35, halign: 'center' },
        3: { halign: 'center', cellWidth: 20 },
        4: { halign: 'right', cellWidth: 22 },
        5: { halign: 'right', cellWidth: 25, fontStyle: 'bold' }
      }
    });

    // Valid conditions
    const finalY = (doc as any).lastAutoTable.finalY + 12;
    doc.setFont('Helvetica', 'oblique');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);

    doc.text(`Observações importantes:`, 14, finalY);
    doc.text(`• Proposta comercial válida até: ${validityDate.toLocaleDateString('pt-BR')}.`, 14, finalY + 5);
    doc.text(`• O presente documento não garante reserva de mercadoria física em estoque prévia à aprovação.`, 14, finalY + 10);
    doc.text(`• Club da Bola • Atendimento esportivo de excelência.`, 14, finalY + 15);

    const fileSlug = (selectedCustomer ? selectedCustomer.name : 'avulso').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
    doc.save(`orcamento-clubdabola-${fileSlug}.pdf`);

    if (!isManualDownloadOnly) {
      setShowBudgetModal(true);
    }
  };

  const [isCartVisible, setIsCartVisible] = useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-auto md:h-[calc(100vh-140px)] flex flex-col md:flex-row gap-4 md:gap-6 relative pb-16 md:pb-4 min-h-screen md:min-h-0"
    >
      {/* Mobile Cart Toggle Bar */}
      <div className="md:hidden sticky top-0 bg-slate-950/95 backdrop-blur-md p-3 rounded-2xl text-white shadow-xl z-[45] flex items-center justify-between border border-white/5 mx-1 mb-2">
        <div className="flex items-center gap-2">
          <div className="size-10 bg-red-800/20 rounded-xl flex items-center justify-center border border-red-800/30">
            <ShoppingCart size={20} className="text-red-500" />
          </div>
          <div>
            <p className="text-[7px] font-black uppercase tracking-widest text-white/50 leading-none mb-1 font-sans">Subtotal</p>
            <p className="text-lg font-black leading-none font-display tabular-nums tracking-tight">{formatCurrency(total)}</p>
          </div>
        </div>
        <button 
          onClick={() => setIsCartVisible(!isCartVisible)}
          className={cn(
            "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-lg",
            isCartVisible ? "bg-slate-800 text-white" : "bg-red-800 text-white shadow-red-800/20"
          )}
        >
          {isCartVisible ? 'Voltar' : 'Finalizar'}
        </button>
      </div>

      {/* Success Modal */}
      {/* ... (Success modal remains the same as it uses fixed inset-0) */}
      <AnimatePresence>
        {showSuccessModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.93, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-white rounded-[32px] shadow-2xl relative z-10 w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-8 text-center bg-red-800 text-white relative">
                <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                  <CheckCircle2 size={240} className="-translate-x-1/4 -translate-y-1/4 text-amber-500" />
                </div>
                <div className="size-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm overflow-hidden p-3 border border-white/10">
                   <CheckCircle2 size={40} className="text-amber-500" />
                </div>
                <h3 className="text-2xl font-black tracking-tight italic uppercase font-sans">Venda Finalizada!</h3>
                <p className="text-white/60 font-bold opacity-80 mt-1 uppercase text-[10px] tracking-widest">Transação processada com sucesso.</p>
              </div>

              <div className="p-8 space-y-6">
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 text-center font-sans">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Total Recebido</p>
                  <p className="text-4xl font-black text-slate-900 tracking-tighter font-display tabular-nums leading-none">{formatCurrency(lastSale?.total || 0)}</p>
                  <p className="text-[10px] font-black text-slate-500 mt-2 uppercase tracking-widest leading-none">{lastSale?.paymentMethod} • {lastSale?.customerName}</p>
                  {lastSale?.downPayment > 0 && (
                    <div className="mt-3 flex justify-center gap-4 text-[10px] font-black uppercase tracking-tight">
                       <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">Entrada: {formatCurrency(lastSale.downPayment)}</span>
                       <span className="text-red-800 bg-red-50 px-2 py-1 rounded-lg">Pendente: {formatCurrency(lastSale.debtAmount)}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => {
                      setShowSuccessModal(false);
                      setShowDetailsModal(true);
                    }}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-100 text-slate-800 rounded-2xl hover:bg-slate-200 transition-all group font-black"
                  >
                    <ClipboardList size={24} className="group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Ver Detalhes</span>
                  </button>
                  <button 
                    onClick={() => shareWhatsApp()}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-amber-50 text-amber-700 rounded-2xl hover:bg-amber-100 transition-all group font-black"
                  >
                    <MessageCircle size={24} className="group-hover:scale-110 transition-transform text-amber-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Enviar WhatsApp</span>
                  </button>
                </div>

                {/* Insight 1: Alavancar Prova Social & WhatsApp Photo Booster */}
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 space-y-2 text-left">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={14} className="shrink-0 animate-bounce text-amber-500" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">Alavancar Prova Social (Insight #1)</span>
                  </div>
                  <p className="text-[10px] text-slate-600 leading-normal font-sans font-semibold">
                    Colete fotos reais dos mantos no corpo para seu mural! Envie o roteiro de incentivo com cupom de desconto para elevar suas conversões em 40%.
                  </p>
                  
                  {lastSale?.customerContact ? (
                    <button 
                      type="button"
                      onClick={() => {
                        const custName = lastSale?.customerName || 'Campeão';
                        const message = `Fala, *${custName}*! Tudo bem? ⚽\n\nPassando para agradecer a preferência no *Club da Bola*! Seu manto já chegou e aposto que ficou daquele jeito! 🤩\n\nPoderia fortalecer nossa opinião tirando uma foto irada vestindo a camisa para nosso Mural de Clientes? 📸\n\nPra te premiar, na sua próxima compra você ganha 10% de desconto ou Frete Grátis com o cupom: *DESCONTO10*. Que tal?\n\nForte abraço! Tamo junto! 🔥🤙\n\n_Produzido por: Brener Gomes_`;
                        const phone = lastSale.customerContact ? lastSale.customerContact.replace(/\D/g, '') : '';
                        const finalPhone = phone && phone.length <= 11 ? '55' + phone : phone;
                        window.open(`https://wa.me/${finalPhone}?text=${encodeURIComponent(message)}`, '_blank');
                      }}
                      className="w-full py-2.5 bg-slate-900 border border-slate-950 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-1.5 hover:scale-[1.01]"
                    >
                      <Camera size={12} className="text-amber-400" /> Solicitar Foto do Manto no Whats 📸
                    </button>
                  ) : (
                    <div className="p-2 bg-slate-100 rounded-xl text-center border border-slate-200">
                      <p className="text-[8.5px] text-slate-500 uppercase font-black tracking-wider leading-none">Sem celular cadastrado para este cliente</p>
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => setShowSuccessModal(false)}
                  className="w-full py-4 bg-red-800 text-white font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-black transition-all shadow-xl shadow-red-900/20"
                >
                  Continuar Vendendo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Details Modal */}
      <AnimatePresence>
        {showDetailsModal && lastSale && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              onClick={() => setShowDetailsModal(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.93, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-white rounded-[40px] shadow-2xl relative z-10 w-full max-w-lg overflow-hidden border border-slate-200"
            >
              <div className="p-8 bg-slate-950 text-white relative">
                 <button 
                   onClick={() => setShowDetailsModal(false)}
                   className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors"
                 >
                   <X size={24} />
                 </button>
                 <div className="flex items-center gap-4 mb-2">
                   <div className="size-12 bg-red-800 rounded-2xl flex items-center justify-center shadow-lg border border-white/5">
                      <Receipt size={24} className="text-white" />
                   </div>
                   <div>
                      <h3 className="text-2xl font-bold tracking-tight uppercase font-display">Detalhes da <span className="text-amber-500">Venda</span></h3>
                      <p className="text-[9px] font-black uppercase text-white/40 tracking-[0.3em]">ID: {lastSale.id}</p>
                   </div>
                 </div>
              </div>

              <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh] custom-scrollbar">
                {/* Sale Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Cliente</p>
                    <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{lastSale.customerName}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Pagamento</p>
                    <p className="text-sm font-black text-red-800 uppercase tracking-tight">{lastSale.paymentMethod}</p>
                  </div>
                </div>

                {/* Items List */}
                <div className="space-y-4">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2 border-l-2 border-amber-500">Itens do Pedido</p>
                  <div className="space-y-2">
                    {lastSale.items.map((item: any, idx: number) => {
                      const itemGender = item.gender || products.find(p => p.id === item.productId || p.name === item.name)?.gender || 'Ambos';
                      return (
                        <div key={idx} className="flex justify-between items-center p-4 bg-white rounded-3xl border border-slate-100 shadow-sm">
                           <div>
                              <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{formatProductNameWithGender(item.name, itemGender)}</p>
                              <div className="flex items-center gap-3">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                                  {`x ${item.quantity}`} {item.variationName ? `[${item.variationName}]` : ''}
                                </p>
                              </div>
                              {item.isCustomized && item.customName && (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-2.5 py-1 text-[9px] font-black uppercase text-amber-700 tracking-wider w-fit">
                                  <Sparkles size={11} className="text-amber-500 animate-pulse" />
                                  <span>👕 Personalizado:</span>
                                  <span className="font-bold underline text-slate-900">{item.customName}</span>
                                  <span>• Nº</span>
                                  <span className="font-bold underline text-slate-900">{item.customNumber || 'S/N'}</span>
                                </div>
                              )}
                           </div>
                           <p className="text-sm font-black text-red-800">{formatCurrency(item.price * item.quantity)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Financial Breakdown */}
                <div className="bg-slate-950 rounded-[32px] p-6 text-white space-y-3 font-sans border border-slate-900">
                  <div className="flex justify-between items-center opacity-40 text-[10px] font-black uppercase tracking-widest">
                     <span>Subtotal</span>
                     <span>{formatCurrency(lastSale.items.reduce((acc: number, i: any) => acc + (i.price * i.quantity), 0))}</span>
                  </div>
                  <div className="flex justify-between items-center opacity-40 text-[10px] font-black uppercase tracking-widest">
                     <span>Descontos</span>
                     <span>-{formatCurrency(lastSale.items.reduce((acc: number, i: any) => acc + (i.price * i.quantity), 0) - lastSale.total)}</span>
                  </div>
                  <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                     <span className="text-xs font-black uppercase tracking-[0.2em] text-amber-500">Total da Venda</span>
                     <span className="text-3xl font-bold tracking-tight">{formatCurrency(lastSale.total)}</span>
                  </div>
                  {lastSale.downPayment > 0 && (
                    <div className="pt-3 border-t border-white/5 grid grid-cols-2 gap-4">
                       <div>
                          <p className="text-[9px] font-black uppercase text-amber-500 mb-1 tracking-widest">Entrada Paga</p>
                          <p className="text-sm font-black text-white">{formatCurrency(lastSale.downPayment)}</p>
                       </div>
                       <div>
                          <p className="text-[9px] font-black uppercase text-red-800 mb-1 tracking-widest">Saldo Pendente</p>
                          <p className="text-sm font-black text-white">{formatCurrency(lastSale.debtAmount)}</p>
                       </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => shareWhatsApp()}
                    className="flex items-center justify-center gap-2 p-4 bg-amber-500 text-slate-950 rounded-2xl hover:bg-amber-600 transition-all font-black uppercase tracking-widest text-[10px] shadow-lg shadow-amber-500/20"
                  >
                    <MessageCircle size={18} />
                    WhatsApp
                  </button>
                  <button 
                    onClick={() => setShowDetailsModal(false)}
                    className="flex items-center justify-center gap-2 p-4 bg-slate-900 text-white rounded-2xl hover:bg-black transition-all font-black uppercase tracking-widest text-[10px]"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Budget Generated Modal */}
      <AnimatePresence>
        {showBudgetModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              onClick={() => setShowBudgetModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.93, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-white rounded-[32px] shadow-2xl relative z-10 w-full max-w-sm overflow-hidden border border-slate-200"
            >
              <div className="p-8 text-center bg-slate-900 text-white relative">
                <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
                  <FileText size={240} className="-translate-x-1/4 -translate-y-1/4" />
                </div>
                <div className="size-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm p-3 border border-white/5">
                  <FileText size={32} className="text-amber-500" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight italic">Orçamento Pronto!</h3>
                <p className="text-white/60 font-bold opacity-80 mt-1 uppercase text-[9px] tracking-widest leading-relaxed">
                  Gerado e disponibilizado para envio e download.
                </p>
              </div>

              <div className="p-6 space-y-5">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-center font-sans">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Calculado</p>
                  <p className="text-3xl font-black text-slate-900 tracking-tighter leading-none tabular-nums font-display">{formatCurrency(total)}</p>
                  <p className="text-[9px] font-bold text-slate-500 mt-1.5 uppercase tracking-widest">{selectedCustomer ? selectedCustomer.name : 'Consumidor Final'}</p>
                </div>

                <div className="space-y-4">
                  <button 
                    onClick={() => generateBudgetPDF(true)}
                    className="w-full flex items-center justify-center gap-2.5 p-3.5 bg-slate-900 hover:bg-black text-white rounded-xl transition-all font-black uppercase tracking-widest text-[9.5px]"
                  >
                    <FileText size={16} className="text-amber-500" />
                    Baixar PDF do Orçamento
                  </button>
                  <button 
                    onClick={openBudgetWhatsApp}
                    className="w-full flex items-center justify-center gap-2.5 p-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-all font-black uppercase tracking-widest text-[9.5px] shadow-md shadow-amber-500/10"
                  >
                    <MessageCircle size={16} />
                    Enviar pelo WhatsApp
                  </button>
                </div>

                <button 
                  onClick={() => setShowBudgetModal(false)}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 font-bold rounded-xl transition-all uppercase tracking-widest text-[9px]"
                >
                  Fechar Janela
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cadastro Rápido de Cliente (Quick-Customer Modal) */}
      <AnimatePresence>
        {showQuickCustomerModal && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              onClick={() => setShowQuickCustomerModal(false)}
              className="absolute inset-0 bg-slate-955/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.93, y: 15 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="bg-white rounded-[24px] border border-slate-200 shadow-2xl p-6 w-full max-w-md relative z-10 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                    <User size={18} />
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Faturamento Rápido</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Novo Cliente do Carrinho</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowQuickCustomerModal(false)} 
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Nome Completo</label>
                  <input 
                    type="text"
                    placeholder="Ex: Rafael Santos"
                    value={quickCustName}
                    onChange={e => setQuickCustName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-250 rounded-xl text-slate-800 text-sm font-semibold outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">WhatsApp / Contato</label>
                  <input 
                    type="text"
                    placeholder="Ex: 11999998888"
                    value={quickCustContact}
                    onChange={e => setQuickCustContact(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-250 rounded-xl text-slate-800 text-sm font-semibold outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowQuickCustomerModal(false)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black uppercase text-[10px] tracking-widest rounded-xl transition-all active:scale-95 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => registerQuickCustomer(quickCustName, quickCustContact)}
                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black uppercase text-[10px] tracking-widest rounded-xl transition-all active:scale-95 cursor-pointer shadow-md shadow-amber-500/10"
                  >
                    Cadastrar e Usar ⚽
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Guia de Costuras / Inteligente Jogador vs Torcedor Modal */}
      <AnimatePresence>
        {showSizeGuideModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              onClick={() => setShowSizeGuideModal(false)}
              className="absolute inset-0 bg-slate-900/65 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.93, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-white rounded-[32px] shadow-2xl relative z-10 w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden border border-slate-200"
            >
              {/* Scrollable area for size guide information content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Contêiner capturado como foto */}
                <div id="size-guide-content" className="bg-white text-slate-800 p-6 space-y-5">
                  <div className="bg-slate-900 text-white p-5 -mx-6 -mt-6 relative">
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg">
                        <Sparkles size={16} />
                      </span>
                      <p className="text-[10px] font-black uppercase text-amber-500 tracking-widest leading-none">Guia de Caimento Inteligente</p>
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Jogador vs Torcedor</h3>
                    <p className="text-white/60 font-medium text-[10px] uppercase tracking-wide mt-1 leading-relaxed">
                      Evite custos de Devolução e Frete Reverso orientando corretamente o cliente!
                    </p>
                  </div>
                  
                  {/* Visual Explanation of Differences */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/40 text-slate-800">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-[10px] font-black uppercase bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full">Jogador</span>
                        <span className="text-[8px] font-bold text-amber-800 uppercase tracking-widest">(Slim Fit)</span>
                      </div>
                      <ul className="text-[10px] space-y-1 text-slate-600 font-semibold leading-relaxed list-disc list-inside">
                        <li>Modelagem <strong>confort/colada</strong></li>
                        <li>Tecido de jogo texturizado</li>
                        <li>Símbolos emborrachados/silk</li>
                        <li><strong>Indicação:</strong> Comprar <strong>1 tamanho acima</strong></li>
                      </ul>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/50 text-slate-800">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-[10px] font-black uppercase bg-slate-800 text-white px-2 py-0.5 rounded-full">Torcedor</span>
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">(Classic Fit)</span>
                      </div>
                      <ul className="text-[10px] space-y-1 text-slate-600 font-semibold leading-relaxed list-disc list-inside">
                        <li>Modelagem <strong>padrão/folgada</strong></li>
                        <li>Tecido de poliéster liso</li>
                        <li>Símbolos e escudos bordados</li>
                        <li><strong>Indicação:</strong> Comprar o <strong>tamanho de costume</strong></li>
                      </ul>
                    </div>
                  </div>

                  {/* Size Equivalence Table */}
                  <div className="border border-slate-150 rounded-2xl overflow-hidden shadow-sm bg-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <th className="p-3 font-black text-[9px] uppercase tracking-wider">Se o cliente usa (Torcedor):</th>
                          <th className="p-3 font-black text-[9px] uppercase tracking-wider text-amber-700 font-bold">Ele deve comprar (Jogador):</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[10px] text-slate-650 font-bold uppercase font-sans">
                        <tr>
                          <td className="p-3">Tamanho P</td>
                          <td className="p-3 text-amber-600 font-extrabold">Tamanho M (Slim)</td>
                        </tr>
                        <tr className="bg-slate-50/50">
                          <td className="p-3">Tamanho M</td>
                          <td className="p-3 text-amber-600 font-extrabold">Tamanho G (Slim)</td>
                        </tr>
                        <tr>
                          <td className="p-3">Tamanho G</td>
                          <td className="p-3 text-amber-600 font-extrabold">Tamanho GG (Slim)</td>
                        </tr>
                        <tr className="bg-slate-50/50">
                          <td className="p-3">Tamanho GG</td>
                          <td className="p-3 text-amber-600 font-extrabold">Tamanho XG / GGG (Slim)</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Practical Tip card */}
                  <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2.5">
                    <span className="text-red-700 font-extrabold text-xs">💡</span>
                    <div>
                      <h4 className="text-[10px] font-black text-rose-800 uppercase tracking-widest mb-0.5">Dica de Arguição de Venda</h4>
                      <p className="text-[10px] text-rose-750 font-medium leading-relaxed">
                        Diga ao cliente: <em>"Como a versão Jogador é mais justa para atletas, sugerimos uma numeração a mais para que fique perfeita e confortável no corpo, mantendo o excelente caimento."</em>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botões - Fora do contêiner de imagem para não sair na foto, fixados no rodapé */}
              <div className="p-5 border-t border-slate-100 bg-slate-50/70 space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <button 
                    type="button"
                    onClick={() => {
                      const text = "A versão JOGADOR possui modelagem Slim (esportiva/justa). Como o corte é projetado para atletas, recomendamos levar +1 tamanho acima do que você costuma usar para garantir o máximo conforto! ⚽🔥";
                      copyToClipboard(text);
                    }}
                    className="flex-1 py-3 bg-white hover:bg-slate-100 text-slate-700 rounded-xl font-black uppercase tracking-widest text-[9.5px] transition-all border border-slate-200 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-sm"
                  >
                    <span>Copiar Script WhatsApp 💬</span>
                  </button>
                  <button 
                    type="button"
                    onClick={async () => {
                      const element = document.getElementById('size-guide-content');
                      if (!element) return;
                      
                      const originalGetComputedStyle = window.getComputedStyle;
                      try {
                        const patchedGetComputedStyle = (elt: Element, pseudoElt?: string | null) => {
                          const style = originalGetComputedStyle(elt, pseudoElt);
                          return createStyleProxy(style);
                        };

                        // Temporarily override main window.getComputedStyle
                        window.getComputedStyle = patchedGetComputedStyle;

                        const canvas = await html2canvas(element, {
                          backgroundColor: '#ffffff',
                          scale: 2,
                          logging: false,
                          useCORS: true,
                          onclone: (clonedDoc) => {
                            // Also patch the cloned document view if it exists
                            if (clonedDoc.defaultView) {
                              const originalClonedGetComputedStyle = clonedDoc.defaultView.getComputedStyle;
                              clonedDoc.defaultView.getComputedStyle = (elt: Element, pseudoElt?: string | null) => {
                                const style = originalClonedGetComputedStyle(elt, pseudoElt);
                                return createStyleProxy(style);
                              };
                            }

                            // 1. Compile and sanitize all global CSS rules from both rules and raw style tag content
                            let combinedCSS = '';

                            // Retrieve rules from parent document style sheets
                            Array.from(document.styleSheets).forEach((sheet) => {
                              try {
                                const rules = Array.from(sheet.cssRules || sheet.rules);
                                rules.forEach((rule) => {
                                  combinedCSS += rule.cssText + '\n';
                                });
                              } catch (e) {
                                // Ignore cross-origin stylesheet reading restrictions if any
                              }
                            });

                            // Retrieve text content from raw style tags (just in case rules are not accessible)
                            Array.from(document.querySelectorAll('style')).forEach((st) => {
                              try {
                                if (st.textContent) {
                                  combinedCSS += st.textContent + '\n';
                                }
                              } catch (e) {
                                // Ignore
                              }
                            });

                            // 2. Remove all existing style and link tag elements from the cloned document.
                            // This ensures that no raw/unconverted oklch or oklab styles remain in any form.
                            const allStyleAndLinkElements = Array.from(clonedDoc.querySelectorAll('style, link[rel="stylesheet"]'));
                            allStyleAndLinkElements.forEach((node) => {
                              node.parentNode?.removeChild(node);
                            });

                            // 3. Inject our fully sanitized and safe combined stylesheet block
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

                            // 5. Convert all SVG fill/stroke colors
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

                        const image = canvas.toDataURL('image/png');
                        
                        // Try native Web Share on mobile devices (including iOS Safari!)
                        if (navigator.share) {
                          try {
                            const res = await fetch(image);
                            const blob = await res.blob();
                            const file = new File([blob], 'guia-de-tamanhos-club-da-bola.png', { type: 'image/png' });
                            
                            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                              await navigator.share({
                                files: [file],
                                title: 'Guia de Tamanhos',
                                text: 'Jogador vs Torcedor: Guia de caimento inteligente!'
                              });
                              return; // sharing succeeded!
                            }
                          } catch (innerShareErr) {
                            console.log('Sharing rejected or unsupported:', innerShareErr);
                          }
                        }

                        // Fallback: Set image state for tap & hold to copy/save modal UI
                        setGeneratedSizeGuideImg(image);
                        
                        // Desktop fallback: standard programmatic anchor click
                        const link = document.createElement('a');
                        link.href = image;
                        link.download = 'guia-de-tamanhos-club-da-bola.png';
                        try {
                          link.click();
                        } catch (clickErr) {
                          console.log('Programmatic trigger failed:', clickErr);
                        }
                      } catch (err) {
                        console.error('Erro ao gerar foto do guia:', err);
                        alert('Não foi possível gerar a foto automaticamente neste navegador. Tire um print da tela para salvar!');
                      } finally {
                        window.getComputedStyle = originalGetComputedStyle;
                      }
                    }}
                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-black uppercase tracking-widest text-[9.5px] transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-md shadow-amber-500/10"
                  >
                    <span>Salvar como Foto 📸</span>
                  </button>
                </div>
                <button 
                  type="button"
                  onClick={() => {
                    setShowSizeGuideModal(false);
                    setGeneratedSizeGuideImg(null);
                  }}
                  className="w-full py-3 bg-slate-900 hover:bg-black text-white font-black rounded-xl transition-all uppercase tracking-widest text-[9.5px] shadow-md cursor-pointer"
                >
                  Fechar
                </button>
              </div>

              {/* Touch-to-Save Image Fallback Overlay for iOS/mobile */}
              {generatedSizeGuideImg && (
                <div className="absolute inset-0 z-[130] bg-slate-950 flex flex-col p-6 overflow-y-auto">
                  <div className="text-center mb-4 text-white">
                    <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-2.5">
                      <Sparkles size={20} />
                    </div>
                    <h4 className="text-sm font-black uppercase tracking-wider text-amber-400">Pronto para salvar! 📸</h4>
                    <p className="text-[10.5px] text-white/70 font-medium leading-relaxed max-w-sm mx-auto mt-1">
                      Toque e segure o dedo na imagem abaixo para <strong>Salvar na Galeria</strong> ou <strong>Copiar</strong> para enviar diretamente no WhatsApp!
                    </p>
                  </div>
                  
                  <div className="flex-1 flex items-center justify-center min-h-[250px] mb-4">
                    <img 
                      src={generatedSizeGuideImg} 
                      alt="Guia de Tamanhos Club da Bola" 
                      className="max-h-[50vh] object-contain rounded-2xl border border-white/10 shadow-2xl bg-white"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  <div className="space-y-3 mt-auto">
                    <p className="text-[9px] text-white/45 uppercase font-semibold tracking-widest text-center">Tonalidade e proporções preservadas na imagem</p>
                    <button
                      type="button"
                      onClick={() => setGeneratedSizeGuideImg(null)}
                      className="w-full py-3 bg-red-800 hover:bg-red-900 active:scale-[0.98] text-white font-black rounded-xl transition-all uppercase tracking-widest text-[9.5px] shadow-lg cursor-pointer text-center"
                    >
                      Voltar ao Guia ↩
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Search & Products Grid */}
      <div className={cn(
        "flex-1 flex flex-col gap-4 md:gap-6 md:overflow-hidden transition-all duration-300",
        isCartVisible ? "hidden md:flex" : "flex"
      )}>
        <div className="sticky top-0 z-20 bg-transparent pb-4 pt-1">
          <div className="p-4 bg-white/40 backdrop-blur-md rounded-[32px] border border-white/60 shadow-xl shadow-slate-200/50">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-red-800 transition-colors size-6" />
              <input 
                type="text" 
                placeholder="Buscar por nome ou categoria..." 
                className="w-full pl-14 pr-6 py-4 bg-white border border-gray-100 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-red-800/20 focus:border-red-800 font-black text-base tracking-tight placeholder:text-slate-300 transition-all"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Category Pills & View Mode */}
            <div className="mt-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3.5 border-t border-slate-100">
              {/* Category Pills Scrollbar */}
              <div className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-1.5 pb-1 sm:pb-0 scroll-smooth">
                {categoriesList.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 cursor-pointer border",
                      selectedCategory === cat
                        ? "bg-red-800 border-red-800 text-white shadow-sm shadow-red-800/10"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-100 hover:text-slate-700"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* View Mode Toggle Button Group */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-end sm:self-auto shrink-0 select-none">
                <button
                  type="button"
                  onClick={() => setCatalogViewMode('visual')}
                  title="Grade Visual (com Fotos)"
                  className={cn(
                    "p-1.5 rounded-lg transition-all flex items-center gap-1 text-[9px] font-black uppercase tracking-wider active:scale-95 cursor-pointer",
                    catalogViewMode === 'visual'
                      ? "bg-white text-red-800 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <LayoutGrid size={14} />
                  <span>Visual</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogViewMode('compact')}
                  title="Grade Compacta (Sem Fotos)"
                  className={cn(
                    "p-1.5 rounded-lg transition-all flex items-center gap-1 text-[9px] font-black uppercase tracking-wider active:scale-95 cursor-pointer",
                    catalogViewMode === 'compact'
                      ? "bg-white text-red-800 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <Grid size={14} />
                  <span>Compacto</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogViewMode('list')}
                  title="Lista Detalhada"
                  className={cn(
                    "p-1.5 rounded-lg transition-all flex items-center gap-1 text-[9px] font-black uppercase tracking-wider active:scale-95 cursor-pointer",
                    catalogViewMode === 'list'
                      ? "bg-white text-red-800 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <List size={14} />
                  <span>Lista</span>
                </button>
              </div>
            </div>

            {/* AI Copilot PDV */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-amber-500 animate-pulse" />
                  AI Copilot (Entrada Rápida)
                </span>
                <HelpCircle size={12} className="text-slate-300 hover:text-slate-400 cursor-help" title='Digite um pedido corrido como: "Dois mantos do flamengo para o Renato de WhatsApp 11999998888"' />
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder='Fale ou digite: "Rodrigo quer 2 mantos do brasil G e 1 do flamengo..."'
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-1 focus:ring-amber-500 transition-all font-semibold text-xs placeholder:text-slate-400 text-slate-800"
                  value={copilotText}
                  onChange={e => setCopilotText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCopilotSubmit();
                  }}
                  disabled={isCopilotProcessing}
                />
                <button
                  type="button"
                  onClick={handleCopilotSubmit}
                  disabled={isCopilotProcessing || !copilotText.trim()}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-100 disabled:text-slate-300 text-slate-950 font-black rounded-xl text-[10px] uppercase tracking-widest transition-all flex items-center gap-1 active:scale-95 cursor-pointer shadow-sm disabled:pointer-events-none"
                >
                  {isCopilotProcessing ? (
                    <div className="size-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Processar</span>
                      <Sparkles size={11} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Catalog Container based on View Mode */}
        {catalogViewMode === 'list' ? (
          /* Detailed List View Mode */
          <div className="flex-1 md:overflow-y-auto pb-24 md:pb-4">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-black text-slate-400 tracking-wider">
                      <th className="py-4 px-5">Produto</th>
                      <th className="py-4 px-5">Categoria</th>
                      <th className="py-4 px-5">Público</th>
                      <th className="py-4 px-5 text-right">Preço</th>
                      <th className="py-4 px-5">Tamanhos / Seleção</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map(product => {
                      const isNoVar = !product.variations || product.variations.length === 0;
                      return (
                        <tr 
                          key={product.id}
                          className={cn(
                            "hover:bg-slate-50/50 transition-colors font-sans",
                            clickedProductId === product.id && "bg-emerald-50/30"
                          )}
                        >
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-3">
                              {/* Small image or icon */}
                              <div className="size-11 rounded-xl overflow-hidden border border-slate-100 shrink-0 bg-slate-50 flex items-center justify-center">
                                {product.photoUrl ? (
                                  <img src={product.photoUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="size-full bg-slate-100 text-slate-400 font-black flex items-center justify-center text-[10px]">
                                    {product.category.substring(0, 3)}
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="font-black text-xs uppercase text-slate-900 leading-tight">{product.name}</div>
                                <div className="text-[9px] text-slate-400 font-mono tracking-wider mt-1">Estoque: {product.isDropshipping ? 'Dropshipping' : `Total: ${product.totalStock}`}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-5">
                            <span className="px-1.5 py-0.5 bg-slate-100 text-[8px] font-black text-slate-400 rounded uppercase tracking-wider">{product.category}</span>
                          </td>
                          <td className="py-4 px-5">
                            {product.gender && (
                              <span className={cn(
                                "px-1.5 py-0.5 text-[8px] font-black rounded uppercase tracking-wider",
                                product.gender === 'Masculino' ? "bg-blue-50 text-blue-600" : 
                                product.gender === 'Feminino' ? "bg-pink-50 text-pink-600" : 
                                "bg-slate-50 text-slate-400"
                              )}>
                                {product.gender === 'Ambos' ? 'UNI' : product.gender.substring(0, 3)}
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-5 text-right font-display font-black text-red-800 text-xs tabular-nums">
                            {formatCurrency(product.sellingPrice)}
                          </td>
                          <td className="py-4 px-5">
                            <div className="flex flex-wrap gap-1.5">
                              {isNoVar ? (
                                <button 
                                  type="button"
                                  disabled={!product.isDropshipping && (product.totalStock || 0) <= 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!product.isDropshipping && (product.totalStock || 0) <= 0) return;
                                    setClickedProductId(product.id!);
                                    setTimeout(() => setClickedProductId(null), 600);
                                    addToCart(product, { id: 'unica', size: 'ÚNICA', color: '', stock: product.totalStock || 0 });
                                  }}
                                  className={cn(
                                    "text-[9px] px-2.5 py-1.5 border rounded-xl font-black transition-all uppercase cursor-pointer",
                                    (!product.isDropshipping && (product.totalStock || 0) <= 0) 
                                      ? "bg-gray-50 border-gray-100 text-gray-200 cursor-not-allowed opacity-40 shadow-none" 
                                      : clickedProductId === product.id
                                        ? "bg-emerald-500 border-emerald-500 text-white"
                                        : "bg-white border-slate-200 text-slate-600 hover:border-red-800 hover:bg-red-50 hover:text-red-800 active:scale-95 shadow-sm"
                                  )}
                                >
                                  {clickedProductId === product.id ? '✓' : 'Selecionar'}
                                </button>
                              ) : (
                                product.variations.map(v => (
                                  <button 
                                    key={v.id}
                                    disabled={!product.isDropshipping && v.stock <= 0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      addToCart(product, v);
                                    }}
                                    className={cn(
                                      "text-[9px] px-2.5 py-1.5 border rounded-xl font-black transition-all uppercase cursor-pointer",
                                      (!product.isDropshipping && v.stock <= 0) 
                                        ? "bg-gray-50 border-gray-100 text-gray-200 cursor-not-allowed opacity-40 shadow-none" 
                                        : "bg-white border-slate-200 text-slate-600 hover:border-red-800 hover:bg-red-50 hover:text-red-800 active:scale-95 shadow-sm",
                                      product.isDropshipping && "border-amber-100 text-amber-600 bg-amber-50/20"
                                    )}
                                  >
                                    {[v.size, v.color].map(x => x?.trim()).filter(x => x && x !== '' && x.toUpperCase() !== 'N/A').join(' - ')} <span className="opacity-45">({product.isDropshipping ? 'DS' : v.stock})</span>
                                  </button>
                                ))
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredProducts.length === 0 && (
                <div className="py-12 text-center text-slate-400 font-black uppercase text-xs tracking-wider">
                  Nenhum produto correspondente encontrado
                </div>
              )}
            </div>
          </div>
        ) : catalogViewMode === 'visual' ? (
          /* Visual Bento Grid Mode with Beautiful Photo/Mockup Cards */
          <div className="flex-1 md:overflow-y-auto grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-24 md:pb-4">
            {filteredProducts.map(product => {
              const isNoVar = !product.variations || product.variations.length === 0;
              const isShirt = (product.category || '').toUpperCase().includes('CAMISA');
              const nameLower = (product.name || '').toLowerCase();
              
              // Helper to generate dynamic gradients based on keywords
              const getGradient = () => {
                if (nameLower.includes('flamengo') || nameLower.includes('milan') || nameLower.includes('parana') || nameLower.includes('atlético') || nameLower.includes('athletico') || nameLower.includes('belgica')) {
                  return "from-red-600 via-slate-900 to-red-700";
                }
                if (nameLower.includes('brasil') || nameLower.includes('amarela') || nameLower.includes('canarinho')) {
                  return "from-yellow-400 via-green-600 to-yellow-500";
                }
                if (nameLower.includes('argentina') || nameLower.includes('gremio') || nameLower.includes('cruzeiro') || nameLower.includes('italia') || nameLower.includes('city') || nameLower.includes('azul') || nameLower.includes('uruguai')) {
                  return "from-sky-400 via-sky-100 to-sky-500";
                }
                if (nameLower.includes('corinthians') || nameLower.includes('vasco') || nameLower.includes('santos') || nameLower.includes('alemanha') || nameLower.includes('real madrid') || nameLower.includes('branca') || nameLower.includes('branco')) {
                  return "from-slate-100 via-slate-200 to-slate-300";
                }
                if (nameLower.includes('barcelona') || nameLower.includes('psg') || nameLower.includes('boca') || nameLower.includes('bayern')) {
                  return "from-blue-700 via-red-600 to-blue-900";
                }
                if (nameLower.includes('palmeiras') || nameLower.includes('celtic') || nameLower.includes('betis') || nameLower.includes('verde')) {
                  return "from-emerald-600 via-green-800 to-emerald-700";
                }
                if (nameLower.includes('roma') || nameLower.includes('fluminense') || nameLower.includes('portugal') || nameLower.includes('vinho')) {
                  return "from-red-850 via-emerald-800 to-amber-700";
                }
                if (nameLower.includes('cabo') || nameLower.includes('eletronico') || nameLower.includes('carregador')) {
                  return "from-indigo-600 via-purple-600 to-indigo-700";
                }
                if (nameLower.includes('tenis') || nameLower.includes('chuteira')) {
                  return "from-amber-500 via-orange-600 to-amber-600";
                }
                return "from-slate-700 via-slate-800 to-slate-900";
              };

              return (
                <div 
                  key={product.id} 
                  onClick={() => {
                    if (isNoVar) {
                      if (!product.isDropshipping && (product.totalStock || 0) <= 0) return;
                      setClickedProductId(product.id!);
                      setTimeout(() => setClickedProductId(null), 600);
                      addToCart(product, { id: 'unica', size: 'ÚNICA', color: '', stock: product.totalStock || 0 });
                    }
                  }}
                  className={cn(
                    "bg-white rounded-[28px] flex flex-col justify-between group hover:-translate-y-1 shadow-[0_4px_25px_rgba(15,23,42,0.02)] hover:shadow-2xl hover:shadow-slate-100/80 border border-slate-100 transition-all duration-300 ease-out relative overflow-hidden min-h-[300px]",
                    isNoVar ? "cursor-pointer" : "",
                    clickedProductId === product.id 
                      ? "ring-2 ring-emerald-500 border-emerald-500 scale-95 shadow-lg shadow-emerald-500/10" 
                      : "hover:border-red-800/15"
                  )}
                >
                  {/* Top Image / Pattern Area */}
                  <div className="h-[140px] w-full bg-slate-50 relative overflow-hidden p-3 flex items-center justify-center border-b border-slate-100/50">
                    {product.photoUrl ? (
                      <img 
                        src={product.photoUrl} 
                        alt={product.name} 
                        className="size-full object-cover rounded-xl group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className={cn("size-full rounded-2xl bg-gradient-to-br flex flex-col items-center justify-center text-white/30 relative overflow-hidden shadow-inner", getGradient())}>
                        {/* Dynamic background patterns */}
                        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent pointer-events-none" />
                        
                        {isShirt ? (
                          <div className="flex flex-col items-center relative z-10 text-white/95 drop-shadow">
                            <svg className="size-16 opacity-85 group-hover:scale-110 transition-transform duration-300" viewBox="0 0 100 100" fill="currentColor">
                              <path d="M 30,20 L 70,20 L 70,22 C 70,25 65,30 50,30 C 35,30 30,25 30,22 Z" fill="#222" opacity="0.3" />
                              <path d="M 30,20 L 42,12 C 45,14 48,15 50,15 C 52,15 55,14 58,12 L 70,20 L 82,30 L 74,40 L 68,34 L 68,90 L 32,90 L 32,34 L 26,40 L 18,30 Z" fill="currentColor" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
                              <path d="M 42,12 Q 50,22 58,12" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
                              <line x1="40" y1="25" x2="40" y2="85" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
                              <line x1="50" y1="25" x2="50" y2="85" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
                              <line x1="60" y1="25" x2="60" y2="85" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
                            </svg>
                            <span className="text-[9px] font-black tracking-widest mt-1 opacity-75 uppercase text-center">MANTO OFICIAL</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center relative z-10 text-white/95 drop-shadow">
                            <svg className="size-12 opacity-80" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="25" y="25" width="50" height="50" rx="8" />
                              <circle cx="50" cy="50" r="10" />
                              <line x1="50" y1="15" x2="50" y2="25" />
                              <line x1="50" y1="75" x2="50" y2="85" />
                              <line x1="15" y1="50" x2="25" y2="50" />
                              <line x1="75" y1="50" x2="85" y2="50" />
                            </svg>
                            <span className="text-[9px] font-black tracking-widest mt-1 opacity-75 uppercase text-center">{product.category}</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Corner Category Badges inside Card Image Area */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                      <span className="px-1.5 py-0.5 bg-white/90 backdrop-blur-md text-[7.5px] font-black text-slate-800 rounded-md shadow-sm uppercase tracking-wider border border-white/50">{product.category}</span>
                      {product.gender && (
                        <span className={cn(
                          "px-1.5 py-0.5 text-[7.5px] font-black rounded-md shadow-sm uppercase tracking-wider border",
                          product.gender === 'Masculino' ? "bg-blue-600/90 text-white border-blue-500/20" : 
                          product.gender === 'Feminino' ? "bg-pink-600/90 text-white border-pink-500/20" : 
                          "bg-slate-800/90 text-white border-slate-700/20"
                        )}>
                          {product.gender === 'Ambos' ? 'UNI' : product.gender.substring(0, 3)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Body Info */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-sans font-black text-slate-900 line-clamp-2 leading-tight text-xs uppercase tracking-tight">{product.name}</h4>
                    </div>
                    
                    <div className="space-y-2.5 mt-3">
                      <div className="text-sm md:text-base font-black text-red-800 font-display tabular-nums leading-none">{formatCurrency(product.sellingPrice)}</div>
                      <div className="flex flex-wrap gap-1 items-stretch justify-start">
                        {isNoVar ? (
                          <button 
                            type="button"
                            disabled={!product.isDropshipping && (product.totalStock || 0) <= 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!product.isDropshipping && (product.totalStock || 0) <= 0) return;
                              setClickedProductId(product.id!);
                              setTimeout(() => setClickedProductId(null), 600);
                              addToCart(product, { id: 'unica', size: 'ÚNICA', color: '', stock: product.totalStock || 0 });
                            }}
                            className={cn(
                              "text-[9px] px-2 py-1.5 border rounded-xl font-black transition-all truncate uppercase relative flex-1 min-w-[45%] text-center cursor-pointer",
                              (!product.isDropshipping && (product.totalStock || 0) <= 0) 
                                ? "bg-gray-50 border-gray-100 text-gray-200 cursor-not-allowed opacity-40 shadow-none scale-100" 
                                : clickedProductId === product.id
                                  ? "bg-emerald-500 border-emerald-500 text-white shadow-none scale-95"
                                  : "bg-white border-slate-100 text-slate-600 hover:border-red-800 hover:bg-red-50 hover:text-red-800 active:scale-95 shadow-sm",
                              product.isDropshipping && "border-amber-100 text-amber-600 bg-amber-50/20"
                            )}
                          >
                            {clickedProductId === product.id ? 'Adicionado! ✓' : 'Selecionar'} <span className="opacity-40">{product.isDropshipping ? 'DS' : (product.totalStock || 0)}</span>
                          </button>
                        ) : (
                          product.variations.map(v => (
                            <button 
                              key={v.id}
                              disabled={!product.isDropshipping && v.stock <= 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                addToCart(product, v);
                              }}
                              className={cn(
                                "text-[9.5px] px-2 py-1.5 border rounded-xl font-black transition-all truncate uppercase relative flex-1 min-w-[45%] text-center cursor-pointer",
                                (!product.isDropshipping && v.stock <= 0) 
                                  ? "bg-gray-50 border-gray-100 text-gray-200 cursor-not-allowed opacity-40 shadow-none scale-100" 
                                  : "bg-white border-slate-100 text-slate-600 hover:border-red-800 hover:bg-red-50 hover:text-red-800 active:scale-95 shadow-sm",
                                product.isDropshipping && "border-amber-100 text-amber-600 bg-amber-50/20"
                              )}
                            >
                              {[v.size, v.color].map(x => x?.trim()).filter(x => x && x !== '' && x.toUpperCase() !== 'N/A').join(' - ')} <span className="opacity-40">{product.isDropshipping ? 'DS' : v.stock}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Compact View Mode (original layout style but with cursor-pointer indicator) */
          <div className="flex-1 md:overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-24 md:pb-4">
            {filteredProducts.map(product => {
              const isNoVar = !product.variations || product.variations.length === 0;
              return (
                <div 
                  key={product.id} 
                  onClick={() => {
                    if (isNoVar) {
                      if (!product.isDropshipping && (product.totalStock || 0) <= 0) return;
                      setClickedProductId(product.id!);
                      setTimeout(() => setClickedProductId(null), 600);
                      addToCart(product, { id: 'unica', size: 'ÚNICA', color: '', stock: product.totalStock || 0 });
                    }
                  }}
                  className={cn(
                    "bg-white p-4 rounded-[24px] flex flex-col justify-between group hover:-translate-y-1 shadow-[0_4px_22px_rgba(15,23,42,0.015)] hover:shadow-xl hover:shadow-slate-100/80 border border-slate-100/50 transition-all duration-300 ease-out relative overflow-hidden min-h-[170px]",
                    isNoVar ? "cursor-pointer" : "",
                    clickedProductId === product.id 
                      ? "ring-2 ring-emerald-500 border-emerald-500 scale-95 shadow-lg shadow-emerald-500/10" 
                      : "hover:border-red-800/15"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="px-1.5 py-0.5 bg-slate-100 text-[8px] font-black text-slate-400 rounded uppercase tracking-wider">{product.category}</span>
                      {product.gender && (
                        <span className={cn(
                          "px-1.5 py-0.5 text-[8px] font-black rounded uppercase tracking-wider",
                          product.gender === 'Masculino' ? "bg-blue-50 text-blue-600" : 
                          product.gender === 'Feminino' ? "bg-pink-50 text-pink-600" : 
                          "bg-slate-50 text-slate-400"
                        )}>
                          {product.gender === 'Ambos' ? 'UNI' : product.gender.substring(0, 3)}
                        </span>
                      )}
                    </div>
                    <h4 className="font-sans font-black text-slate-900 line-clamp-2 leading-tight text-xs uppercase tracking-tight">{product.name}</h4>
                  </div>
                  <div className="space-y-2 mt-3">
                    <div className="text-xs md:text-sm font-black text-red-800 font-display tabular-nums leading-none">{formatCurrency(product.sellingPrice)}</div>
                    <div className="flex flex-wrap gap-1 items-stretch justify-start">
                      {isNoVar ? (
                        <button 
                          type="button"
                          disabled={!product.isDropshipping && (product.totalStock || 0) <= 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!product.isDropshipping && (product.totalStock || 0) <= 0) return;
                            setClickedProductId(product.id!);
                            setTimeout(() => setClickedProductId(null), 600);
                            addToCart(product, { id: 'unica', size: 'ÚNICA', color: '', stock: product.totalStock || 0 });
                          }}
                          className={cn(
                            "text-[9px] px-2 py-1.5 border rounded font-black transition-all truncate uppercase relative flex-1 min-w-[45%] text-center cursor-pointer",
                            (!product.isDropshipping && (product.totalStock || 0) <= 0) 
                              ? "bg-gray-50 border-gray-100 text-gray-200 cursor-not-allowed opacity-40 shadow-none scale-100" 
                              : clickedProductId === product.id
                                ? "bg-emerald-500 border-emerald-500 text-white shadow-none scale-95"
                                : "bg-white border-slate-200 text-slate-600 hover:border-red-800 hover:bg-red-50 hover:text-red-800 active:scale-95 shadow-sm",
                            product.isDropshipping && "border-amber-100 text-amber-600 bg-amber-50/20"
                          )}
                        >
                          {clickedProductId === product.id ? 'Adicionado! ✓' : 'Selecionar'} <span className="opacity-40">{product.isDropshipping ? 'DS' : (product.totalStock || 0)}</span>
                        </button>
                      ) : (
                        product.variations.map(v => (
                          <button 
                            key={v.id}
                            disabled={!product.isDropshipping && v.stock <= 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(product, v);
                            }}
                            className={cn(
                              "text-[9px] px-2 py-1.5 border rounded font-black transition-all truncate uppercase relative flex-1 min-w-[45%] text-center cursor-pointer",
                              (!product.isDropshipping && v.stock <= 0) 
                                ? "bg-gray-50 border-gray-100 text-gray-200 cursor-not-allowed opacity-40 shadow-none scale-100" 
                                : "bg-white border-slate-200 text-slate-600 hover:border-red-800 hover:bg-red-50 hover:text-red-800 active:scale-95 shadow-sm",
                              product.isDropshipping && "border-amber-100 text-amber-600 bg-amber-50/20"
                            )}
                          >
                            {[v.size, v.color].map(x => x?.trim()).filter(x => x && x !== '' && x.toUpperCase() !== 'N/A').join(' - ')} <span className="opacity-40">{product.isDropshipping ? 'DS' : v.stock}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart & Checkout */}
      <div className={cn(
        "w-full md:w-[400px] flex flex-col gap-4 md:gap-4 h-auto md:h-full transition-all duration-300",
        isCartVisible ? "flex" : "hidden md:flex"
      )}>
        <div className="bg-slate-950 text-white rounded-2xl md:rounded-[24px] p-4 md:p-4 pb-4 md:pb-4 flex flex-col h-auto md:h-full shadow-2xl relative md:overflow-hidden border border-slate-900">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <ShoppingCart size={120} />
          </div>
          
          <div className="flex items-center gap-3 mb-3 md:mb-3 shrink-0 relative">
            <div className="size-10 bg-red-800 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/20">
              <ShoppingCart size={20} />
            </div>
            <div>
              <h2 className="text-2xl md:text-2xl font-bold tracking-tight text-white leading-none">
                Venda <span className="text-red-600 underline decoration-red-400 decoration-4 underline-offset-4 tracking-tight font-bold">Checkout</span>
              </h2>
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em] font-sans mt-0.5">Finalização de pedido</p>
            </div>
            <span className="ml-auto bg-white/10 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-amber-500">
              {cart.reduce((a, b) => a + b.quantity, 0)}
            </span>
          </div>

          {/* Segment Toggle */}
          <div className="grid grid-cols-2 p-0.5 bg-black/50 backdrop-blur-sm border border-white/5 rounded-full mb-3 shrink-0 font-sans relative select-none">
            {[
              { key: 'checkout', label: 'Novo Carrinho' },
              { key: 'prevendas', label: 'Orçamentos / Pré-Vendas', badgeCount: sales.filter(s => s.status === 'Pré-venda').length }
            ].map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={cn(
                    "relative py-2.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest transition-colors cursor-pointer select-none z-10 flex items-center justify-center gap-1.5",
                    isActive ? "text-white font-black" : "text-white/40 hover:text-white/80"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="activePdvTabIndicator"
                      className="absolute inset-[1px] bg-red-800 rounded-full shadow-[0_4px_12px_rgba(220,38,38,0.2)] border border-red-700/30"
                      style={{ zIndex: -1 }}
                      transition={{ type: 'spring', stiffness: 480, damping: 35, mass: 1 }}
                    />
                  )}
                  <span>{tab.label}</span>
                  {tab.badgeCount ? (
                    <span className="bg-amber-500 text-black text-[8px] font-black px-1.5 py-0.5 rounded-full animate-pulse">
                      {tab.badgeCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="flex-1 flex flex-col min-h-0 relative md:overflow-hidden">
            {activeTab === 'checkout' ? (
              <>
                {/* Scrollable Area for Cart and Fields */}
                <div className="flex-1 md:overflow-y-auto pr-1 -mr-1 custom-scrollbar space-y-6 pb-4 md:pb-6">
                  {/* Loaded pre-sale warning alert */}
                  {loadedPreSaleId && (
                    <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ClipboardList size={14} className="text-amber-500 animate-pulse" />
                        <div>
                          <p className="text-[8px] font-black uppercase text-amber-500 tracking-wider">Modo Edição de Pré-venda</p>
                          <p className="text-[10px] font-bold text-slate-300 uppercase">Aprovando pedido ID: #{loadedPreSaleId.slice(-6).toUpperCase()}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          setLoadedPreSaleId(null);
                          setCart([]);
                          setSelectedCustomer(null);
                          setDiscountVal('0');
                          setDiscountPerc('0');
                        }} 
                        className="text-[8px] bg-white/15 px-2.5 py-1.5 rounded-lg hover:bg-white/20 transition-all font-black text-amber-400 uppercase tracking-widest"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                  {/* Checkout Form (Top) */}
                  <div className="space-y-4 pb-6 border-b border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Informações da Venda</div>
                      {cart.some(item => {
                        const productObj = products.find(p => p.id === item.productId);
                        return (productObj?.category || '').toLowerCase().includes('camisa') || 
                               (item.name || '').toLowerCase().includes('camisa');
                      }) && (
                        <button 
                          type="button"
                          onClick={() => setShowSizeGuideModal(true)}
                          className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-lg text-[8.5px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1 shadow-lg shadow-amber-500/5 cursor-pointer animate-in fade-in zoom-in-95 duration-200"
                        >
                          <HelpCircle size={10} /> Guia de Costuras 📏
                        </button>
                      )}
                    </div>
                    {/* Customer Selector */}
                    <div className="flex gap-1.5 items-center">
                      <div className="relative group flex-1">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 size-4 group-focus-within:text-amber-500 z-10 pointer-events-none" />
                        <select 
                          className="w-full bg-slate-900 border border-white/15 rounded-xl pl-10 pr-4 py-2.5 text-base md:text-xs font-extrabold uppercase outline-none appearance-none hover:bg-slate-800 focus:ring-1 focus:ring-amber-500 transition-all text-white"
                          value={selectedCustomer?.id || ''}
                          onChange={e => {
                            const c = customers.find(cust => cust.id === e.target.value);
                            setSelectedCustomer(c || null);
                          }}
                        >
                          <option value="" className="bg-slate-950 text-white">Consumidor Final</option>
                          {customers.map(c => <option key={c.id} value={c.id} className="bg-slate-950 text-white">{c.name}</option>)}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setQuickCustName('');
                          setQuickCustContact('');
                          setShowQuickCustomerModal(true);
                        }}
                        className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-white/15 hover:border-amber-500/40 text-amber-500 rounded-xl flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-sm"
                        title="Cadastrar Cliente Rápido"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    {/* Shipping Region Selector */}
                    <div className="relative group">
                      <Truck className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 size-4 group-focus-within:text-amber-500 z-10 pointer-events-none" />
                      <select 
                        className="w-full bg-slate-900 border border-white/15 rounded-xl pl-10 pr-4 py-2.5 text-base md:text-xs font-extrabold uppercase outline-none appearance-none hover:bg-slate-800 focus:ring-1 focus:ring-amber-500 transition-all text-white"
                        value={shippingRegion}
                        onChange={e => setShippingRegion(e.target.value as any)}
                      >
                        <option value="none" className="bg-slate-950 text-white">Sem Frete (Presencial / Retirada)</option>
                        <option value="paragominas" className="bg-slate-950 text-white">Paragominas (Frete Fixo R$ 8,00)</option>
                        <option value="saoluis" className="bg-slate-955 text-white">São Luís (Frete Fixo R$ 20,00)</option>
                      </select>
                    </div>
                    {selectedCustomer && (() => {
                      const freshCustomer = customers.find(c => c.id === selectedCustomer.id) || selectedCustomer;
                      const currentBalance = freshCustomer.balance !== undefined ? freshCustomer.balance : -(freshCustomer.totalDebt || 0);
                      return (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-2 mb-2"
                        >
                          <div className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <User size={12} className="text-red-400" />
                                <span className="text-[10px] font-black uppercase text-red-200">{freshCustomer.name}</span>
                              </div>
                              <span className={cn(
                                "text-[9px] font-black uppercase mt-0.5 tracking-tight",
                                currentBalance > 0 ? "text-emerald-400" : currentBalance < 0 ? "text-red-400" : "text-slate-400"
                              )}>
                                Saldo: {currentBalance > 0 ? '+' : ''}{formatCurrency(currentBalance)}
                              </span>
                            </div>
                            <button onClick={() => { setSelectedCustomer(null); setUseCustomerBalance(false); }} className="text-red-400 hover:text-white transition-colors p-1">
                              <Trash2 size={12} />
                            </button>
                          </div>

                          {currentBalance > 0 && (
                            <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-950/40 border border-emerald-800/30 rounded-xl">
                              <div className="flex flex-col">
                                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Usar Saldo Positivo</span>
                                <span className="text-[10px] font-bold text-white/70">Disponível: {formatCurrency(currentBalance)}</span>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer select-none">
                                <input 
                                  type="checkbox" 
                                  checked={useCustomerBalance} 
                                  onChange={e => setUseCustomerBalance(e.target.checked)}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                              </label>
                            </div>
                          )}
                        </motion.div>
                      );
                    })()}

                    {/* Payment Methods */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: 'Dinheiro', icon: Banknote },
                        { id: 'Pix', icon: QrCode },
                        { id: 'Cartão', icon: CreditCard },
                        { id: 'Fiado', icon: ClipboardList },
                      ].map(method => (
                        <button
                          key={method.id}
                          onClick={() => setPaymentMethod(method.id as any)}
                          className={cn(
                            "flex flex-col items-center gap-1 p-2 rounded-xl transition-all border",
                            paymentMethod === method.id 
                              ? "bg-red-800 border-amber-500 text-white shadow-lg shadow-red-900/10" 
                              : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          <method.icon size={18} />
                          <span className="text-[8px] font-black uppercase tracking-tight">{method.id}</span>
                        </button>
                      ))}
                    </div>

                    {paymentMethod === 'Fiado' && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="relative group"
                      >
                        <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 size-4 group-focus-within:text-emerald-400 z-10 pointer-events-none" />
                        <input 
                          type="text"
                          inputMode="decimal"
                          placeholder="Valor de Entrada (Opcional)"
                          className="w-full bg-slate-900 border border-white/15 rounded-xl pl-10 pr-4 py-2.5 text-base md:text-xs font-extrabold outline-none hover:bg-slate-800 focus:ring-1 focus:ring-emerald-500 transition-all text-white placeholder-white/40"
                          value={downPayment}
                          onChange={e => setDownPayment(e.target.value.replace(/[^0-9,.]/g, ''))}
                          onFocus={e => e.target.value === '0' ? setDownPayment('') : null}
                          onBlur={e => e.target.value === '' ? setDownPayment('') : null}
                        />
                      </motion.div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-[10px] font-black group-focus-within:text-amber-400 z-10 pointer-events-none">% Desc.</span>
                        <input 
                          type="text"
                          inputMode="decimal"
                          className="w-full bg-slate-900 border border-white/15 rounded-xl pl-16 pr-4 py-2.5 text-base md:text-xs font-extrabold outline-none hover:bg-slate-800 focus:ring-1 focus:ring-amber-500 transition-all text-white"
                          value={discountPerc}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9,.]/g, '');
                            handleDiscountPercChange(val);
                          }}
                          onFocus={e => e.target.value === '0' ? setDiscountPerc('') : null}
                          onBlur={e => e.target.value === '' ? setDiscountPerc('0') : null}
                        />
                      </div>
                      <div className="relative group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-[10px] font-black group-focus-within:text-amber-400 z-10 pointer-events-none">R$ Desc.</span>
                        <input 
                          type="text"
                          inputMode="decimal"
                          className="w-full bg-slate-900 border border-white/15 rounded-xl pl-16 pr-4 py-2.5 text-base md:text-xs font-extrabold outline-none hover:bg-slate-800 focus:ring-1 focus:ring-amber-500 transition-all text-white"
                          value={discountVal}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9,.]/g, '');
                            handleDiscountValChange(val);
                          }}
                          onFocus={e => e.target.value === '0' ? setDiscountVal('') : null}
                          onBlur={e => e.target.value === '' ? setDiscountVal('0') : null}
                        />
                      </div>
                    </div>

                    {/* Teclado Numérico Micro-Animado para Ajustes Rápidos */}
                    <div className="space-y-2 pt-1 pb-1">
                      <div className="text-[7px] font-black tracking-widest text-white/30 uppercase pl-1">Teclado de Desconto & Ajustes</div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { label: '🔥 -R$5', value: 5, type: 'val_sub' },
                          { label: '⚡ -R$10', value: 10, type: 'val_sub' },
                          { label: '🏆 -R$20', value: 20, type: 'val_sub' },
                          { label: '➕ +R$10', value: 10, type: 'val_add' },
                        ].map((btn, idx) => (
                          <motion.button
                            key={idx}
                            type="button"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.93 }}
                            onClick={() => {
                              const currVal = parseFloat(discountVal.replace(',', '.')) || 0;
                              let newVal = currVal;
                              if (btn.type === 'val_sub') {
                                newVal += btn.value;
                              } else {
                                newVal = Math.max(0, newVal - btn.value);
                              }
                              handleDiscountValChange(newVal.toFixed(2).replace('.', ','));
                            }}
                            className="relative overflow-hidden py-2 px-1 bg-white/5 border border-white/10 hover:border-amber-500/30 text-white rounded-xl text-[9px] font-black uppercase tracking-tight transition-all duration-300 hover:bg-amber-500/5 cursor-pointer flex items-center justify-center focus:outline-none"
                          >
                            <motion.span 
                              className="absolute inset-0 bg-amber-500/0 hover:bg-amber-500/5 active:bg-amber-500/20 transition-colors duration-150 rounded-xl pointer-events-none"
                            />
                            <span className="relative z-10">{btn.label}</span>
                          </motion.button>
                        ))}
                      </div>

                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { label: '-5%', value: 5, type: 'pct' },
                          { label: '-10%', value: 10, type: 'pct' },
                          { label: '-15%', value: 15, type: 'pct' },
                          { label: 'Zerar 🚫', value: 0, type: 'clear' },
                        ].map((btn, idx) => (
                          <motion.button
                            key={idx}
                            type="button"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.93 }}
                            onClick={() => {
                              if (btn.type === 'clear') {
                                handleDiscountPercChange('0');
                                handleDiscountValChange('0');
                              } else {
                                const currPct = parseFloat(discountPerc.replace(',', '.')) || 0;
                                const newPct = currPct + btn.value;
                                handleDiscountPercChange(newPct.toString());
                              }
                            }}
                            className={cn(
                              "relative overflow-hidden py-2 px-1 text-white border rounded-xl text-[9px] font-black uppercase tracking-tight transition-all duration-300 cursor-pointer flex items-center justify-center focus:outline-none",
                              btn.type === 'clear' 
                                ? "bg-red-950/20 border-red-900/30 hover:border-red-500 hover:bg-red-500/10 text-red-400" 
                                : "bg-white/5 border-white/10 hover:border-amber-500/30 hover:bg-amber-500/5"
                            )}
                          >
                            <motion.span 
                              className={cn(
                                "absolute inset-0 transition-colors duration-150 rounded-xl pointer-events-none",
                                btn.type === 'clear' ? "bg-red-500/0 active:bg-red-500/20" : "bg-amber-500/0 active:bg-amber-500/20"
                              )}
                            />
                            <span className="relative z-10">{btn.label}</span>
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="relative group font-sans">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-[9px] font-black group-focus-within:text-white uppercase tracking-widest leading-none z-10 pointer-events-none">Venda em:</span>
                        <input 
                          type="date"
                          className="w-full bg-white/5 border border-white/10 rounded-xl pl-24 pr-4 py-2.5 text-base md:text-xs font-black outline-none hover:bg-white/10 focus:ring-1 focus:ring-red-800 transition-all text-white/90"
                          value={saleDate}
                          onChange={e => setSaleDate(e.target.value)}
                        />
                      </div>

                      <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl border border-white/10 cursor-pointer group hover:bg-white/10 transition-all" onClick={() => setSendWhatsAppOnFinish(!sendWhatsAppOnFinish)}>
                        <div className={cn(
                          "size-5 rounded flex items-center justify-center border transition-all",
                          sendWhatsAppOnFinish ? "bg-amber-500 border-amber-600 text-slate-950" : "bg-transparent border-white/20"
                        )}>
                          {sendWhatsAppOnFinish && <MessageCircle size={12} />}
                        </div>
                        <span className="text-[10px] font-black uppercase text-white/60 group-hover:text-white transition-colors tracking-widest">WhatsApp</span>
                      </div>
                    </div>
                  </div>

                  {/* Cart Items List */}
                  <div className="space-y-3">
                    {/* Real-time Profitability/Margin Status Bar */}
                    {(() => {
                      if (cart.length === 0) return null;
                      let totalCost = 0;
                      cart.forEach(item => {
                        const p = products.find(prod => prod.id === item.productId);
                        const realAvgCost = getRealAverageCost(item.productId, p?.costPrice || 0);
                        totalCost += realAvgCost * item.quantity;
                      });
                      
                      const cartSubtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
                      const cartTotal = Math.max(0, cartSubtotal - safeFloat(discountVal));
                      const profit = cartTotal - totalCost;
                      const avgMargin = cartTotal > 0 ? (profit / cartTotal) * 100 : 0;
                      const avgMarkup = totalCost > 0 ? (profit / totalCost) * 105 : 0; // Wait, let's calculate exact markup: (Profit / Cost) * 100
                      const exactMarkup = totalCost > 0 ? (profit / totalCost) * 105 : 0;

                      let badgeColor = "bg-slate-900/40 border-slate-800 text-slate-400";
                      let statusText = "Margem Neutra";

                      if (avgMargin < 15) {
                        badgeColor = "bg-rose-950/30 border-rose-900/30 text-rose-400 animate-pulse";
                        statusText = "Margem Crítica ⚠️";
                      } else if (avgMargin >= 15 && avgMargin < 30) {
                        badgeColor = "bg-amber-950/30 border-amber-900/30 text-amber-400";
                        statusText = "Margem Moderada";
                      } else if (avgMargin >= 30) {
                        badgeColor = "bg-emerald-950/35 border-emerald-900/30 text-emerald-400";
                        statusText = "Altamente Lucrativo 🚀";
                      }

                      return (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn("p-4 border rounded-2xl flex flex-col gap-2 mb-4 transition-all duration-300", badgeColor)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/50">Saúde da Venda (Custo Médio Real)</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">{statusText}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <div className="bg-black/40 p-2 rounded-xl border border-white/5 text-center">
                              <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Margem Média</p>
                              <p className="text-sm font-black text-white mt-1 tabular-nums">{avgMargin.toFixed(1)}%</p>
                            </div>
                            <div className="bg-black/40 p-2 rounded-xl border border-white/5 text-center">
                              <p className="text-[8px] font-black text-white/40 uppercase tracking-widest leading-none">Markup Médio</p>
                              <p className="text-sm font-black text-white mt-1 tabular-nums">{exactMarkup.toFixed(1)}%</p>
                            </div>
                          </div>
                          <div className="flex justify-between text-[9px] font-black uppercase text-white/40 tracking-wider pt-1 border-t border-white/5">
                            <span>Custo Real Ponderado: {formatCurrency(totalCost)}</span>
                            <span>Lucro Estimado: {formatCurrency(profit)}</span>
                          </div>
                          <p className="text-[7.5px] font-semibold text-white/20 uppercase tracking-wide leading-tight text-center">
                            * Baseado nas encomendas reais + taxas pro-rata de lotes fiscalizados
                          </p>
                        </motion.div>
                      );
                    })()}

                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Itens no Carrinho ({cart.length})</div>
                    
                    {/* Shipping Upselling Intelligence Alerts */}
                    {(() => {
                      const totalCartQty = cart.reduce((acc, item) => acc + item.quantity, 0);
                      if (totalCartQty === 1 && shippingRegion !== 'none') {
                        const itemPrice = cart[0].price;
                        const shippingCost = shippingRegion === 'saoluis' ? 20.00 : 8.00;
                        const regionName = shippingRegion === 'saoluis' ? 'São Luís' : 'Paragominas';
                        const pctSingle = (shippingCost / itemPrice) * 100;
                        const pctDouble = (shippingCost / (itemPrice * 1.9)) * 100;

                        return (
                          <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-4 bg-red-800/10 border border-red-500/20 rounded-2xl space-y-1.5"
                          >
                            <div className="flex items-center gap-1.5 text-rose-400 font-sans font-black uppercase text-[9px] tracking-widest leading-none">
                              <TrendingUp size={12} className="text-rose-400 shrink-0 animate-bounce" />
                              Oportunidade de Upselling de Frete!
                            </div>
                            <p className="text-[10px] text-slate-350 leading-normal font-sans uppercase font-bold text-slate-200">
                              Aviso: O custo de frete representa <span className="text-amber-400 font-black">{pctSingle.toFixed(0)}%</span> do valor desta venda. Ofereça mais 1 item com <span className="text-emerald-400 font-black">10% de desconto</span> para faturar mais e diluir o frete de {regionName} para apenas <span className="text-emerald-400 font-black">{pctDouble.toFixed(0)}%</span>!
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                const discountAmount = itemPrice * 0.10;
                                setDiscountVal(discountAmount.toFixed(2).replace('.', ','));
                                const sub = itemPrice;
                                const p = (discountAmount * 100) / sub;
                                setDiscountPerc(p.toFixed(1).replace('.', ','));
                                alert(`Simulação ativada! Desconto de 10% (R$ ${formatCurrency(discountAmount)}) pré-configurado no checkout para a oferta do segundo item.`);
                              }}
                              className="w-full text-center py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                            >
                              Aplicar Sugestão (10% Desc.)
                            </button>
                          </motion.div>
                        );
                      }
                      
                      if (totalCartQty >= 2 && shippingRegion !== 'none') {
                        const shippingCost = shippingRegion === 'saoluis' ? 20.00 : 8.00;
                        const regionName = shippingRegion === 'saoluis' ? 'São Luís' : 'Paragominas';
                        const pctReal = (shippingCost / subtotal) * 100;
                        return (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-1"
                          >
                            <div className="flex items-center gap-1.5 text-emerald-400 font-sans font-black uppercase text-[9px] tracking-widest leading-none">
                              <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                              Eficiência Logística Máxima!
                            </div>
                            <p className="text-[10px] text-slate-300 leading-normal font-sans uppercase font-bold text-slate-200">
                              Excelente! Ao faturar <span className="text-emerald-400 font-black">{totalCartQty} itens</span>, o peso relativo do frete para {regionName} caiu para apenas <span className="text-emerald-400 font-black">{pctReal.toFixed(1)}%</span> do valor total vendido!
                            </p>
                          </motion.div>
                        );
                      }
                      return null;
                    })()}

                    {cart.some(item => (item.name || '').toLowerCase().includes('jogador') || (item.variationName || '').toLowerCase().includes('jogador')) && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1"
                      >
                        <div className="flex items-center gap-1.5 text-amber-400">
                          <Sparkles size={12} className="animate-spin text-amber-500 shrink-0" />
                          <span className="text-[9px] font-black uppercase tracking-widest leading-none">Corte Slim Jogador Detectado!</span>
                        </div>
                        <p className="text-[10px] text-slate-300 leading-normal font-sans">
                          A versão <strong>Jogador</strong> possui caimento mais justo e atlético. Oriente o comprador a escolher <strong>+1 tamanho acima</strong> do usual para evitar trocas e taxas de frete reverso.
                        </p>
                      </motion.div>
                    )}
                    {cart.length === 0 && (
                      <div className="py-12 flex flex-col items-center justify-center opacity-30 gap-4">
                        <div className="size-16 rounded-full border-2 border-dashed border-white flex items-center justify-center">
                          <Plus />
                        </div>
                        <p className="font-black text-sm tracking-tight uppercase">Carrinho Vazio</p>
                      </div>
                    )}
                    <AnimatePresence mode="popLayout">
                      {cart.map(item => (
                        <motion.div 
                          layout
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          key={item.variationId} 
                          className="bg-white/10 rounded-2xl p-4 border border-white/10 hover:border-red-500/50 transition-all shadow-lg group/item"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-black text-xs leading-tight text-white uppercase group-hover/item:text-amber-400 transition-colors">{cleanProductNameWithVariation(item.name)}</p>
                                {item.isDropshipping && (
                                  <span className="text-[7px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded italic animate-pulse">DS</span>
                                )}
                              </div>
                              {formatVariationWithGender(item.variationName, item.gender) && (
                                <p className="text-[8px] font-black text-white/30 mt-1 uppercase tracking-widest">{formatVariationWithGender(item.variationName, item.gender)}</p>
                              )}
                            </div>
                            {(() => {
                              const productObj = products.find(p => p.id === item.productId);
                              const isCamisa = (productObj?.category || '').toLowerCase().includes('camisa') || 
                                               (item.name || '').toLowerCase().includes('camisa');
                              const customizationFee = (item.isCustomized && isCamisa) ? 30 : 0;
                              return (
                                <p className="font-black text-sm ml-2 text-white tabular-nums tracking-tighter">
                                  {formatCurrency((item.price + customizationFee) * item.quantity)}
                                </p>
                              );
                            })()}
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="flex items-center bg-black/40 rounded-xl p-1 border border-white/5 shadow-inner">
                              <motion.button whileTap={{ scale: 0.85 }} onClick={() => updateQuantity(item.productId, item.variationId, -1)} className="size-8 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white cursor-pointer"><Minus size={14} /></motion.button>
                              <span className="w-10 text-center font-black text-sm text-white tabular-nums">{item.quantity}</span>
                              <motion.button whileTap={{ scale: 0.85 }} onClick={() => updateQuantity(item.productId, item.variationId, 1)} className="size-8 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white cursor-pointer"><Plus size={14} /></motion.button>
                            </div>
                            {(() => {
                              const productObj = products.find(p => p.id === item.productId);
                              const isCamisa = (productObj?.category || '').toLowerCase().includes('camisa') || 
                                               (item.name || '').toLowerCase().includes('camisa');
                              const hasCustom = item.isCustomized && isCamisa;
                              const realAvgCost = getRealAverageCost(item.productId, productObj?.costPrice || 0);
                              return (
                                <div className="flex flex-col gap-0.5">
                                  <div className="text-[9px] font-black text-white/30 uppercase tracking-widest block">
                                    Un: {formatCurrency(item.price)}{hasCustom && ` + ${formatCurrency(30)}`}
                                  </div>
                                  <div className="text-[8px] font-bold text-amber-500/80 uppercase tracking-widest block">
                                    Custo Médio: {formatCurrency(realAvgCost)}
                                  </div>
                                </div>
                              );
                            })()}
                            <motion.button 
                              whileTap={{ scale: 0.85 }}
                              onClick={() => setCart(cart.filter(c => c.variationId !== item.variationId))}
                              className="ml-auto size-9 flex items-center justify-center text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
                            >
                              <Trash2 size={18} />
                            </motion.button>
                          </div>

                          {/* Customization Details (Executive Jersey Print) */}
                          {(() => {
                            const productObj = products.find(p => p.id === item.productId);
                            const isCamisa = (productObj?.category || '').toLowerCase().includes('camisa') || 
                                             (item.name || '').toLowerCase().includes('camisa');
                            if (!isCamisa) return null;
                            
                            return (
                              <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                                <label className="flex items-center gap-2 cursor-pointer group/custom select-none">
                                  <input 
                                    type="checkbox"
                                    checked={!!item.isCustomized}
                                    onChange={(e) => updateCustomization(item.productId, item.variationId, { 
                                      isCustomized: e.target.checked,
                                      customName: e.target.checked ? (item.customName || '') : '',
                                      customNumber: e.target.checked ? (item.customNumber || '') : ''
                                    })}
                                    className="rounded border-white/10 bg-black/40 text-red-600 focus:ring-red-650 focus:ring-offset-slate-900 size-3.5"
                                  />
                                  <span className="text-[10px] font-bold uppercase text-white/60 group-hover/custom:text-white transition-colors tracking-wider flex items-center gap-1">
                                    <Sparkles size={11} className="text-amber-400" /> Deseja Personalizar Camisa? (+ R$ 30,00)
                                  </span>
                                </label>

                                {item.isCustomized && (
                                  <div className="space-y-3 mt-2 animate-fadeIn duration-200">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="space-y-1">
                                        <span className="text-[8px] font-bold uppercase text-white/40 tracking-wider block">Nome nas Costas</span>
                                        <input 
                                          type="text" 
                                          placeholder="Ex: BRUNO" 
                                          value={item.customName || ''}
                                          onChange={(e) => updateCustomization(item.productId, item.variationId, { customName: e.target.value.toUpperCase() })}
                                          maxLength={15}
                                          className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-1.5 text-base md:text-[11px] font-bold uppercase text-white placeholder-white/20 focus:border-red-500/50"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <span className="text-[8px] font-bold uppercase text-white/40 tracking-wider block">Número (0-99)</span>
                                        <input 
                                          type="text" 
                                          placeholder="Ex: 10" 
                                          value={item.customNumber || ''}
                                          onChange={(e) => {
                                            const cleanNum = e.target.value.replace(/[^0-9]/g, '');
                                            if (cleanNum === '') {
                                              updateCustomization(item.productId, item.variationId, { customNumber: '' });
                                            } else {
                                              const parsed = parseInt(cleanNum, 10);
                                              if (parsed <= 99) {
                                                updateCustomization(item.productId, item.variationId, { customNumber: cleanNum.slice(0, 2) });
                                              }
                                            }
                                          }}
                                          maxLength={2}
                                          className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-1.5 text-base md:text-[11px] font-bold uppercase text-white placeholder-white/20 focus:border-red-500/50 text-center"
                                        />
                                      </div>
                                    </div>

                                    {/* Manto Live Canvas Preview Box */}
                                    <div className="pt-1.5">
                                      <JerseyPreview 
                                        name={item.customName || ''} 
                                        number={item.customNumber || ''} 
                                        productName={item.name}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Sticky Bottom Summary */}
                <div className="mt-auto space-y-2 md:space-y-2.5 pt-3 md:pt-3 border-t border-white/10 shrink-0 bg-slate-950 z-10 -mx-4 md:-mx-4 px-4 md:px-4 pb-1">
                  <div className="flex flex-col gap-0.5 px-3 py-2 bg-white/5 rounded-xl border border-white/5 font-display">
                    <div className="flex justify-between items-center opacity-40">
                      <span className="text-[9px] font-black uppercase tracking-widest text-white">Subtotal</span>
                      <span className="text-xs font-black text-white tabular-nums tracking-tight">{formatCurrency(subtotal)}</span>
                    </div>
                    {discountVal !== '0' && (
                      <div className="flex justify-between items-center opacity-70">
                        <span className="text-[9px] font-black uppercase tracking-widest text-white">Desconto</span>
                        <span className="text-xs font-black text-rose-400 tabular-nums tracking-tight">-{formatCurrency(safeFloat(discountVal))}</span>
                      </div>
                    )}
                    {appliedBalanceForUI > 0 && (
                      <div className="flex justify-between items-center opacity-90 text-emerald-400">
                        <span className="text-[9px] font-black uppercase tracking-widest">Saldo Utilizado</span>
                        <span className="text-xs font-black tabular-nums tracking-tight">-{formatCurrency(appliedBalanceForUI)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center mt-1 border-t border-white/5 pt-1">
                      <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest animate-pulse">A Pagar</span>
                      <span className="text-xl md:text-2xl font-bold tracking-tight text-white tabular-nums">{formatCurrency(saleTotalForUI)}</span>
                    </div>
                  </div>

                  <button 
                    onClick={generateBudgetPDF}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-[9px] shadow-lg shadow-amber-500/15 font-sans active:scale-95 text-center"
                  >
                    <FileText size={14} /> Gerar Orçamento PDF
                  </button>

                  {paymentMethod === 'Fiado' && !selectedCustomer && (
                    <div className="bg-red-950/50 border border-red-800/50 p-2 rounded-xl text-center">
                      <p className="text-[9px] font-black uppercase text-red-400">Selecione um cliente para Fiado</p>
                    </div>
                  )}

                  {loadedPreSaleId ? (
                    <div className="flex flex-col md:grid md:grid-cols-2 gap-2">
                      <button 
                        disabled={isFinishing || (paymentMethod === 'Fiado' && !selectedCustomer)}
                        onClick={() => finishSale(false)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-900 disabled:text-slate-700 disabled:shadow-none text-white font-black py-4 md:py-2.5 rounded-xl transition-all shadow-xl flex items-center justify-center gap-1.5 uppercase tracking-wider text-[9px]"
                      >
                        {isFinishing ? 'PROCESSANDO...' : 'FATURAR'}
                        {!isFinishing && <CheckCircle2 size={13} />}
                      </button>
                      <button 
                        disabled={isFinishing}
                        onClick={() => finishSale(true)}
                        className="w-full bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-amber-500 font-black py-3 md:py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider text-[9px]"
                      >
                        {isFinishing ? 'PROCESSANDO...' : 'ATUALIZAR'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col md:grid md:grid-cols-2 gap-2">
                      <button 
                        disabled={isFinishing || (paymentMethod === 'Fiado' && !selectedCustomer)}
                        onClick={() => finishSale(false)}
                        className="w-full bg-red-800 hover:bg-black disabled:bg-slate-900 disabled:text-slate-700 disabled:shadow-none text-white font-black py-4 md:py-2.5 rounded-xl transition-all shadow-xl shadow-red-900/30 flex items-center justify-center gap-1.5 active:scale-[0.98] uppercase tracking-wider text-[9px]"
                      >
                        {isFinishing ? 'PROCESSANDO...' : 'FINALIZE'}
                        {!isFinishing && <Send size={13} />}
                      </button>
                      <button 
                        disabled={isFinishing}
                        onClick={() => finishSale(true)}
                        className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-900 text-amber-500 border border-white/5 font-black py-3 md:py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider text-[9px]"
                      >
                        {isFinishing ? 'PROCESSANDO...' : 'SALVE PRÉ-VENDA'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 relative">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4 px-1">Orçamentos e Pré-Vendas ({sales.filter(s => s.status === 'Pré-venda').length})</div>
                
                <div className="flex-1 md:overflow-y-auto pr-1 -mr-1 custom-scrollbar space-y-3 pb-6">
                  {sales.filter(s => s.status === 'Pré-venda').length === 0 ? (
                    <div className="py-24 flex flex-col items-center justify-center opacity-35 gap-4">
                      <div className="size-16 rounded-full border-2 border-dashed border-white flex items-center justify-center text-white/50 animate-pulse">
                        <ClipboardList size={28} />
                      </div>
                      <p className="font-black text-xs tracking-widest uppercase text-slate-300">Nenhum orçamento disponível</p>
                    </div>
                  ) : (
                    sales.filter(s => s.status === 'Pré-venda').map(preSale => (
                      <div key={preSale.id} className="bg-white/5 hover:bg-white/10 p-5 rounded-2xl border border-white/5 hover:border-amber-500/30 transition-all shadow-md space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-wider text-amber-500">ID #{preSale.id?.slice(-6).toUpperCase()}</p>
                            <h4 className="font-sans font-black text-xs text-white uppercase mt-0.5 truncate max-w-[150px]">{preSale.customerName || 'Consumidor Final'}</h4>
                            <p className="text-[8px] font-medium text-white/40 mt-0.5">
                              {preSale.createdAt?.seconds 
                                ? new Date(preSale.createdAt.seconds * 1000).toLocaleDateString('pt-BR') 
                                : 'Sem data'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] font-black uppercase tracking-wider text-white/40">Total Estimado</p>
                            <p className="text-base font-black text-white italic">{formatCurrency(preSale.total)}</p>
                          </div>
                        </div>

                        <div className="border-t border-white/5 pt-2.5 space-y-1">
                          {preSale.items.map((it: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-[9px] font-bold text-white/50 uppercase">
                              <span>{it.quantity}x {it.name}</span>
                              <span>{formatCurrency(it.price * it.quantity)}</span>
                            </div>
                          ))}
                        </div>

                        <div className="space-y-2 pt-2">
                          {confirmDeleteId === preSale.id ? (
                            <div className="bg-red-950/25 border border-red-500/20 rounded-xl p-2.5 flex flex-col gap-2 mt-2">
                              <p className="text-[8.5px] font-black text-red-400 uppercase tracking-widest text-center leading-tight">CONFIRMA EXCLUSÃO DESTE ORÇAMENTO?</p>
                              <div className="grid grid-cols-2 gap-2">
                                <button 
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-all"
                                >
                                  Cancelar
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => deletePreSale(preSale.id!)}
                                  className="py-1.5 bg-red-800 hover:bg-red-700 text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-all shadow-md shadow-red-950/40"
                                >
                                  Sim, Apagar
                                </button>
                              </div>
                            </div>
                          ) : confirmDirectBillId === preSale.id ? (
                            <div className="bg-emerald-950/25 border border-emerald-500/20 rounded-xl p-2.5 flex flex-col gap-2 mt-2">
                              <p className="text-[8.5px] font-black text-emerald-400 uppercase tracking-widest text-center leading-tight">CONFIRMA FATURAMENTO IMEDIATO? (ESTOQUE SERÁ ATUALIZADO)</p>
                              <div className="grid grid-cols-2 gap-2">
                                <button 
                                  type="button"
                                  onClick={() => setConfirmDirectBillId(null)}
                                  className="py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-all"
                                >
                                  Cancelar
                                </button>
                                <button 
                                  type="button"
                                  disabled={isFinishing}
                                  onClick={() => {
                                    convertPreSaleToSaleDirect(preSale);
                                    setConfirmDirectBillId(null);
                                  }}
                                  className="py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-all shadow-md shadow-emerald-950/40 disabled:opacity-50"
                                >
                                  Sim, Faturar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-3 gap-2">
                                <button 
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteId(preSale.id!);
                                    setConfirmDirectBillId(null);
                                  }}
                                  className="py-2 border border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500 text-[8px] font-black uppercase tracking-widest rounded-xl transition-all truncate"
                                >
                                  Apagar
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => {
                                    shareWhatsApp(preSale);
                                  }}
                                  className="py-2 bg-slate-800 border border-white/5 text-amber-500 hover:bg-slate-750 text-[8px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1"
                                  title="Compartilhar Link Interativo"
                                >
                                  <span>Whats</span>
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => {
                                    loadPreSale(preSale);
                                  }}
                                  className="py-2 bg-amber-500 text-slate-950 hover:bg-amber-400 text-[8px] font-black uppercase tracking-widest rounded-xl transition-all"
                                >
                                  Carregar
                                </button>
                              </div>
                              <button 
                                type="button"
                                disabled={isFinishing}
                                onClick={() => {
                                  setConfirmDirectBillId(preSale.id!);
                                  setConfirmDeleteId(null);
                                }}
                                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/20 disabled:opacity-50"
                              >
                                <CheckCircle2 size={12} /> Faturar Orçamento (1-Clique)
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
