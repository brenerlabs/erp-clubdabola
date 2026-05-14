import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, writeBatch } from 'firebase/firestore';
import { Shipment, ShipmentItem, Customer, Product, Sale } from '../types';
import { 
  Package, Search, Plus, Trash2, Edit2, Truck, 
  CheckCircle2, Clock, AlertCircle, MapPin, 
  MessageCircle, DollarSign, X, Receipt,
  ChevronRight, ArrowRight, ShoppingBag, Box, History, CheckSquare, Square, Calculator
} from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const SHIPMENT_STATUSES = [
  'Processando',
  'Postado',
  'Em Trânsito',
  'Fiscalização',
  'Recebido',
  'Entregue'
] as const;

export default function Shipments() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showTimelineId, setShowTimelineId] = useState<string | null>(null);

  // Form State
  const [trackingCode, setTrackingCode] = useState('');
  const [status, setStatus] = useState<Shipment['status']>('Processando');
  const [items, setItems] = useState<ShipmentItem[]>([]);
  const [hasTax, setHasTax] = useState(false);
  const [taxAmount, setTaxAmount] = useState<string>('0');
  const [taxPaid, setTaxPaid] = useState(false);
  const [notes, setNotes] = useState('');
  const [supplierName, setSupplierName] = useState('');

  // Item selection from Sales
  const [selectedSaleId, setSelectedSaleId] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'shipments'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setShipments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Shipment)));
    });

    const unsubCust = onSnapshot(query(collection(db, 'customers'), orderBy('name', 'asc')), (snapshot) => {
      setCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    });

    const unsubProd = onSnapshot(query(collection(db, 'products'), orderBy('name', 'asc')), (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });

    const unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('createdAt', 'desc')), (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    });

    return () => {
      unsub();
      unsubCust();
      unsubProd();
      unsubSales();
    };
  }, []);

  const openModal = (shipment?: Shipment) => {
    if (shipment) {
      setEditingShipment(shipment);
      setTrackingCode(shipment.trackingCode);
      setStatus(shipment.status);
      setItems(shipment.items);
      setHasTax(shipment.hasTax);
      setTaxAmount(shipment.taxAmount.toString());
      setTaxPaid(shipment.taxPaid);
      setNotes(shipment.notes || '');
      setSupplierName(shipment.supplierName || '');
    } else {
      setEditingShipment(null);
      setTrackingCode('');
      setStatus('Processando');
      setItems([]);
      setHasTax(false);
      setTaxAmount('0');
      setTaxPaid(false);
      setNotes('');
      setSupplierName('');
    }
    setSelectedSaleId('');
    setIsModalOpen(true);
  };

  const [expandedGroups, setExpandedGroups] = useState<Record<string, Record<string, boolean>>>({});

  const toggleExpand = (shipmentId: string, customerId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [shipmentId]: {
        ...(prev[shipmentId] || {}),
        [customerId]: !(prev[shipmentId]?.[customerId])
      }
    }));
  };

  const shippedItemKeys = new Set(
    shipments.flatMap(s => s.items.map(i => `${i.saleId}-${i.productId}-${i.variationId}`))
  );

  const availableSales = sales.filter(sale => 
    sale.items.some(item => !shippedItemKeys.has(`${sale.id}-${item.productId}-${item.variationId}`))
  );

  const addSaleItems = (saleId: string) => {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;

    const currentItems = [...items];
    
    sale.items.forEach(item => {
      const itemKey = `${sale.id}-${item.productId}-${item.variationId}`;
      if (shippedItemKeys.has(itemKey)) return; // Skip already shipped items

      const pName = `${item.name} ${item.variationName ? `(${item.variationName})` : ''}`;
      const cId = sale.customerId || 'final-consumer';
      const cName = sale.customerName || 'Consumidor Final';
      
      const existing = currentItems.find(i => 
        i.customerId === cId && 
        i.productId === item.productId && 
        i.variationId === item.variationId
      );

      if (existing) {
        existing.quantity += item.quantity;
      } else {
        currentItems.push({
          id: Math.random().toString(36).substr(2, 9),
          saleId: sale.id,
          variationId: item.variationId,
          customerId: cId,
          customerName: cName,
          productId: item.productId,
          productName: pName,
          quantity: item.quantity,
          price: item.price
        });
      }
    });

    setItems(currentItems);
    setSelectedSaleId('');
  };

  const removeItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const sendNotification = (shipment: Shipment, newStatus: string) => {
    // Group unique customers
    const uniqueCustomers = new Map<string, string>();
    shipment.items.forEach(item => {
      const customer = customers.find(c => c.id === item.customerId);
      if (customer && customer.contact) {
        uniqueCustomers.set(customer.id!, customer.contact);
      }
    });

    uniqueCustomers.forEach((contact, customerId) => {
      const customerItems = shipment.items.filter(i => i.customerId === customerId);
      const itemsList = customerItems.map(i => `- ${i.quantity}x ${i.productName}`).join('\\n');
      
      const message = `Olá! Seu pedido no ERP Club da Bola foi atualizado.\\n\\n*Status:* ${newStatus}\\n*Rastreio:* ${shipment.trackingCode}\\n\\n*Produtos:*\\n${itemsList}\\n\\nAcompanhe seu pedido!`;
      
      const cleanPhone = contact.replace(/\\D/g, '');
      const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message.replace(/\\\\n/g, '\n'))}`;
      window.open(url, '_blank');
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingCode.trim()) {
      alert('O código de rastreio é obrigatório.');
      return;
    }
    try {
      const data = {
        trackingCode,
        status,
        items,
        hasTax,
        taxAmount: parseFloat(String(taxAmount || '0').replace(',', '.')) || 0,
        taxPaid,
        notes,
        supplierName,
        updatedAt: serverTimestamp(),
      };

      if (editingShipment) {
        const oldStatus = editingShipment.status;
        const newHistory = [...(editingShipment.history || [])];
        
        if (oldStatus !== status) {
          newHistory.push({
            status,
            updatedAt: new Date(),
            notes: `Status alterado de ${oldStatus} para ${status}`
          });
        }

        await updateDoc(doc(db, 'shipments', editingShipment.id!), {
          ...data,
          history: newHistory
        });
        
        if (oldStatus !== status) {
          if (confirm('Deseja enviar notificações via WhatsApp para os clientes deste grupo?')) {
            sendNotification({ ...editingShipment, ...data }, status);
          }
        }
      } else {
        await addDoc(collection(db, 'shipments'), {
          ...data,
          history: [{ status, updatedAt: new Date(), notes: 'Grupo criado' }],
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'shipments');
    }
  };

  const getStatusColor = (s: Shipment['status']) => {
    switch (s) {
      case 'Processando': return 'bg-slate-100 text-slate-600';
      case 'Postado': return 'bg-blue-100 text-blue-600';
      case 'Em Trânsito': return 'bg-amber-100 text-amber-600';
      case 'Fiscalização': return 'bg-rose-100 text-rose-600';
      case 'Recebido': return 'bg-emerald-100 text-emerald-600';
      case 'Entregue': return 'bg-indigo-100 text-indigo-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const batchUpdateStatus = async (newStatus: Shipment['status']) => {
    if (selectedIds.length === 0) return;
    const batch = writeBatch(db);
    selectedIds.forEach(id => {
      const s = shipments.find(sh => sh.id === id);
      if (s) {
        batch.update(doc(db, 'shipments', id), { 
          status: newStatus, 
          updatedAt: serverTimestamp(),
          history: [...(s.history || []), { status: newStatus, updatedAt: new Date(), notes: `Ação em massa: ${newStatus}` }]
        });
      }
    });
    await batch.commit();
    setSelectedIds([]);
  };

  const calculateTaxBreakdown = (shipment: Shipment) => {
    const totalValue = shipment.items.reduce((acc, i) => acc + (i.price * i.quantity), 0);
    if (totalValue === 0) return [];
    
    const breakdownMap = new Map<string, { name: string, value: number, tax: number }>();
    shipment.items.forEach(item => {
      const current = breakdownMap.get(item.customerId) || { name: item.customerName, value: 0, tax: 0 };
      current.value += (item.price * item.quantity);
      breakdownMap.set(item.customerId, current);
    });

    return Array.from(breakdownMap.entries()).map(([id, data]) => ({
      id,
      ...data,
      tax: (data.value / totalValue) * shipment.taxAmount
    }));
  };

  const updateShipmentStatus = async (shipment: Shipment, newStatus: Shipment['status']) => {
    try {
      const history = [...(shipment.history || [])];
      history.push({
        status: newStatus,
        updatedAt: new Date(),
        notes: `Alteração rápida de status para ${newStatus}`
      });

      await updateDoc(doc(db, 'shipments', shipment.id!), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        history
      });

      if (confirm('Deseja notificar o cliente via WhatsApp sobre essa mudança?')) {
        sendNotification(shipment, newStatus);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'shipments');
    }
  };

  const updateShipmentTax = async (shipmentId: string, amount: number, paid: boolean) => {
    try {
      await updateDoc(doc(db, 'shipments', shipmentId), {
        hasTax: amount > 0,
        taxAmount: amount,
        taxPaid: paid,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'shipments');
    }
  };

  const filtered = shipments.filter(s => 
    s.trackingCode.toLowerCase().includes(search.toLowerCase()) ||
    s.supplierName?.toLowerCase().includes(search.toLowerCase()) ||
    s.items.some(i => i.customerName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight italic">ENCOMENDAS <span className="text-indigo-600">IMPORTAÇÃO</span></h2>
          <p className="text-slate-500 text-sm font-medium">Agrupe pedidos e gerencie o rastreio internacional</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 mr-4 px-4 py-2 bg-slate-900 rounded-xl animate-in slide-in-from-top-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedIds.length} selecionados</span>
              <div className="h-4 w-[1px] bg-slate-700 mx-2" />
              <select 
                onChange={(e) => {
                  if (e.target.value === 'payTax') {
                    if (confirm(`Marcar taxa como PAGA para ${selectedIds.length} lotes?`)) {
                      const batch = writeBatch(db);
                      selectedIds.forEach(id => batch.update(doc(db, 'shipments', id), { taxPaid: true, updatedAt: serverTimestamp() }));
                      batch.commit().then(() => setSelectedIds([]));
                    }
                  } else {
                    batchUpdateStatus(e.target.value as any);
                  }
                }}
                className="bg-transparent text-white text-[10px] font-bold uppercase outline-none cursor-pointer"
                value=""
              >
                <option value="" disabled>Ação em Massa</option>
                <optgroup label="Alterar Status" className="bg-slate-900">
                  {SHIPMENT_STATUSES.map(s => <option key={s} value={s} className="bg-slate-900 text-white">{s}</option>)}
                </optgroup>
                <optgroup label="Financeiro" className="bg-slate-900">
                  <option value="payTax" className="bg-slate-900 text-white">Marcar Taxas como PAGAS</option>
                </optgroup>
              </select>
              <button onClick={() => setSelectedIds([])} className="ml-2 text-slate-400 hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Rastreio ou cliente..." 
              className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64 transition-all"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button 
            onClick={() => openModal()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-indigo-100 flex items-center gap-2 active:scale-95"
          >
            <Plus size={20} /> Novo Grupo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map(shipment => (
          <motion.div 
            layout
            key={shipment.id} 
            className={cn(
              "bg-white rounded-3xl border transition-all p-6 flex flex-col group relative",
              selectedIds.includes(shipment.id!) ? "border-indigo-500 shadow-xl shadow-indigo-50" : "border-slate-100 shadow-sm hover:shadow-xl"
            )}
          >
            <button 
              onClick={() => toggleSelect(shipment.id!)}
              className="absolute -top-2 -left-2 z-10 size-8 bg-white border-2 border-slate-100 rounded-xl flex items-center justify-center text-slate-300 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
            >
              {selectedIds.includes(shipment.id!) ? <CheckSquare size={18} className="text-indigo-600" /> : <Square size={18} />}
            </button>

            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={cn("size-12 rounded-2xl flex items-center justify-center transition-colors", getStatusColor(shipment.status))}>
                  <Truck size={24} />
                </div>
                <div className="max-w-[150px]">
                  <h3 className="font-black text-slate-900 leading-tight uppercase tracking-tight truncate">{shipment.trackingCode || 'Sem Rastreio'}</h3>
                  <div className="flex flex-col gap-0.5 mt-1">
                    <select 
                      value={shipment.status}
                      onChange={(e) => updateShipmentStatus(shipment, e.target.value as any)}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider outline-none cursor-pointer border-none appearance-none",
                        getStatusColor(shipment.status)
                      )}
                    >
                      {SHIPMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {shipment.supplierName && (
                      <span className="text-[9px] font-bold text-slate-400 uppercase truncate">
                        {shipment.supplierName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setShowTimelineId(showTimelineId === shipment.id ? null : shipment.id!)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600"><History size={16} /></button>
                <button onClick={() => openModal(shipment)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600"><Edit2 size={16} /></button>
                <button onClick={() => deleteDoc(doc(db, 'shipments', shipment.id!))} className="p-2 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button>
              </div>
            </div>

            <div className="space-y-3 flex-1">
              <AnimatePresence mode="wait">
                {showTimelineId === shipment.id ? (
                  <motion.div 
                    key="timeline"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-4"
                  >
                    <p className="text-[10px] font-black uppercase text-indigo-600 tracking-widest border-b border-indigo-50 pb-1">Linha do Tempo</p>
                    <div className="space-y-3 pl-2 border-l border-slate-100 h-40 overflow-y-auto custom-scrollbar">
                      {shipment.history?.slice().reverse().map((h, i) => (
                        <div key={i} className="relative pb-2">
                          <div className={cn("absolute -left-[13px] top-1 size-2 rounded-full border-2 border-white", getStatusColor(h.status).replace('text-', 'bg-'))} />
                          <p className="text-[10px] font-black text-slate-900 uppercase tracking-tighter">{h.status}</p>
                          <p className="text-[9px] text-slate-500 font-bold">{new Date(h.updatedAt?.seconds * 1000 || h.updatedAt).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setShowTimelineId(null)} className="w-full py-2 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 bg-slate-50 rounded-xl">Voltar para clientes</button>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="items"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="space-y-3"
                  >
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-50 pb-1">Grupos por Cliente</p>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                      {(Array.from(new Set(shipment.items.map(i => i.customerId))) as string[]).map(customerId => {
                        const customerName = shipment.items.find(i => i.customerId === customerId)?.customerName;
                        const customerItems = shipment.items.filter(i => i.customerId === customerId);
                        const isExpanded = expandedGroups[shipment.id!]?.[customerId];

                        return (
                          <div key={customerId} className="space-y-1">
                            <button 
                              onClick={() => toggleExpand(shipment.id!, customerId)}
                              className="w-full flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-100 transition-colors text-left"
                            >
                              <div className="flex items-center gap-2">
                                <div className="size-5 bg-white rounded-md flex items-center justify-center text-slate-400 border border-slate-100">
                                  {isExpanded ? <X size={10} /> : <Plus size={10} />}
                                </div>
                                <span className="font-bold text-slate-900 truncate max-w-[100px]">{customerName}</span>
                              </div>
                              <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                                {customerItems.length}
                              </span>
                            </button>
                            
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="bg-white/50 rounded-xl overflow-hidden ml-4 border-l-2 border-slate-100"
                                >
                                  {customerItems.map(item => (
                                    <div key={item.id} className="p-2 border-b border-slate-50 last:border-0 flex justify-between items-center text-[11px]">
                                      <span className="text-slate-600 font-medium truncate max-w-[120px]">{item.productName}</span>
                                      <span className="font-black text-slate-900">x{item.quantity}</span>
                                    </div>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
              <div className="flex flex-col gap-2">
                {shipment.hasTax ? (
                  <div className="flex items-center gap-2">
                    <div className="group/tax relative">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const amountStr = prompt('Valor da taxa (Ex: 100,50):', shipment.taxAmount.toString().replace('.', ','));
                          if (amountStr !== null && amountStr.trim() !== '') {
                            const normalized = amountStr.replace(',', '.').replace(/[^\d.]/g, '');
                            const parsed = parseFloat(normalized);
                            if (!isNaN(parsed) && parsed >= 0) {
                              updateShipmentTax(shipment.id!, parsed, shipment.taxPaid);
                            } else {
                              alert('Por favor, insira um valor numérico válido.');
                            }
                          }
                        }}
                        className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <Receipt size={14} className={shipment.taxPaid ? "text-emerald-500" : "text-rose-500"} />
                        <span className={cn("text-[10px] font-black uppercase", shipment.taxPaid ? "text-emerald-600" : "text-rose-600")}>
                          Imp: {formatCurrency(shipment.taxAmount)}
                        </span>
                        <Calculator size={12} className="text-slate-300 ml-1" />
                      </button>
                      {/* Tax Rateio Popover */}
                      <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-900 text-white rounded-xl p-3 shadow-xl opacity-0 group-hover/tax:opacity-100 pointer-events-none transition-all z-20">
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2 border-b border-slate-800 pb-1">Rateio Sugerido</p>
                        <div className="space-y-1.5">
                          {calculateTaxBreakdown(shipment).map(item => (
                            <div key={item.id} className="flex justify-between items-center text-[9px]">
                              <span className="font-bold truncate max-w-[80px]">{item.name}</span>
                              <span className="font-black text-emerald-400">{formatCurrency(item.tax)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => updateShipmentTax(shipment.id!, shipment.taxAmount, !shipment.taxPaid)}
                      className={cn(
                        "px-2 py-0.5 rounded-md text-[9px] font-black uppercase transition-all",
                        shipment.taxPaid ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      )}
                    >
                      {shipment.taxPaid ? 'Pago' : 'Pagar'}
                    </button>
                  </div>
                ) : (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        const amountStr = prompt('Valor da taxa (Ex: 100,50):');
                        if (amountStr !== null && amountStr.trim() !== '') {
                          const normalized = amountStr.replace(',', '.').replace(/[^\d.]/g, '');
                          const parsed = parseFloat(normalized);
                          if (!isNaN(parsed) && parsed >= 0) {
                            updateShipmentTax(shipment.id!, parsed, false);
                          } else {
                            alert('Por favor, insira um valor numérico válido.');
                          }
                        }
                      }}
                      className="flex items-center gap-1 text-[9px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors border border-slate-200 px-2 py-1 rounded-lg"
                    >
                      <Plus size={10} /> Adicionar Taxa
                    </button>
                )}
              </div>
              <button 
                onClick={() => sendNotification(shipment, shipment.status)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-colors"
              >
                <MessageCircle size={14} /> Notificar
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Shipment Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="size-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                    <Package size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 italic uppercase">Gerenciar <span className="text-indigo-600">Grupo</span></h3>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Configuração de Encomendas</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X size={24} className="text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Código de Rastreio</label>
                    <input 
                      required 
                      type="text" 
                      value={trackingCode} 
                      onChange={e => setTrackingCode(e.target.value)}
                      placeholder="Ex: NL123456789BR"
                      className="w-full px-4 py-3 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm bg-slate-50/50 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Status Atual</label>
                    <select 
                      value={status} 
                      onChange={e => setStatus(e.target.value as any)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm bg-slate-50/50 appearance-none"
                    >
                      {SHIPMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Fornecedor / Loja</label>
                  <input 
                    type="text" 
                    value={supplierName} 
                    onChange={e => setSupplierName(e.target.value)}
                    placeholder="Ex: Alibaba, Wechat Seller..."
                    className="w-full px-4 py-3 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm bg-slate-50/50 transition-all"
                  />
                </div>

                {/* Items Management from Sales */}
                <div className="bg-slate-50 rounded-[32px] p-6 border border-slate-100 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-900 italic">Vendas Vinculadas</h4>
                    <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">{items.length} itens</span>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <ShoppingBag size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select 
                          value={selectedSaleId}
                          onChange={e => setSelectedSaleId(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                          <option value="">Selecionar Venda Realizada</option>
                          {availableSales.slice(0, 50).map(s => (
                            <option key={s.id} value={s.id}>
                              {s.customerName} - {formatCurrency(s.total)} ({s.createdAt?.toDate?.()?.toLocaleDateString?.() || 'Recente'})
                            </option>
                          ))}
                        </select>
                      </div>
                      <button 
                        type="button"
                        onClick={() => addSaleItems(selectedSaleId)}
                        disabled={!selectedSaleId}
                        className="px-6 bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-100"
                      >
                        Vincular Venda
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 mt-4 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                    {items.map(item => (
                      <div key={item.id} className="bg-white p-3 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-3">
                          <div className="size-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                            <Box size={16} />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-900">{item.customerName}</p>
                            <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-tight">{item.productName}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-xs font-black text-slate-900">x{item.quantity}</span>
                          <button 
                            type="button" 
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {items.length === 0 && (
                      <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-[32px]">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest text-center px-4">Selecione uma venda acima para vincular os produtos a este lote de importação</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Taxes Management */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Receipt size={20} className="text-rose-500" />
                      <h4 className="text-sm font-black uppercase tracking-widest text-slate-900">Taxas e Tributos</h4>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={hasTax} onChange={e => setHasTax(e.target.checked)} />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-500"></div>
                    </label>
                  </div>

                  <AnimatePresence>
                    {hasTax && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="grid grid-cols-2 gap-4 pt-2 overflow-hidden"
                      >
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Valor total da Taxa</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">R$</span>
                            <input 
                              type="text" 
                              value={taxAmount} 
                              inputMode="decimal"
                              onChange={e => setTaxAmount(e.target.value.replace(/[^0-9,.]/g, ''))}
                              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 font-bold text-sm bg-rose-50/30"
                              placeholder="0,00"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Situação Pagto</label>
                          <button 
                            type="button"
                            onClick={() => setTaxPaid(!taxPaid)}
                            className={cn(
                              "w-full px-4 py-3 rounded-2xl border font-bold text-sm transition-all flex items-center justify-center gap-2",
                              taxPaid ? "bg-emerald-500 border-emerald-600 text-white shadow-lg shadow-emerald-100" : "bg-white border-slate-200 text-slate-600"
                            )}
                          >
                            {taxPaid ? <CheckCircle2 size={18} /> : <Clock size={18} />}
                            {taxPaid ? 'Taxa Paga' : 'Pendente de Pgto'}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Observações Internas</label>
                  <textarea 
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm bg-slate-50/30 transition-all resize-none"
                    placeholder="Detalhes adicionais sobre o lote..."
                  />
                </div>
              </form>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-6 py-4 bg-white border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest rounded-[20px] hover:bg-slate-100 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSubmit}
                  className="flex-[2] px-6 py-4 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-[20px] shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all hover:-translate-y-1 active:translate-y-0"
                >
                  {editingShipment ? 'Salvar Alterações' : 'Criar Lote de Importação'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
