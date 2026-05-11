import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Product, Customer, SaleItem, Variation } from '../types';
import { Search, ShoppingCart, User, Plus, Minus, Trash2, CreditCard, Banknote, QrCode, ClipboardList, Send, X, CheckCircle2, MessageCircle, FileImage, Share2 } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function PDV() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'Dinheiro' | 'Cartão' | 'Pix' | 'Fiado'>('Dinheiro');
  const [downPayment, setDownPayment] = useState<string>('');
  const [isFinishing, setIsFinishing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);

  useEffect(() => {
    const qProd = query(collection(db, 'products'));
    const unsubProd = onSnapshot(qProd, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });
    const qCust = query(collection(db, 'customers'));
    const unsubCust = onSnapshot(qCust, (snapshot) => {
      setCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    });
    return () => { unsubProd(); unsubCust(); };
  }, []);

  const addToCart = (product: Product, variation: Variation) => {
    if (variation.stock <= 0) return alert('Estoque esgotado!');
    
    const existing = cart.find(item => item.productId === product.id && item.variationId === variation.id);
    if (existing) {
      if (existing.quantity >= variation.stock) return alert('Limite de estoque atingido!');
      setCart(cart.map(item => 
        (item.productId === product.id && item.variationId === variation.id) 
          ? { ...item, quantity: item.quantity + 1 } 
          : item
      ));
    } else {
      setCart([...cart, {
        productId: product.id!,
        variationId: variation.id,
        name: product.name,
        variationName: `${variation.size} / ${variation.color}`,
        quantity: 1,
        price: product.sellingPrice
      }]);
    }
  };

  const updateQuantity = (pId: string, vId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.productId === pId && item.variationId === vId) {
        const product = products.find(p => p.id === pId);
        const variation = product?.variations.find(v => v.id === vId);
        const nextQty = item.quantity + delta;
        if (nextQty <= 0) return item;
        if (variation && nextQty > variation.stock) return item;
        return { ...item, quantity: nextQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const finishSale = async () => {
    if (cart.length === 0) return;
    if (paymentMethod === 'Fiado' && !selectedCustomer) {
      alert('Selecione um cliente para venda no Fiado!');
      return;
    }

    setIsFinishing(true);
    try {
      const batch = writeBatch(db);
      
      const finalDownPayment = parseFloat(downPayment) || 0;
      const debtAmount = total - finalDownPayment;

      // 1. Create Sale Record
      const saleRef = doc(collection(db, 'sales'));
      batch.set(saleRef, {
        customerId: selectedCustomer?.id || null,
        customerName: selectedCustomer?.name || 'Consumidor Final',
        items: cart,
        total,
        downPayment: finalDownPayment,
        paymentMethod,
        status: paymentMethod === 'Fiado' && debtAmount > 0 ? 'Pendente' : 'Concluída',
        createdAt: serverTimestamp()
      });

      // 2. Update Stock
      // ... (stock update remains same)
      cart.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          const nextVariations = product.variations.map(v => 
            v.id === item.variationId ? { ...v, stock: v.stock - item.quantity } : v
          );
          const nextTotalStock = nextVariations.reduce((acc, v) => acc + v.stock, 0);
          batch.update(doc(db, 'products', item.productId), {
            variations: nextVariations,
            totalStock: nextTotalStock,
            updatedAt: serverTimestamp()
          });
        }
      });

      // 3. Update Customer Debt and Transactions
      if (selectedCustomer) {
        if (paymentMethod === 'Fiado') {
          // If there's an entry payment
          if (finalDownPayment > 0) {
            const entryTransRef = doc(collection(db, 'transactions'));
            batch.set(entryTransRef, {
              customerId: selectedCustomer.id,
              amount: finalDownPayment,
              type: 'payment',
              paymentMethod: 'Dinheiro', // Default to Dinheiro for entry
              saleId: saleRef.id,
              createdAt: serverTimestamp()
            });
          }

          // The remaining debt
          if (debtAmount > 0) {
            batch.update(doc(db, 'customers', selectedCustomer.id!), {
              totalDebt: (selectedCustomer.totalDebt || 0) + debtAmount,
              updatedAt: serverTimestamp()
            });

            const debtTransRef = doc(collection(db, 'transactions'));
            batch.set(debtTransRef, {
              customerId: selectedCustomer.id,
              amount: debtAmount,
              type: 'debt',
              saleId: saleRef.id,
              createdAt: serverTimestamp()
            });
          }
        } else {
          // Non-Fiado sale with customer: record payment transaction
          const paymentTransRef = doc(collection(db, 'transactions'));
          batch.set(paymentTransRef, {
            customerId: selectedCustomer.id,
            amount: total,
            type: 'payment',
            paymentMethod: paymentMethod,
            saleId: saleRef.id,
            createdAt: serverTimestamp()
          });
        }
      } else {
        // Consumidor Final (No customer record): still log transaction for cash flow
        const paymentTransRef = doc(collection(db, 'transactions'));
        batch.set(paymentTransRef, {
          customerId: 'Consumidor Final',
          amount: total,
          type: 'payment',
          paymentMethod: paymentMethod,
          saleId: saleRef.id,
          createdAt: serverTimestamp()
        });
      }

      await batch.commit();

      const finishedSale = {
        id: saleRef.id,
        customerName: selectedCustomer?.name || 'Consumidor Final',
        customerContact: selectedCustomer?.contact || null,
        items: [...cart],
        total,
        downPayment: finalDownPayment,
        debtAmount: debtAmount,
        paymentMethod,
        date: new Date()
      };

      setLastSale(finishedSale);
      setShowSuccessModal(true);

      setCart([]);
      setSelectedCustomer(null);
      setPaymentMethod('Dinheiro');
      setDownPayment('');
    } catch (err: any) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, 'PDV_Batch_Commit');
    } finally {
      setIsFinishing(false);
    }
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()));

  const shareWhatsApp = () => {
    if (!lastSale) return;
    
    const itemsText = lastSale.items.map((i: any) => 
      `- ${i.name} (${i.variationName}) x ${i.quantity}: ${formatCurrency(i.price * i.quantity)}`
    ).join('\n');

    const message = `⚽ *ERP CLUB DA BOLA - Comprovante* ⚽\n` +
      `-------------------------------------------\n` +
      `👤 *Cliente:* ${lastSale.customerName}\n` +
      `📅 *Data:* ${lastSale.date.toLocaleString('pt-BR')}\n` +
      `💳 *Pagamento:* ${lastSale.paymentMethod}\n` +
      (lastSale.downPayment > 0 ? `💵 *Entrada:* ${formatCurrency(lastSale.downPayment)}\n` : '') +
      (lastSale.debtAmount > 0 ? `📝 *Pendente:* ${formatCurrency(lastSale.debtAmount)}\n` : '') +
      `-------------------------------------------\n` +
      `📦 *Itens:*\n${itemsText}\n` +
      `-------------------------------------------\n` +
      `💰 *TOTAL: ${formatCurrency(lastSale.total)}*\n` +
      `-------------------------------------------\n` +
      `Obrigado por comprar no *ERP CLUB DA BOLA*!`;

    const encoded = encodeURIComponent(message);
    const phone = lastSale.customerContact ? lastSale.customerContact.replace(/\D/g, '') : '';
    window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
  };

  const [isCartVisible, setIsCartVisible] = useState(false);

  return (
    <div className="h-full flex flex-col md:flex-row gap-6 relative">
      {/* Mobile Cart Toggle */}
      <div className="md:hidden flex items-center justify-between bg-slate-900 p-4 rounded-2xl text-white shadow-lg z-30">
        <div className="flex items-center gap-3">
          <ShoppingCart size={20} className="text-indigo-400" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/50 leading-none mb-1">Carrinho</p>
            <p className="text-lg font-black leading-none">{formatCurrency(total)}</p>
          </div>
        </div>
        <button 
          onClick={() => setIsCartVisible(!isCartVisible)}
          className="bg-indigo-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
        >
          {isCartVisible ? 'Produtos' : 'Finalizar'}
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
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl relative z-10 w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-8 text-center bg-emerald-500 text-white relative">
                <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                  <CheckCircle2 size={240} className="-translate-x-1/4 -translate-y-1/4" />
                </div>
                <div className="size-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm overflow-hidden p-3 border border-white/10">
                   <img 
                    src="https://i.ibb.co/v3Y0V6N/logo-club-da-bola.jpg" 
                    alt="Logo" 
                    className="w-full h-full object-contain" 
                    referrerPolicy="no-referrer" 
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        const fallback = document.createElement('div');
                        fallback.className = "w-full h-full bg-white/20 rounded flex items-center justify-center text-xs font-black italic text-white";
                        fallback.innerText = "CB";
                        parent.appendChild(fallback);
                      }
                    }}
                   />
                </div>
                <h3 className="text-2xl font-black tracking-tight">Venda Finalizada!</h3>
                <p className="text-emerald-100 font-bold opacity-80 mt-1">Transação processada com sucesso.</p>
              </div>

              <div className="p-8 space-y-6">
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 text-center">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Total Recebido</p>
                  <p className="text-4xl font-black text-slate-900">{formatCurrency(lastSale?.total || 0)}</p>
                  <p className="text-xs font-bold text-slate-500 mt-2 uppercase">{lastSale?.paymentMethod} • {lastSale?.customerName}</p>
                  {lastSale?.downPayment > 0 && (
                    <div className="mt-2 flex justify-center gap-4 text-[10px] font-bold">
                       <span className="text-emerald-600">Entrada: {formatCurrency(lastSale.downPayment)}</span>
                       <span className="text-rose-600">Pendente: {formatCurrency(lastSale.debtAmount)}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={shareWhatsApp}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-emerald-100 text-emerald-700 rounded-2xl hover:bg-emerald-200 transition-all group"
                  >
                    <MessageCircle size={24} className="group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Enviar WhatsApp</span>
                  </button>
                  <button 
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-blue-100 text-blue-700 rounded-2xl hover:bg-blue-200 transition-all group opacity-50 cursor-not-allowed"
                    title="PNG Indisponível nesta prévia"
                  >
                    <FileImage size={24} className="group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Gerar PNG</span>
                  </button>
                </div>

                <button 
                  onClick={() => setShowSuccessModal(false)}
                  className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-slate-800 transition-all"
                >
                  Continuar Vendendo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Search & Products Grid */}
      <div className={cn(
        "flex-1 flex flex-col gap-6 overflow-hidden transition-all duration-300",
        isCartVisible ? "hidden md:flex" : "flex"
      )}>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 size-6" />
          <input 
            type="text" 
            placeholder="Buscar por nome ou código..." 
            className="w-full pl-14 pr-6 py-4 bg-white border border-gray-100 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm md:text-base"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-4">
          {filteredProducts.map(product => (
            <div key={product.id} className="bg-white p-3 md:p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col group hover:shadow-md transition-all">
              <div className="mb-3">
                <span className="px-2 py-0.5 bg-blue-50 text-[10px] font-bold text-blue-600 rounded uppercase tracking-wider">{product.category}</span>
                <h4 className="font-bold text-gray-900 mt-1 line-clamp-2 leading-tight text-xs md:text-sm">{product.name}</h4>
              </div>
              <div className="mt-auto space-y-2">
                <div className="text-base md:text-lg font-black text-blue-600">{formatCurrency(product.sellingPrice)}</div>
                <div className="grid grid-cols-2 gap-1 px-1">
                  {product.variations.map(v => (
                    <button 
                      key={v.id}
                      disabled={v.stock <= 0}
                      onClick={() => {
                        addToCart(product, v);
                        // On small screens, maybe show a toast or feedback
                      }}
                      className={cn(
                        "text-[9px] md:text-[10px] py-1 border rounded font-bold transition-all truncate",
                        v.stock <= 0 
                          ? "bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed" 
                          : "bg-white border-gray-200 text-gray-600 hover:border-blue-500 hover:bg-blue-50 active:scale-95"
                      )}
                    >
                      {v.size} ({v.stock})
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart & Checkout */}
      <div className={cn(
        "w-full md:w-[400px] flex flex-col gap-6 h-full transition-all duration-300",
        isCartVisible ? "flex" : "hidden md:flex"
      )}>
        <div className="bg-slate-900 text-white rounded-[32px] p-6 flex flex-col flex-1 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <ShoppingCart size={120} />
          </div>
          
          <div className="flex items-center gap-3 mb-6 relative">
            <div className="size-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <ShoppingCart size={20} />
            </div>
            <h3 className="text-xl font-bold tracking-tight">Checkout</h3>
            <span className="ml-auto bg-white/10 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-indigo-300">
              {cart.reduce((a, b) => a + b.quantity, 0)} Itens
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2 -mr-2 relative">
            {cart.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-30 gap-4">
                <div className="size-16 rounded-full border-2 border-dashed border-white flex items-center justify-center">
                  <Plus />
                </div>
                <p className="font-bold text-sm tracking-tight">Adicione produtos</p>
              </div>
            )}
            {cart.map(item => (
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                key={item.variationId} 
                className="bg-white/5 rounded-2xl p-4 border border-white/5 hover:bg-white/10 transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <p className="font-bold text-sm leading-tight text-white">{item.name}</p>
                    <p className="text-[10px] font-bold text-indigo-400 mt-1 uppercase tracking-wide">{item.variationName}</p>
                  </div>
                  <p className="font-bold text-sm ml-2 text-indigo-300">{formatCurrency(item.price * item.quantity)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-white/10 rounded-lg p-1">
                    <button onClick={() => updateQuantity(item.productId, item.variationId, -1)} className="p-1 hover:bg-white/20 rounded-md transition-colors"><Minus size={14} /></button>
                    <span className="w-8 text-center font-bold text-xs">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.productId, item.variationId, 1)} className="p-1 hover:bg-white/20 rounded-md transition-colors"><Plus size={14} /></button>
                  </div>
                  <button 
                    onClick={() => setCart(cart.filter(c => c.variationId !== item.variationId))}
                    className="ml-auto p-2 text-rose-400 hover:bg-rose-500/20 rounded-xl transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-6 space-y-4 pt-6 border-t border-white/10 relative">
            {/* Customer Selector */}
            <div className="relative group">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 size-4 group-focus-within:text-indigo-400" />
              <select 
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold outline-none appearance-none hover:bg-white/10 focus:ring-1 focus:ring-indigo-500 transition-all text-white/80"
                value={selectedCustomer?.id || ''}
                onChange={e => {
                  const c = customers.find(cust => cust.id === e.target.value);
                  setSelectedCustomer(c || null);
                }}
              >
                <option value="" className="bg-slate-900 text-white">Consumidor Final</option>
                {customers.map(c => <option key={c.id} value={c.id} className="bg-slate-900 text-white">{c.name}</option>)}
              </select>
            </div>

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
                      ? "bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/10" 
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
                <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 size-4 group-focus-within:text-emerald-400" />
                <input 
                  type="number"
                  placeholder="Valor de Entrada (Opcional)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold outline-none hover:bg-white/10 focus:ring-1 focus:ring-emerald-500 transition-all text-white/80"
                  value={downPayment}
                  onChange={e => setDownPayment(e.target.value)}
                  onFocus={e => e.target.value === '0' ? setDownPayment('') : null}
                />
              </motion.div>
            )}

            <div className="flex justify-between items-center px-4 py-4 bg-white/5 rounded-2xl border border-white/5">
              <span className="text-xs font-bold text-white/50 uppercase tracking-widest">Total</span>
              <span className="text-3xl font-black text-indigo-300">{formatCurrency(total)}</span>
            </div>

            <button 
              disabled={isFinishing || cart.length === 0}
              onClick={finishSale}
              className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-indigo-900/40 flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              {isFinishing ? 'PROCESSANDO...' : 'FINALIZAR VENDA'}
              {!isFinishing && <Send size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
