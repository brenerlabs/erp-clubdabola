import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, writeBatch } from 'firebase/firestore';
import { Product, Variation } from '../types';
import { Plus, Search, Edit2, Trash2, Copy, Package, Box, X } from 'lucide-react';
import { formatCurrency, calculateMargin, calculateMarkup, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [costPrice, setCostPrice] = useState<string>('0');
  const [sellingPrice, setSellingPrice] = useState<string>('0');
  const [minStock, setMinStock] = useState<string>('2');
  const [variations, setVariations] = useState<Variation[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });
    return unsubscribe;
  }, []);

  const openModal = (product?: Product, isDuplicate = false) => {
    if (product) {
      setName(isDuplicate ? `${product.name} (Cópia)` : product.name);
      setCategory(product.category);
      setCostPrice(product.costPrice.toString());
      setSellingPrice(product.sellingPrice.toString());
      setMinStock(product.minStock.toString());
      setVariations(product.variations);
      setEditingProduct(isDuplicate ? null : product);
    } else {
      setName('');
      setCategory('');
      setCostPrice('0');
      setSellingPrice('0');
      setMinStock('2');
      setVariations([]);
      setEditingProduct(null);
    }
    setIsModalOpen(true);
  };

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        
        let startIndex = 0;
        if (lines[0].toLowerCase().includes('nome') || lines[0].toLowerCase().includes('produto')) {
          startIndex = 1;
        }

        const batch = writeBatch(db);
        let count = 0;

        for (let i = startIndex; i < lines.length; i++) {
          const columns = lines[i].split(',').map(c => c.trim());
          if (columns[0]) {
            const cPrice = parseFloat(columns[2]?.replace(',', '.') || '0') || 0;
            const sPrice = parseFloat(columns[3]?.replace(',', '.') || '0') || 0;
            const mStock = parseInt(columns[4]) || 2;
            
            const productRef = doc(collection(db, 'products'));
            batch.set(productRef, {
              name: columns[0],
              category: columns[1] || 'Geral',
              costPrice: cPrice,
              sellingPrice: sPrice,
              margin: calculateMargin(cPrice, sPrice),
              markup: calculateMarkup(cPrice, sPrice),
              minStock: mStock,
              totalStock: 0,
              variations: [],
              updatedAt: serverTimestamp()
            });
            count++;
          }
        }

        await batch.commit();
        alert(`${count} produtos importados com sucesso!`);
      } catch (err: any) {
        console.error(err);
        alert('Erro ao processar CSV. Use o formato: Nome, Categoria, Custo, Venda, Estoque Min');
      } finally {
        setIsImporting(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const addVariation = () => {
    setVariations([...variations, { id: Math.random().toString(36).substr(2, 9), size: '', color: '', stock: 0 }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cPrice = parseFloat(costPrice) || 0;
      const sPrice = parseFloat(sellingPrice) || 0;
      const mStock = parseInt(minStock) || 0;
      const totalStock = variations.reduce((acc, v) => acc + (parseInt(v.stock?.toString() || '0') || 0), 0);
      const productData = {
        name,
        category,
        costPrice: cPrice,
        sellingPrice: sPrice,
        margin: calculateMargin(cPrice, sPrice),
        markup: calculateMarkup(cPrice, sPrice),
        variations: variations.map(v => ({ ...v, stock: parseInt(v.stock?.toString() || '0') || 0 })),
        totalStock,
        minStock: mStock,
        updatedAt: serverTimestamp()
      };

      if (editingProduct) {
        try {
          await updateDoc(doc(db, 'products', editingProduct.id!), productData);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `products/${editingProduct.id}`);
        }
      } else {
        try {
          await addDoc(collection(db, 'products'), productData);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'products');
        }
      }
      setIsModalOpen(false);
      alert('Produto salvo com sucesso!');
    } catch (err: any) {
      console.error(err);
      let message = 'Erro ao salvar produto. Verifique sua conexão.';
      try {
        const errInfo = JSON.parse(err.message);
        if (errInfo.error.includes('permission')) {
          message = 'Erro de permissão: Apenas o administrador autenticado pode realizar esta ação.';
        }
      } catch {
        // Not JSON
      }
      alert(message);
    }
  };

  const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative w-96 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 size-5 group-focus-within:text-indigo-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Buscar por nome ou categoria..." 
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm outline-none text-sm font-medium"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className={cn(
            "flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl cursor-pointer transition-all active:scale-95 text-sm",
            isImporting && "opacity-50 pointer-events-none"
          )}>
            <Box size={20} className="text-slate-400" />
            {isImporting ? 'Importando...' : 'Importar CSV'}
            <input type="file" accept=".csv" className="hidden" onChange={handleCSVImport} disabled={isImporting} />
          </label>
          <button 
            onClick={() => openModal()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center gap-2 active:scale-95 h-full"
          >
            <Plus size={20} /> Adicionar Produto
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Desktop Table View */}
        <table className="w-full text-left border-collapse hidden md:table">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Produto</th>
              <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Categoria</th>
              <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest text-right">Preços</th>
              <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest text-center">Grade/Estoque</th>
              <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(product => (
              <tr key={product.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-6 py-5">
                  <div className="flex items-center gap-4">
                    <div className="size-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 shadow-inner">
                      <Package size={20} />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm leading-tight">{product.name}</div>
                      <div className="flex gap-2 mt-1">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Margem: {product.margin.toFixed(1)}%</div>
                        <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-tighter">Markup: {calculateMarkup(product.costPrice, product.sellingPrice).toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-black rounded uppercase tracking-widest">{product.category}</span>
                </td>
                <td className="px-6 py-5 text-right">
                  <div className="text-sm font-bold text-slate-900">{formatCurrency(product.sellingPrice)}</div>
                  <div className="text-[10px] text-slate-400 font-medium">Custo: {formatCurrency(product.costPrice)}</div>
                </td>
                <td className="px-6 py-5 text-center">
                  <div className={cn(
                    "text-sm font-bold",
                    product.totalStock <= product.minStock ? 'text-rose-500' : 'text-slate-900'
                  )}>
                    {product.totalStock} un
                  </div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">{product.variations.length} variações</div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openModal(product, true)} className="p-2 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-colors" title="Duplicar">
                      <Copy size={16} />
                    </button>
                    <button onClick={() => openModal(product)} className="p-2 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-colors" title="Editar">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => deleteDoc(doc(db, 'products', product.id!))} className="p-2 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors" title="Excluir">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile List View */}
        <div className="md:hidden divide-y divide-slate-100 px-2">
          {filtered.map(product => (
            <div key={product.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                    <Package size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm leading-tight">{product.name}</h4>
                    <span className="text-[10px] text-indigo-500 font-black uppercase tracking-widest">{product.category}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-slate-900">{formatCurrency(product.sellingPrice)}</div>
                  <div className={cn(
                    "text-[10px] font-bold uppercase",
                    product.totalStock <= product.minStock ? "text-rose-500" : "text-slate-400"
                  )}>
                    Estoque: {product.totalStock}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-2">
                  <div className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-500 uppercase">Mg: {product.margin.toFixed(1)}%</div>
                  <div className="text-[9px] bg-indigo-50 px-1.5 py-0.5 rounded font-bold text-indigo-500 uppercase">Mk: {calculateMarkup(product.costPrice, product.sellingPrice).toFixed(1)}%</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openModal(product)} className="p-2 bg-slate-100 text-slate-600 rounded-lg"><Edit2 size={14} /></button>
                  <button onClick={() => deleteDoc(doc(db, 'products', product.id!))} className="p-2 bg-rose-50 text-rose-600 rounded-lg"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl relative z-10 w-full max-w-4xl overflow-hidden border border-slate-200"
            >
              <form onSubmit={handleSubmit}>
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="size-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
                      <Box size={18} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {editingProduct ? 'Configurar Produto' : 'Cadastrar Novo Item'}
                    </h3>
                  </div>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-200 rounded-lg transition-colors"><X size={20} /></button>
                </div>
                
                <div className="p-8 overflow-y-auto max-h-[70vh] grid grid-cols-5 gap-8">
                  <div className="col-span-3 space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Identificação</label>
                        <input 
                          required 
                          type="text" 
                          value={name} 
                          onChange={e => setName(e.target.value)}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-sm transition-all"
                          placeholder="Nome do produto"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Segmento/Categoria</label>
                        <input 
                          required 
                          type="text" 
                          value={category} 
                          onChange={e => setCategory(e.target.value)}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-sm transition-all"
                          placeholder="Ex: Tênis"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Preço Custo</label>
                        <input 
                          required 
                          type="text" 
                          inputMode="decimal"
                          value={costPrice} 
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9,.]/g, '').replace(',', '.');
                            setCostPrice(val);
                          }}
                          onFocus={e => e.target.value === '0' && setCostPrice('')}
                          onBlur={e => e.target.value === '' && setCostPrice('0')}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-sm transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Preço Venda</label>
                        <input 
                          required 
                          type="text" 
                          inputMode="decimal"
                          value={sellingPrice} 
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9,.]/g, '').replace(',', '.');
                            setSellingPrice(val);
                          }}
                          onFocus={e => e.target.value === '0' && setSellingPrice('')}
                          onBlur={e => e.target.value === '' && setSellingPrice('0')}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-sm transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Estoque Mínimo</label>
                        <input 
                          type="text" 
                          inputMode="numeric"
                          value={minStock} 
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            setMinStock(val);
                          }}
                          onFocus={e => e.target.value === '0' && setMinStock('')}
                          onBlur={e => e.target.value === '' && setMinStock('0')}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-sm transition-all"
                        />
                      </div>
                    </div>

                    <div className="p-5 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-100 flex items-center justify-between text-white">
                      <div className="flex gap-8">
                        <div>
                          <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">Margem Lucro</p>
                          <div className="text-2xl font-black">{calculateMargin(parseFloat(costPrice) || 0, parseFloat(sellingPrice) || 0).toFixed(1)}%</div>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">Markup (Mark-on)</p>
                          <div className="text-2xl font-black">{calculateMarkup(parseFloat(costPrice) || 0, parseFloat(sellingPrice) || 0).toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">Lucro un.</p>
                        <p className="text-xl font-bold">{formatCurrency((parseFloat(sellingPrice) || 0) - (parseFloat(costPrice) || 0))}</p>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Grade Dimensional / Cores</label>
                      <button 
                        type="button" 
                        onClick={addVariation}
                        className="text-[10px] font-black text-indigo-600 uppercase flex items-center gap-1 hover:bg-indigo-50 px-2 py-1 rounded"
                      >
                        <Plus size={14} /> Adicionar
                      </button>
                    </div>
                    <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl overflow-y-auto max-h-[350px]">
                      {variations.length === 0 && (
                        <div className="text-center py-10">
                          <Plus className="mx-auto text-slate-300 mb-2" size={32} strokeWidth={1} />
                          <p className="text-[11px] font-bold text-slate-400 uppercase">Defina a grade do produto</p>
                        </div>
                      )}
                      {variations.map((v, i) => (
                        <div key={v.id} className="grid grid-cols-11 gap-2 items-center group/row">
                          <div className="col-span-3">
                            <input 
                              placeholder="Tamanho"
                              className="w-full text-xs px-2 py-2 border rounded-lg border-slate-200 bg-white"
                              value={v.size}
                              onChange={e => {
                                const next = [...variations];
                                next[i].size = e.target.value;
                                setVariations(next);
                              }}
                            />
                          </div>
                          <div className="col-span-4">
                            <input 
                              placeholder="Cor/Variante"
                              className="w-full text-xs px-2 py-2 border rounded-lg border-slate-200 bg-white"
                              value={v.color}
                              onChange={e => {
                                const next = [...variations];
                                next[i].color = e.target.value;
                                setVariations(next);
                              }}
                            />
                          </div>
                          <div className="col-span-3">
                            <input 
                              type="text"
                              inputMode="numeric"
                              placeholder="Est"
                              className="w-full text-xs px-2 py-2 border rounded-lg border-slate-200 bg-white font-bold"
                              value={v.stock}
                              onChange={e => {
                                const next = [...variations];
                                next[i].stock = e.target.value.replace(/[^0-9]/g, '') as any;
                                setVariations(next);
                              }}
                              onFocus={e => {
                                if (e.target.value === '0') {
                                  const next = [...variations];
                                  next[i].stock = '' as any;
                                  setVariations(next);
                                }
                              }}
                              onBlur={e => {
                                if (e.target.value === '') {
                                  const next = [...variations];
                                  next[i].stock = 0;
                                  setVariations(next);
                                }
                              }}
                            />
                          </div>
                          <button 
                            type="button"
                            onClick={() => setVariations(variations.filter((_, idx) => idx !== i))}
                            className="col-span-1 text-slate-300 hover:text-rose-500 transition-colors flex justify-center"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 text-[11px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all tracking-widest"
                  >
                    Descartar
                  </button>
                  <button 
                    type="submit"
                    className="px-10 py-2.5 bg-indigo-600 hover:bg-slate-900 text-white text-[11px] font-black uppercase rounded-xl transition-all shadow-lg shadow-indigo-100 tracking-widest"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
