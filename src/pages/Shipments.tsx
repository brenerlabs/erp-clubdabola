import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp, orderBy, writeBatch } from 'firebase/firestore';
import { Shipment, ShipmentItem, Customer, Product, Sale, SaleItem } from '../types';
import { 
  Package, Search, Plus, Trash2, Edit2, Truck, 
  CheckCircle2, Clock, AlertCircle, MapPin, 
  MessageCircle, DollarSign, X, Receipt,
  ChevronRight, ArrowRight, ShoppingBag, Box, History, CheckSquare, Square, Calculator,
  Sparkles, TrendingUp, Activity, Plane, Globe, RefreshCw
} from 'lucide-react';
import { formatCurrency, cn, cleanVariationName, cleanProductNameWithVariation, formatVariationWithGender, formatProductNameWithGender } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const SHIPMENT_STATUSES = [
  'Processando',
  'Postado',
  'Em Trânsito',
  'Chegou no Brasil',
  'Fiscalização',
  'Em trânsito para o destino final',
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
    case 'Chegou no Brasil':
      return {
        bg: 'bg-emerald-50 border-emerald-100',
        text: 'text-emerald-700 font-extrabold',
        border: 'border-emerald-200',
        badge: 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100/70',
        iconBg: 'bg-emerald-100 text-emerald-600',
        dot: 'bg-emerald-600'
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
    case 'Em trânsito para o destino final':
      return {
        bg: 'bg-indigo-50 border-indigo-100',
        text: 'text-indigo-700 font-extrabold',
        border: 'border-indigo-200',
        badge: 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100/70',
        iconBg: 'bg-indigo-100 text-indigo-600',
        dot: 'bg-indigo-600'
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
    case 'Em Trânsito': return <Plane size={size} />;
    case 'Chegou no Brasil': return <Globe size={size} />;
    case 'Fiscalização': return <AlertCircle size={size} />;
    case 'Em trânsito para o destino final': return <Truck size={size} />;
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
    case 'Chegou no Brasil': return 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-500/10';
    case 'Fiscalização': return 'bg-rose-600 text-white border-rose-600 shadow-sm shadow-rose-600/10 animate-pulse';
    case 'Em trânsito para o destino final': return 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/10';
    case 'Recebido': return 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-500/10';
    case 'Entregue': return 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/10';
    default: return 'bg-red-800 text-white border-red-800 shadow-sm';
  }
};

const mapCorreiosEventToERPStatus = (statusText: string, localText = ''): Shipment['status'] => {
  const norm = statusText.toLowerCase();
  const normLocal = localText.toLowerCase();
  
  if (norm.includes('entregue') || norm.includes('objeto entregue')) {
    return 'Entregue';
  }
  if (
    norm.includes('objeto disponível para retirada') || 
    norm.includes('aguardando retirada') || 
    norm.includes('endereço indicado') || 
    (normLocal.includes('unidade de distribuição') && norm.includes('retirada'))
  ) {
    return 'Recebido';
  }
  if (
    norm.includes('fiscalização') || 
    norm.includes('taxa') || 
    norm.includes('aduaneira') || 
    norm.includes('retido') || 
    norm.includes('tributado') || 
    norm.includes('pagamento') ||
    norm.includes('aguardando pagamento')
  ) {
    return 'Fiscalização';
  }
  if (
    norm.includes('recebido no brasil') || 
    norm.includes('unidade de tratamento internacional - recebido') || 
    norm.includes('chegou no brasil') ||
    ((norm.includes('conferido') || norm.includes('recebido')) && normLocal.includes('internacional'))
  ) {
    return 'Chegou no Brasil';
  }
  if (
    norm.includes('unidade de distribuição') && 
    (norm.includes('trânsito') || norm.includes('encaminhado') || norm.includes('saída para entrega'))
  ) {
    return 'Em trânsito para o destino final';
  }
  if (
    norm.includes('trânsito') || 
    norm.includes('encaminhado') || 
    norm.includes('objeto encaminhado')
  ) {
    return 'Em Trânsito';
  }
  if (
    norm.includes('postado') || 
    norm.includes('objeto postado') || 
    norm.includes('postagem')
  ) {
    return 'Postado';
  }
  return 'Processando';
};

const generateSimulatedEvents = (trackingCode: string, targetStatus: Shipment['status']): any[] => {
  const now = new Date();
  
  const formatDateStr = (d: Date) => d.toLocaleDateString('pt-BR');
  
  // Gera um seed numérico determinístico baseado no código de rastreio
  let seed = 0;
  const uppercaseCode = (trackingCode || 'AA123456789BR').toUpperCase().trim();
  for (let i = 0; i < uppercaseCode.length; i++) {
    seed = uppercaseCode.charCodeAt(i) + ((seed << 5) - seed);
  }
  seed = Math.abs(seed);

  // Helpers para geração de dados determinísticos
  const getRandInt = (max: number, offset = 0) => {
    return ((seed + offset) % max);
  };

  const getRandElement = <T,>(arr: T[], offset = 0): T => {
    return arr[getRandInt(arr.length, offset)];
  };

  const padZero = (n: number) => n.toString().padStart(2, '0');

  // Geração de horários distintos e realistas para cada evento
  const timeEvent1 = `${padZero(8 + getRandInt(4, 11))}:${padZero(getRandInt(60, 22))}`;
  const timeEvent2 = `${padZero(13 + getRandInt(5, 33))}:${padZero(getRandInt(60, 44))}`;
  const timeEvent3 = `${padZero(9 + getRandInt(4, 55))}:${padZero(getRandInt(60, 66))}`;
  const timeEvent4 = `${padZero(11 + getRandInt(3, 77))}:${padZero(getRandInt(60, 88))}`;
  const timeEvent5 = `${padZero(14 + getRandInt(4, 99))}:${padZero(getRandInt(60, 10))}`;
  const timeEvent6 = `${padZero(10 + getRandInt(3, 111))}:${padZero(getRandInt(60, 122))}`;
  const timeEvent7 = `${padZero(15 + getRandInt(3, 133))}:${padZero(getRandInt(60, 144))}`;

  // Variação de hubs asiáticos e aduaneiros nacionais de forma dinâmica
  const originHubs = [
    "Agência dos Correios - Shenzhen / CN",
    "Centro Internacional de Triagem - Shenzhen / CN",
    "Unidade de Postagem Internacional - Hong Kong / HK",
    "Centro Logístico de Shenzhen - Futian / CN",
    "Centro de Triagem Logística - Guangzhou / CN"
  ];
  const originHub = getRandElement(originHubs, 100);

  const exportHubs = [
    "Centro Logístico de Exportação - Shenzhen / CN",
    "Centro de Distribuição de Exportação - Guangzhou / CN",
    "Terminais de Cargas Aéreas - Hong Kong / HK",
    "Unidade de Tratamento de Exportação - Dongguan / CN",
    "Aeroporto de Guangzhou - Guangzhou / CN"
  ];
  const exportHub = getRandElement(exportHubs, 200);

  const importHubs = [
    "Unidade de Tratamento Internacional - Curitiba / PR",
    "Centro Logístico de Importação - Rio de Janeiro / RJ",
    "Unidade de Tratamento Aduaneiro - São Paulo / SP",
    "Centro Logístico Aduaneiro - Curitiba / PR"
  ];
  const importHub = getRandElement(importHubs, 300);

  const distributionUnits = [
    "Unidade de Tratamento - São Paulo / SP",
    "Unidade de Tratamento - Rio de Janeiro / RJ",
    "Unidade de Tratamento - Belo Horizonte / MG",
    "Unidade de Tratamento - Curitiba / PR",
    "Unidade de Tratamento - Porto Alegre / RS",
    "Unidade de Tratamento - Salvador / BA",
    "Unidade de Tratamento - Recife / PE",
    "Unidade de Tratamento - Fortaleza / CE"
  ];
  const distributionUnit = getRandElement(distributionUnits, 400);

  const localUnits = [
    "Unidade de Distribuição - São Paulo / SP",
    "Unidade de Distribuição - Rio de Janeiro / RJ",
    "Unidade de Distribuição - Belo Horizonte / MG",
    "Unidade de Distribuição - Curitiba / PR",
    "Unidade de Distribuição - Porto Alegre / RS",
    "Unidade de Distribuição - Brasília / DF",
    "Unidade de Distribuição - Salvador / BA",
    "Unidade de Distribuição - Recife / PE",
    "Unidade de Distribuição - Fortaleza / CE"
  ];
  const localUnit = getRandElement(localUnits, 500);

  // Pequena variação de dias para não coincidirem no mesmo dia
  const dateOffsetDays = getRandInt(3, 15) * 0.1; // 0.3 a 1.4 dias de variação

  const eventsList = [
    {
      data: formatDateStr(new Date(now.getTime() - (4 + dateOffsetDays) * 24 * 60 * 60 * 1000)),
      hora: timeEvent1,
      local: originHub,
      status: "Objeto postado pela importadora",
      subStatus: ["Origem: Centro de triagem internacional", "Destino: Unidade de Tratamento de Importação"]
    },
    {
      data: formatDateStr(new Date(now.getTime() - (3.5 + dateOffsetDays) * 24 * 60 * 60 * 1000)),
      hora: timeEvent2,
      local: exportHub,
      status: "Objeto encaminhado para o país de destino",
      subStatus: ["Origem: Aeroporto internacional", "Destino: " + importHub]
    },
    {
      data: formatDateStr(new Date(now.getTime() - (3 + dateOffsetDays) * 24 * 60 * 60 * 1000)),
      hora: timeEvent3,
      local: importHub,
      status: "Objeto recebido pelos Correios do Brasil",
      subStatus: ["Objeto recebido no centro de fiscalização aduaneira"]
    }
  ];

  if (targetStatus === 'Processando') {
    return [eventsList[0]];
  }
  if (targetStatus === 'Postado' || targetStatus === 'Em Trânsito') {
    return [eventsList[1], eventsList[0]];
  }

  eventsList.push({
    data: formatDateStr(new Date(now.getTime() - (2.5 + dateOffsetDays) * 24 * 60 * 60 * 1000)),
    hora: timeEvent4,
    local: importHub,
    status: "Recebido pelo Centro de Importação - Fiscalização Ativa",
    subStatus: ["Encaminhado para fiscalização aduaneira", "Acompanhe pela aba 'Minhas Importações'"]
  });

  if (targetStatus === 'Chegou no Brasil') {
    return [eventsList[3], eventsList[2], eventsList[1], eventsList[0]];
  }

  if (targetStatus === 'Fiscalização') {
    eventsList.push({
      data: formatDateStr(new Date(now.getTime() - (1.5 + dateOffsetDays) * 24 * 60 * 60 * 1000)),
      hora: timeEvent5,
      local: importHub,
      status: "Retido para fiscalização ou aguardando pagamento de tributo",
      subStatus: ["Objeto aguarda pagamento de tributos ou declaração de valor aduaneiro"]
    });
    return [eventsList[4], eventsList[3], eventsList[2], eventsList[1], eventsList[0]];
  }

  eventsList.push({
    data: formatDateStr(new Date(now.getTime() - (1 + dateOffsetDays) * 24 * 60 * 60 * 1000)),
    hora: timeEvent6,
    local: distributionUnit,
    status: "Objeto liberado da fiscalização ou em trânsito nacional",
    subStatus: ["Fiscalização concluída", "Encaminhado para o Centro de Distribuição Local"]
  });

  if (targetStatus === 'Em trânsito para o destino final') {
    return [eventsList[4], eventsList[3], eventsList[2], eventsList[1], eventsList[0]];
  }

  eventsList.push({
    data: formatDateStr(new Date(now.getTime() - (0.5 + dateOffsetDays) * 24 * 60 * 60 * 1000)),
    hora: timeEvent7,
    local: localUnit,
    status: "Objeto disponível para retirada",
    subStatus: ["Endereço indicado para retirada: Unidade de Distribuição Correios correspondente"]
  });

  if (targetStatus === 'Recebido') {
    return [eventsList[5], eventsList[4], eventsList[3], eventsList[2], eventsList[1], eventsList[0]];
  }

  eventsList.push({
    data: formatDateStr(now),
    hora: timeEvent7,
    local: localUnit,
    status: "Objeto entregue ao destinatário",
    subStatus: ["Entregue em mãos pelo Carteiro da Unidade", "Status Atual: Entregue com Sucesso!"]
  });

  return [eventsList[6], eventsList[5], eventsList[4], eventsList[3], eventsList[2], eventsList[1], eventsList[0]];
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
  const [expandedCardTab, setExpandedCardTab] = useState<'items' | 'history' | 'correios'>('items');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingSingle, setIsSyncingSingle] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'info' | 'error', message: string } | null>(null);
  const [editingTaxId, setEditingTaxId] = useState<string | null>(null);
  const [quickTaxAmount, setQuickTaxAmount] = useState('');
  const [showInsights, setShowInsights] = useState(true);
  const [isSupplierRankOpen, setIsSupplierRankOpen] = useState(false);
  const [showDeliveredSection, setShowDeliveredSection] = useState(false);
  const [activeStatusMenuId, setActiveStatusMenuId] = useState<string | null>(null);
  const [pendingWhatsAppNotify, setPendingWhatsAppNotify] = useState<{ shipment: Shipment, newStatus: string } | null>(null);
  const [notifyModalData, setNotifyModalData] = useState<{ shipment: Shipment, status: string } | null>(null);
  const [notifiedCustomers, setNotifiedCustomers] = useState<string[]>([]);

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

  // Supplier Autocomplete Suggestions state and memo calculations
  const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);

  const existingSuppliers = useMemo(() => {
    const names = new Set<string>();
    // Pre-seed with defaults mentioned in the prompt (always uppercase)
    names.add('LYLY');
    names.add('CHENG');
    
    // Add all unique supplier names present in existing shipments
    shipments.forEach(s => {
      if (s.supplierName && s.supplierName.trim()) {
        let name = s.supplierName.trim().toUpperCase();
        if (name === 'LILY' || name === 'LILÝ') {
          name = 'LYLY';
        }
        names.add(name);
      }
    });

    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [shipments]);

  const supplierSuggestions = useMemo(() => {
    const q = supplierName.trim().toUpperCase();
    if (!q) return [];
    return existingSuppliers.filter(sup => 
      sup.includes(q) && 
      sup !== supplierName.trim().toUpperCase()
    );
  }, [existingSuppliers, supplierName]);

  // Automated migration effect to correct existing shipments' supplier names in Firestore to use uppercase and normalize LILY -> LYLY, CHENG -> CHENG, and others to UPPERCASE.
  useEffect(() => {
    if (shipments.length === 0) return;

    const runSupplierMigration = async () => {
      try {
        for (const s of shipments) {
          if (!s.id) continue;
          const currentName = s.supplierName || '';
          if (!currentName.trim()) continue;

          let targetName = currentName.trim().toUpperCase();
          if (targetName === 'LILY' || targetName === 'LILÝ') {
            targetName = 'LYLY';
          }

          if (currentName !== targetName) {
            await updateDoc(doc(db, 'shipments', s.id), {
              supplierName: targetName
            });
          }
        }
      } catch (err) {
        console.error('Error during supplier name standardization migration:', err);
      }
    };

    runSupplierMigration();
  }, [shipments]);

  // Item selection from Sales
  const [selectedSaleId, setSelectedSaleId] = useState('');

  // Item selection from Products (direct buy for stock)
  const [addItemMode, setAddItemMode] = useState<'sale' | 'stock'>('sale');
  const [selectedStockProductId, setSelectedStockProductId] = useState('');
  const [selectedStockVariationId, setSelectedStockVariationId] = useState('');
  const [stockQuantity, setStockQuantity] = useState('1');
  const [stockPrice, setStockPrice] = useState('0');

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

  const syncActiveShipments = async (forceAllAll = false) => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback({ type: 'info', message: 'Iniciando sincronização inteligente de tracking...' });

    const activeShipments = shipments.filter(s => {
      const trackingRegex = /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/;
      const codeCleaned = (s.trackingCode || '').toUpperCase().trim();
      const isValidCode = trackingRegex.test(codeCleaned);
      const isNotDelivered = s.status !== 'Entregue';
      return isValidCode && (forceAllAll || isNotDelivered);
    });

    if (activeShipments.length === 0) {
      setIsSyncing(false);
      setSyncFeedback({ type: 'success', message: 'Nenhuma encomenda pendente para sincronizar!' });
      setTimeout(() => setSyncFeedback(null), 5000);
      return;
    }

    let successCount = 0;
    let updateCount = 0;
    let failedCount = 0;

    for (const ship of activeShipments) {
      try {
        const codeCleaned = (ship.trackingCode || '').toUpperCase().trim();
        const urlCmd = `https://brasilapi.com.br/api/correios/v1/${codeCleaned}`;
        const response = await fetch(urlCmd);
        if (response.ok) {
          const data = await response.json();
          const eventos = data.eventos || [];
          if (eventos.length > 0) {
            successCount++;
            const latestEvent = eventos[0];
            const apiStatusText = latestEvent.status || latestEvent.descricao || '';
            const apiLocalText = latestEvent.local || latestEvent.unidade || '';
            
            const mappedStatus = mapCorreiosEventToERPStatus(apiStatusText, apiLocalText);
            const oldStatus = ship.status;
            
            const docRef = doc(db, 'shipments', ship.id!);
            const updatePayload: any = {
              correiosHistory: eventos,
              lastSyncedAt: new Date().toISOString()
            };

            if (mappedStatus !== oldStatus) {
              updateCount++;
              updatePayload.status = mappedStatus;
              
              const newHistory = [...(ship.history || [])];
              newHistory.push({
                status: mappedStatus,
                updatedAt: new Date(),
                notes: `Sincronizado via Correios API: ${apiStatusText}`
              });
              updatePayload.history = newHistory;
              updatePayload.updatedAt = serverTimestamp();
            }

            await updateDoc(docRef, updatePayload);
          }
        } else {
          failedCount++;
        }
      } catch (err) {
        console.error(`Erro ao sincronizar ${ship.trackingCode}:`, err);
        failedCount++;
      }
    }

    setIsSyncing(false);
    if (updateCount > 0) {
      setSyncFeedback({ 
        type: 'success', 
        message: `Sincronização completa! ${successCount} códigos consultados, ${updateCount} encomendas atualizadas.` 
      });
    } else {
      setSyncFeedback({ 
        type: 'success', 
        message: 'Rastreamentos atualizados! Todos os status já estão sincronizados.' 
      });
    }
    setTimeout(() => setSyncFeedback(null), 5000);
  };

  const syncSingleShipment = async (ship: Shipment) => {
    if (isSyncingSingle) return;
    setIsSyncingSingle(ship.id!);

    try {
      const codeCleaned = (ship.trackingCode || '').toUpperCase().trim();
      const urlCmd = `https://brasilapi.com.br/api/correios/v1/${codeCleaned}`;
      const response = await fetch(urlCmd);
      if (response.ok) {
        const data = await response.json();
        const eventos = data.eventos || [];
        if (eventos.length > 0) {
          const latestEvent = eventos[0];
          const apiStatusText = latestEvent.status || latestEvent.descricao || '';
          const apiLocalText = latestEvent.local || latestEvent.unidade || '';
          
          const mappedStatus = mapCorreiosEventToERPStatus(apiStatusText, apiLocalText);
          const oldStatus = ship.status;
          
          const docRef = doc(db, 'shipments', ship.id!);
          const updatePayload: any = {
            correiosHistory: eventos,
            lastSyncedAt: new Date().toISOString()
          };

          if (mappedStatus !== oldStatus) {
            updatePayload.status = mappedStatus;
            const newHistory = [...(ship.history || [])];
            newHistory.push({
              status: mappedStatus,
              updatedAt: new Date(),
              notes: `Sincronizado via Correios: ${apiStatusText}`
            });
            updatePayload.history = newHistory;
            updatePayload.updatedAt = serverTimestamp();
          }

          await updateDoc(docRef, updatePayload);
          alert(`Sincronizado com sucesso! Novo status detectado: ${mappedStatus}`);
        } else {
          alert('Objeto encontrado na API, mas nenhum evento foi registrado ainda.');
        }
      } else if (response.status === 404) {
        alert('Código de rastreamento não encontrado nos Correios ou rastreio internacional recente não postado (demora até 72h).');
      } else {
        alert('Serviço dos Correios temporariamente indisponível. Tente novamente mais tarde.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao conectar com os servidores dos Correios.');
    } finally {
      setIsSyncingSingle(null);
    }
  };

  const simulateCorreiosTracking = async (ship: Shipment) => {
    if (confirm('Deseja iniciar a simulação de movimentos reais dos Correios para esta encomenda no ambiente de testes?')) {
      const codeCleaned = (ship.trackingCode || '').toUpperCase().trim();
      const simulated = generateSimulatedEvents(codeCleaned, ship.status);
      const docRef = doc(db, 'shipments', ship.id!);
      await updateDoc(docRef, {
        correiosHistory: simulated,
        lastSyncedAt: new Date().toISOString()
      });
    }
  };

  useEffect(() => {
    if (shipments.length > 0) {
      const timer = setTimeout(() => {
        syncActiveShipments(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [shipments.length > 0]);

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
    setAddItemMode('sale');
    setSelectedStockProductId('');
    setSelectedStockVariationId('');
    setStockQuantity('1');
    setStockPrice('0');
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
    [
      ...shipments
        .filter(s => s.id !== editingShipment?.id)
        .flatMap(s => s.items.filter(i => i.saleId).map(i => `${i.saleId}-${i.productId}-${i.variationId}`)),
      ...items.filter(i => i.saleId).map(i => `${i.saleId}-${i.productId}-${i.variationId}`)
    ]
  );

  const addSingleSaleItem = (sale: Sale, item: SaleItem) => {
    const pGender = item.gender || products.find(p => p.id === item.productId)?.gender || 'Ambos';
    const formattedVar = formatVariationWithGender(item.variationName, pGender);
    const pName = `${item.name}${formattedVar ? ` (${formattedVar})` : ''}`;
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
      isDropshipping: item.isDropshipping || false,
      gender: pGender,
      status: 'Pendente'
    }]);
  };

  const addSaleItems = (saleId: string) => {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;

    const currentItems = [...items];
    
    sale.items.forEach(item => {
      const itemKey = `${sale.id}-${item.productId}-${item.variationId}`;
      if (shippedItemKeys.has(itemKey)) return; 

      const pGender = item.gender || products.find(p => p.id === item.productId)?.gender || 'Ambos';
      const formattedVar = formatVariationWithGender(item.variationName, pGender);
      const pName = `${item.name}${formattedVar ? ` (${formattedVar})` : ''}`;
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
        isDropshipping: item.isDropshipping || false,
        gender: pGender,
        status: 'Pendente'
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

  const handleStockProductChange = (productId: string) => {
    setSelectedStockProductId(productId);
    const product = products.find(p => p.id === productId);
    if (product) {
      setStockPrice(String(product.costPrice));
      if (product.variations && product.variations.length > 0) {
        setSelectedStockVariationId(product.variations[0].id);
      } else {
        setSelectedStockVariationId('');
      }
    } else {
      setStockPrice('0');
      setSelectedStockVariationId('');
    }
  };

  const addStockItem = () => {
    if (!selectedStockProductId) return;
    const product = products.find(p => p.id === selectedStockProductId);
    if (!product) return;

    const variation = product.variations?.find(v => v.id === selectedStockVariationId);
    const variationName = variation ? `${variation.size}${variation.color ? ` / ${variation.color}` : ''}` : 'Única';
    
    const pGender = product.gender || 'Ambos';
    const formattedVar = formatVariationWithGender(variationName, pGender);
    const pName = `${product.name}${formattedVar ? ` (${formattedVar})` : ''}`;

    const newItem: ShipmentItem = {
      id: Math.random().toString(36).substr(2, 9),
      productId: product.id!,
      variationId: selectedStockVariationId,
      customerId: 'estoque',
      customerName: 'Estoque (Pronta Entrega)',
      productName: pName,
      quantity: Number(stockQuantity) || 1,
      price: Number(stockPrice) || 0,
      isDropshipping: false,
      gender: pGender,
      status: 'Pendente'
    };

    setItems(prev => [...prev, newItem]);
    
    // Clear variation and reset quantity to 1 for consecutive adds
    setSelectedStockVariationId('');
    setStockQuantity('1');
    setStockPrice('0');
    setSelectedStockProductId('');
  };

  const getCustomerWhatsAppMessage = (shipment: Shipment, customerId: string, newStatus: string) => {
    const customer = customers.find(c => c.id === customerId);
    const customerName = customer ? customer.name : 'campeão';
    const customerItems = shipment.items.filter(i => i.customerId === customerId);
    const itemsList = customerItems.map(i => {
      const itemGender = i.gender || products.find(p => p.id === i.productId)?.gender || 'Ambos';
      return `- ${i.quantity}x ${formatProductNameWithGender(i.productName, itemGender)}`;
    }).join('\n');

    let message = `Olá! Seu pedido no ERP Club da Bola foi atualizado.\n\n*Status:* ${newStatus}\n*Rastreio:* ${shipment.trackingCode}\n\n*Produtos:*\n${itemsList}\n\nAcompanhe seu pedido!`;

    if (newStatus === 'Recebido') {
      message = `Fala, *${customerName}*! Tudo bem? ⚽\n\nSua encomenda com o rastreio *${shipment.trackingCode}* foi recebida pela nossa equipe! 🎉\n\n📌 *PRODUTO(S) DISPONÍVEL PARA RETIRADA!*\n\n*Produtos:*\n${itemsList}\n\nEntre em contato para agendar ou venha retirar! Tamo junto! 🔥🤙`;
    } else if (newStatus === 'Entregue') {
      const historyEntry = shipment.history?.find(h => h.status === 'Entregue');
      let deliveryDateStr = '';
      if (historyEntry && historyEntry.updatedAt) {
        const d = historyEntry.updatedAt.seconds 
          ? new Date(historyEntry.updatedAt.seconds * 1000) 
          : (historyEntry.updatedAt instanceof Date ? historyEntry.updatedAt : new Date());
        deliveryDateStr = d.toLocaleDateString('pt-BR');
      } else {
        deliveryDateStr = new Date().toLocaleDateString('pt-BR');
      }
      message = `Fala, *${customerName}*! Tudo bem? ⚽\n\nVi aqui que sua encomenda com o rastreio *${shipment.trackingCode}* foi entregue em *${deliveryDateStr}*! Aposto que ficou daquele jeito! 🤩\n\nPoderia fortalecer nossa comunidade tirando uma foto irada vestindo a camisa para o nosso Mural de Clientes no site?\n\nPra te premiar, na sua próxima compra você ganha 10% de desconto ou Frete Grátis com o cupom: *DESCONTO10*. Que tal?\n\nForte abraço! Tamo junto! 🔥🤙`;
    } else if (newStatus === 'Postado') {
      message = `Fala, *${customerName}*! Excelente notícia! ⚽🚀\n\nSeu pedido foi postado nos Correios ou transportadora!\n\n*Status:* Postado\n*Código de Rastreio:* *${shipment.trackingCode}*\n\n*Produtos:*\n${itemsList}\n\nVocê já pode acompanhar o envio com o código acima. Tamo junto! 🔥🤙`;
    } else if (newStatus === 'Em Trânsito') {
      message = `Fala, *${customerName}*! Sua encomenda está a caminho! ⚽🚚\n\n*Status:* Em Trânsito\n*Rastreio:* *${shipment.trackingCode}*\n\n*Produtos:*\n${itemsList}\n\nSua entrega está se aproximando! Excelente semana e tamo junto! 🔥🤙`;
    } else if (newStatus === 'Chegou no Brasil') {
      message = `Fala, *${customerName}*! Excelente atualização de rastreio! 🇧🇷⚽\n\nSua encomenda com o rastreio *${shipment.trackingCode}* acabou de chegar no Brasil!\n\n*Status:* Chegou no Brasil 🇧🇷\n*Rastreio:* *${shipment.trackingCode}*\n\n*Produtos:*\n${itemsList}\n\nAgora o próximo passo é passar pela fiscalização aduaneira. Estamos acompanhando tudo prontamente! Tamo junto! 🔥🤙`;
    } else if (newStatus === 'Fiscalização') {
      message = `Olá, *${customerName}*. Temos uma atualização sobre o seu pedido. ⚽⚠️\n\n*Status:* Retido para Fiscalização\n*Rastreio:* *${shipment.trackingCode}*\n\n*Produtos:*\n${itemsList}\n\nNossa equipe já está acompanhando os trâmites fiscais da importação para liberação o quanto antes. Qualquer dúvida, estamos por aqui!`;
    } else if (newStatus === 'Em trânsito para o destino final') {
      message = `Fala, *${customerName}*! Novidades da logística! ⚽🚚💨\n\nSua encomenda foi liberada da fiscalização e já está em trânsito para o nosso centro de distribuição final!\n\n*Status:* Em trânsito para o destino final 🚀\n*Rastreio:* *${shipment.trackingCode}*\n\n*Produtos:*\n${itemsList}\n\nFalta muito pouco para a sua encomenda chegar. Assim que estiver em mãos, te avisamos! Tamo junto! 🔥🤙`;
    } else if (newStatus === 'Processando') {
      message = `Fala, *${customerName}*! Tudo pronto para iniciar! ⚽⏳\n\nSua encomenda entrou em processamento logístico na origem.\n\n*Status:* Processando\n*Rastreio:* *${shipment.trackingCode}*\n\n*Produtos:*\n${itemsList}\n\nAssim que houver novos movimentos, te informamos! Tamo junto! 🔥🤙`;
    }

    return message;
  };

  const sendNotification = (shipment: Shipment, newStatus: string) => {
    setNotifiedCustomers([]);
    setNotifyModalData({ shipment, status: newStatus });
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
        supplierName: (() => {
          let name = supplierName.trim().toUpperCase();
          if (name === 'LILY' || name === 'LILÝ') {
            return 'LYLY';
          }
          return name;
        })(),
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
    
    for (const id of selectedIds) {
      const s = shipments.find(sh => sh.id === id);
      if (s) {
        let autoStockProcessed = s.stockProcessed || false;
        const history = [...(s.history || [])];
        history.push({ 
          status: newStatus, 
          updatedAt: new Date(), 
          notes: `Ação em massa: ${newStatus}` 
        });

        const stockItems = s.items.filter(i => i.customerId === 'estoque');

        if ((newStatus === 'Recebido' || newStatus === 'Entregue') && !autoStockProcessed && stockItems.length > 0) {
          for (const item of stockItems) {
            if (!item.productId) continue;
            try {
              const prodRef = doc(db, 'products', item.productId);
              const prodSnap = await getDoc(prodRef);
              if (prodSnap.exists()) {
                const productData = { id: prodSnap.id, ...prodSnap.data() } as Product;
                const updatedVariations = (productData.variations || []).map(v => {
                  if (v.id === item.variationId) {
                    return { ...v, stock: (v.stock || 0) + item.quantity };
                  }
                  return v;
                });
                const totalStock = updatedVariations.reduce((acc, v) => acc + (v.stock || 0), 0);
                await updateDoc(prodRef, {
                  variations: updatedVariations,
                  totalStock,
                  updatedAt: serverTimestamp()
                });
              }
            } catch (err) {
              console.error("Erro ao atualizar bulk estoque:", err);
            }
          }
          autoStockProcessed = true;
          history.push({
            status: newStatus,
            updatedAt: new Date(),
            notes: `Estoque automático integrado em lote.`
          });
        }

        await updateDoc(doc(db, 'shipments', id), {
          status: newStatus,
          updatedAt: serverTimestamp(),
          history,
          stockProcessed: autoStockProcessed
        });
      }
    }
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

      let autoStockProcessed = shipment.stockProcessed || false;
      const stockItems = shipment.items.filter(i => i.customerId === 'estoque');

      if ((newStatus === 'Recebido' || newStatus === 'Entregue') && !autoStockProcessed && stockItems.length > 0) {
        for (const item of stockItems) {
          if (!item.productId) continue;
          try {
            const prodRef = doc(db, 'products', item.productId);
            const prodSnap = await getDoc(prodRef);
            if (prodSnap.exists()) {
              const productData = { id: prodSnap.id, ...prodSnap.data() } as Product;
              const updatedVariations = (productData.variations || []).map(v => {
                if (v.id === item.variationId) {
                  return { ...v, stock: (v.stock || 0) + item.quantity };
                }
                return v;
              });
              const totalStock = updatedVariations.reduce((acc, v) => acc + (v.stock || 0), 0);
              await updateDoc(prodRef, {
                variations: updatedVariations,
                totalStock: totalStock,
                updatedAt: serverTimestamp()
              });
            }
          } catch (itemErr) {
            console.error("Erro ao atualizar item de estoque individual:", itemErr);
          }
        }
        autoStockProcessed = true;
        history.push({
          status: newStatus,
          updatedAt: finalDate,
          notes: `Estoque automático integrado: ${stockItems.length} item(ns) inseridos no estoque real.`
        });
      }

      await updateDoc(doc(db, 'shipments', shipment.id!), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        history,
        stockProcessed: autoStockProcessed
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

  const updateItemStatus = async (shipmentId: string, itemId: string, nextStatus: 'Pendente' | 'Recebido' | 'Faturado') => {
    try {
      const shipment = shipments.find(s => s.id === shipmentId);
      if (!shipment) return;

      const updatedItems = shipment.items.map(i => {
        if (i.id === itemId) {
          return { ...i, status: nextStatus };
        }
        return i;
      });

      // Update the shipment status first! This guarantees swiftness and that the status change is saved immediately to Firestore
      await updateDoc(doc(db, 'shipments', shipmentId), {
        items: updatedItems,
        updatedAt: serverTimestamp()
      });

      // Safely process background side-effects inside individual isolated try-catch blocks
      const targetItem = shipment.items.find(i => i.id === itemId);
      if (targetItem) {
        const previousStatus = targetItem.status || 'Pendente';

        // 1. Replenishment stock automatic check
        if (targetItem.customerId === 'estoque' && nextStatus === 'Recebido' && previousStatus !== 'Recebido') {
          if (targetItem.productId && targetItem.productId.trim()) {
            try {
              const prodRef = doc(db, 'products', targetItem.productId);
              const prodSnap = await getDoc(prodRef);
              if (prodSnap.exists()) {
                const productData = { id: prodSnap.id, ...prodSnap.data() } as Product;
                const updatedVariations = (productData.variations || []).map(v => {
                  if (v.id === targetItem.variationId) {
                    return { ...v, stock: (v.stock || 0) + targetItem.quantity };
                  }
                  return v;
                });
                const totalStock = updatedVariations.reduce((acc, v) => acc + (v.stock || 0), 0);
                await updateDoc(prodRef, {
                  variations: updatedVariations,
                  totalStock,
                  updatedAt: serverTimestamp()
                });
              }
            } catch (err) {
              console.error("Erro background ao atualizar estoque de peca única:", targetItem.productId, err);
            }
          }
        }

        // 2. Automated purchase flow status update and transaction registering
        if (nextStatus === 'Faturado' && previousStatus !== 'Faturado') {
          try {
            const amount = targetItem.price * targetItem.quantity;
            if (amount > 0) {
              let pMethod: any = 'Dinheiro';
              
              if (targetItem.saleId && targetItem.saleId.trim()) {
                const saleRef = doc(db, 'sales', targetItem.saleId);
                const saleSnap = await getDoc(saleRef);
                if (saleSnap.exists()) {
                  const saleData = saleSnap.data() as Sale;
                  pMethod = saleData.paymentMethod || 'Dinheiro';
                  if (saleData.status === 'Pendente' || saleData.status === 'Pré-venda') {
                    await updateDoc(saleRef, {
                      status: 'Concluída',
                      updatedAt: serverTimestamp()
                    });
                  }
                }
              }

              await addDoc(collection(db, 'transactions'), {
                customerId: targetItem.customerId || 'Consumidor Final',
                amount: amount,
                type: 'payment',
                paymentMethod: pMethod === 'Fiado' ? 'Dinheiro' : pMethod,
                saleId: targetItem.saleId || null,
                createdAt: serverTimestamp()
              });
            }
          } catch (err) {
            console.error("Erro background faturamento automático da sale:", targetItem.saleId, err);
          }
        }
      }
    } catch (err) {
      console.error("Erro ao atualizar status do item correspondente:", err);
      handleFirestoreError(err, OperationType.WRITE, 'shipments');
    }
  };

  const updateCustomerGroupStatus = async (shipmentId: string, customerId: string, nextStatus: 'Pendente' | 'Recebido' | 'Faturado') => {
    try {
      const shipment = shipments.find(s => s.id === shipmentId);
      if (!shipment) return;

      const updatedItems = shipment.items.map(i => {
        if (i.customerId === customerId) {
          return { ...i, status: nextStatus };
        }
        return i;
      });

      // Update the shipment status first to make the front-end react immediately
      await updateDoc(doc(db, 'shipments', shipmentId), {
        items: updatedItems,
        updatedAt: serverTimestamp()
      });

      // Process side effects sequentially or asynchronously in a highly decoupled, non-blocking manner
      const customerItems = shipment.items.filter(i => i.customerId === customerId);
      for (const item of customerItems) {
        const previousStatus = item.status || 'Pendente';
        if (previousStatus === nextStatus) continue;

        // 1. Monitoramento de Estoque de reposição automático
        if (item.customerId === 'estoque' && nextStatus === 'Recebido') {
          if (item.productId && item.productId.trim()) {
            try {
              const prodRef = doc(db, 'products', item.productId);
              const prodSnap = await getDoc(prodRef);
              if (prodSnap.exists()) {
                const productData = { id: prodSnap.id, ...prodSnap.data() } as Product;
                const updatedVariations = (productData.variations || []).map(v => {
                  if (v.id === item.variationId) {
                    return { ...v, stock: (v.stock || 0) + item.quantity };
                  }
                  return v;
                });
                const totalStock = updatedVariations.reduce((acc, v) => acc + (v.stock || 0), 0);
                await updateDoc(prodRef, {
                  variations: updatedVariations,
                  totalStock,
                  updatedAt: serverTimestamp()
                });
              }
            } catch (err) {
              console.error("Erro ao atualizar estoque automático para lote:", item.productId, err);
            }
          }
        }

        // 2. Faturamento Automático da Sale integrada + Registro financeiro na Compensação
        if (nextStatus === 'Faturado') {
          try {
            const amount = item.price * item.quantity;
            if (amount > 0) {
              let pMethod: any = 'Dinheiro';
              
              if (item.saleId && item.saleId.trim()) {
                const saleRef = doc(db, 'sales', item.saleId);
                const saleSnap = await getDoc(saleRef);
                if (saleSnap.exists()) {
                  const saleData = saleSnap.data() as Sale;
                  pMethod = saleData.paymentMethod || 'Dinheiro';
                  if (saleData.status === 'Pendente' || saleData.status === 'Pré-venda') {
                    await updateDoc(saleRef, {
                      status: 'Concluída',
                      updatedAt: serverTimestamp()
                    });
                  }
                }
              }

              await addDoc(collection(db, 'transactions'), {
                customerId: item.customerId || 'Consumidor Final',
                amount: amount,
                type: 'payment',
                paymentMethod: pMethod === 'Fiado' ? 'Dinheiro' : pMethod,
                saleId: item.saleId || null,
                createdAt: serverTimestamp()
              });
            }
          } catch (err) {
            console.error("Erro ao faturamento automático para lote de sale:", item.saleId, err);
          }
        }
      }
    } catch (err) {
      console.error("Erro ao atualizar lote de status do cliente:", err);
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

  // --- SUPPLIER RANKING LOGIC (FEATURE 5) ---
  const supplierRankings = (() => {
    // Group shipments by supplier
    const groups: Record<string, typeof shipments> = {};
    shipments.forEach(s => {
      if (s.supplierName && s.supplierName.trim()) {
        const name = s.supplierName.trim().toUpperCase();
        if (!groups[name]) groups[name] = [];
        groups[name].push(s);
      }
    });

    return Object.entries(groups).map(([supplier, list]) => {
      const total = list.length;
      const shipped = list.filter(s => s.status !== 'Processando');
      const taxedList = shipped.filter(s => s.hasTax);
      const taxedCount = taxedList.length;
      const taxRate = shipped.length > 0 ? (taxedCount / shipped.length) * 100 : 0;

      const totalTaxPaid = taxedList.reduce((sum, s) => sum + (s.taxAmount || 0), 0);
      const avgTaxAmount = taxedCount > 0 ? totalTaxPaid / taxedCount : 0;

      let supplierTransitTotal = 0;
      let supplierDeliveredCount = 0;
      list.filter(s => s.status === 'Entregue').forEach(s => {
        if (s.history) {
          const postado = s.history.find(h => h.status === 'Postado');
          const entregue = s.history.find(h => h.status === 'Entregue');
          if (postado && entregue) {
            const postadoDate = postado.updatedAt?.seconds 
              ? new Date(postado.updatedAt.seconds * 1000) 
              : new Date(postado.updatedAt);
            const entregueDate = entregue.updatedAt?.seconds 
              ? new Date(entregue.updatedAt.seconds * 1000) 
              : new Date(entregue.updatedAt);
            
            const diff = entregueDate.getTime() - postadoDate.getTime();
            if (diff > 0) {
              supplierTransitTotal += diff / (1000 * 60 * 60 * 24);
              supplierDeliveredCount++;
            }
          }
        }
      });
      const avgTransit = supplierDeliveredCount > 0 ? supplierTransitTotal / supplierDeliveredCount : null;

      return {
        supplier,
        total,
        shipped: shipped.length,
        taxedCount,
        taxRate,
        totalTaxPaid,
        avgTaxAmount,
        avgTransit,
        allShipments: list
      };
    }).sort((a, b) => {
      // Prioritize suppliers with faster transit time, or if null, push to back
      if (a.avgTransit === null && b.avgTransit === null) return b.total - a.total;
      if (a.avgTransit === null) return 1;
      if (b.avgTransit === null) return -1;
      return a.avgTransit - b.avgTransit;
    });
  })();

  // --- INTER-SEGMENT LOGISTICS TRANSIT TIMES (INSIGHTS) ---
  let phase1Days = 0;
  let phase1Count = 0;
  let phase2Days = 0;
  let phase2Count = 0;
  let phase3Days = 0;
  let phase3Count = 0;

  shipments.forEach(s => {
    if (s.history && Array.isArray(s.history)) {
      const getLogDate = (statusToFind: string) => {
        const item = s.history!.find(h => h.status === statusToFind);
        if (!item || !item.updatedAt) return null;
        return item.updatedAt.seconds 
          ? new Date(item.updatedAt.seconds * 1000) 
          : (item.updatedAt instanceof Date ? item.updatedAt : new Date(item.updatedAt));
      };

      const postado = getLogDate('Postado') || getLogDate('Em Trânsito');
      const brasil = getLogDate('Chegou no Brasil');
      const libTransit = getLogDate('Em trânsito para o destino final') || getLogDate('Fiscalização');
      const entregue = getLogDate('Entregue') || getLogDate('Recebido');

      // 1. Postado -> Chegou no Brasil (Fase Internacional)
      if (postado && brasil) {
        const diff = brasil.getTime() - postado.getTime();
        if (diff > 0) {
          phase1Days += diff / (1000 * 60 * 60 * 24);
          phase1Count++;
        }
      }

      // 2. Chegou no Brasil -> Desembaraço (Fase Aduaneira)
      if (brasil) {
        const aduanaFim = libTransit || entregue;
        if (aduanaFim) {
          const diff = aduanaFim.getTime() - brasil.getTime();
          if (diff > 0) {
            phase2Days += diff / (1000 * 60 * 60 * 24);
            phase2Count++;
          }
        }
      }

      // 3. Destino Final -> Entregue (Última Milha Nacional)
      const destinoOrigem = getLogDate('Em trânsito para o destino final') || getLogDate('Fiscalização');
      if (destinoOrigem && entregue) {
        const diff = entregue.getTime() - destinoOrigem.getTime();
        if (diff > 0) {
          phase3Days += diff / (1000 * 60 * 60 * 24);
          phase3Count++;
        }
      }
    }
  });

  const avgIntlDays = phase1Count > 0 ? (phase1Days / phase1Count).toFixed(1) : null;
  const avgAduanaDays = phase2Count > 0 ? (phase2Days / phase2Count).toFixed(1) : null;
  const avgDestinoDays = phase3Count > 0 ? (phase3Days / phase3Count).toFixed(1) : null;

  // Track counts in each phase of funnel
  const pipelineCounts = {
    processando: shipments.filter(s => s.status === 'Processando').length,
    postado: shipments.filter(s => s.status === 'Postado' || s.status === 'Em Trânsito').length,
    brasil: shipments.filter(s => s.status === 'Chegou no Brasil').length,
    customs: shipments.filter(s => s.status === 'Fiscalização').length,
    destino: shipments.filter(s => s.status === 'Em trânsito para o destino final').length,
    recebido: shipments.filter(s => s.status === 'Recebido').length,
    entregue: shipments.filter(s => s.status === 'Entregue').length,
  };

  // Detect stuck shipments that require attention
  const stuckShipments = shipments.filter(s => {
    if (s.status === 'Recebido' || s.status === 'Entregue') return false;
    
    // Get last state updatedAt date
    const lastUpdate = s.updatedAt?.seconds 
      ? new Date(s.updatedAt.seconds * 1000) 
      : (s.updatedAt ? new Date(s.updatedAt) : new Date());
    
    const diffTime = new Date().getTime() - lastUpdate.getTime();
    const daysInState = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

    if (s.status === 'Processando' && daysInState > 4) return true;
    if ((s.status === 'Postado' || s.status === 'Em Trânsito') && daysInState > 12) return true;
    if (s.status === 'Chegou no Brasil' && daysInState > 6) return true;
    if (s.status === 'Fiscalização' && daysInState > 5) return true;
    if (s.status === 'Em trânsito para o destino final' && daysInState > 5) return true;

    return false;
  }).map(s => {
    const lastUpdate = s.updatedAt?.seconds 
      ? new Date(s.updatedAt.seconds * 1000) 
      : (s.updatedAt ? new Date(s.updatedAt) : new Date());
    const days = Math.max(0, Math.floor((new Date().getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24)));
    return {
      id: s.id,
      trackingCode: s.trackingCode,
      status: s.status,
      daysInState: days
    };
  });

  const getShipmentDuration = (ship: Shipment) => {
    const getStartDate = (s: Shipment) => {
      if (s.createdAt) {
        return s.createdAt.seconds 
          ? new Date(s.createdAt.seconds * 1000) 
          : new Date(s.createdAt);
      }
      if (s.history && s.history.length > 0) {
        const oldest = s.history[0];
        return oldest.updatedAt?.seconds 
          ? new Date(oldest.updatedAt.seconds * 1000) 
          : new Date(oldest.updatedAt);
      }
      return null;
    };

    const start = getStartDate(ship);
    if (!start) return { days: 0, formatted: '0 dias' };

    let end = new Date();
    if (ship.status === 'Entregue') {
      const entregueLog = ship.history?.find(h => h.status === 'Entregue');
      if (entregueLog && entregueLog.updatedAt) {
        end = entregueLog.updatedAt.seconds 
          ? new Date(entregueLog.updatedAt.seconds * 1000) 
          : new Date(entregueLog.updatedAt);
      } else if (ship.updatedAt) {
        end = ship.updatedAt.seconds 
          ? new Date(ship.updatedAt.seconds * 1000) 
          : new Date(ship.updatedAt);
      }
    }

    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    return {
      days: diffDays,
      formatted: diffDays === 1 ? '1 dia' : `${diffDays} dias`
    };
  };

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

                <span className="text-[9px] font-bold text-slate-400 uppercase bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5 select-none font-mono">
                  {getShipmentDuration(shipment).formatted}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
            <button 
              onClick={() => {
                if (showTimelineId === shipment.id) {
                  setShowTimelineId(null);
                } else {
                  setShowTimelineId(shipment.id!);
                  setExpandedCardTab('correios');
                }
              }} 
              title="Histórico"
              className={cn(
                "p-1.5 hover:bg-slate-100 rounded-lg transition-colors",
                showTimelineId === shipment.id ? "text-yellow-500 bg-yellow-50 hover:bg-yellow-100" : "text-slate-400 hover:text-slate-800"
              )}
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
          {shipment.status === 'Recebido' && (
            <div className="p-2 bg-emerald-50 border border-emerald-100/50 rounded-xl flex items-center gap-1.5 text-emerald-800 text-[10px] font-bold uppercase select-none">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span>Disponível para Retirada</span>
            </div>
          )}

          {shipment.status === 'Entregue' && (() => {
            const historyEntry = shipment.history?.find(h => h.status === 'Entregue');
            let deliveryDateStr = '';
            if (historyEntry && historyEntry.updatedAt) {
              const d = historyEntry.updatedAt.seconds 
                ? new Date(historyEntry.updatedAt.seconds * 1000) 
                : (historyEntry.updatedAt instanceof Date ? historyEntry.updatedAt : new Date());
              deliveryDateStr = d.toLocaleDateString('pt-BR');
            } else {
              const dateObj = shipment.updatedAt?.seconds 
                ? new Date(shipment.updatedAt.seconds * 1000) 
                : (shipment.updatedAt ? new Date(shipment.updatedAt) : new Date());
              deliveryDateStr = dateObj.toLocaleDateString('pt-BR');
            }
            return (
              <div className="p-2 bg-indigo-50/50 border border-indigo-100/40 rounded-xl flex items-center justify-between px-2.5 text-indigo-800 text-[10px] font-bold uppercase select-none">
                <span>Entregue em:</span>
                <span className="font-extrabold">{deliveryDateStr}</span>
              </div>
            );
          })()}


          <AnimatePresence mode="wait">
            {showTimelineId === shipment.id ? (
              <motion.div 
                key="expanded-card-tabs"
                initial={{ opacity: 0, scale: 0.98 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-3 pt-1"
              >
                {/* Visual tabs switcher */}
                <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/50 select-none">
                  <button
                    type="button"
                    onClick={() => setExpandedCardTab('items')}
                    className={cn(
                      "flex-1 py-1.5 text-[8.5px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                      expandedCardTab === 'items' 
                        ? "bg-white text-slate-800 shadow-sm" 
                        : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    👥 Clientes
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedCardTab('correios')}
                    className={cn(
                      "flex-1 py-1.5 text-[8.5px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer",
                      expandedCardTab === 'correios' 
                        ? "bg-yellow-400 text-blue-900 shadow-sm" 
                        : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    💛 Correios
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedCardTab('history')}
                    className={cn(
                      "flex-1 py-1.5 text-[8.5px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                      expandedCardTab === 'history' 
                        ? "bg-white text-slate-800 shadow-sm" 
                        : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    📝 Logs ERP
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {expandedCardTab === 'items' && (
                    <motion.div 
                      key="items-tab"
                      initial={{ opacity: 0, y: 2 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      exit={{ opacity: 0, y: -2 }}
                      className="space-y-2"
                    >
                      <div className="flex justify-between items-center border-b border-slate-100 pb-1">
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
                          
                          const firstStatus = customerItems[0]?.status || 'Pendente';
                          const allSameStatus = customerItems.every(i => (i.status || 'Pendente') === firstStatus);
                          const currentGroupStatus = allSameStatus ? firstStatus : '';

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
                                <div className="flex items-center gap-1.5 ml-2 shrink-0 select-none" onClick={e => e.stopPropagation()}>
                                  <span className="text-[8px] font-black text-slate-500 mr-1 uppercase">Lote:</span>
                                  <select
                                    value={currentGroupStatus}
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        updateCustomerGroupStatus(shipment.id!, customerId, e.target.value as any);
                                      }
                                    }}
                                    className="text-[8.5px] font-black bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded-lg cursor-pointer outline-none"
                                  >
                                    <option value="" disabled>Alterar...</option>
                                    <option value="Pendente">⏳ Pendente</option>
                                    <option value="Recebido">✓ Recebido</option>
                                    <option value="Faturado">💳 Faturado</option>
                                  </select>
                                  <span className="text-[8px] font-black text-red-800 bg-red-100/80 px-1.5 py-0.5 rounded-lg ml-1">
                                    {customerItems.length} {customerItems.length === 1 ? 'Item' : 'Itens'}
                                  </span>
                                </div>
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
                                      <div key={item.id} className="p-1.5 px-2.5 border-b border-slate-50 last:border-0 flex justify-between items-center text-[9px] hover:bg-slate-50/50 transition-colors">
                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                          <span className="text-slate-600 font-bold uppercase truncate tracking-tight">{formatProductNameWithGender(item.productName, item.gender || products.find(p => p.id === item.productId)?.gender)}</span>
                                          {item.isDropshipping && (
                                            <span className="text-[6px] font-black bg-amber-500 text-white px-1 rounded italic leading-none">DS</span>
                                          )}
                                          {customerId === 'estoque' && (
                                            <span className={cn(
                                              "text-[7px] font-black px-1.5 py-0.5 rounded leading-none shrink-0 uppercase tracking-wider border",
                                              shipment.stockProcessed 
                                                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                                : "bg-amber-50 text-amber-700 border-amber-200"
                                            )}>
                                              {shipment.stockProcessed ? '✓ No Estoque' : '⏳ Aguardando'}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 ml-2 shrink-0" onClick={e => e.stopPropagation()}>
                                          <span className="font-extrabold text-slate-900 border-r border-slate-200/60 pr-2 font-mono">x{item.quantity}</span>
                                          <select
                                            value={item.status || 'Pendente'}
                                            onChange={(e) => updateItemStatus(shipment.id!, item.id, e.target.value as any)}
                                            className={cn(
                                              "text-[9px] font-black px-1.5 py-0.5 rounded-lg border outline-none cursor-pointer transition-all pr-4 relative appearance-none bg-no-repeat bg-[right_4px_center] bg-[length:6px] select-none",
                                              (item.status || 'Pendente') === 'Pendente' && "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
                                              (item.status || 'Pendente') === 'Recebido' && "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
                                              (item.status || 'Pendente') === 'Faturado' && "bg-sky-50 text-sky-700 border-sky-305 hover:bg-sky-100"
                                            )}
                                            style={{
                                              backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23334155' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
                                            }}
                                          >
                                            <option value="Pendente">⏳ PEN</option>
                                            <option value="Recebido">✓ REC</option>
                                            <option value="Faturado">💳 FAT</option>
                                          </select>
                                        </div>
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

                  {expandedCardTab === 'history' && (
                    <motion.div 
                      key="history-tab"
                      initial={{ opacity: 0, y: 2 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      exit={{ opacity: 0, y: -2 }}
                      className="space-y-2"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                        <p className="text-[9px] font-black uppercase text-red-800 tracking-widest">Log de Auditoria</p>
                        <span className="text-[8px] font-bold text-slate-400 uppercase">Interno ERP</span>
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
                              {h.notes && <p className="text-[9px] text-slate-500 font-medium mt-0.5 leading-normal">{h.notes}</p>}
                              <p className="text-[8px] text-slate-400 font-bold mt-1 select-none">
                                {new Date(h.updatedAt?.seconds * 1000 || h.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {expandedCardTab === 'correios' && (
                    <motion.div 
                      key="correios-tab"
                      initial={{ opacity: 0, y: 2 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      exit={{ opacity: 0, y: -2 }}
                      className="space-y-2 pt-0.5"
                    >
                      <div className="flex items-center justify-between border-b border-amber-200 pb-1">
                        <span className="text-[8.5px] bg-yellow-400 text-blue-900 px-1.5 py-0.5 rounded border border-yellow-500 font-extrabold uppercase tracking-wider flex items-center gap-1 select-none">
                          💛 Rastreio Oficial Correios
                        </span>
                        <button
                          type="button"
                          onClick={() => syncSingleShipment(shipment)}
                          disabled={isSyncingSingle === shipment.id}
                          className="text-[8px] font-black uppercase bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded transition-all flex items-center gap-1 border border-slate-300/40 cursor-pointer"
                        >
                          <RefreshCw size={8} className={cn("text-red-800", isSyncingSingle === shipment.id ? "animate-spin" : "")} />
                          {isSyncingSingle === shipment.id ? 'Sincronizando...' : 'Consultar API'}
                        </button>
                      </div>

                      {shipment.correiosHistory && shipment.correiosHistory.length > 0 ? (
                        <div className="space-y-3 pl-3.5 border-l border-amber-400/50 h-[118px] overflow-y-auto custom-scrollbar pt-1 pr-1">
                          {shipment.correiosHistory.map((evt: any, i: number) => (
                            <div key={i} className="relative pl-3.5 pb-1 select-text">
                              <div className="absolute -left-[19.5px] top-1.5 size-2 rounded-full border border-yellow-400 bg-blue-600 shadow-sm" />
                              <div className="space-y-0.5">
                                <p className="text-[9.5px] font-extrabold text-slate-900 leading-tight uppercase tracking-tight">
                                  {evt.status || evt.descricao}
                                </p>
                                {evt.local && (
                                  <p className="text-[8px] text-slate-500 font-bold uppercase flex items-center gap-1">
                                    📍 {evt.local || evt.unidade}
                                  </p>
                                )}
                                {evt.subStatus && evt.subStatus.length > 0 && (
                                  <div className="text-[8px] text-slate-400 font-medium italic space-y-0.5 mt-0.5 pl-1.5 border-l border-slate-200">
                                    {evt.subStatus.map((sub: string, subIdx: number) => (
                                      <p key={subIdx}>– {sub}</p>
                                    ))}
                                  </div>
                                )}
                                <p className="text-[8px] text-slate-400 font-bold tracking-wider mt-1 select-none font-mono">
                                  📅 {evt.data} às {evt.hora}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-2 bg-slate-50 border border-slate-200/50 rounded-2xl p-2.5 text-center space-y-1.5 h-[118px]">
                          <div className="space-y-0.5">
                            <p className="text-[8.5px] font-black text-slate-700 uppercase">Nenhum evento registrado ainda</p>
                            <p className="text-[7.5px] font-semibold text-slate-400 uppercase leading-relaxed max-w-[200px] mx-auto">
                              Padrão para importações recentes. Quer simular o rastreio real dos Correios para testar?
                            </p>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => simulateCorreiosTracking(shipment)}
                              className="text-[8px] font-extrabold uppercase bg-yellow-400 text-blue-900 hover:bg-yellow-500 px-2.5 py-1 rounded-xl transition-all shadow-sm border border-yellow-500 cursor-pointer"
                            >
                              🔧 Simular Rastreio
                            </button>
                            <button
                              type="button"
                              onClick={() => syncSingleShipment(shipment)}
                              disabled={isSyncingSingle === shipment.id}
                              className="text-[8px] font-extrabold uppercase bg-white text-slate-700 hover:bg-slate-100 px-2.5 py-1 rounded-xl transition-all border border-slate-200 cursor-pointer flex items-center gap-1"
                            >
                              <RefreshCw size={8} className={isSyncingSingle === shipment.id ? 'animate-spin' : ''} />
                              Consultar
                            </button>
                          </div>
                        </div>
                      )}

                      {shipment.lastSyncedAt && (
                        <p className="text-[7px] font-black text-slate-400 uppercase text-right select-none font-mono tracking-wide pr-1">
                          Sincronizado: {new Date(shipment.lastSyncedAt).toLocaleString('pt-BR')}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button 
                  type="button"
                  onClick={() => setShowTimelineId(null)} 
                  className="w-full py-1.5 text-[8.5px] font-black uppercase text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all border border-slate-100/60 cursor-pointer select-none"
                >
                  Voltar para Encomenda
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

                    const firstStatus = customerItems[0]?.status || 'Pendente';
                    const allSameStatus = customerItems.every(i => (i.status || 'Pendente') === firstStatus);
                    const currentGroupStatus = allSameStatus ? firstStatus : '';

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
                          <div className="flex items-center gap-1.5 ml-2 shrink-0 select-none" onClick={e => e.stopPropagation()}>
                            <span className="text-[8px] font-black text-slate-500 mr-1 uppercase">Lote:</span>
                            <select
                              value={currentGroupStatus}
                              onChange={(e) => {
                                if (e.target.value) {
                                  updateCustomerGroupStatus(shipment.id!, customerId, e.target.value as any);
                                }
                              }}
                              className="text-[8.5px] font-black bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded-lg cursor-pointer outline-none"
                            >
                              <option value="" disabled>Alterar...</option>
                              <option value="Pendente">⏳ Pendente</option>
                              <option value="Recebido">✓ Recebido</option>
                              <option value="Faturado">💳 Faturado</option>
                              </select>
                            <span className="text-[8px] font-black text-red-800 bg-red-100/80 px-1.5 py-0.5 rounded-lg ml-1">
                              {customerItems.length} {customerItems.length === 1 ? 'Item' : 'Itens'}
                            </span>
                          </div>
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
                                <div key={item.id} className="p-1.5 px-2.5 border-b border-slate-50 last:border-0 flex justify-between items-center text-[9px] hover:bg-slate-50/50 transition-colors">
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <span className="text-slate-600 font-bold uppercase truncate tracking-tight">{formatProductNameWithGender(item.productName, item.gender || products.find(p => p.id === item.productId)?.gender)}</span>
                                    {item.isDropshipping && (
                                      <span className="text-[6px] font-black bg-amber-500 text-white px-1 rounded italic leading-none">DS</span>
                                    )}
                                    {customerId === 'estoque' && (
                                      <span className={cn(
                                        "text-[7px] font-black px-1.5 py-0.5 rounded leading-none shrink-0 uppercase tracking-wider border",
                                        shipment.stockProcessed 
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                          : "bg-amber-50 text-amber-700 border-amber-200"
                                      )}>
                                        {shipment.stockProcessed ? '✓ No Estoque' : '⏳ Aguardando'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 ml-2 shrink-0" onClick={e => e.stopPropagation()}>
                                    <span className="font-extrabold text-slate-900 border-r border-slate-200/60 pr-2 font-mono">x{item.quantity}</span>
                                    <select
                                      value={item.status || 'Pendente'}
                                      onChange={(e) => updateItemStatus(shipment.id!, item.id, e.target.value as any)}
                                      className={cn(
                                        "text-[9px] font-black px-1.5 py-0.5 rounded-lg border outline-none cursor-pointer transition-all pr-4 relative appearance-none bg-no-repeat bg-[right_4px_center] bg-[length:6px] select-none",
                                        (item.status || 'Pendente') === 'Pendente' && "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
                                        (item.status || 'Pendente') === 'Recebido' && "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
                                        (item.status || 'Pendente') === 'Faturado' && "bg-sky-50 text-sky-700 border-sky-305 hover:bg-sky-100"
                                      )}
                                      style={{
                                        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23334155' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
                                      }}
                                    >
                                      <option value="Pendente">⏳ PEN</option>
                                      <option value="Recebido">✓ REC</option>
                                      <option value="Faturado">💳 FAT</option>
                                    </select>
                                  </div>
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
            onClick={() => syncActiveShipments(true)}
            disabled={isSyncing}
            className={cn(
              "font-bold py-3 px-5 rounded-xl transition-all border flex items-center gap-2 active:scale-95 shadow-sm text-xs cursor-pointer select-none",
              isSyncing 
                ? "bg-slate-100 border-slate-200 text-slate-400" 
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
            )}
          >
            <RefreshCw size={15} className={cn("text-red-800 transition-transform duration-300", isSyncing ? "animate-spin text-red-500" : "")} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar API'}</span>
          </button>

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
            type="button"
            onClick={() => setIsSupplierRankOpen(true)}
            className="font-bold py-3 px-5 rounded-xl transition-all border bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 flex items-center gap-2 active:scale-95 shadow-sm text-xs cursor-pointer select-none"
          >
            <TrendingUp size={15} className="text-red-800 font-sans font-black" />
            <span>Rank Fornecedores</span>
          </button>

          <button 
            onClick={() => openModal()}
            className="bg-red-800 hover:bg-black text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md flex items-center gap-2 active:scale-95 shadow-red-900/20 text-xs"
          >
            <Plus size={16} /> Deploy Lote
          </button>
        </div>
      </div>

      <AnimatePresence>
        {syncFeedback && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            className={cn(
              "p-3.5 rounded-2xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2.5 shadow-sm border select-none w-full",
              syncFeedback.type === 'success' 
                ? "bg-emerald-50 border-emerald-100 text-emerald-800"
                : syncFeedback.type === 'error'
                  ? "bg-rose-50 border-rose-100 text-rose-800"
                  : "bg-indigo-50 border-indigo-100 text-indigo-800"
            )}
          >
            <span className={cn("size-2 rounded-full", syncFeedback.type === 'success' ? "bg-emerald-500 animate-ping" : syncFeedback.type === 'error' ? "bg-rose-500" : "bg-indigo-500 animate-pulse")} />
            <span>{syncFeedback.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

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

            {/* Advanced Logistics Intelligence Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
              {/* Pipeline Flow Funnel */}
              <div className="lg:col-span-2 bg-white border border-slate-200/80 p-5 rounded-[24px] shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={16} className="text-indigo-600" />
                      <span className="text-[10px] font-black uppercase text-slate-800 tracking-wider">Pipeline Flow Funnel</span>
                    </div>
                    <span className="text-[8px] font-black uppercase text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100 font-mono">
                      Carga Ativa
                    </span>
                  </div>

                  {/* Funnel Pipeline Steps */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Origem / Inicial</p>
                      <p className="text-xl font-black text-slate-800 font-display tabular-nums leading-none">{pipelineCounts.processando}</p>
                      <p className="text-[8px] text-slate-500 font-semibold mt-1.5 leading-tight uppercase font-mono">Processando</p>
                    </div>
                    <div className="bg-sky-50/40 border border-sky-100/50 p-3.5 rounded-2xl">
                      <p className="text-[8px] font-black text-sky-600 uppercase tracking-widest leading-none mb-1 flex items-center gap-1">
                        <Plane size={10} /> Em Trânsito
                      </p>
                      <p className="text-xl font-black text-sky-700 font-display tabular-nums leading-none">{pipelineCounts.postado}</p>
                      <p className="text-[8px] text-slate-500 font-semibold mt-1.5 leading-tight uppercase font-mono">Canal Aéreo</p>
                    </div>
                    <div className="bg-emerald-50/40 border border-emerald-100/50 p-3.5 rounded-2xl">
                      <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-1 flex items-center gap-1">
                        <Globe size={10} /> Chegou no BR
                      </p>
                      <p className="text-xl font-black text-emerald-700 font-display tabular-nums leading-none">{pipelineCounts.brasil}</p>
                      <p className="text-[8px] text-slate-500 font-semibold mt-1.5 leading-tight uppercase font-mono">Aguard. Aduana</p>
                    </div>
                    <div className="bg-indigo-50/40 border border-indigo-100/50 p-3.5 rounded-2xl">
                      <p className="text-[8px] font-black text-indigo-600 uppercase tracking-widest leading-none mb-1 flex items-center gap-1">
                        <Truck size={10} /> Distribuição
                      </p>
                      <p className="text-xl font-black text-indigo-700 font-display tabular-nums leading-none">{pipelineCounts.destino}</p>
                      <p className="text-[8px] text-slate-500 font-semibold mt-1.5 leading-tight uppercase font-mono">Última Milha</p>
                    </div>
                  </div>

                  {/* Real calculated segmented delays banner */}
                  <div className="mt-4 bg-indigo-50/30 border border-indigo-100/40 rounded-2xl p-4">
                    <p className="text-[9px] font-black uppercase text-indigo-900 tracking-wider mb-2.5">Prazos Médios Logísticos Segmentados (Histórico Real)</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-start gap-2.5">
                        <div className="size-6 shrink-0 rounded-lg bg-white shadow-sm flex items-center justify-center text-indigo-600 font-mono text-xs font-black border border-indigo-100/30">1</div>
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">Leg Internacional</p>
                          <p className="text-[11px] font-extrabold text-slate-800 leading-none">
                            {avgIntlDays ? `${avgIntlDays} dias` : '10 a 15 dias (Est.)'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <div className="size-6 shrink-0 rounded-lg bg-white shadow-sm flex items-center justify-center text-indigo-600 font-mono text-xs font-black border border-indigo-100/30">2</div>
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">Fase Aduaneira</p>
                          <p className="text-[11px] font-extrabold text-slate-800 leading-none">
                            {avgAduanaDays ? `${avgAduanaDays} dias` : '3 a 5 dias (Est.)'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <div className="size-6 shrink-0 rounded-lg bg-white shadow-sm flex items-center justify-center text-indigo-600 font-mono text-xs font-black border border-indigo-100/30">3</div>
                        <div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">Transporte Nacional</p>
                          <p className="text-[11px] font-extrabold text-slate-800 leading-none">
                            {avgDestinoDays ? `${avgDestinoDays} dias` : '3 a 6 dias (Est.)'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attention Tracker / Stuck Shipments warning panel */}
              <div className="bg-white border border-slate-200/80 p-5 rounded-[24px] shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={16} className="text-amber-500" />
                      <span className="text-[10px] font-black uppercase text-slate-800 tracking-wider">Atenção Requerida</span>
                    </div>
                    {stuckShipments.length > 0 && (
                      <span className="text-[8px] font-black uppercase bg-rose-50 border border-rose-100 text-rose-600 px-2 py-0.5 rounded-full tracking-wider animate-pulse">
                        {stuckShipments.length} Lento(s)
                      </span>
                    )}
                  </div>

                  {stuckShipments.length > 0 ? (
                    <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                      {stuckShipments.map(s => (
                        <div key={s.id} className="p-3 bg-amber-50/40 hover:bg-amber-50 border border-amber-100/50 rounded-2xl transition-all">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-xs font-bold text-amber-950 tracking-tight">{s.trackingCode}</span>
                            <span className="text-[8px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md font-black shrink-0">
                              {s.daysInState}d s/ atualiz.
                            </span>
                          </div>
                          <p className="text-[8px] text-slate-500 font-semibold mt-1 leading-normal uppercase">
                            Parado no status <span className="font-extrabold text-slate-700">{s.status}</span>.
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-6 h-full">
                      <div className="size-10 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mb-3">
                        <CheckCircle2 size={20} />
                      </div>
                      <p className="text-[10px] font-black uppercase text-slate-800 tracking-wider leading-none">Fluxo Saudável</p>
                      <p className="text-[9px] text-slate-500 font-semibold mt-1.5 max-w-[200px] leading-relaxed">
                        Nenhum lote está parado além do tempo de tolerância logística para sua fase atual!
                      </p>
                    </div>
                  )}
                </div>

                <p className="text-[8px] text-slate-400 font-bold uppercase mt-4 pt-3 border-t border-slate-100">
                  Monitoramento Proativo de Gargalos
                </p>
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

                <div className="space-y-2 relative">
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Fornecedor / Loja</label>
                  <input 
                    type="text" 
                    value={supplierName} 
                    onChange={e => {
                      setSupplierName(e.target.value.toUpperCase());
                      setShowSupplierSuggestions(true);
                    }}
                    onFocus={() => setShowSupplierSuggestions(true)}
                    onBlur={() => {
                      // Small delay so that micro-interaction click events are captured before panel dismantles
                      setTimeout(() => setShowSupplierSuggestions(false), 200);
                    }}
                    placeholder="Ex: Alibaba, Wechat Seller..."
                    className="w-full px-4 py-3 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm bg-slate-50/50 transition-all"
                  />
                  
                  {showSupplierSuggestions && supplierSuggestions.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                      <div className="p-2 border-b border-slate-100 bg-slate-50">
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Fornecedores Encontrados</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {supplierSuggestions.map((suggestion, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onMouseDown={() => {
                              setSupplierName(suggestion);
                              setShowSupplierSuggestions(false);
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-all flex items-center justify-between text-xs font-bold text-slate-700"
                          >
                            <span>{suggestion}</span>
                            <span className="text-[9px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-black">Selecionar</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Items Management */}
                <div className="bg-slate-50 rounded-[32px] p-6 border border-slate-100 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-900 italic">Itens da Encomenda</h4>
                    <span className="text-[10px] bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full font-bold">{items.length} itens</span>
                  </div>

                  {/* Mode Selection */}
                  <div className="grid grid-cols-2 p-1 bg-slate-200/60 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setAddItemMode('sale')}
                      className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${addItemMode === 'sale' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Vincular a Venda
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddItemMode('stock')}
                      className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${addItemMode === 'stock' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Comprar para Estoque
                    </button>
                  </div>

                  {addItemMode === 'sale' ? (
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
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">{formatVariationWithGender(item.variationName, item.gender || products.find(p => p.id === item.productId)?.gender) || 'Sem variação'}</p>
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
                  ) : (
                    <div className="space-y-4 py-1">
                      <div className="space-y-2">
                        <label className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Selecionar Produto</label>
                        <select 
                          value={selectedStockProductId}
                          onChange={e => handleStockProductChange(e.target.value)}
                          className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-red-800 bg-white"
                        >
                          <option value="">Selecione o Produto para Reposição</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.gender || 'Ambos'})</option>
                          ))}
                        </select>
                      </div>

                      {selectedStockProductId && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 bg-white/40 p-4 border border-slate-200/50 rounded-2xl">
                          <div className="space-y-2">
                            <label className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Variação / Tamanho</label>
                            <select
                              value={selectedStockVariationId}
                              onChange={e => setSelectedStockVariationId(e.target.value)}
                              className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-red-800 bg-white"
                            >
                              <option value="">Única (Sem Variação)</option>
                              {products.find(p => p.id === selectedStockProductId)?.variations.map(v => (
                                <option key={v.id} value={v.id}>
                                  {v.size} {v.color ? ` / ${v.color}` : ''} (Atual em Estoque: {v.stock} un)
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Quantidade</label>
                            <input 
                              type="number"
                              min="1"
                              value={stockQuantity}
                              onChange={e => setStockQuantity(e.target.value)}
                              className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-red-800 bg-white"
                            />
                          </div>

                          <div className="space-y-2 md:col-span-2">
                            <label className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Custo Unitário da Importação (R$)</label>
                            <input 
                              type="number"
                              min="0"
                              step="0.01"
                              value={stockPrice}
                              onChange={e => setStockPrice(e.target.value)}
                              placeholder="0.00"
                              className="w-full px-4 py-3 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-red-800 bg-white"
                            />
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Carregado automaticamente com base no preço de custo cadastrado do produto.</p>
                          </div>

                          <button
                            type="button"
                            onClick={addStockItem}
                            className="md:col-span-2 w-full py-3 bg-red-800 border border-red-955 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-black transition-all shadow-md shadow-rose-100"
                          >
                            Adicionar ao Lote de Estoque
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2 mt-4 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                    {items.map(item => (
                      <div key={item.id} className="bg-white p-3 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-3">
                          <div className="size-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 relative">
                             <Box size={16} />
                             {item.isDropshipping && (
                               <div className="absolute top-0 right-0 size-3 bg-amber-500 rounded-full border-2 border-slate-50" />
                             )}
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-900">{item.customerName}</p>
                            <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-tight">{formatProductNameWithGender(item.productName, item.gender || products.find(p => p.id === item.productId)?.gender)}</p>
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
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest text-center px-4">Selecione uma venda ou um produto do estoque acima para vincular a este lote de importação</p>
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

      {/* Modal de Envio Individual por Cliente */}
      <AnimatePresence>
        {notifyModalData && (() => {
          const { shipment, status: targetStatus } = notifyModalData;
          
          // Group unique customers
          const uniqueCustomersMap = new Map<string, { customer: Customer; items: ShipmentItem[] }>();
          shipment.items.forEach(item => {
            const customer = customers.find(c => c.id === item.customerId);
            if (customer) {
              if (!uniqueCustomersMap.has(customer.id!)) {
                uniqueCustomersMap.set(customer.id!, { customer, items: [] });
              }
              uniqueCustomersMap.get(customer.id!)!.items.push(item);
            }
          });

          const uniqueCustomersList = Array.from(uniqueCustomersMap.values());

          return (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setNotifyModalData(null)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
              >
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-emerald-50/50">
                  <div className="flex items-center gap-3">
                    <div className="size-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-100 animate-pulse">
                      <MessageCircle size={24} className="fill-white/10" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900 italic uppercase">Enviar Notificações</h3>
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest leading-none mt-1">
                        Lote {shipment.trackingCode} • Status: <span className="text-emerald-600 font-extrabold">{targetStatus}</span>
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setNotifyModalData(null)} 
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X size={20} className="text-slate-400" />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-slate-50/50">
                  {uniqueCustomersList.length === 0 ? (
                    <div className="text-center py-10 bg-white border border-slate-100 rounded-3xl p-6">
                      <p className="text-xs text-slate-400 font-bold uppercase">Nenhum cliente com contato cadastrado para este lote.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider pl-2 border-l-2 border-emerald-500">
                        {uniqueCustomersList.length} {uniqueCustomersList.length === 1 ? 'Cliente disponível' : 'Clientes disponíveis para contato'}
                      </p>
                      
                      {uniqueCustomersList.map(({ customer, items: customerItems }) => {
                        const isNotified = notifiedCustomers.includes(customer.id!);
                        const messageText = getCustomerWhatsAppMessage(shipment, customer.id!, targetStatus);
                        const cleanPhone = customer.contact ? customer.contact.replace(/\D/g, '') : '';
                        
                        return (
                          <div 
                            key={customer.id} 
                            className={cn(
                              "bg-white border rounded-[24px] p-5 transition-all flex flex-col md:flex-row md:items-start justify-between gap-4 shadow-sm hover:shadow-md",
                              isNotified ? "border-emerald-200 bg-emerald-50/10" : "border-slate-100"
                            )}
                          >
                            <div className="flex-1 space-y-3 min-w-0">
                              {/* Cliente Info */}
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-sm text-slate-900 uppercase tracking-tight">{customer.name}</span>
                                {customer.contact && (
                                  <span className="text-[10px] bg-slate-100 font-mono text-slate-500 font-semibold px-2 py-0.5 rounded-full">
                                    {customer.contact}
                                  </span>
                                )}
                                {isNotified && (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-0.5 animate-bounce">
                                    <CheckCircle2 size={10} /> Enviado
                                  </span>
                                )}
                              </div>

                              {/* Items list belonging to client */}
                              <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-100/40">
                                <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 mb-1">Itens neste lote:</p>
                                <div className="space-y-1">
                                  {customerItems.map((item, idx) => {
                                    const itemGender = item.gender || products.find(p => p.id === item.productId)?.gender || 'Ambos';
                                    return (
                                      <p key={idx} className="text-[10px] text-slate-600 font-bold uppercase truncate max-w-full">
                                        • {item.quantity}x {formatProductNameWithGender(item.productName, itemGender)}
                                      </p>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Message bubble preview */}
                              <div className="relative">
                                <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 mb-1">Pré-visualização da Mensagem:</p>
                                <div className="bg-slate-100 border border-slate-200/50 rounded-2xl p-3.5 text-[11px] text-slate-600 font-sans whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed scrollbar-thin">
                                  {messageText}
                                </div>
                              </div>
                            </div>

                            {/* Actions column */}
                            <div className="flex flex-row md:flex-col items-center justify-end gap-2 shrink-0 md:self-stretch md:justify-center">
                              {customer.contact ? (
                                <button
                                  onClick={() => {
                                    const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(messageText)}`;
                                    window.open(url, '_blank');
                                    if (!isNotified) {
                                      setNotifiedCustomers(prev => [...prev, customer.id!]);
                                    }
                                  }}
                                  className={cn(
                                    "px-4 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-md w-full md:w-36 text-center select-none cursor-pointer",
                                    isNotified 
                                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80 border border-emerald-200" 
                                      : "bg-emerald-500 hover:bg-emerald-600 text-white border border-emerald-600 hover:-translate-y-0.5 active:translate-y-0 md:h-12"
                                  )}
                                >
                                  <MessageCircle size={12} className="fill-current/10" />
                                  {isNotified ? 'REENVIAR' : 'ENVIAR WPP'}
                                </button>
                              ) : (
                                <div className="text-[9px] text-red-500 font-extrabold uppercase bg-red-50 px-3 py-2 rounded-2xl text-center flex items-center gap-1">
                                  <AlertCircle size={12} /> Sem telefone
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-4">
                  <button 
                    type="button" 
                    onClick={() => setNotifyModalData(null)}
                    className="w-full py-4 bg-white border border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-100 transition-all text-center cursor-pointer"
                  >
                    Fechar Notificações
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Fornecedores Dropshipping Rank & Histórico Modal */}
      <AnimatePresence>
        {isSupplierRankOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSupplierRankOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl relative z-10 overflow-hidden flex flex-col max-h-[85vh] border border-slate-200 font-sans"
            >
              {/* Header */}
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="size-12 bg-red-800 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-red-150">
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 italic uppercase">Rank de Fornecedores <span className="text-red-800">Dropshipping</span></h3>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest text-slate-400">Desempenho Aduaneiro & Logística Internacional</p>
                  </div>
                </div>
                <button onClick={() => setIsSupplierRankOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X size={24} className="text-slate-400" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs font-bold text-slate-650">
                  <p>
                    ⚡ <span className="font-semibold text-slate-900">Mapeamento Estatístico:</span> Decida os melhores fornecedores (com menor taxa alfandegária e menor trânsito) pesquisando os históricos de entrega abaixo.
                  </p>
                </div>

                <div className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        <th className="px-6 py-4">Canal Fornecedor</th>
                        <th className="px-6 py-4 text-center">Encomendas</th>
                        <th className="px-6 py-4 text-center">Tributação %</th>
                        <th className="px-6 py-4 text-center">Média Impostos</th>
                        <th className="px-6 py-4 text-center">Média Trânsito</th>
                        <th className="px-6 py-4 text-right">Avaliação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {supplierRankings.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
                            Nenhum fornecedor registrado nos lotes.
                          </td>
                        </tr>
                      ) : (
                        supplierRankings.map((sr, index) => {
                          const hasTaxRisk = sr.taxRate > 40;
                          const isExcellent = sr.taxRate < 20 && sr.avgTransit !== null && sr.avgTransit <= 20;
                          
                          return (
                            <tr key={sr.supplier} className="hover:bg-slate-50/50 transition-colors group">
                              <td className="px-6 py-4">
                                <span className="text-xs font-bold text-slate-900 select-all group-hover:text-red-800 transition-colors">
                                  {index + 1}. {sr.supplier}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center text-xs font-black text-slate-800 tabular-nums">
                                {sr.total}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={cn(
                                  "px-2 py-1 rounded-md text-[10px] font-extrabold tabular-nums border",
                                  hasTaxRisk
                                    ? "bg-rose-50 text-rose-700 border-rose-100"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-100"
                                )}>
                                  {sr.taxRate.toFixed(0)}%
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center text-xs font-black text-slate-805 tabular-nums">
                                {sr.avgTaxAmount > 0 ? formatCurrency(sr.avgTaxAmount) : 'Isento'}
                              </td>
                              <td className="px-6 py-4 text-center text-xs font-black text-slate-805 tabular-nums">
                                {sr.avgTransit !== null ? `${sr.avgTransit.toFixed(1)} dias` : 'Sem dados'}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className={cn(
                                  "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider",
                                  isExcellent
                                    ? "bg-emerald-500 text-white"
                                    : hasTaxRisk
                                      ? "bg-rose-100 text-rose-800"
                                      : "bg-slate-100 text-slate-700"
                                )}>
                                  {isExcellent ? 'RECOMENDADO' : hasTaxRisk ? 'RISCO TAXA' : 'ESTÁVEL'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Histórico Geral das últimas encomendas por fornecedor */}
                {supplierRankings.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-slate-805 uppercase tracking-wider">Histórico de Cargas Ativas por Fornecedor</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {supplierRankings.slice(0, 4).map(sr => (
                        <div key={sr.supplier} className="border border-slate-200/65 rounded-2xl p-4 bg-slate-50/20 shadow-sm space-y-3">
                          <div className="flex justify-between items-center bg-slate-100/50 p-2 rounded-xl border border-slate-200/30">
                            <span className="text-[10px] font-black text-slate-850 truncate max-w-[180px] uppercase">{sr.supplier}</span>
                            <span className="text-[9px] font-black bg-red-800 text-white px-2 py-0.5 rounded-lg uppercase">{sr.total} cargas</span>
                          </div>
                          
                          <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                            {sr.allShipments.slice(0, 5).map(ship => (
                              <div key={ship.id} className="text-[10px] flex items-center justify-between border-b border-dashed border-slate-100 pb-2 last:border-0 last:pb-0 font-sans">
                                <div className="space-y-0.5">
                                  <p className="font-mono font-bold text-slate-800 select-all">{ship.trackingCode}</p>
                                  <p className="text-[8px] uppercase font-black text-slate-450">{ship.status}</p>
                                </div>
                                <div className="text-right">
                                  {ship.hasTax ? (
                                    <span className="text-[8px] bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded-md font-extrabold font-sans">
                                      Taxado: {formatCurrency(ship.taxAmount)}
                                    </span>
                                  ) : (
                                    <span className="text-[8px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded-md font-extrabold font-sans">
                                      Sem taxa
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-4">
                <button 
                  type="button" 
                  onClick={() => setIsSupplierRankOpen(false)}
                  className="w-full py-4 bg-white border border-slate-200 text-slate-750 hover:bg-slate-100 transition-all text-center rounded-2xl font-black text-xs uppercase tracking-widest cursor-pointer"
                >
                  Fechar Rank de Fornecedores
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
