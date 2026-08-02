import React, { useState, useEffect } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Minus, 
  Plus, 
  X, 
  Send, 
  Check, 
  ChevronRight, 
  Tag, 
  Smartphone,
  Sparkles,
  Shirt,
  Info,
  Star,
  Award,
  Globe,
  ChevronLeft,
  MessageCircle,
  Edit2
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Product, Variation, CustomerPhoto, Coupon } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { JerseyPreview } from '../components/JerseyPreview';

interface CartItem {
  product: Product;
  variation: Variation;
  quantity: number;
  isCustomized?: boolean;
  customName?: string;
  customNumber?: string;
}

const CUSTOMIZATION_FEE = 30; // R$ 30,00 customization fee per unit

const isProductCamisa = (product?: Product | null) => {
  if (!product) return true;
  const cat = (product.category || '').toLowerCase();
  const name = (product.name || '').toLowerCase();
  return cat.includes('camisa') || cat.includes('manto') || cat.includes('conjunto') ||
         name.includes('camisa') || name.includes('manto') || name.includes('regata') || name.includes('jersey');
};

const getItemUnitPrice = (item: CartItem) => {
  const isCamisa = isProductCamisa(item.product);
  const fee = (item.isCustomized && isCamisa) ? CUSTOMIZATION_FEE : 0;
  return item.product.sellingPrice + fee;
};

// Default fallback variation for single-grade / no variation products
const DEFAULT_GRADE_UNICA: Variation = {
  id: 'grade-unica',
  size: 'Tamanho Único',
  color: '',
  stock: 999
};

export default function PublicCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [logoScale, setLogoScale] = useState<number>(1.0);
  const [whatsappNumber, setWhatsappNumber] = useState<string>('');
  
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'info'>('cart');
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [selectedVariation, setSelectedVariation] = useState<Variation | null>(null);
  const [modalQuantity, setModalQuantity] = useState<number>(1);
  const [customerPhotos, setCustomerPhotos] = useState<CustomerPhoto[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [selectedTestimonialPhoto, setSelectedTestimonialPhoto] = useState<CustomerPhoto | null>(null);

  // Customization state for Quick View Modal
  const [isCustomizedModal, setIsCustomizedModal] = useState(false);
  const [customNameModal, setCustomNameModal] = useState('');
  const [customNumberModal, setCustomNumberModal] = useState('');
  const [editingCartCustomIndex, setEditingCartCustomIndex] = useState<number | null>(null);

  const handleOpenQuickView = (product: Product) => {
    setQuickViewProduct(product);
    setModalQuantity(1);
    setIsCustomizedModal(false);
    setCustomNameModal('');
    setCustomNumberModal('');

    if (!product.variations || product.variations.length === 0) {
      setSelectedVariation(DEFAULT_GRADE_UNICA);
    } else {
      const validVariation = product.variations.find(v => product.isDropshipping || v.stock > 0) || product.variations[0];
      setSelectedVariation(validVariation || DEFAULT_GRADE_UNICA);
    }
  };

  // Coupons catalog integration
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState('');

  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [productsLoaded, setProductsLoaded] = useState(false);

  // Load active products, logo settings, and whatsapp config from Firestore
  useEffect(() => {
    // 1. Fetch Products
    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const prodList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      setProducts(prodList);
      setProductsLoaded(true);
    }, (error) => {
      console.error("Error loading products in PublicCatalog:", error);
      setFirebaseError(`Erro ao carregar produtos do banco de dados: ${error.message}`);
      setProductsLoaded(true);
    });

    // 2. Fetch Logo and WhatsApp settings
    const settingsRef = doc(db, 'settings', 'appearance');
    const unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLogoUrl(data.logoUrl || '');
        setLogoScale(data.logoScale ?? 1.0);
        // Load custom whatsapp number for catalog from settings
        setWhatsappNumber(data.catalogWhatsapp || data.whatsapp || '5591993249580');
      }
    }, (error) => {
      console.error("Error loading settings in PublicCatalog:", error);
      setFirebaseError(`Erro ao carregar configurações de aparência: ${error.message}`);
    });

    // 3. Fetch Customer Photos for Social Proof
    const qPhotos = query(collection(db, 'customer_photos'), orderBy('createdAt', 'desc'));
    const unsubscribePhotos = onSnapshot(qPhotos, (snapshot) => {
      const photosList = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as CustomerPhoto))
        .filter(p => p.showInCatalog !== false);
      setCustomerPhotos(photosList);
    }, (error) => {
      console.error("Error loading customer photos:", error);
    });

    // 4. Fetch Coupons for discounts
    const unsubscribeCoupons = onSnapshot(collection(db, 'coupons'), (snapshot) => {
      const couponList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Coupon));
      setCoupons(couponList);
    }, (error) => {
      console.error("Error loading coupons:", error);
    });

    return () => {
      unsubscribeProducts();
      unsubscribeSettings();
      unsubscribePhotos();
      unsubscribeCoupons();
    };
  }, []);

  // Rotate banner slide every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % 3); // 3 slides
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Format currency
  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Unique categories
  const categories = ['ALL', ...Array.from(new Set(products.map(p => (p.category || '').toUpperCase().trim()).filter(Boolean)))];

  // Filter products
  const filteredProducts = products.filter(p => {
    const categoryStr = p.category || '';
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                          categoryStr.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'ALL' || categoryStr.toUpperCase().trim() === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (
    product: Product, 
    variation: Variation, 
    quantity = 1,
    isCustomized = false,
    customName = '',
    customNumber = ''
  ) => {
    setCart(prev => {
      const existingIdx = prev.findIndex(item => 
        item.product.id === product.id && 
        item.variation.id === variation.id &&
        !!item.isCustomized === !!isCustomized &&
        (item.customName || '') === (customName || '') &&
        (item.customNumber || '') === (customNumber || '')
      );

      if (existingIdx > -1) {
        const updated = [...prev];
        const newQty = updated[existingIdx].quantity + quantity;
        if (newQty <= variation.stock || product.isDropshipping) {
          updated[existingIdx].quantity = newQty;
        } else {
          alert(`Desculpe! Estoque máximo atingido para o tamanho ${variation.size}.`);
        }
        return updated;
      } else {
        return [...prev, { 
          product, 
          variation, 
          quantity,
          isCustomized,
          customName: isCustomized ? customName.trim().toUpperCase() : '',
          customNumber: isCustomized ? customNumber.trim() : ''
        }];
      }
    });

    // Reset selection and close quick view
    setQuickViewProduct(null);
    setSelectedVariation(null);
    setIsCustomizedModal(false);
    setCustomNameModal('');
    setCustomNumberModal('');
  };

  const updateCartQty = (idx: number, delta: number) => {
    setCart(prev => {
      const updated = [...prev];
      const item = updated[idx];
      const newQty = item.quantity + delta;
      
      if (newQty <= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      
      if (newQty <= item.variation.stock || item.product.isDropshipping) {
        updated[idx].quantity = newQty;
        return updated;
      } else {
        alert(`Estoque máximo para o tamanho ${item.variation.size} é ${item.variation.stock} unidades.`);
        return prev;
      }
    });
  };

  const updateCartCustomization = (
    idx: number, 
    updates: { isCustomized?: boolean; customName?: string; customNumber?: string }
  ) => {
    setCart(prev => {
      const updated = [...prev];
      updated[idx] = { 
        ...updated[idx], 
        ...updates,
        customName: updates.customName !== undefined ? updates.customName.toUpperCase() : updated[idx].customName
      };
      return updated;
    });
  };

  const cartTotal = cart.reduce((acc, item) => acc + (getItemUnitPrice(item) * item.quantity), 0);
  const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  // Validate applied coupon in real-time based on current cartTotal
  const isAppliedCouponValid = (() => {
    if (!appliedCoupon) return false;
    if (appliedCoupon.minPurchase && cartTotal < appliedCoupon.minPurchase) return false;
    const isExpired = appliedCoupon.expiresAt && new Date(appliedCoupon.expiresAt) < new Date(new Date().setHours(0,0,0,0));
    if (isExpired) return false;
    return true;
  })();

  const activeCoupon = isAppliedCouponValid ? appliedCoupon : null;

  const discountAmount = activeCoupon
    ? (activeCoupon.type === 'percentage'
        ? cartTotal * (activeCoupon.value / 100)
        : activeCoupon.value)
    : 0;

  const finalTotal = Math.max(0, cartTotal - discountAmount);

  const handleApplyCoupon = () => {
    setCouponError('');
    setAppliedCoupon(null);
    if (!couponCodeInput.trim()) return;

    const found = coupons.find(c => c.code.toUpperCase() === couponCodeInput.trim().toUpperCase());
    if (!found) {
      setCouponError('Cupom inválido ou inexistente.');
      return;
    }

    if (!found.isActive) {
      setCouponError('Este cupom não está ativo.');
      return;
    }

    const isExpired = found.expiresAt && new Date(found.expiresAt) < new Date(new Date().setHours(0,0,0,0));
    if (isExpired) {
      setCouponError('Este cupom expirou.');
      return;
    }

    if (found.minPurchase && cartTotal < found.minPurchase) {
      setCouponError(`Compra mínima para este cupom é de ${formatCurrency(found.minPurchase)}.`);
      return;
    }

    setAppliedCoupon(found);
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCodeInput('');
    setCouponError('');
  };

  const handleSendWhatsAppOrder = () => {
    if (cart.length === 0) return;
    if (!clientName.trim()) {
      alert('Por favor, informe seu Nome para que possamos identificá-lo!');
      setCheckoutStep('info');
      return;
    }

    let message = `*Olá! Acabei de montar meu carrinho no catálogo online:* ⚽🔥\n\n`;
    message += `👤 *Cliente:* ${clientName.trim()}\n`;
    if (clientPhone.trim()) {
      message += `📞 *Contato:* ${clientPhone.trim()}\n`;
    }
    message += `\n📦 *Itens Escolhidos:*\n`;

    cart.forEach((item, index) => {
      const unitPrice = getItemUnitPrice(item);
      const subtotalItem = unitPrice * item.quantity;
      message += `${index + 1}. *${item.product.name}*\n`;
      message += `   Tamanho: _${item.variation.size}_ ${item.variation.color ? `| Cor: _${item.variation.color}_` : ''}\n`;
      if (item.isCustomized) {
        message += `   ✨ *Personalização (+ R$ 30,00):* NOME: "${item.customName || 'S/N'}" | Nº: "${item.customNumber || 'S/N'}"\n`;
      }
      message += `   Qtd: *${item.quantity}x* | Valor Un: _${formatCurrency(unitPrice)}_ | Subtotal: *${formatCurrency(subtotalItem)}*\n\n`;
    });

    if (activeCoupon) {
      message += `🎟️ *Cupom de Desconto:* _${activeCoupon.code}_ (-${activeCoupon.type === 'percentage' ? `${activeCoupon.value}%` : formatCurrency(activeCoupon.value)})\n`;
      message += `💵 *Subtotal:* ${formatCurrency(cartTotal)}\n`;
      message += `💰 *Total com Desconto:* *${formatCurrency(finalTotal)}*\n\n`;
    } else {
      message += `💰 *Total do Pedido:* *${formatCurrency(cartTotal)}*\n\n`;
    }
    
    message += `👉 *Por favor, confirme a disponibilidade e me passe as instruções de pagamento!*`;

    const formattedNumber = whatsappNumber.replace(/\D/g, '');
    const finalNumber = formattedNumber.startsWith('55') ? formattedNumber : `55${formattedNumber}`;
    const url = `https://api.whatsapp.com/send?phone=${finalNumber}&text=${encodeURIComponent(message)}`;
    
    // Open WhatsApp link
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 pb-20 select-none relative font-sans">
      {/* Ambient background glows */}
      <div className="absolute top-0 left-0 w-full h-[320px] bg-gradient-to-b from-red-950/10 to-transparent pointer-events-none" />
      <div className="absolute top-[-100px] right-[-100px] w-[350px] h-[350px] bg-red-600/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Floating Cart Trigger Button */}
      {cartItemCount > 0 && (
        <motion.button
          layoutId="cartFloatingBtn"
          onClick={() => {
            setCheckoutStep('cart');
            setIsCartOpen(true);
          }}
          className="fixed bottom-6 right-6 z-[99] bg-gradient-to-r from-red-700 to-rose-600 text-white p-4 rounded-full shadow-2xl flex items-center gap-2 font-black text-sm uppercase tracking-wider cursor-pointer border border-red-500/20 active:scale-95 shadow-red-900/40"
        >
          <ShoppingCart size={20} className="animate-bounce" />
          <span>Carrinho ({cartItemCount})</span>
          <span className="bg-white text-red-800 text-[10px] px-2 py-0.5 rounded-full font-black">
            {formatCurrency(finalTotal)}
          </span>
        </motion.button>
      )}

      {/* Header */}
      <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-100 z-40 py-4 px-6 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg bg-transparent shadow-slate-200/50 overflow-hidden border border-slate-100 relative">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt="Logo" 
                className="w-full h-full object-cover rounded-xl" 
                style={{ transform: `scale(${logoScale})` }}
                referrerPolicy="no-referrer" 
              />
            ) : (
              <div className="w-full h-full bg-red-800 flex items-center justify-center rounded-xl text-white font-black text-lg">⚽</div>
            )}
          </div>
          <div className="flex flex-col -space-y-0.5">
            <span className="text-xs font-black uppercase tracking-tight text-slate-950">
              ERP CLUB DA <span className="text-red-700">BOLA</span>
            </span>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
              Vitrina de Estoque Ativo
            </span>
          </div>
        </div>

        <button 
          onClick={() => {
            if (cart.length > 0) {
              setCheckoutStep('cart');
              setIsCartOpen(true);
            } else {
              alert('Seu carrinho está vazio! Escolha produtos para começar.');
            }
          }}
          className="relative p-2 text-slate-500 hover:text-slate-950 active:scale-95 transition-transform"
        >
          <ShoppingCart size={24} />
          {cartItemCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-700 text-white text-[9px] font-black rounded-full size-5 flex items-center justify-center border border-white animate-pulse">
              {cartItemCount}
            </span>
          )}
        </button>
      </header>

      {/* Debug Error Banner */}
      {firebaseError && (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <div className="bg-red-50 border border-red-200 text-red-800 text-xs font-semibold p-4 rounded-2xl flex items-start gap-2.5">
            <span className="text-sm">⚠️</span>
            <div className="space-y-1">
              <p className="font-bold uppercase tracking-wide text-[10px]">Erro no Banco de Dados</p>
              <p className="opacity-90 leading-relaxed">{firebaseError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Catalog Dynamic Banner Carousel */}
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="relative group/carousel">
          {[
            {
              id: 0,
              badge: "⚡ NOVIDADES DA SEMANA",
              title: "Mantos de Elite 24/25",
              description: "Estoque renovado com as camisas de jogo e treino dos maiores clubes europeus e seleções. Tecido tecnológico de alta performance com caimento perfeito!",
              icon: <Shirt className="text-amber-400 size-8 sm:size-10" />,
              colorClass: "from-slate-950 via-slate-900 to-red-950 border-red-900/20",
              glowColor: "bg-red-600/15"
            },
            {
              id: 1,
              badge: "⭐ PROGRAMA DE FIDELIDADE",
              title: "Ganhe Cashback Club",
              description: "Todas as suas compras acumulam bônus de desconto! Indique amigos, envie sua foto no nosso Mural de Clientes e garanta cupons especiais.",
              icon: <Award className="text-yellow-400 size-8 sm:size-10" />,
              colorClass: "from-zinc-950 via-stone-900 to-[#102a1d] border-emerald-900/20",
              glowColor: "bg-emerald-600/15"
            },
            {
              id: 2,
              badge: "✈️ ENCOMENDAS PERSONALIZADAS",
              title: "Mantos sob Encomenda",
              description: "Não encontrou seu tamanho ou modelo no estoque pronto? Nós encomendamos via dropshipping internacional seguro com personalização completa de nome e número!",
              icon: <Globe className="text-sky-400 size-8 sm:size-10" />,
              colorClass: "from-slate-950 via-[#0d1b3e] to-[#070b19] border-blue-900/20",
              glowColor: "bg-blue-600/15"
            }
          ].map((slide, idx) => {
            const isActive = idx === currentSlide;
            if (!isActive) return null;
            return (
              <motion.div
                key={slide.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.4 }}
                className={cn(
                  "bg-gradient-to-tr text-white rounded-[32px] p-6 sm:p-8 shadow-xl border relative overflow-hidden flex flex-col sm:flex-row items-center gap-6 min-h-[190px]",
                  slide.colorClass
                )}
              >
                {/* Ambient glow */}
                <div className={cn("absolute top-0 right-0 w-[240px] h-[240px] rounded-full blur-[90px] pointer-events-none transition-all", slide.glowColor)} />
                
                {/* Text Content */}
                <div className="text-center sm:text-left flex-1 space-y-2.5 z-10">
                  <span className="bg-white/10 text-amber-400 text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-white/10 inline-block backdrop-blur-md">
                    {slide.badge}
                  </span>
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight font-display text-white">
                    {slide.title}
                  </h1>
                  <p className="text-xs text-slate-300 font-medium leading-relaxed max-w-xl">
                    {slide.description}
                  </p>
                </div>

                {/* Big Visual Icon */}
                <div className="size-16 sm:size-20 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center shadow-2xl shrink-0 select-none backdrop-blur-sm relative group-hover/carousel:scale-105 transition-transform duration-300">
                  {slide.icon}
                </div>
              </motion.div>
            );
          })}

          {/* Left Arrow */}
          <button
            onClick={() => setCurrentSlide(prev => (prev === 0 ? 2 : prev - 1))}
            className="absolute left-3 top-1/2 -translate-y-1/2 size-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity active:scale-90 z-20"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Right Arrow */}
          <button
            onClick={() => setCurrentSlide(prev => (prev === 2 ? 0 : prev + 1))}
            className="absolute right-3 top-1/2 -translate-y-1/2 size-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity active:scale-90 z-20"
          >
            <ChevronRight size={16} />
          </button>

          {/* Dot Indicators */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
            {[0, 1, 2].map(idx => (
              <button
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  idx === currentSlide ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60"
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="max-w-4xl mx-auto px-4 mt-6 space-y-4">
        {/* Search */}
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 size-5 group-focus-within:text-red-800 transition-colors" />
          <input 
            type="text" 
            placeholder="Buscar produtos ou marcas..." 
            className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-800 shadow-sm outline-none text-xs font-black tracking-widest transition-all"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button 
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 text-xs font-bold font-sans"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Categories Carousel */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 select-none">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shrink-0 active:scale-95 border",
                  isActive 
                    ? "bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-900/10" 
                    : "bg-white border-slate-200 text-slate-500 hover:text-slate-800"
                )}
              >
                {cat === 'ALL' ? 'Todos' : cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Products Grid */}
      <div className="max-w-4xl mx-auto px-4 mt-6">
        {!productsLoaded ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <div key={n} className="bg-white border border-slate-200/80 rounded-[28px] overflow-hidden p-4 space-y-3 animate-pulse">
                <div className="aspect-square bg-slate-100 rounded-2xl w-full" />
                <div className="h-3 bg-slate-200 rounded-lg w-3/4" />
                <div className="h-3 bg-slate-200 rounded-lg w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3">
            <div className="text-4xl">🔎</div>
            <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Nenhum produto encontrado</h3>
            <p className="text-xs text-slate-400">Tente buscar por termos diferentes ou selecione outra categoria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {filteredProducts.map((product) => {
              const hasStock = product.isDropshipping || (!product.variations || product.variations.length === 0) || product.variations.some(v => v.stock > 0);
              
              return (
                <div 
                  key={product.id}
                  className="bg-white border border-slate-200/80 rounded-[28px] overflow-hidden flex flex-col group hover:shadow-lg transition-all duration-300 relative"
                >
                  {/* Category Tag */}
                  <span className="absolute top-3 left-3 z-10 px-2 py-0.5 bg-slate-950/80 backdrop-blur-md text-amber-500 text-[8px] font-black uppercase rounded tracking-widest leading-none">
                    {product.category}
                  </span>

                  {/* Dropshipping/Virtual Badge */}
                  {product.isDropshipping && (
                    <span className="absolute top-3 right-3 z-10 px-2 py-0.5 bg-indigo-600 text-white text-[8px] font-black uppercase rounded tracking-widest leading-none shadow-sm">
                      Encomenda
                    </span>
                  )}

                  {/* Product Photo */}
                  <div className="aspect-square bg-slate-100 overflow-hidden relative shrink-0">
                    {product.photoUrl ? (
                      <img 
                        src={product.photoUrl} 
                        alt={product.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 font-black gap-1 uppercase text-[8px] tracking-wider bg-gradient-to-tr from-slate-100 to-slate-200">
                        <Shirt size={28} className="opacity-40 text-red-800" />
                        <span>Sem Imagem</span>
                      </div>
                    )}
                    
                    {!hasStock && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center">
                        <span className="px-3 py-1.5 bg-red-800 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow">
                          Esgotado
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-2">
                    <div>
                      <h3 className="font-bold text-xs text-slate-800 leading-tight line-clamp-2">
                        {product.name}
                      </h3>
                      {product.gender && product.gender !== 'Ambos' && (
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                          {product.gender}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="text-sm font-black text-slate-950 font-display">
                        {formatCurrency(product.sellingPrice)}
                      </div>
                    </div>

                    {/* Choose / Action button */}
                    <button
                      onClick={() => {
                        if (!hasStock) return;
                        handleOpenQuickView(product);
                      }}
                      disabled={!hasStock}
                      className={cn(
                        "w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all text-center flex items-center justify-center gap-1 active:scale-95 cursor-pointer",
                        hasStock 
                          ? "bg-slate-900 hover:bg-slate-800 text-white shadow-sm" 
                          : "bg-slate-100 text-slate-400 cursor-not-allowed"
                      )}
                    >
                      <span>{product.isDropshipping ? 'Encomendar' : 'Ver Opções / Adicionar'}</span>
                      <ChevronRight size={10} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mural de Clientes & Depoimentos (Social Proof Section) */}
      <div className="max-w-4xl mx-auto px-4 mt-12 pb-10">
        <div className="text-center sm:text-left mb-6 space-y-1">
          <span className="bg-red-50 text-red-800 text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-red-100 inline-block">
            ⚽ PROVA SOCIAL - QUEM USA RECOMENDA
          </span>
          <h2 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 font-display">
            Mural de Clientes & Fotos Reais
          </h2>
          <p className="text-xs text-slate-500 font-medium max-w-xl">
            Veja as fotos enviadas pelos nossos clientes vestindo o manto sagrado e comprove a qualidade premium e o caimento impecável de nossas peças!
          </p>
        </div>

        {customerPhotos.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center space-y-3 shadow-sm">
            <div className="size-12 rounded-full bg-red-50 text-red-700 flex items-center justify-center mx-auto text-xl font-bold">⭐</div>
            <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider">Mural em Construção</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Seja o primeiro a enviar sua foto vestindo seu manto do Club da Bola no nosso WhatsApp e garanta bônus de cashback na sua próxima compra!
            </p>
            <a
              href={`https://api.whatsapp.com/send?phone=${whatsappNumber.replace(/\D/g, '')}&text=${encodeURIComponent("Olá! Quero enviar uma foto minha vestindo o manto para participar do Mural de Clientes e ganhar meu cupom!")}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-black text-white text-[9px] font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-sm"
            >
              <MessageCircle size={12} />
              <span>Enviar Minha Foto</span>
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {customerPhotos.slice(0, 6).map((photo) => (
              <motion.div
                key={photo.id}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
                onClick={() => setSelectedTestimonialPhoto(photo)}
                className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-md cursor-pointer flex flex-col justify-between"
              >
                {/* Photo crop */}
                <div className="aspect-[4/3] bg-slate-100 overflow-hidden relative group">
                  <img
                    src={photo.photoUrl}
                    alt={photo.customerName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="px-3 py-1.5 bg-white text-slate-900 text-[8px] font-black uppercase tracking-wider rounded-lg shadow-lg">
                      Ver Foto Inteira
                    </span>
                  </div>
                  
                  {/* Rating stars */}
                  <div className="absolute bottom-2.5 left-3 bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded-full flex gap-0.5 text-amber-400 border border-white/5 shadow">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star key={star} size={9} fill="currentColor" />
                    ))}
                  </div>
                </div>

                {/* Testimonial details */}
                <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                  <p className="text-[11px] text-slate-600 font-medium italic leading-relaxed line-clamp-3">
                    "{photo.description || 'Produto incrível! Tecido premium, escudo bordado e caimento perfeito. Muito satisfeito com a compra!'}"
                  </p>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight flex items-center gap-1">
                        {photo.customerName}
                        <Check size={12} className="text-sky-500 stroke-[3]" />
                      </span>
                      {photo.mantoType && (
                        <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider">
                          {photo.mantoType}
                        </span>
                      )}
                    </div>
                    
                    <span className="text-[8px] font-black text-red-800 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0">
                      100% Real
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox / Testimonial Photo Modal */}
      <AnimatePresence>
        {selectedTestimonialPhoto && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTestimonialPhoto(null)}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-[32px] overflow-hidden max-w-lg w-full shadow-2xl z-20 border border-slate-200"
            >
              {/* Image View */}
              <div className="aspect-[4/3] bg-slate-950 relative overflow-hidden">
                <img
                  src={selectedTestimonialPhoto.photoUrl}
                  alt={selectedTestimonialPhoto.customerName}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                
                {/* Close Button */}
                <button
                  onClick={() => setSelectedTestimonialPhoto(null)}
                  className="absolute top-4 right-4 p-2 rounded-full bg-slate-950/60 text-white hover:bg-slate-950/80 hover:scale-105 transition-all"
                >
                  <X size={18} />
                </button>

                <div className="absolute bottom-4 left-4 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-full flex gap-1 text-amber-400 border border-white/10">
                  {[1, 2, 3, 4, 5].map(star => (
                    <Star key={star} size={11} fill="currentColor" />
                  ))}
                  <span className="text-[9px] font-black text-white ml-1 uppercase">RECOMENDADO</span>
                </div>
              </div>

              {/* Feedback Content */}
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-sm text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                      {selectedTestimonialPhoto.customerName}
                      <Check size={14} className="text-sky-500 stroke-[3]" />
                    </h3>
                    <span className="text-[9px] font-black text-green-700 bg-green-50 border border-green-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      Compra Verificada
                    </span>
                  </div>
                  {selectedTestimonialPhoto.mantoType && (
                    <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase tracking-wider">
                      Adquiriu: {selectedTestimonialPhoto.mantoType}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-600 font-medium leading-relaxed italic border-l-4 border-red-700 pl-3">
                  "{selectedTestimonialPhoto.description || 'Excelente caimento, acabamento impecável de primeira linha. Recomendo de olhos fechados!'}"
                </p>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase">
                  <span>Foto real enviada por cliente</span>
                  <span>Club da Bola</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick View / Select Size Modal */}
      <AnimatePresence>
        {quickViewProduct && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setQuickViewProduct(null)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs"
            />
            
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full sm:max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl border border-slate-150 overflow-hidden z-10 flex flex-col max-h-[85vh] sm:max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-black text-xs uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} className="text-amber-500 animate-pulse" />
                  Selecione as Opções
                </h3>
                <button 
                  onClick={() => setQuickViewProduct(null)}
                  className="p-1 rounded-lg bg-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-300 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                {/* Product details */}
                <div className="flex gap-4">
                  <div className="size-16 rounded-xl bg-slate-100 overflow-hidden border shrink-0">
                    {quickViewProduct.photoUrl ? (
                      <img src={quickViewProduct.photoUrl} alt={quickViewProduct.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-red-100 text-red-800 font-bold">⚽</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="px-1.5 py-0.5 bg-slate-900 text-amber-500 text-[8px] font-black rounded uppercase tracking-widest">
                      {quickViewProduct.category}
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 leading-tight">{quickViewProduct.name}</h4>
                    <div className="flex items-baseline gap-2">
                      <p className="text-base font-black text-red-800 font-display">
                        {formatCurrency(quickViewProduct.sellingPrice + (isCustomizedModal ? CUSTOMIZATION_FEE : 0))}
                      </p>
                      {isCustomizedModal && (
                        <span className="text-[9px] font-extrabold text-amber-600 uppercase tracking-wider">
                          (+R$ 30,00 Personalização)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sizes Selection */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">
                    Tamanho / Opção:
                  </label>
                  
                  {quickViewProduct.variations && quickViewProduct.variations.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {quickViewProduct.variations.map((v) => {
                        const hasStock = quickViewProduct.isDropshipping || v.stock > 0;
                        const isSelected = selectedVariation?.id === v.id;
                        
                        return (
                          <button
                            key={v.id}
                            disabled={!hasStock}
                            onClick={() => setSelectedVariation(v)}
                            className={cn(
                              "px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all active:scale-95 flex flex-col items-center justify-center min-w-14 relative overflow-hidden",
                              isSelected 
                                ? "bg-red-800 border-red-800 text-white shadow-md shadow-red-800/10" 
                                : hasStock
                                  ? "bg-white border-slate-200 text-slate-800 hover:border-slate-400"
                                  : "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
                            )}
                          >
                            <span>{v.size}</span>
                            {v.color && <span className="text-[8px] opacity-60 font-semibold">{v.color}</span>}
                            {!quickViewProduct.isDropshipping && v.stock > 0 && v.stock <= 2 && (
                              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-amber-500 rounded-full" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedVariation(DEFAULT_GRADE_UNICA)}
                        className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-red-800 border border-red-800 text-white shadow-md flex items-center gap-2"
                      >
                        <Check size={14} />
                        <span>Tamanho Único / Grade Única</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Quantity Selector */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">
                    Quantidade:
                  </label>
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-2.5">
                    <div className="flex items-center gap-2 select-none">
                      <button 
                        type="button"
                        onClick={() => setModalQuantity(prev => Math.max(1, prev - 1))}
                        className="size-8 bg-white hover:bg-slate-200 rounded-xl flex items-center justify-center text-slate-800 active:scale-90 border border-slate-200/80 shadow-xs"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="font-black text-sm font-mono min-w-8 text-center text-slate-900">{modalQuantity}</span>
                      <button 
                        type="button"
                        onClick={() => {
                          const maxStock = (!quickViewProduct.isDropshipping && selectedVariation && selectedVariation.id !== 'grade-unica') 
                            ? selectedVariation.stock 
                            : 99;
                          setModalQuantity(prev => Math.min(maxStock > 0 ? maxStock : 99, prev + 1));
                        }}
                        className="size-8 bg-white hover:bg-slate-200 rounded-xl flex items-center justify-center text-slate-800 active:scale-90 border border-slate-200/80 shadow-xs"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-extrabold uppercase text-slate-400 block">Subtotal Item</span>
                      <span className="text-sm font-black text-red-800 font-display">
                        {formatCurrency((quickViewProduct.sellingPrice + (isCustomizedModal ? CUSTOMIZATION_FEE : 0)) * modalQuantity)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stock info message */}
                {selectedVariation && selectedVariation.id !== 'grade-unica' && !quickViewProduct.isDropshipping && (
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>Estoque Deste Tamanho:</span>
                    <span className={cn("font-black text-xs font-mono", selectedVariation.stock <= 2 ? 'text-amber-600' : 'text-slate-950')}>
                      {selectedVariation.stock} unidades
                    </span>
                  </div>
                )}
                
                {quickViewProduct.isDropshipping && (
                  <div className="p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-150 text-[10px] text-indigo-700 font-bold uppercase tracking-wider flex items-center gap-2">
                    <Sparkles size={14} className="text-indigo-600" />
                    <span>Item sob encomenda internacional (Prazo padrão)</span>
                  </div>
                )}

                {/* Customization Section in Modal */}
                {isProductCamisa(quickViewProduct) && (
                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none group/custom">
                      <input 
                        type="checkbox"
                        checked={isCustomizedModal}
                        onChange={(e) => {
                          setIsCustomizedModal(e.target.checked);
                          if (!e.target.checked) {
                            setCustomNameModal('');
                            setCustomNumberModal('');
                          }
                        }}
                        className="rounded border-slate-300 text-red-700 focus:ring-red-800 size-4 cursor-pointer"
                      />
                      <span className="text-xs font-black uppercase text-slate-800 group-hover/custom:text-red-800 transition-colors tracking-wide flex items-center gap-1.5">
                        <Sparkles size={14} className="text-amber-500" /> Personalizar Camisa? (+ R$ 30,00)
                      </span>
                    </label>

                    {isCustomizedModal && (
                      <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 animate-fadeIn">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">
                              Nome nas Costas
                            </label>
                            <input 
                              type="text" 
                              placeholder="EX: BRENER" 
                              value={customNameModal}
                              onChange={(e) => setCustomNameModal(e.target.value.toUpperCase())}
                              maxLength={15}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold uppercase text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-red-800"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">
                              Número (0-99)
                            </label>
                            <input 
                              type="text" 
                              placeholder="EX: 10" 
                              value={customNumberModal}
                              onChange={(e) => {
                                const cleanNum = e.target.value.replace(/[^0-9]/g, '');
                                if (cleanNum === '') {
                                  setCustomNumberModal('');
                                } else {
                                  const parsed = parseInt(cleanNum, 10);
                                  if (parsed <= 99) {
                                    setCustomNumberModal(cleanNum.slice(0, 2));
                                  }
                                }
                              }}
                              maxLength={2}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold uppercase text-slate-900 placeholder:text-slate-300 text-center focus:outline-none focus:ring-1 focus:ring-red-800"
                            />
                          </div>
                        </div>

                        {/* Live Jersey Canvas Preview */}
                        <div className="pt-1">
                          <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                            Prévia da Impressão:
                          </span>
                          <JerseyPreview 
                            name={customNameModal || 'SEU NOME'} 
                            number={customNumberModal || '10'} 
                            productName={quickViewProduct.name}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setQuickViewProduct(null)}
                  className="flex-1 py-3 border border-slate-200 text-[10px] font-black uppercase rounded-xl hover:bg-slate-100 transition-all tracking-widest text-slate-400"
                >
                  Cancelar
                </button>
                <button 
                  type="button" 
                  disabled={!selectedVariation}
                  onClick={() => {
                    const variationToUse = selectedVariation || DEFAULT_GRADE_UNICA;
                    addToCart(quickViewProduct, variationToUse, modalQuantity, isCustomizedModal, customNameModal, customNumberModal);
                    setQuickViewProduct(null);
                  }}
                  className={cn(
                    "flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all shadow-lg tracking-widest text-center flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer",
                    selectedVariation
                      ? "bg-red-800 hover:bg-black text-white shadow-red-900/20"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  )}
                >
                  <ShoppingCart size={14} />
                  <span>Adicionar ({modalQuantity})</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cart Drawer / Overlay */}
      <AnimatePresence>
        {isCartOpen && (
          <div className="fixed inset-0 z-[110] flex justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs"
            />
            
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative w-full max-w-md bg-white h-full shadow-2xl overflow-hidden z-10 flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
                <div className="flex items-center gap-2">
                  <ShoppingCart size={20} className="text-amber-500" />
                  <h3 className="font-black text-xs uppercase tracking-widest">
                    Meu Carrinho ({cartItemCount})
                  </h3>
                </div>
                <button 
                  onClick={() => setIsCartOpen(false)}
                  className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Checkout Progress Indicator */}
              <div className="flex border-b border-slate-100 text-center select-none bg-slate-50 font-sans">
                <button
                  onClick={() => setCheckoutStep('cart')}
                  className={cn(
                    "flex-1 py-3 text-[9px] font-black uppercase tracking-widest border-b-2",
                    checkoutStep === 'cart' ? 'border-red-800 text-red-800 bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'
                  )}
                >
                  1. Itens do Pedido
                </button>
                <button
                  onClick={() => {
                    if (cart.length > 0) {
                      setCheckoutStep('info');
                    }
                  }}
                  disabled={cart.length === 0}
                  className={cn(
                    "flex-1 py-3 text-[9px] font-black uppercase tracking-widest border-b-2",
                    checkoutStep === 'info' ? 'border-red-800 text-red-800 bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'
                  )}
                >
                  2. Identificação
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 font-sans">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-3">
                    <span className="text-5xl">🛒</span>
                    <h4 className="font-black text-xs uppercase text-slate-400 tracking-wider">Seu carrinho está vazio</h4>
                    <p className="text-xs text-slate-400">Navegue pelas vitrines e selecione os seus mantos favoritos.</p>
                    <button 
                      onClick={() => setIsCartOpen(false)}
                      className="px-6 py-2.5 bg-slate-900 text-white font-black text-[9px] uppercase tracking-wider rounded-xl hover:bg-black transition-all"
                    >
                      Voltar às compras
                    </button>
                  </div>
                ) : checkoutStep === 'cart' ? (
                  /* STEP 1: CART LIST */
                  <div className="space-y-4">
                    <div className="divide-y divide-slate-100">
                      {cart.map((item, idx) => (
                        <div key={`${item.product.id}-${item.variation.id}-${idx}`} className="py-4 flex flex-col gap-2.5 border-b border-slate-100 last:border-0">
                          <div className="flex gap-4">
                            {/* Image */}
                            <div className="size-14 rounded-xl bg-slate-100 overflow-hidden border shrink-0">
                              {item.product.photoUrl ? (
                                <img src={item.product.photoUrl} alt={item.product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-red-100 text-red-800 font-bold">⚽</div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                              <div>
                                <h4 className="font-bold text-xs text-slate-800 leading-tight truncate">{item.product.name}</h4>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                                  Tam: {item.variation.size} {item.variation.color ? `| Cor: ${item.variation.color}` : ''}
                                </p>
                              </div>
                              <div className="text-xs font-black text-red-800 font-display">
                                {formatCurrency(getItemUnitPrice(item))}
                              </div>
                            </div>

                            {/* Quantities & Delete */}
                            <div className="flex flex-col justify-between items-end shrink-0">
                              <button 
                                onClick={() => updateCartQty(idx, -999)}
                                className="text-slate-300 hover:text-red-700 p-1"
                              >
                                <X size={14} />
                              </button>
                              
                              <div className="flex items-center gap-2 border border-slate-200 rounded-xl bg-slate-50 p-1 select-none">
                                <button 
                                  onClick={() => updateCartQty(idx, -1)}
                                  className="size-6 bg-white hover:bg-slate-200 rounded-lg flex items-center justify-center text-slate-700 active:scale-90"
                                >
                                  <Minus size={10} />
                                </button>
                                <span className="font-bold text-xs font-mono min-w-4 text-center">{item.quantity}</span>
                                <button 
                                  onClick={() => updateCartQty(idx, 1)}
                                  className="size-6 bg-white hover:bg-slate-200 rounded-lg flex items-center justify-center text-slate-700 active:scale-90"
                                >
                                  <Plus size={10} />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Customization Details & Quick Edit Bar */}
                          {isProductCamisa(item.product) && (
                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 space-y-2 text-[10px]">
                              <div className="flex items-center justify-between gap-2">
                                {item.isCustomized ? (
                                  <div className="flex items-center gap-1.5 text-amber-900 font-extrabold truncate">
                                    <Sparkles size={12} className="text-amber-600 shrink-0" />
                                    <span className="truncate">✨ Personalizado: NOME: "{item.customName || 'S/N'}" | Nº: "{item.customNumber || 'S/N'}" (+R$ 30)</span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 font-bold">Camisa sem personalização</span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setEditingCartCustomIndex(editingCartCustomIndex === idx ? null : idx)}
                                  className="text-[9px] font-black uppercase text-red-800 hover:underline flex items-center gap-1 shrink-0"
                                >
                                  <Edit2 size={10} />
                                  {editingCartCustomIndex === idx ? 'Fechar' : item.isCustomized ? 'Editar' : '+ Customizar (+R$30)'}
                                </button>
                              </div>

                              {editingCartCustomIndex === idx && (
                                <div className="pt-2 border-t border-slate-200/60 space-y-2 animate-fadeIn">
                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input 
                                      type="checkbox"
                                      checked={!!item.isCustomized}
                                      onChange={(e) => updateCartCustomization(idx, { 
                                        isCustomized: e.target.checked,
                                        customName: e.target.checked ? (item.customName || '') : '',
                                        customNumber: e.target.checked ? (item.customNumber || '') : ''
                                      })}
                                      className="rounded border-slate-300 text-red-700 focus:ring-red-800 size-3.5"
                                    />
                                    <span className="font-bold text-slate-800 text-[10px] uppercase">
                                      Ativar Personalização (+ R$ 30,00)
                                    </span>
                                  </label>

                                  {item.isCustomized && (
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <span className="text-[8px] font-bold text-slate-400 uppercase block">Nome</span>
                                        <input 
                                          type="text"
                                          placeholder="EX: BRENER"
                                          value={item.customName || ''}
                                          onChange={(e) => updateCartCustomization(idx, { customName: e.target.value.toUpperCase() })}
                                          maxLength={15}
                                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold uppercase text-slate-900"
                                        />
                                      </div>
                                      <div>
                                        <span className="text-[8px] font-bold text-slate-400 uppercase block">Número</span>
                                        <input 
                                          type="text"
                                          placeholder="EX: 10"
                                          value={item.customNumber || ''}
                                          onChange={(e) => {
                                            const cleanNum = e.target.value.replace(/[^0-9]/g, '');
                                            updateCartCustomization(idx, { customNumber: cleanNum.slice(0, 2) });
                                          }}
                                          maxLength={2}
                                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold uppercase text-slate-900 text-center"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Coupon / Promocode field */}
                    <div className="pt-4 mt-2 border-t border-slate-100 space-y-2">
                      <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">Cupom de Desconto</span>
                      
                      {activeCoupon ? (
                        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 p-3 rounded-xl">
                          <div className="flex items-center gap-2">
                            <Tag size={14} className="text-emerald-600" />
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-emerald-800 uppercase tracking-wide">
                                {activeCoupon.code}
                              </span>
                              <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wide">
                                Desconto de {activeCoupon.type === 'percentage' ? `${activeCoupon.value}%` : formatCurrency(activeCoupon.value)} aplicado
                              </span>
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={handleRemoveCoupon}
                            className="text-[9px] font-black uppercase text-emerald-850 hover:text-red-700 hover:underline transition-all"
                          >
                            Remover
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              value={couponCodeInput}
                              onChange={e => {
                                setCouponCodeInput(e.target.value);
                                setCouponError('');
                              }}
                              placeholder="Digite seu cupom (Ex: BOLA10)"
                              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-red-800 font-bold text-xs uppercase transition-all placeholder:opacity-30 placeholder:normal-case"
                            />
                            <button 
                              type="button"
                              onClick={handleApplyCoupon}
                              className="px-4 py-2.5 bg-slate-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all active:scale-95"
                            >
                              Aplicar
                            </button>
                          </div>
                          {couponError && (
                            <p className="text-[9px] font-bold text-red-600 uppercase tracking-wide">
                              ⚠ {couponError}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* STEP 2: CLIENT INFO */
                  <div className="space-y-5 animate-fadeIn">
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-amber-800 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-[10px] uppercase tracking-wider">
                        <Smartphone size={14} /> Informações para Envio
                      </div>
                      <p className="text-[10px] leading-normal font-medium">
                        Preencha seu nome e contato para enviarmos seu pedido formatado. Isso ajuda nosso vendedor a agilizar seu atendimento!
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Seu Nome Completo</label>
                      <input 
                        required 
                        type="text" 
                        value={clientName} 
                        onChange={e => setClientName(e.target.value)}
                        placeholder="Ex: João da Silva"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-red-800 font-bold text-xs transition-all placeholder:opacity-30"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Seu WhatsApp / Telefone (Opcional)</label>
                      <input 
                        type="text" 
                        value={clientPhone} 
                        onChange={e => setClientPhone(e.target.value)}
                        placeholder="Ex: (91) 99999-9999"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-red-800 font-bold text-xs transition-all placeholder:opacity-30"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Drawer Footer */}
              {cart.length > 0 && (
                <div className="p-6 bg-slate-50 border-t border-slate-100 space-y-4">
                  <div className="space-y-1.5 border-b border-slate-150/50 pb-3">
                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <span>Subtotal:</span>
                      <span className="font-mono">{formatCurrency(cartTotal)}</span>
                    </div>
                    {activeCoupon && (
                      <div className="flex justify-between items-center text-[10px] font-black text-emerald-600 uppercase tracking-wider">
                        <span>Desconto ({activeCoupon.code}):</span>
                        <span className="font-mono">-{formatCurrency(discountAmount)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Total Final:</span>
                    <span className="text-xl font-black text-red-800 font-display tabular-nums">
                      {formatCurrency(finalTotal)}
                    </span>
                  </div>

                  {checkoutStep === 'cart' ? (
                    <button
                      onClick={() => setCheckoutStep('info')}
                      className="w-full py-4 bg-slate-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                    >
                      <span>Identificar e Fechar Pedido</span>
                      <ChevronRight size={14} />
                    </button>
                  ) : (
                    <div className="flex gap-3">
                      <button
                        onClick={() => setCheckoutStep('cart')}
                        className="flex-1 py-4 border border-slate-200 bg-white text-slate-400 hover:text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 cursor-pointer"
                      >
                        Voltar
                      </button>
                      <button
                        onClick={handleSendWhatsAppOrder}
                        className="flex-3 py-4 bg-green-600 hover:bg-green-700 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-green-200 flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                      >
                        <Send size={14} />
                        <span>Enviar WhatsApp</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
