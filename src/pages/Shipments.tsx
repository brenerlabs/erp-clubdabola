import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, writeBatch } from 'firebase/firestore';
import { Shipment, ShipmentItem, Customer, Product, Sale, SaleItem } from '../types';
import { 
  Package, Search, Plus, Trash2, Edit2, Truck, 
  CheckCircle2, Clock, AlertCircle, MapPin, 
  MessageCircle, DollarSign, X, Receipt,
  ChevronRight, ArrowRight, ShoppingBag, Box, History, CheckSquare, Square, Calculator,
  Sparkles, TrendingUp, Activity
} from 'lucide-react';
import { formatCurrency, cn, cleanVariationName } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const SHIPMENT_STATUSES = [
  'Processando',
  'Postado',
  'Em Trânsito',
  'Fiscalização',
  'Recebido',
  'Entregue'
] as const;

const getStatusConfig = (s: Shipment['status']) => {
  switch (s) {
    case 'Processando':
      return {
        bg: 'bg-slate-50 border-slate-200/60',
        text: 'text-slate-600',
        border: 'border-slate-200',
        badge: 'bg-slate-50 border-slate-200/60 text-slate-600 hover:bg-slate-100',
        iconBg: 'bg-slate-100 text-slate-500',
        dot: 'bg-slate-400'
      };
    case 'Postado':
      return {
        bg: 'bg-sky-50/50 border-sky-100',
        text: 'text-sky-600 font-bold',
        border: 'border-sky-200',
        badge: 'bg-sky-50 border-sky-100 text-sky-600 hover:bg-sky-100/70',
        iconBg: 'bg-sky-100 text-sky-600',
        dot: 'bg-sky-500'
      };
    case 'Em Trânsito':
      return {
        bg: 'bg-amber-50/50 border-amber-100',
        text: 'text-amber-600 font-bold',
        border: 'border-amber-200',
        badge: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100/70',
        iconBg: 'bg-amber-100 text-amber-600',
        dot: 'bg-amber-500'
      };
    case 'Fiscalização':
      return {
        bg: 'bg-rose-50 border-rose-100',
        text: 'text-rose-600 font-extrabold',
        border: 'border-rose-200',
        badge: 'bg-rose-100/80 border-rose-200 text-rose-600 hover:bg-rose-200/70 animate-pulse',
        iconBg: 'bg-rose-100 text-rose-600',
        dot: 'bg-rose-600'
      };
    case 'Recebido':
      return {
        bg: 'bg-emerald-50/50 border-emerald-100',
        text: 'text-emerald-600 font-bold',
        border: 'border-emerald-200',
        badge: 'bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-100/70',
        iconBg: 'bg-emerald-100 text-emerald-600',
        dot: 'bg-emerald-500'
      };
    case 'Entregue':
      return {
        bg: 'bg-indigo-50/80 border-indigo-100',
        text: 'text-indigo-600 font-extrabold',
        border: 'border-indigo-200',
        badge: 'bg-indigo-50 border-indigo-100 text-indigo-600 hover:bg-indigo-100/70',
        iconBg: 'bg-indigo-100 text-indigo-600',
        dot: 'bg-indigo-500'
      };
    default:
      return {
        bg: 'bg-slate-50 border-slate-200',
        text: 'text-slate-600',
        border: 'border-slate-200',
        badge: 'bg-slate-50 border-slate-200 text-slate-600',
        iconBg: 'bg-slate-100 text-slate-400',
        dot: 'bg-slate-400'
      };
  }
};

const getStatusIcon = (status: Shipment['status'], size = 18) => {
  switch (status) {
    case 'Processando': return <Clock size={size} />;
    case 'Postado': return <Package size={size} />;
    case 'Em Trânsito': return <Truck size={size} />;
    case 'Fiscalização': return <AlertCircle size={size} />;
    case 'Recebido': return <MapPin size={size} />;
    case 'Entregue': return <CheckCircle2 size={size} />;
    default: return <Package size={size} />;
  }
};

const getSelectedTabStyle = (s: string) => {
  switch (s) {
    case 'all': return 'bg-slate-950 text-white border-slate-950 shadow-sm';
    case 'Processando': return 'bg-slate-600 text-white border-slate-600 shadow-sm shadow-slate-600/10';
    case 'Postado': return 'bg-sky-600 text-white border-sky-600 shadow-sm shadow-sky-600/10';
    case 'Em Trânsito': return 'bg-amber-600 text-white border-amber-600 shadow-sm shadow-amber-600/10';
    case 'Fiscalização': return 'bg-rose-600 text-white border-rose-600 shadow-sm shadow-rose-600/10 animate-pulse';
    case 'Recebido': return 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-500/10';
    case 'Entregue': return 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/10';
    default: return 'bg-red-800 text-white border-red-800 shadow-sm';
  }
};

export default function Shipments() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showTimelineId, setShowTimelineId] = useState<string | null>(null);
  const [editingTaxId, setEditingTaxId] = useState<string | null>(null);
  const [quickTaxAmount, setQuickTaxAmount] = useState('');
  const [showInsights, setShowInsights] = useState(true);
  const [showDeliveredSection, setShowDeliveredSection] = useState(false);
  const [activeStatusMenuId, setActiveStatusMenuId] = useState<string | null>(null);
  const [pendingWhatsAppNotify, setPendingWhatsAppNotify] = useState<{ shipment: Shipment, newStatus: string } | null>(null);

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
  const [sendWhatsAppOnSave, setSendWhatsAppOnSave] = useState(true);

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

  useEffect(() => {
    const handleStorageChange = () => {
      const storedSearch = localStorage.getItem('shipment-search');
      if (storedSearch !== null) {
        setSearch(storedSearch);
        localStorage.removeItem('shipment-search');
      }
    };

    handleStorageChange();

    window.addEventListener('shipment-search-update', handleStorageChange);
    return () => {
      window.removeEventListener('shipment-search-update', handleStorageChange);
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
    const cleanedVar = cleanVariationName(item.variationName);
    const pName = `${item.name}${cleanedVar ? ` (${cleanedVar})` : ''}`;
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

      const cleanedVar = cleanVariationName(item.variationName);
      const pName = `${item.name}${cleanedVar ? ` (${cleanedVar})` : ''}`;
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
    sale.status !== 'Pré-venda' &&
    sale.status !== 'Cancelada' &&
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
      const customer = customers.find(c => c.id === customerId);
      const customerName = customer ? customer.name : '';
      const customerItems = shipment.items.filter(i => i.customerId === customerId);
      const itemsList = customerItems.map(i => `- ${i.quantity}x ${i.productName}`).join('\n');
      
      let message = `Olá! Seu pedido no ERP Club da Bola foi atualizado.\n\n*Status:* ${newStatus}\n*Rastreio:* ${shipment.trackingCode}\n\n*Produtos:*\n${itemsList}\n\nAcompanhe seu pedido!`;
      
      if (newStatus === 'Entregue') {
        message = `Fala, *${customerName || 'campeão'}*! Tudo bem? ⚽\n\nVi aqui que sua encomenda com o rastreio *${shipment.trackingCode}* já foi entregue! Aposto que ficou daquele jeito! 🤩\n\nPoderia fortalecer nossa comunidade tirando uma foto irada vestindo a camisa para o nosso Mural de Clientes no site?\n\nPra te premiar, na sua próxima compra você ganha 10% de desconto ou Frete Grátis com o cupom: *DESCONTO10*. Que tal?\n\nForte abraço! Tamo junto! 🔥🤙`;
      }
      
      const cleanPhone = contact.replace(/\D/g, '');
      const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`;
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
          if (sendWhatsAppOnSave) {
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
      const finalDate = new Date();

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

  const filtered = shipments.filter(s => {
    const matchesSearch = s.trackingCode.toLowerCase().includes(search.toLowerCase()) ||
      s.supplierName?.toLowerCase().includes(search.toLowerCase()) ||
      s.items.some(i => i.customerName.toLowerCase().includes(search.toLowerCase())) ||
      (search.toLowerCase() === 'dropshipping' && s.items.some(i => i.isDropshipping));
      
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const inTransitFiltered = filtered.filter(s => s.status !== 'Entregue');
  const deliveredFiltered = filtered.filter(s => s.status === 'Entregue');

  // --- COMPUTE ADVANCED OPERATIONAL INTELLIGENCE METRICS ---
  const totalShipmentsCount = shipments.length;
  const shippedShipments = shipments.filter(s => s.status !== 'Processando');
  const taxedCount = shippedShipments.filter(s => s.hasTax).length;
  const taxationRate = shippedShipments.length > 0 ? Math.round((taxedCount / shippedShipments.length) * 100) : 0;
  
  // Average transit time from "Postado" -> "Entregue" using real history logs
  const deliveredShipments = shipments.filter(s => s.status === 'Entregue');
  let totalTransitDays = 0;
  let deliveredWithTransitCount = 0;
  deliveredShipments.forEach(s => {
    if (s.history) {
      const postadoLog = s.history.find(h => h.status === 'Postado');
      const entregueLog = s.history.find(h => h.status === 'Entregue');
      if (postadoLog && entregueLog) {
        const postadoDate = postadoLog.updatedAt?.seconds 
          ? new Date(postadoLog.updatedAt.seconds * 1000) 
          : new Date(postadoLog.updatedAt);
        const entregueDate = entregueLog.updatedAt?.seconds 
          ? new Date(entregueLog.updatedAt.seconds * 1000) 
          : new Date(entregueLog.updatedAt);
        
        const diffTime = entregueDate.getTime() - postadoDate.getTime();
        if (diffTime > 0) {
          const diffDays = diffTime / (1000 * 60 * 60 * 24);
          totalTransitDays += diffDays;
          deliveredWithTransitCount++;
        }
      }
    }
  });
  const avgTransitTime = deliveredWithTransitCount > 0 ? (totalTransitDays / deliveredWithTransitCount).toFixed(1) : null;

  // Search active customs hold bottleneck (Fiscalização)
  const fiscalizacaoAlerts = shipments.filter(s => s.status === 'Fiscalização').map(s => {
    const fiscalLog = s.history?.find(h => h.status === 'Fiscalização');
    let daysInFiscal = 0;
    if (fiscalLog) {
      const date = fiscalLog.updatedAt?.seconds 
        ? new Date(fiscalLog.updatedAt.seconds * 1000) 
        : new Date(fiscalLog.updatedAt);
      const diffTime = new Date().getTime() - date.getTime();
      daysInFiscal = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
    }
    return {
      id: s.id,
      trackingCode: s.trackingCode,
      days: daysInFiscal,
      hasTax: s.hasTax,
      taxPaid: s.taxPaid,
      taxAmount: s.taxAmount
    };
  }).sort((a, b) => b.days - a.days);

  // Supplier counts and leading supplier
  const supplierBreakdown = shipments.reduce((acc, s) => {
    if (s.supplierName && s.supplierName.trim()) {
      const name = s.supplierName.trim().toUpperCase();
      acc[name] = (acc[name] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  const topSupplierName = (Object.entries(supplierBreakdown) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1)[0]?.[0] || 'NÃO CONFIGURADO';

  // Dropshipping share metrics
  const totalItemsCount = shipments.reduce((acc, s) => acc + s.items.reduce((sum, i) => sum + i.quantity, 0), 0);
  const totalDropshippingItemsCount = shipments.reduce((acc, s) => acc + s.items.filter(i => i.isDropshipping).reduce((sum, i) => sum + i.quantity, 0), 0);
  const dropshippingPercentage = totalItemsCount > 0 ? Math.round((totalDropshippingItemsCount / totalItemsCount) * 100) : 0;

  const renderShipmentCard = (shipment: Shipment) => {
    const statusConfig = getStatusConfig(shipment.status);
    const isSelected = selectedIds.includes(shipment.id!);

    return (
      <motion.div 
        layout
        key={shipment.id} 
        className={cn(
          "bg-white rounded-3xl border transition-all p-5 flex flex-col group relative",
          isSelected 
            ? "border-amber-500 ring-2 ring-amber-500/10 shadow-lg" 
            : "border-slate-200/70 hover:border-slate-300 shadow-sm hover:shadow-md hover:-translate-y-0.5"
        )}
      >
        <button 
          onClick={() => toggleSelect(shipment.id!)}
          className={cn(
            "absolute -top-1.5 -left-1.5 z-10 size-6 rounded-lg flex items-center justify-center transition-all shadow-sm border",
            isSelected 
              ? "bg-amber-500 border-amber-600 text-white" 
              : "bg-white border-slate-200 text-slate-300 hover:text-slate-500 hover:border-slate-300"
          )}
        >
          {isSelected ? <CheckSquare size={12} className="stroke-[3]" /> : <Square size={12} />}
        </button>

        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn(
              "size-10 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105 shadow-sm border border-transparent",
              statusConfig.iconBg
            )}>
              {getStatusIcon(shipment.status, 20)}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-mono font-bold text-slate-900 text-xs tracking-tight truncate select-all">{shipment.trackingCode || 'SEM RASTREIO'}</h3>
              <div className="flex flex-wrap items-center gap-1.5 mt-1 relative">
                {/* Custom Interactive Dropdown Button */}
                <div className="relative">
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveStatusMenuId(activeStatusMenuId === shipment.id ? null : shipment.id!);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border shadow-sm cursor-pointer select-none",
                      statusConfig.badge
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", statusConfig.dot)} />
                    <span>{shipment.status}</span>
                    <ChevronRight size={10} className={cn("transition-transform duration-200 shrink-0 text-slate-400", activeStatusMenuId === shipment.id ? "rotate-90 text-slate-700" : "")} />
                  </button>

                  <AnimatePresence>
                    {activeStatusMenuId === shipment.id && (
                      <>
                        {/* Safe absolute overlay to handle close click within card context safely */}
                        <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setActiveStatusMenuId(null); }} />
                        <motion.div 
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.95 }}
                          transition={{ duration: 0.12 }}
                          className="absolute left-0 mt-2 w-52 bg-white rounded-2xl border border-slate-200/80 shadow-2xl p-2 z-50 overflow-hidden"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="p-1.5 px-2 mb-1 border-b border-slate-100">
                            <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest leading-none">Alterar Status</p>
                          </div>
                          <div className="space-y-0.5">
                            {SHIPMENT_STATUSES.map(s => {
                              const config = getStatusConfig(s);
                              const isCurrent = shipment.status === s;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setActiveStatusMenuId(null);
                                    if (shipment.status !== s) {
                                      await updateShipmentStatus(shipment, s);
                                      setPendingWhatsAppNotify({ shipment, newStatus: s });
                                    }
                                  }}
                                  className={cn(
                                    "w-full text-left p-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-between group/opt",
                                    isCurrent 
                                      ? "bg-slate-900 text-white font-extrabold" 
                                      : "bg-transparent text-slate-700 hover:bg-slate-50"
                                  )}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={cn("size-2 rounded-full", isCurrent ? "bg-white" : config.dot)} />
                                    <span>{s}</span>
                                  </div>
                                  {!isCurrent && (
                                    <span className={cn("opacity-0 group-hover/opt:opacity-100 transition-all text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded", config.text, config.bg)}>
                                      Mudar
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                {shipment.supplierName && (
                  <span className="text-[9px] font-semibold text-slate-400 uppercase truncate max-w-[90px] bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">
                    {shipment.supplierName}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
            <button 
              onClick={() => setShowTimelineId(showTimelineId === shipment.id ? null : shipment.id!)} 
              title="Histórico"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-800 transition-colors"
            >
              <History size={14} />
            </button>
            <button 
              onClick={() => openModal(shipment)} 
              title="Editar"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-800 transition-colors"
            >
              <Edit2 size={14} />
            </button>
            <button 
              onClick={() => {
                if (confirm('Tem certeza que deseja excluir esta encomenda?')) {
                  deleteDoc(doc(db, 'shipments', shipment.id!));
                }
              }} 
              title="Excluir"
              className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="space-y-2 flex-1">
          <AnimatePresence mode="wait">
            {showTimelineId === shipment.id ? (
              <motion.div 
                key="timeline"
                initial={{ opacity: 0, x: -5 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: 5 }}
                className="space-y-2 pt-1"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                  <p className="text-[9px] font-black uppercase text-red-800 tracking-widest">Log de Auditoria</p>
                  <span className="text-[8px] font-bold text-slate-400 uppercase">Histórico</span>
                </div>
                <div className="space-y-3 pl-2 border-l-2 border-slate-100 h-[132px] overflow-y-auto custom-scrollbar pt-1 pr-1">
                  {shipment.history?.slice().reverse().map((h, i) => {
                    const hConfig = getStatusConfig(h.status);
                    return (
                      <div key={i} className="relative pl-3 pb-1">
                        <div className={cn("absolute -left-[14px] top-1.5 size-2 rounded-full border-2 border-white shadow-sm", hConfig.dot)} />
                        <div className="flex items-center gap-1.5">
                          <span className={cn("text-[9px] font-black uppercase tracking-wider px-1 rounded", hConfig.text, hConfig.bg)}>
                            {h.status}
                          </span>
                        </div>
                        {h.notes && <p className="text-[9px] text-slate-500 font-medium mt-0.5">{h.notes}</p>}
                        <p className="text-[8px] text-slate-400 font-bold mt-1">
                          {new Date(h.updatedAt?.seconds * 1000 || h.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <button 
                  onClick={() => setShowTimelineId(null)} 
                  className="w-full py-1.5 text-[8px] font-black uppercase text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all border border-slate-100"
                >
                  Voltar para Itens
                </button>
              </motion.div>
            ) : (
              <motion.div 
                key="items"
                initial={{ opacity: 0, x: 5 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -5 }}
                className="space-y-2"
              >
                <div className="flex justify-between items-center border-b border-slate-100/60 pb-1">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Consignatários</p>
                  <span className="text-[9px] font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md font-display tabular-nums">
                    ∑ {shipment.items.reduce((acc, i) => acc + i.quantity, 0)} UN
                  </span>
                </div>
                <div className="space-y-1.5 max-h-[132px] overflow-y-auto custom-scrollbar pr-1">
                  {(Array.from(new Set(shipment.items.map(i => i.customerId))) as string[]).map(customerId => {
                    const customerName = shipment.items.find(i => i.customerId === customerId)?.customerName;
                    const customerItems = shipment.items.filter(i => i.customerId === customerId);
                    const isExpanded = expandedGroups[shipment.id!]?.[customerId];

                    return (
                      <div key={customerId} className="space-y-1">
                        <button 
                          onClick={() => toggleExpand(shipment.id!, customerId)}
                          className="w-full flex items-center justify-between text-[10px] bg-slate-50/50 p-2 rounded-xl border border-slate-100 hover:bg-slate-100/50 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="size-4 bg-white rounded flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm shrink-0">
                              {isExpanded ? <X size={8} /> : <Plus size={8} />}
                            </div>
                            <span className="font-bold text-slate-800 truncate uppercase tracking-tight">{customerName}</span>
                          </div>
                          <span className="text-[8px] font-black text-red-800 bg-red-100/80 px-1.5 py-0.5 rounded-lg ml-2 shrink-0">
                            {customerItems.length} {customerItems.length === 1 ? 'Prod' : 'Prods'}
                          </span>
                        </button>
                        
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="bg-slate-50/30 rounded-xl overflow-hidden ml-3 border-l-2 border-slate-200"
                            >
                              {customerItems.map(item => (
                                <div key={item.id} className="p-1.5 px-2.5 border-b border-slate-50 last:border-0 flex justify-between items-center text-[9px]">
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <span className="text-slate-600 font-bold uppercase truncate tracking-tight">{item.productName}</span>
                                    {item.isDropshipping && (
                                      <span className="text-[6px] font-black bg-amber-500 text-white px-1 rounded italic leading-none">DS</span>
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

        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
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
                    className="flex items-center gap-1 cursor-pointer hover:opacity-80 group text-left"
                  >
                    <Receipt size={12} className={shipment.taxPaid ? "text-emerald-500" : "text-rose-500"} />
                    <span className={cn("text-[10px] font-black uppercase font-display tabular-nums leading-none tracking-tight", shipment.taxPaid ? "text-emerald-600" : "text-rose-600")}>
                      {formatCurrency(shipment.taxAmount)}
                    </span>
                    <Calculator size={10} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                  
                  <div className="absolute bottom-full left-0 mb-2 w-56 bg-slate-950 text-white rounded-2xl p-3.5 shadow-2xl opacity-0 group-hover/tax:opacity-100 pointer-events-none transition-all z-20 border border-white/10">
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2 border-b border-white/5 pb-1.5">Divisão Pro-Rata de Taxas</p>
                    <div className="space-y-1.5">
                      {calculateTaxBreakdown(shipment).map(item => (
                        <div key={item.id} className="flex justify-between items-center text-[9px] gap-2">
                          <span className="font-bold truncate max-w-[110px] uppercase opacity-70 tracking-tight">{item.name}</span>
                          <span className="font-black text-emerald-400 font-display tabular-nums">{formatCurrency(item.tax)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => updateShipmentTax(shipment.id!, shipment.taxAmount, !shipment.taxPaid)}
                  className={cn(
                    "px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all",
                    shipment.taxPaid ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-rose-500 text-white hover:bg-rose-600"
                  )}
                >
                  {shipment.taxPaid ? 'PAGO' : 'PAGAR'}
                </button>
              </div>
            ) : (
              editingTaxId === shipment.id ? (
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5" onClick={e => e.stopPropagation()}>
                  <input 
                    autoFocus
                    type="text"
                    placeholder="0,00"
                    value={quickTaxAmount}
                    onChange={e => setQuickTaxAmount(e.target.value.replace(/[^0-9,]/g, ''))}
                    className="w-12 px-1 py-0.5 text-[10px] font-bold outline-none font-display"
                  />
                  <button 
                    onClick={() => {
                      const val = parseFloat(quickTaxAmount.replace(',', '.'));
                      if (!isNaN(val)) {
                        updateShipmentTax(shipment.id!, val, false);
                        setEditingTaxId(null);
                      }
                    }}
                    className="bg-indigo-600 text-white px-2 py-0.5 rounded-lg text-[8px] font-black uppercase hover:bg-indigo-700 transition-colors"
                  >
                    OK
                  </button>
                  <button onClick={() => setEditingTaxId(null)} className="text-slate-400 hover:text-slate-600"><X size={10} /></button>
                </div>
              ) : (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingTaxId(shipment.id!);
                    setQuickTaxAmount('');
                  }}
                  className="flex items-center gap-1 text-[9px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors border border-slate-200/60 hover:border-slate-300 px-2 py-1 rounded-xl bg-slate-50 hover:bg-slate-100"
                >
                  <Plus size={10} /> ADD TAXA
                </button>
              )
            )}
          </div>
          <button 
            onClick={() => sendNotification(shipment, shipment.status)}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 border border-slate-950 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:border-emerald-700 hover:scale-[1.03] active:scale-95 transition-all shadow-sm"
          >
            <MessageCircle size={10} /> NOTIFICAR
          </button>
        </div>
      </motion.div>
    );
  };

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
            type="button"
            onClick={() => setShowInsights(!showInsights)}
            className={cn(
              "font-bold py-3 px-5 rounded-xl transition-all border flex items-center gap-2 active:scale-95 shadow-sm text-xs cursor-pointer select-none",
              showInsights 
                ? "bg-slate-900 border-slate-950 text-white hover:bg-slate-800" 
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
            )}
          >
            <Sparkles size={15} className={cn("text-amber-500 transition-transform duration-300", showInsights ? "fill-amber-400 rotate-[15deg] scale-110" : "")} />
            <span>{showInsights ? 'Ocultar Insights' : 'Ver Insights'}</span>
          </button>

          <button 
            onClick={() => openModal()}
            className="bg-red-800 hover:bg-black text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md flex items-center gap-2 active:scale-95 shadow-red-900/20 text-xs"
          >
            <Plus size={16} /> Deploy Lote
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

      <AnimatePresence>
        {showInsights && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="overflow-hidden mt-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-1">
              {/* Card 1: Taxation index */}
              <div className="bg-white hover:border-slate-300 transition-all border border-slate-200 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none">Índice de Tributação</span>
                    <div className="size-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100/50">
                      <TrendingUp size={14} />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-2xl font-black text-slate-900 font-display tabular-nums leading-none">
                      {taxationRate}%
                    </p>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">taxado</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-semibold mt-2.5 leading-relaxed">
                    Média de <span className="font-bold text-slate-800">{formatCurrency(taxedCount > 0 ? (shippedShipments.filter(s => s.hasTax).reduce((acc, s) => acc + (s.taxAmount || 0), 0) / taxedCount) : 0)}</span> de tributo por lote fiscalizado.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[8px] font-black uppercase">
                  <span className="text-slate-400">Eficiência Fiscal</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-md tracking-wider font-extrabold",
                    taxationRate > 40 ? "bg-rose-50 text-rose-600 border border-rose-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                  )}>
                    {taxationRate > 40 ? 'ALTO ENCARGO' : 'SOB CONTROLE'}
                  </span>
                </div>
              </div>

              {/* Card 2: Transit Metrics */}
              <div className="bg-white hover:border-slate-300 transition-all border border-slate-200 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none">Tempo de Trânsito</span>
                    <div className="size-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100/50">
                      <Clock size={14} />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-2xl font-black text-slate-900 font-display tabular-nums leading-none">
                      {avgTransitTime ? `${avgTransitTime} dias` : 'S/ dados'}
                    </p>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">médio</span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-semibold mt-2.5 leading-relaxed">
                    Tempo médio decorrido desde o status <span className="font-bold text-slate-700">Postado</span> até a chegada registrada no <span className="font-bold text-slate-700">Entregue</span>.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[8px] font-black uppercase">
                  <span className="text-slate-400">Status da Linha</span>
                  <span className="text-[9px] font-extrabold text-slate-700 flex items-center gap-1">
                    Fluxo Ativo <Activity size={10} className="text-emerald-500 animate-pulse" />
                  </span>
                </div>
              </div>

              {/* Card 3: Top Suppliers */}
              <div className="bg-white hover:border-slate-300 transition-all border border-slate-200 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none">Fornecedor Líder</span>
                    <div className="size-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100/50">
                      <Package size={14} />
                    </div>
                  </div>
                  <p className="text-[11px] font-black text-slate-800 uppercase truncate leading-none mb-1 tracking-tight">
                    {topSupplierName}
                  </p>
                  <p className="text-[10px] text-slate-500 font-semibold mt-2.5 leading-relaxed">
                    Canal com maior volume de lotes ativos, dividindo operações entre Dropshipping e atacado local.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[8px] font-black uppercase">
                  <span className="text-slate-400">Operador dropshipping</span>
                  <span className="text-[8px] font-black bg-indigo-50/80 text-indigo-700 border border-indigo-100/50 px-1.5 py-0.5 rounded-md">
                    {dropshippingPercentage}% itens DS
                  </span>
                </div>
              </div>

              {/* Card 4: Bottleneck Alert */}
              <div className="bg-white hover:border-slate-300 transition-all border border-slate-200 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none">Retenção Aduaneira</span>
                    <div className={cn(
                      "size-8 rounded-xl flex items-center justify-center border",
                      fiscalizacaoAlerts.length > 0 
                        ? "bg-rose-50 border-rose-100 text-rose-600 animate-pulse" 
                        : "bg-emerald-50 border-emerald-100 text-emerald-600"
                    )}>
                      <AlertCircle size={14} />
                    </div>
                  </div>

                  {fiscalizacaoAlerts.length > 0 ? (
                    <div className="space-y-1 max-h-16 overflow-y-auto custom-scrollbar pr-1">
                      {fiscalizacaoAlerts.slice(0, 2).map(alert => (
                        <div key={alert.id} className="text-[10px] flex items-center justify-between font-bold bg-rose-50/40 p-1 px-2 rounded-lg border border-rose-100/30">
                          <span className="font-mono text-rose-700 tracking-tight select-all">{alert.trackingCode}</span>
                          <span className="text-[8px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded-md font-black">
                            {alert.days}d retido
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <p className="text-xl font-black text-emerald-600 font-display leading-none">Canal Verde</p>
                      <p className="text-[10px] text-slate-500 font-semibold mt-2 leading-relaxed">
                        Excelente! Nenhum pacote pendente de pagamento ou sob exame físico na fiscalização.
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[8px] font-black uppercase">
                  <span className="text-slate-400">Total Retido</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-md",
                    fiscalizacaoAlerts.length > 0 ? "bg-rose-500 text-white font-extrabold animate-pulse" : "bg-emerald-50 text-emerald-600"
                  )}>
                    {fiscalizacaoAlerts.length} LOTES
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filtros de Status */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 -mb-2 custom-scrollbar">
        <button
          onClick={() => setStatusFilter('all')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all border flex items-center gap-2 cursor-pointer",
            statusFilter === 'all' 
              ? getSelectedTabStyle('all')
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
          )}
        >
          <span>Todos</span>
          <span className={cn(
            "px-1.5 py-0.5 rounded-md text-[9px] font-black",
            statusFilter === 'all' ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
          )}>
            {shipments.length}
          </span>
        </button>
        {SHIPMENT_STATUSES.map(st => {
          const count = shipments.filter(s => s.status === st).length;
          const isSelected = statusFilter === st;
          const config = getStatusConfig(st);
          return (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={cn(
                "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all border flex items-center gap-2 cursor-pointer",
                isSelected 
                  ? getSelectedTabStyle(st)
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 text-slate-700"
              )}
            >
              <span className={cn("size-1.5 rounded-full", isSelected ? "bg-white" : config.dot)} />
              <span>{st}</span>
              <span className={cn(
                "px-1.5 py-0.5 rounded-md text-[9px] font-black",
                isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {statusFilter === 'all' ? (
        <div className="space-y-6">
          {/* Main Grid: Only In Transit/Pending */}
          {inTransitFiltered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {inTransitFiltered.map(shipment => renderShipmentCard(shipment))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 bg-white/40 backdrop-blur-md rounded-3xl border border-white/60 shadow-inner text-center">
              <CheckCircle2 size={36} className="text-emerald-500 mb-3" />
              <p className="text-sm font-black text-slate-800 uppercase tracking-wider">Tudo em dia!</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">Nenhuma encomenda nova está em processamento ou em trânsito no momento.</p>
            </div>
          )}

          {/* Hidden/Collapsed Delivered Section */}
          {deliveredFiltered.length > 0 && (
            <div className="mt-8 pt-6 border-t border-dashed border-slate-200">
              <button
                type="button"
                onClick={() => setShowDeliveredSection(!showDeliveredSection)}
                className="w-full flex items-center justify-between p-4 bg-white/60 hover:bg-slate-50 border border-slate-200/50 hover:border-slate-300 rounded-2xl shadow-sm transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-3 text-slate-700">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase text-slate-800 tracking-wider">
                      Encomendas Entregues ({deliveredFiltered.length})
                    </p>
                    <p className="text-[9px] text-slate-400 font-medium leading-none mt-0.5">
                      Arquivadas e ocultas para visualização limpa por padrão
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600">
                    {showDeliveredSection ? "Ocultar" : "Mostrar"}
                  </span>
                  <motion.div
                    animate={{ rotate: showDeliveredSection ? 90 : 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <ChevronRight size={16} className="text-slate-400 group-hover:text-slate-600" />
                  </motion.div>
                </div>
              </button>

              <AnimatePresence>
                {showDeliveredSection && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                      {deliveredFiltered.map(shipment => renderShipmentCard(shipment))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      ) : (
        /* Explicit status filter grid */
        filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(shipment => renderShipmentCard(shipment))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 bg-white/40 backdrop-blur-md rounded-3xl border border-white/60 shadow-inner text-center">
            <AlertCircle size={36} className="text-slate-400 mb-3" />
            <p className="text-sm font-black text-slate-800 uppercase tracking-wider">Nenhum resultado</p>
            <p className="text-xs text-slate-500 mt-1">Nenhuma encomenda encontrada com o status selecionado ou filtro de busca atual.</p>
          </div>
        )
      )}

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
                                  <p className="text-[9px] text-slate-400 font-bold uppercase">{cleanVariationName(item.variationName) || 'Sem variação'}</p>
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

                {editingShipment && (
                  <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200/60 rounded-2xl">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={sendWhatsAppOnSave} 
                        onChange={e => setSendWhatsAppOnSave(e.target.checked)} 
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase text-slate-800 tracking-wider">Notificar por WhatsApp ao salvar</p>
                      <p className="text-[9px] text-slate-400 font-medium leading-none mt-0.5">Se o status for alterado, o WhatsApp abrirá automaticamente para notificar.</p>
                    </div>
                  </div>
                )}

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

      {/* Floating non-blocking WhatsApp notification prompt */}
      <AnimatePresence>
        {pendingWhatsAppNotify && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-[100] max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-5 select-none font-sans overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <div className="flex items-start gap-4">
              <div className="size-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-sm border border-emerald-100">
                <MessageCircle size={20} className="fill-emerald-600/10" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-sans font-bold text-slate-900 text-xs uppercase tracking-wider">Notificar WhatsApp?</h4>
                  <button 
                    onClick={() => setPendingWhatsAppNotify(null)} 
                    className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-1 leading-normal">
                  Deseja avisar os clientes sobre o novo status: <span className="font-bold text-slate-800 uppercase tracking-tight">{pendingWhatsAppNotify.newStatus}</span> da encomenda <span className="font-mono font-bold text-slate-800">{pendingWhatsAppNotify.shipment.trackingCode}</span>?
                </p>
                <div className="flex items-center gap-2 mt-4 pt-1">
                  <button
                    onClick={() => {
                      sendNotification(pendingWhatsAppNotify.shipment, pendingWhatsAppNotify.newStatus as any);
                      setPendingWhatsAppNotify(null);
                    }}
                    className="flex-1 bg-slate-950 hover:bg-emerald-600 text-white font-black text-[9px] uppercase tracking-widest px-3 py-2 rounded-xl border border-slate-950 hover:border-emerald-700 transition-all text-center flex items-center justify-center gap-1.5 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                  >
                    <MessageCircle size={10} /> Enviar
                  </button>
                  <button
                    onClick={() => setPendingWhatsAppNotify(null)}
                    className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 font-bold text-[9px] uppercase tracking-widest px-3 py-2 rounded-xl transition-all text-center border border-slate-200/50"
                  >
                    Dispensar
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
