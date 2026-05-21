import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, writeBatch } from 'firebase/firestore';
import { Shipment, ShipmentItem, Customer, Product, Sale, SaleItem } from '../types';
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
  const [editingTaxId, setEditingTaxId] = useState<string | null>(null);
  const [quickTaxAmount, setQuickTaxAmount] = useState('');

  // Form State
  const [trackingCode, setTrackingCode] = useState('');
  const [status, setStatus] = useState<Shipment['status']>('Processando');
  const [statusDate, setStatusDate] = useState(new Date().toISOString().split('T')[0]);
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
      setStatusDate(new Date().toISOString().split('T')[0]);
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
      setStatusDate(new Date().toISOString().split('T')[0]);
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

  const shippedItemKeys = new Set([
    ...shipments
      .filter(s => s.id !== editingShipment?.id)
      .flatMap(s => s.items.map(i => `${i.saleId}-${i.productId}-${i.variationId}`)),
    ...items.map(i => `${i.saleId}-${i.productId}-${i.variationId}`)
  ]);

  const addSingleSaleItem = (sale: Sale, item: SaleItem) => {
    const pName = `${item.name} ${item.variationName ? `(${item.variationName})` : ''}`;
    const cId = sale.customerId || 'final-consumer';
    const cName = sale.customerName || 'Consumidor Final';
    
    setItems(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      saleId: sale.id,
      variationId: item.variationId,
      customerId: cId,
      customerName: cName,
      productId: item.productId,
      productName: pName,
      quantity: item.quantity,
      price: item.price,
      isDropshipping: item.isDropshipping || false
    }]);
  };

  const addSaleItems = (saleId: string) => {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;

    const currentItems = [...items];
    
    sale.items.forEach(item => {
      const itemKey = `${sale.id}-${item.productId}-${item.variationId}`;
      if (shippedItemKeys.has(itemKey)) return; 

      const pName = `${item.name} ${item.variationName ? `(${item.variationName})` : ''}`;
      const cId = sale.customerId || 'final-consumer';
      const cName = sale.customerName || 'Consumidor Final';
      
      currentItems.push({
        id: Math.random().toString(36).substr(2, 9),
        saleId: sale.id,
        variationId: item.variationId,
        customerId: cId,
        customerName: cName,
        productId: item.productId,
        productName: pName,
        quantity: item.quantity,
        price: item.price,
        isDropshipping: item.isDropshipping || false
      });
    });

    setItems(currentItems);
  };

  const availableSales = sales.filter(sale => 
    sale.items.some(item => !shippedItemKeys.has(`${sale.id}-${item.productId}-${item.variationId}`))
  );

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
    
    // Tracking code validation: 2 letters + 9 numbers + 2 letters
    const upperTracking = trackingCode.trim().toUpperCase();
    const trackingRegex = /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/;
    
    if (!upperTracking) {
      alert('O código de rastreio é obrigatório.');
      return;
    }

    if (!trackingRegex.test(upperTracking)) {
      alert('Formato de rastreio inválido! Use o padrão: 2 letras + 9 números + 2 letras (ex: AA123456789BR).');
      return;
    }

    // Uniqueness check
    const isDuplicate = shipments.some(s => 
      s.trackingCode.toUpperCase() === upperTracking && s.id !== editingShipment?.id
    );

    if (isDuplicate) {
      alert('Este código de rastreio já está cadastrado em outro lote!');
      return;
    }

    try {
      const data = {
        trackingCode: upperTracking,
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
          const selectedDate = new Date(statusDate);
          // Adjust for timezone to ensure the date is correctly recorded as the start of the day in UTC or local as preferred
          // Here we use the time provided by statusDate input
          const finalDate = new Date(statusDate + 'T12:00:00'); 

          newHistory.push({
            status,
            updatedAt: finalDate,
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
        const finalDate = new Date(statusDate + 'T12:00:00');
        await addDoc(collection(db, 'shipments'), {
          ...data,
          history: [{ status, updatedAt: finalDate, notes: 'Grupo criado' }],
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
      const today = new Date().toISOString().split('T')[0];
      const customDate = prompt(`Selecione a data da movimentação para "${newStatus}" (AAAA-MM-DD):`, today);
      if (customDate === null) return;
      
      const finalDate = new Date(customDate + 'T12:00:00');
      if (isNaN(finalDate.getTime())) {
        alert('Data inválida. Use o formato AAAA-MM-DD');
        return;
      }

      const history = [...(shipment.history || [])];
      history.push({
        status: newStatus,
        updatedAt: finalDate,
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
    s.items.some(i => i.customerName.toLowerCase().includes(search.toLowerCase())) ||
    (search.toLowerCase() === 'dropshipping' && s.items.some(i => i.isDropshipping))
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 pb-10"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 leading-none">
            Rastreio de <span className="text-red-800 underline decoration-red-200 decoration-4 underline-offset-4 tracking-tight font-bold">Encomendas</span>
          </h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] font-sans mt-2">Gestão de Importação e Rastreamento</p>
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
          <button 
            onClick={() => openModal()}
            className="bg-red-800 hover:bg-black text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md flex items-center gap-2 active:scale-95 shadow-red-900/20"
          >
            <Plus size={20} /> Deploy Lote
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row items-center justify-between gap-4 p-6 bg-white/40 backdrop-blur-md rounded-3xl border border-white/60 shadow-xl shadow-slate-200/50">
        <div className="flex-1 max-w-md relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 size-5 group-focus-within:text-red-800 transition-colors" />
          <input 
            type="text" 
            placeholder="Buscar Rastreio ou Cliente..." 
            className="w-full pl-12 pr-4 py-3 bg-white/60 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-800 transition-all shadow-sm outline-none text-sm font-bold tracking-tight"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-8 px-6 border-l border-slate-200 hidden lg:flex font-sans">
           <div className="text-right">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Lotes no Trecho</p>
              <p className="text-xl font-black text-slate-900 font-display tabular-nums leading-none">{shipments.filter(s => s.status !== 'Entregue').length}</p>
           </div>
           <div className="text-right">
              <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest leading-none mb-1">Taxas Pagas</p>
              <p className="text-xl font-black text-emerald-600 font-display tabular-nums leading-none">{formatCurrency(shipments.filter(s => s.taxPaid).reduce((acc, s) => acc + (s.taxAmount || 0), 0))}</p>
           </div>
           <div className="text-right">
              <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest leading-none mb-1">Taxas Pendentes</p>
              <p className="text-xl font-black text-rose-600 font-display tabular-nums leading-none">{formatCurrency(shipments.filter(s => s.hasTax && !s.taxPaid).reduce((acc, s) => acc + (s.taxAmount || 0), 0))}</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(shipment => (
          <motion.div 
            layout
            key={shipment.id} 
            className={cn(
              "bg-white rounded-2xl border transition-all p-4 flex flex-col group relative",
              selectedIds.includes(shipment.id!) ? "border-amber-500 shadow-md" : "border-slate-100 shadow-sm hover:shadow-md"
            )}
          >
            <button 
              onClick={() => toggleSelect(shipment.id!)}
              className="absolute -top-1.5 -left-1.5 z-10 size-6 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-800 transition-all shadow-sm"
            >
              {selectedIds.includes(shipment.id!) ? <CheckSquare size={14} className="text-red-800" /> : <Square size={14} />}
            </button>

            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn("size-9 rounded-xl flex items-center justify-center shrink-0", getStatusColor(shipment.status))}>
                  <Truck size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-slate-950 text-xs uppercase tracking-tight truncate font-sans">{shipment.trackingCode || 'S/ RASTREIO'}</h3>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <select 
                      value={shipment.status}
                      onChange={(e) => updateShipmentStatus(shipment, e.target.value as any)}
                      className={cn(
                        "inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest outline-none cursor-pointer border-none appearance-none",
                        getStatusColor(shipment.status)
                      )}
                    >
                      {SHIPMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {shipment.supplierName && (
                      <span className="text-[8px] font-bold text-slate-400 uppercase truncate max-w-[80px]">
                        {shipment.supplierName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => setShowTimelineId(showTimelineId === shipment.id ? null : shipment.id!)} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-red-800"><History size={14} /></button>
                <button onClick={() => openModal(shipment)} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-red-800"><Edit2 size={14} /></button>
                <button onClick={() => deleteDoc(doc(db, 'shipments', shipment.id!))} className="p-1.5 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
            </div>

            <div className="space-y-2 flex-1">
              <AnimatePresence mode="wait">
                {showTimelineId === shipment.id ? (
                  <motion.div 
                    key="timeline"
                    initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 5 }}
                    className="space-y-2 pt-1"
                  >
                    <p className="text-[8px] font-black uppercase text-red-800 tracking-widest border-b border-red-50 pb-0.5">Log de Auditoria</p>
                    <div className="space-y-2 pl-2 border-l border-slate-100 h-32 overflow-y-auto custom-scrollbar">
                      {shipment.history?.slice().reverse().map((h, i) => (
                        <div key={i} className="relative pb-1">
                          <div className={cn("absolute -left-[11px] top-1 size-1.5 rounded-full border border-white", getStatusColor(h.status).replace('text-', 'bg-'))} />
                          <p className="text-[9px] font-black text-slate-900 uppercase leading-none">{h.status}</p>
                          <p className="text-[8px] text-slate-400 font-bold mt-0.5">{new Date(h.updatedAt?.seconds * 1000 || h.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setShowTimelineId(null)} className="w-full py-1.5 text-[8px] font-black uppercase text-slate-400 hover:text-slate-600 bg-slate-50 rounded-lg">Retornar</button>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="items"
                    initial={{ opacity: 0, x: 5 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -5 }}
                    className="space-y-1.5"
                  >
                    <div className="flex justify-between items-center border-b border-slate-50 pb-0.5">
                      <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Grupos Consignados</p>
                      <span className="text-[8px] font-black text-slate-950 font-display tabular-nums">∑ {shipment.items.reduce((acc, i) => acc + i.quantity, 0)} UNIDADES</span>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                      {(Array.from(new Set(shipment.items.map(i => i.customerId))) as string[]).map(customerId => {
                        const customerName = shipment.items.find(i => i.customerId === customerId)?.customerName;
                        const customerItems = shipment.items.filter(i => i.customerId === customerId);
                        const isExpanded = expandedGroups[shipment.id!]?.[customerId];

                        return (
                          <div key={customerId} className="space-y-1">
                            <button 
                              onClick={() => toggleExpand(shipment.id!, customerId)}
                              className="w-full flex items-center justify-between text-[10px] bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/50 hover:bg-slate-100/50 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="size-4 bg-white rounded flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm shrink-0">
                                  {isExpanded ? <X size={8} /> : <Plus size={8} />}
                                </div>
                                <span className="font-bold text-slate-900 truncate uppercase tracking-tight">{customerName}</span>
                              </div>
                              <span className="text-[8px] font-black text-red-800 bg-red-100 px-1 rounded ml-2 shrink-0">
                                {customerItems.length}
                              </span>
                            </button>
                            
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="bg-slate-50/30 rounded-lg overflow-hidden ml-3 border-l border-slate-200"
                                >
                                  {customerItems.map(item => (
                                    <div key={item.id} className="p-1.5 border-b border-slate-50/50 last:border-0 flex justify-between items-center text-[9px]">
                                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        <span className="text-slate-600 font-bold uppercase truncate tracking-tight">{item.productName}</span>
                                        {item.isDropshipping && (
                                          <span className="text-[6px] font-black bg-amber-500 text-white px-0.5 rounded italic leading-none">DS</span>
                                        )}
                                      </div>
                                      <span className="font-black text-slate-950 ml-2 shrink-0 mr-1">x{item.quantity}</span>
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

            <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {shipment.hasTax ? (
                  <div className="flex items-center gap-1.5">
                    <div className="group/tax relative">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const amountStr = prompt('Valor da taxa:', shipment.taxAmount.toString().replace('.', ','));
                          if (amountStr !== null && amountStr.trim() !== '') {
                            const normalized = amountStr.replace(',', '.').replace(/[^\d.]/g, '');
                            const parsed = parseFloat(normalized);
                            if (!isNaN(parsed) && parsed >= 0) {
                              updateShipmentTax(shipment.id!, parsed, shipment.taxPaid);
                            }
                          }
                        }}
                        className="flex items-center gap-1 cursor-pointer hover:opacity-80 group"
                      >
                        <Receipt size={12} className={shipment.taxPaid ? "text-emerald-500" : "text-rose-500"} />
                        <span className={cn("text-[9px] font-black uppercase font-display tabular-nums leading-none tracking-tight", shipment.taxPaid ? "text-emerald-600" : "text-rose-600")}>
                          {formatCurrency(shipment.taxAmount)}
                        </span>
                        <Calculator size={10} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                      
                      <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-950 text-white rounded-xl p-2.5 shadow-2xl opacity-0 group-hover/tax:opacity-100 pointer-events-none transition-all z-20 border border-white/10">
                        <p className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1.5 border-b border-white/5 pb-1">Auditoria de Taxas / Pro-Rata</p>
                        <div className="space-y-1">
                          {calculateTaxBreakdown(shipment).map(item => (
                            <div key={item.id} className="flex justify-between items-center text-[8px]">
                              <span className="font-bold truncate max-w-[90px] uppercase opacity-70 tracking-tight">{item.name}</span>
                              <span className="font-black text-emerald-400 font-display tabular-nums">{formatCurrency(item.tax)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => updateShipmentTax(shipment.id!, shipment.taxAmount, !shipment.taxPaid)}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest transition-all",
                        shipment.taxPaid ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                      )}
                    >
                      {shipment.taxPaid ? 'PAGO' : 'PAGAR'}
                    </button>
                  </div>
                ) : (
                  editingTaxId === shipment.id ? (
                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5" onClick={e => e.stopPropagation()}>
                      <input 
                        autoFocus
                        type="text"
                        placeholder="0,00"
                        value={quickTaxAmount}
                        onChange={e => setQuickTaxAmount(e.target.value.replace(/[^0-9,]/g, ''))}
                        className="w-12 px-1 py-0.5 text-[9px] font-bold outline-none"
                      />
                      <button 
                        onClick={() => {
                          const val = parseFloat(quickTaxAmount.replace(',', '.'));
                          if (!isNaN(val)) {
                            updateShipmentTax(shipment.id!, val, false);
                            setEditingTaxId(null);
                          }
                        }}
                        className="bg-indigo-600 text-white px-1.5 py-0.5 rounded text-[7px] font-black uppercase"
                      >
                        OK
                      </button>
                      <button onClick={() => setEditingTaxId(null)} className="text-slate-400"><X size={8} /></button>
                    </div>
                  ) : (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTaxId(shipment.id!);
                        setQuickTaxAmount('');
                      }}
                      className="flex items-center gap-1 text-[8px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors border border-slate-100 px-1.5 py-1 rounded bg-slate-50/50"
                    >
                      <Plus size={8} /> ADD TAXA
                    </button>
                  )
                )}
              </div>
              <button 
                onClick={() => sendNotification(shipment, shipment.status)}
                className="flex items-center gap-1 px-2 py-1 bg-slate-900 text-white rounded text-[8px] font-black uppercase tracking-widest hover:bg-red-800 transition-colors"
              >
                <MessageCircle size={10} /> NOTIFICAR
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Código de Rastreio</label>
                    <input 
                      required 
                      type="text" 
                      value={trackingCode} 
                      onChange={e => setTrackingCode(e.target.value.toUpperCase())}
                      placeholder="Ex: NL123456789BR"
                      maxLength={13}
                      className="w-full px-4 py-3 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm bg-slate-50/50 transition-all uppercase"
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
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Data do Status</label>
                    <input 
                      type="date"
                      value={statusDate} 
                      onChange={e => setStatusDate(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm bg-slate-50/50 transition-all"
                    />
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
                    <div className="flex flex-col gap-4">
                      <div className="relative">
                        <ShoppingBag size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select 
                          value={selectedSaleId}
                          onChange={e => setSelectedSaleId(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-red-800 bg-white appearance-none"
                        >
                          <option value="">Selecionar Venda Realizada</option>
                          {availableSales.slice(0, 50).map(s => (
                            <option key={s.id} value={s.id}>
                              {s.customerName} - {formatCurrency(s.total)} ({s.createdAt?.toDate?.()?.toLocaleDateString?.() || 'Recente'})
                            </option>
                          ))}
                        </select>
                      </div>

                      {selectedSaleId && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 border-l-2 border-red-800 pl-4 py-1">
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Produtos Disponíveis desta Venda</p>
                          {sales.find(s => s.id === selectedSaleId)?.items
                            .filter(item => !shippedItemKeys.has(`${selectedSaleId}-${item.productId}-${item.variationId}`))
                            .map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-white border border-slate-100 p-2.5 rounded-xl shadow-sm">
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-black text-slate-900 truncate uppercase">{item.name}</p>
                                  <p className="text-[9px] text-slate-400 font-bold uppercase">{item.variationName || 'Sem variação'}</p>
                                </div>
                                <div className="flex items-center gap-3 ml-4">
                                  <span className="text-[10px] font-black text-slate-900">x{item.quantity}</span>
                                  <button 
                                    type="button"
                                    onClick={() => {
                                      const sale = sales.find(s => s.id === selectedSaleId);
                                      if (sale) addSingleSaleItem(sale, item);
                                    }}
                                    className="p-1 px-3 bg-red-800 text-white text-[9px] font-black uppercase rounded-lg hover:bg-black transition-all"
                                  >
                                    Add
                                  </button>
                                </div>
                              </div>
                            ))}
                          <button 
                            type="button"
                            onClick={() => {
                              addSaleItems(selectedSaleId);
                              setSelectedSaleId('');
                            }}
                            className="w-full py-2 bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-red-800 transition-all mt-2"
                          >
                            Vincular Todos os Itens
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 mt-4 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                    {items.map(item => (
                      <div key={item.id} className="bg-white p-3 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-3">
                          <div className="size-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                             <Box size={16} />
                             {item.isDropshipping && (
                               <div className="absolute top-0 right-0 size-3 bg-amber-500 rounded-full border-2 border-slate-50" />
                             )}
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
                  className="flex-[2] px-6 py-4 bg-red-800 text-white font-black text-xs uppercase tracking-widest rounded-[20px] shadow-xl shadow-red-100 hover:bg-black transition-all hover:-translate-y-1 active:translate-y-0"
                >
                  {editingShipment ? 'Salvar Alterações' : 'Criar Lote de Importação'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
