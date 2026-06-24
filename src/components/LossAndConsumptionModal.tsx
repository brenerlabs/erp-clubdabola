import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { Product, Variation, StockAdjustment, Expense } from '../types';
import { X, AlertTriangle, History, ClipboardList, Package, Info, Search, ShieldAlert, CheckCircle2, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface LossAndConsumptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
}

export default function LossAndConsumptionModal({ isOpen, onClose, products }: LossAndConsumptionModalProps) {
  const [activeTab, setActiveTab] = useState<'register' | 'history'>('register');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedVariationId, setSelectedVariationId] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [adjustmentType, setAdjustmentType] = useState<'Avaria' | 'Perda' | 'Consumo Próprio' | 'Demonstração' | 'Outros'>('Avaria');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);

  // Fetch adjustments history
  useEffect(() => {
    if (!isOpen) return;
    const q = query(collection(db, 'stockAdjustments'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAdjustments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'stockAdjustments');
    });
    return unsubscribe;
  }, [isOpen]);

  // Selected product helper
  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId);
  }, [products, selectedProductId]);

  // Available variations for selected product
  const availableVariations = useMemo(() => {
    if (!selectedProduct) return [];
    return selectedProduct.variations || [];
  }, [selectedProduct]);

  // Auto-select variation if only one or empty
  useEffect(() => {
    if (availableVariations.length > 0) {
      // Auto select first variation
      setSelectedVariationId(availableVariations[0].id);
    } else {
      setSelectedVariationId('');
    }
    setQuantity(1);
  }, [availableVariations]);

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products.slice(0, 5); // Limit default list for performance and UI layout
    const lowerQuery = searchQuery.toLowerCase();
    return products.filter(p => 
      p.name.toLowerCase().includes(lowerQuery) || 
      p.category.toLowerCase().includes(lowerQuery)
    );
  }, [products, searchQuery]);

  // Selected variation helper
  const selectedVariation = useMemo(() => {
    if (!selectedProduct) return null;
    return selectedProduct.variations.find(v => v.id === selectedVariationId) || null;
  }, [selectedProduct, selectedVariationId]);

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return alert('Por favor, selecione um produto.');
    if (!selectedVariationId && selectedProduct.variations.length > 0) {
      return alert('Por favor, selecione uma variação.');
    }
    if (quantity <= 0) return alert('A quantidade deve ser maior que zero.');

    const maxStock = selectedVariation ? selectedVariation.stock : 0;
    if (quantity > maxStock) {
      const confirmExceed = window.confirm(`A quantidade selecionada (${quantity}) excede o estoque atual disponível (${maxStock} un). Deseja continuar e deixar o estoque negativo?`);
      if (!confirmExceed) return;
    }

    setIsSubmitting(true);

    try {
      const varName = selectedVariation 
        ? `${selectedVariation.size || ''} ${selectedVariation.color || ''}`.trim() || 'Tamanho Único' 
        : 'Tamanho Único';

      const costPrice = selectedProduct.costPrice || 0;
      const totalCost = quantity * costPrice;

      // 1. Save adjustment document in Firestore
      const adjustmentData = {
        productId: selectedProduct.id!,
        productName: selectedProduct.name,
        variationId: selectedVariationId || 'unico',
        variationName: varName,
        quantity,
        type: adjustmentType,
        costPrice,
        totalCost,
        notes: notes.trim(),
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'stockAdjustments'), adjustmentData);

      // 2. Automatically generate Operating Expense
      const displayType = 
        adjustmentType === 'Consumo Próprio' ? 'Consumo Próprio' :
        adjustmentType === 'Demonstração' ? 'Demonstração' :
        adjustmentType === 'Avaria' ? 'Avaria de Estoque' :
        adjustmentType === 'Perda' ? 'Perda/Extravio de Estoque' : 'Ajuste de Estoque';

      const expenseDescription = `[${displayType}] - ${quantity} un. de ${selectedProduct.name} (${varName}) — Custo Unitário: ${formatCurrency(costPrice)}`;
      
      const expenseCategory = (adjustmentType === 'Consumo Próprio' || adjustmentType === 'Demonstração') 
        ? 'Consumo Próprio' 
        : 'Perdas/Avarias';

      await addDoc(collection(db, 'expenses'), {
        description: expenseDescription,
        amount: totalCost,
        category: expenseCategory,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 3. Update Product stock in Firestore
      const updatedVariations = selectedProduct.variations.map(v => {
        if (v.id === selectedVariationId) {
          return {
            ...v,
            stock: Math.max(0, v.stock - quantity) // Protect from negative stock if they agreed, otherwise standard
          };
        }
        return v;
      });

      const newTotalStock = updatedVariations.reduce((acc, v) => acc + (v.stock || 0), 0);

      await updateDoc(doc(db, 'products', selectedProduct.id!), {
        variations: updatedVariations,
        totalStock: newTotalStock,
        updatedAt: serverTimestamp()
      });

      // Reset form
      setSelectedProductId('');
      setSelectedVariationId('');
      setQuantity(1);
      setNotes('');
      setSearchQuery('');
      alert('Baixa de estoque e despesa operacional registradas com sucesso! ✓');
      setActiveTab('history');
    } catch (err: any) {
      alert('Erro ao registrar baixa de estoque: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 z-10 flex flex-col max-h-[90vh] mx-2 sm:mx-0"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-red-950 to-red-900 p-6 text-white shrink-0">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white hover:bg-white/10 p-2 rounded-2xl transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="size-10 bg-amber-500 rounded-xl flex items-center justify-center text-slate-950 shadow-inner shrink-0">
              <ShieldAlert size={20} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight uppercase italic leading-none">Controle de Perdas e Consumo</h3>
              <p className="text-[10px] text-red-200/80 font-bold uppercase tracking-widest mt-1.5 leading-none">Baixa de estoque não comercial & Lançamento de despesa de custo</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 mt-6 bg-black/15 p-1 rounded-2xl">
            <button
              onClick={() => setActiveTab('register')}
              className={cn(
                "flex-1 py-2 px-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer",
                activeTab === 'register' ? "bg-white text-red-950 shadow-sm" : "text-white/80 hover:text-white"
              )}
            >
              <ClipboardList size={14} />
              Registrar Baixa
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                "flex-1 py-2 px-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer",
                activeTab === 'history' ? "bg-white text-red-950 shadow-sm" : "text-white/80 hover:text-white"
              )}
            >
              <History size={14} />
              Histórico de Saídas ({adjustments.length})
            </button>
          </div>
        </div>

        {/* Content Box */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'register' ? (
              <motion.form 
                key="register-form"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onSubmit={handleSubmit} 
                className="space-y-5"
              >
                {/* 1. Selecionar Produto */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider flex items-center gap-1">
                    <Package size={12} className="text-slate-400" />
                    1. Selecionar Produto do Estoque
                  </label>
                  
                  {selectedProduct ? (
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="size-9 bg-red-100 rounded-xl flex items-center justify-center text-red-800 font-bold text-xs shrink-0">
                          SKU
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm leading-tight">{selectedProduct.name}</p>
                          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-0.5">
                            {selectedProduct.category} • Preço de Custo: {formatCurrency(selectedProduct.costPrice)}
                          </p>
                        </div>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setSelectedProductId('')}
                        className="text-xs font-black text-rose-600 hover:text-rose-800 uppercase tracking-widest cursor-pointer bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-xl transition-colors"
                      >
                        Alterar
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type="text"
                          placeholder="Buscar produto por nome ou categoria..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 focus:border-red-800 focus:bg-white rounded-2xl outline-none text-sm text-slate-800 transition-all font-medium"
                        />
                      </div>
                      
                      <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-50 shadow-sm max-h-48 overflow-y-auto custom-scrollbar">
                        {filteredProducts.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400 font-bold uppercase tracking-wider">
                            Nenhum produto encontrado
                          </div>
                        ) : (
                          filteredProducts.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSelectedProductId(p.id!)}
                              className="w-full text-left p-3.5 hover:bg-red-50/50 flex items-center justify-between transition-colors group"
                            >
                              <div>
                                <p className="font-bold text-slate-800 text-xs group-hover:text-red-900 transition-colors">{p.name}</p>
                                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-0.5">{p.category} • Estoque: {p.totalStock} un</p>
                              </div>
                              <ChevronRight size={14} className="text-slate-400 group-hover:text-red-800 group-hover:translate-x-0.5 transition-all" />
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Selecionar Grade/Variação e Quantidade */}
                {selectedProduct && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1">
                    {/* Variação */}
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                        2. Tamanho / Cor (Grade)
                      </label>
                      {availableVariations.length === 0 || (availableVariations.length === 1 && !availableVariations[0].size && !availableVariations[0].color) ? (
                        <div className="bg-slate-50 border border-slate-200/60 p-3.5 rounded-2xl text-xs font-bold text-slate-600">
                          Tamanho Único / Sem Variação
                          <p className="text-[10px] text-slate-400 mt-1 uppercase font-black">Estoque disponível: {selectedProduct.totalStock} un</p>
                        </div>
                      ) : (
                        <select
                          value={selectedVariationId}
                          onChange={(e) => setSelectedVariationId(e.target.value)}
                          className="w-full p-3.5 bg-slate-50 border border-slate-200 focus:border-red-800 focus:bg-white rounded-2xl outline-none text-xs font-black uppercase tracking-wider text-slate-800 cursor-pointer"
                        >
                          {availableVariations.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.size && v.color ? `${v.size} — ${v.color}` : v.size || v.color || 'ÚNICO'} (Estoque: {v.stock} un)
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Quantidade */}
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                        3. Quantidade que saiu
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={selectedVariation ? selectedVariation.stock : undefined}
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                        className="w-full p-3.5 bg-slate-50 border border-slate-200 focus:border-red-800 focus:bg-white rounded-2xl outline-none text-xs font-black text-slate-800"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* 3. Tipo de Ajuste */}
                {selectedProduct && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                        4. Motivo da Saída (Tipo)
                      </label>
                      <select
                        value={adjustmentType}
                        onChange={(e) => setAdjustmentType(e.target.value as any)}
                        className="w-full p-3.5 bg-slate-50 border border-slate-200 focus:border-red-800 focus:bg-white rounded-2xl outline-none text-xs font-black uppercase tracking-wider text-slate-800 cursor-pointer"
                      >
                        <option value="Avaria">⏳ Avaria / Produto Quebrado</option>
                        <option value="Perda">❌ Perda / Extravio / Furto</option>
                        <option value="Consumo Próprio">👤 Consumo Próprio / Uso Pessoal</option>
                        <option value="Demonstração">⭐️ Demonstração / Showroom</option>
                        <option value="Outros">⚙️ Outros Motivos</option>
                      </select>
                    </div>

                    {/* Resumo Financeiro da Perda */}
                    <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200/60 p-4 rounded-3xl flex flex-col justify-between select-none">
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 leading-none">Custo Financeiro Estimado</p>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-xl font-black font-mono text-red-900 tracking-tighter italic">
                          {formatCurrency((selectedProduct?.costPrice || 0) * quantity)}
                        </span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                          {quantity} un. x {formatCurrency(selectedProduct?.costPrice || 0)}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-500 font-bold mt-2 leading-tight uppercase tracking-wide">
                        ⚠️ O custo total será lançado como despesa de <span className="text-slate-800 font-black">{(adjustmentType === 'Consumo Próprio' || adjustmentType === 'Demonstração') ? 'Consumo Próprio' : 'Perdas/Avarias'}</span> no fluxo financeiro.
                      </p>
                    </div>
                  </div>
                )}

                {/* 4. Observações */}
                {selectedProduct && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                      5. Detalhes / Observações (Opcional)
                    </label>
                    <textarea
                      placeholder="Detalhe o ocorrido (ex: camiseta rasgada no zíper, retirado por Brener para fotos de divulgação...)"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full p-4 bg-slate-50 border border-slate-200 focus:border-red-800 focus:bg-white rounded-2xl outline-none text-xs text-slate-700 min-h-20"
                    />
                  </div>
                )}

                {/* Submit button */}
                {selectedProduct && (
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={cn(
                        "w-full bg-red-950 hover:bg-black text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 cursor-pointer",
                        isSubmitting && "opacity-50 pointer-events-none"
                      )}
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="animate-spin" size={16} />
                          Processando baixa de estoque...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={16} className="text-amber-500" />
                          Confirmar Saída e Gerar Despesa
                        </>
                      )}
                    </button>
                  </div>
                )}
              </motion.form>
            ) : (
              <motion.div 
                key="history-panel"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-4"
              >
                {adjustments.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-3xl border border-slate-100 p-6">
                    <Package size={40} className="mx-auto text-slate-300 mb-2" strokeWidth={1.5} />
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Nenhuma baixa registrada ainda</p>
                    <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tight">Todas as perdas, avarias e consumos próprios aparecerão aqui.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {adjustments.map(adj => {
                      const dateStr = adj.createdAt?.seconds 
                        ? new Date(adj.createdAt.seconds * 1000).toLocaleDateString('pt-BR') 
                        : 'Recente';

                      return (
                        <div key={adj.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-2 hover:border-slate-200 transition-colors">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className={cn(
                                "text-[8px] font-black uppercase rounded-[4px] px-1.5 py-0.5 tracking-wider leading-none mr-2",
                                adj.type === 'Consumo Próprio' && "bg-blue-50 text-blue-700 border border-blue-100",
                                adj.type === 'Demonstração' && "bg-indigo-50 text-indigo-700 border border-indigo-100",
                                adj.type === 'Avaria' && "bg-amber-50 text-amber-700 border border-amber-100",
                                adj.type === 'Perda' && "bg-rose-50 text-rose-700 border border-rose-100",
                                adj.type === 'Outros' && "bg-slate-100 text-slate-700"
                              )}>
                                {adj.type}
                              </span>
                              <span className="text-[9px] text-slate-400 font-bold">{dateStr}</span>
                              <h4 className="font-bold text-slate-800 text-xs mt-1.5 uppercase leading-tight">{adj.productName}</h4>
                              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-0.5">Grade: {adj.variationName} • {adj.quantity} un</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-black text-red-950 font-mono">{formatCurrency(adj.totalCost)}</p>
                              <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Custo Baixado</p>
                            </div>
                          </div>
                          {adj.notes && (
                            <div className="bg-slate-50 p-2.5 rounded-xl text-[10px] text-slate-600 font-medium flex items-start gap-1.5 mt-1 border border-slate-100/50">
                              <Info size={12} className="text-slate-400 shrink-0 mt-0.5" />
                              <span className="italic">"{adj.notes}"</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-wide">
            <AlertCircle size={14} className="text-amber-500 shrink-0 animate-pulse" />
            Impacto automático no lucro real do financeiro
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="text-xs font-black text-slate-500 hover:text-slate-800 uppercase tracking-widest cursor-pointer bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl transition-all active:scale-95"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
