import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Sale, Shipment, Transaction, Customer, Product } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { 
  Search, 
  Filter, 
  Calendar, 
  User, 
  Package, 
  TrendingUp, 
  DollarSign, 
  Truck, 
  Copy, 
  Check, 
  Download, 
  ArrowUpRight, 
  BarChart3, 
  Clock, 
  ShoppingBag,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Reports() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Copy state helper
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Active view tab: 'all' | 'products' | 'customers'
  const [activeTab, setActiveTab] = useState<'all' | 'products' | 'customers'>('all');

  // Unified page filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('all');

  // Listeners to Firestore
  useEffect(() => {
    setIsLoading(true);

    const unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('createdAt', 'desc')), (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    });

    const unsubShipments = onSnapshot(collection(db, 'shipments'), (snapshot) => {
      setShipments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Shipment)));
    });

    const unsubTrans = onSnapshot(query(collection(db, 'transactions'), orderBy('createdAt', 'desc')), (snapshot) => {
      setTransactions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    });

    const unsubCust = onSnapshot(collection(db, 'customers'), (snapshot) => {
      setCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    });

    const unsubProd = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      setIsLoading(false);
    });

    return () => {
      unsubSales();
      unsubShipments();
      unsubTrans();
      unsubCust();
      unsubProd();
    };
  }, []);

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const getCustomerName = (id?: string) => {
    if (!id) return 'Consumidor Final';
    if (id === 'estoque') return 'Estoque (Pronta Entrega)';
    return customers.find(c => c.id === id)?.name || 'Consumidor Final';
  };

  // Find linked shipment tracking code for a specific saleId
  const getLinkedShipment = (saleId?: string) => {
    if (!saleId) return null;
    return shipments.find(s => s.items.some(item => item.saleId === saleId)) || null;
  };

  // Helper to format date
  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Sem data';
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateShort = (timestamp: any) => {
    if (!timestamp) return 'Sem data';
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleString('pt-BR');
  };

  // 1. DATA PREPARATION: JOINING TRANSACTIONS & SALES
  // Create a unified history list for cross-tracing
  const unifiedRecords = React.useMemo(() => {
    const records: Array<{
      id: string; // Dynamic unique ID representing the record
      type: 'Venda' | 'Amortização' | 'Lote de Entrada';
      date: any;
      customerId: string;
      customerName: string;
      amount: number;
      paymentMethod: string;
      itemsSummary: Array<{ name: string; qty: number; price: number }>;
      linkedTrackingCode?: string;
      linkedShipmentStatus?: string;
      saleId?: string;
      originalRefId: string;
    }> = [];

    // Map each sale as a record
    sales.forEach(sale => {
      const linkedShip = getLinkedShipment(sale.id);
      records.push({
        id: sale.id?.substring(0, 8).toUpperCase() || 'VDA-' + Math.random().toString(36).substring(2, 5).toUpperCase(),
        type: 'Venda',
        date: sale.createdAt,
        customerId: sale.customerId || 'final-consumer',
        customerName: sale.customerName || 'Consumidor Final',
        amount: sale.total,
        paymentMethod: sale.paymentMethod,
        itemsSummary: sale.items?.map(it => ({
          name: it.name + (it.variationName ? ` (${it.variationName})` : ''),
          qty: it.quantity,
          price: it.price
        })) || [],
        linkedTrackingCode: linkedShip?.trackingCode || undefined,
        linkedShipmentStatus: linkedShip?.status || undefined,
        saleId: sale.id,
        originalRefId: sale.id || ''
      });
    });

    // Add extra transaction payments (amortizations) not already covered or showing direct logs
    transactions.forEach(t => {
      // If it's a payment/amortization separate from direct sale faturamentos
      if (t.type === 'payment') {
        const matchingSale = sales.find(s => s.id === t.saleId);
        // Only add if it's an independent amortization or we want to trace it individually!
        // To be safe we represent each unique physical transaction
        const linkedShip = getLinkedShipment(t.saleId);
        records.push({
          id: t.id?.substring(0, 8).toUpperCase() || 'PAG-' + Math.random().toString(36).substring(2, 5).toUpperCase(),
          type: 'Amortização',
          date: t.createdAt,
          customerId: t.customerId || 'final-consumer',
          customerName: getCustomerName(t.customerId),
          amount: t.amount,
          paymentMethod: t.paymentMethod || 'Outros',
          itemsSummary: matchingSale ? matchingSale.items?.map(it => ({
            name: it.name + (it.variationName ? ` (${it.variationName})` : ''),
            qty: it.quantity,
            price: it.price
          })) : [{ name: 'Amortização Fiado (Sem Item Direto)', qty: 1, price: t.amount }],
          linkedTrackingCode: linkedShip?.trackingCode || undefined,
          linkedShipmentStatus: linkedShip?.status || undefined,
          saleId: t.saleId,
          originalRefId: t.id || ''
        });
      }
    });

    return records.sort((a, b) => {
      const tA = a.date?.seconds || new Date(a.date).getTime() || 0;
      const tB = b.date?.seconds || new Date(b.date).getTime() || 0;
      return tB - tA;
    });
  }, [sales, shipments, transactions, customers]);


  // FILTERING THE UNIFIED RECORDS
  const filteredRecords = React.useMemo(() => {
    return unifiedRecords.filter(rec => {
      // 1. Text search (ID, Customer Name, Tracking Code, Product Name)
      const queryLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        rec.id.toLowerCase().includes(queryLower) ||
        rec.originalRefId.toLowerCase().includes(queryLower) ||
        rec.customerName.toLowerCase().includes(queryLower) ||
        rec.linkedTrackingCode?.toLowerCase().includes(queryLower) ||
        rec.itemsSummary.some(it => it.name.toLowerCase().includes(queryLower));

      // 2. Product filter
      const matchesProduct = selectedProductId === 'all' || 
        (selectedProductId !== 'all' && rec.itemsSummary.some(it => {
          // Find matching sales associated with this product
          const matchingSale = sales.find(s => s.id === rec.saleId);
          return matchingSale?.items.some(item => item.productId === selectedProductId);
        }));

      // 3. Customer filter
      const matchesCustomer = selectedCustomerId === 'all' || rec.customerId === selectedCustomerId;

      // 4. Payment method filter
      const matchesPayment = selectedPaymentMethod === 'all' || rec.paymentMethod === selectedPaymentMethod;

      // 5. Date filter range
      let matchesRange = true;
      if (rec.date) {
        const itemDate = rec.date.seconds ? new Date(rec.date.seconds * 1000) : new Date(rec.date);
        
        if (startDate) {
          const sD = new Date(startDate + 'T00:00:00');
          if (itemDate < sD) matchesRange = false;
        }
        if (endDate) {
          const eD = new Date(endDate + 'T23:59:59');
          if (itemDate > eD) matchesRange = false;
        }
      }

      return matchesSearch && matchesProduct && matchesCustomer && matchesPayment && matchesRange;
    });
  }, [unifiedRecords, searchQuery, selectedProductId, selectedCustomerId, selectedPaymentMethod, startDate, endDate, sales]);


  // 2. PRODUCT HISTORICAL REPORT DATA
  const productStats = React.useMemo(() => {
    const statsMap: { [productId: string]: {
      id: string;
      name: string;
      qtySold: number;
      revenue: number;
      transactionsCount: number;
      buyers: Set<string>;
      uniqueSaleIds: Set<string>;
    }} = {};

    sales.forEach(sale => {
      // Skip cancelled
      if (sale.status === 'Cancelada') return;

      sale.items.forEach(item => {
        if (!statsMap[item.productId]) {
          statsMap[item.productId] = {
            id: item.productId,
            name: item.name,
            qtySold: 0,
            revenue: 0,
            transactionsCount: 0,
            buyers: new Set(),
            uniqueSaleIds: new Set()
          };
        }
        statsMap[item.productId].qtySold += item.quantity;
        statsMap[item.productId].revenue += item.quantity * item.price;
        statsMap[item.productId].buyers.add(sale.customerId || 'final-consumer');
        statsMap[item.productId].uniqueSaleIds.add(sale.id || '');
      });
    });

    return Object.values(statsMap).sort((a, b) => b.revenue - a.revenue);
  }, [sales]);


  // 3. CUSTOMER HISTORICAL LAUNCH DATA
  const customerStats = React.useMemo(() => {
    const statsMap: { [customerId: string]: {
      id: string;
      name: string;
      spentTotal: number;
      ordersCount: number;
      productsCount: number;
      lastPurchaseDate: any;
      linkedShipments: Set<string>;
      paymentPreference: { [method: string]: number };
    }} = {};

    sales.forEach(sale => {
      if (sale.status === 'Cancelada') return;
      const cId = sale.customerId || 'final-consumer';
      const cName = sale.customerName || 'Consumidor Final';

      if (!statsMap[cId]) {
        statsMap[cId] = {
          id: cId,
          name: cName,
          spentTotal: 0,
          ordersCount: 0,
          productsCount: 0,
          lastPurchaseDate: null,
          linkedShipments: new Set(),
          paymentPreference: {}
        };
      }

      statsMap[cId].spentTotal += sale.total;
      statsMap[cId].ordersCount += 1;
      statsMap[cId].productsCount += sale.items.reduce((acc, it) => acc + it.quantity, 0);
      
      const shipLinked = getLinkedShipment(sale.id);
      if (shipLinked) {
        statsMap[cId].linkedShipments.add(shipLinked.trackingCode);
      }

      // Track payment preferences
      statsMap[cId].paymentPreference[sale.paymentMethod] = (statsMap[cId].paymentPreference[sale.paymentMethod] || 0) + sale.total;

      // Track last purchase date
      if (!statsMap[cId].lastPurchaseDate || (sale.createdAt?.seconds > (statsMap[cId].lastPurchaseDate?.seconds || 0))) {
        statsMap[cId].lastPurchaseDate = sale.createdAt;
      }
    });

    return Object.values(statsMap).sort((a, b) => b.spentTotal - a.spentTotal);
  }, [sales, shipments]);


  // METRIC COMPUTATIONS FOR CURRENT FILTER
  const metrics = React.useMemo(() => {
    const totalAmount = filteredRecords.reduce((acc, r) => acc + r.amount, 0);
    const count = filteredRecords.length;
    const avgTicket = count > 0 ? totalAmount / count : 0;
    
    // Percent with tracking linking
    const trackerCount = filteredRecords.filter(r => !!r.linkedTrackingCode).length;
    const trackerPercent = count > 0 ? (trackerCount / count) * 100 : 0;

    return { totalAmount, count, avgTicket, trackerCount, trackerPercent };
  }, [filteredRecords]);


  // EXPORT TO WHATSAPP/SHARE FUNCTION
  const handleShareReport = () => {
    let text = `*RELATÓRIO Club da Bola - Rastreamento de Operações*\n`;
    text += `De: ${startDate || 'Início'} até ${endDate || 'Hoje'}\n`;
    text += `Total Registrado: ${formatCurrency(metrics.totalAmount)}\n`;
    text += `Quantidade de Lançamentos: ${metrics.count}\n`;
    text += `-----------------------------------------------\n\n`;

    filteredRecords.slice(0, 15).forEach(rec => {
      text += `ID único: [${rec.id}]\n`;
      text += `Tipo: ${rec.type}\n`;
      text += `Data: ${formatDateShort(rec.date)}\n`;
      text += `Cliente: ${rec.customerName}\n`;
      text += `Valor: ${formatCurrency(rec.amount)} (${rec.paymentMethod})\n`;
      if (rec.linkedTrackingCode) {
        text += `Rastreador: ${rec.linkedTrackingCode} (${rec.linkedShipmentStatus || 'Postado'})\n`;
      }
      text += `Itens: ${rec.itemsSummary.map(it => `${it.qty}x ${it.name}`).join(', ')}\n`;
      text += `\n`;
    });

    if (filteredRecords.length > 15) {
      text += `... e mais ${filteredRecords.length - 15} transações.`;
    }

    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    
    // Header section decoration
    doc.setFillColor(153, 27, 27); // #991b1b
    doc.rect(0, 0, 210, 32, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("ERP CLUB DA BOLA", 14, 14);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("SISTEMA DE GESTÃO - RELATÓRIO DE PERFORMANCE", 14, 22);
    
    const runDate = new Date().toLocaleString('pt-BR');
    doc.setFontSize(7.5);
    doc.text(`Gerado em: ${runDate} | Produzido por: Brener Gomes`, 114, 14);
    
    doc.setTextColor(30, 41, 59); // Slate-800
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    
    let reportTitle = "";
    let headers: string[][] = [];
    let body: any[][] = [];
    
    if (activeTab === 'all') {
      reportTitle = "Rastreamento Geral (Transações & Encomendas)";
      headers = [['ID Único', 'Data', 'Cliente', 'Operação', 'Produtos Adquiridos', 'Preço / Total', 'Lote Correios']];
      body = filteredRecords.map(rec => [
        rec.id,
        formatDateShort(rec.date),
        rec.customerName,
        rec.type,
        rec.itemsSummary.map(it => `${it.qty}x ${it.name}`).join('\n'),
        formatCurrency(rec.amount),
        rec.linkedTrackingCode ? `${rec.linkedTrackingCode} (${rec.linkedShipmentStatus || 'Postado'})` : '-'
      ]);
    } else if (activeTab === 'products') {
      reportTitle = "Estatísticas de Desempenho de Produtos";
      headers = [['Métrica', 'Produto', 'Unidades Vendidas', 'Total Faturado', 'Vendas Cruzadas']];
      body = productStats
        .filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .map((it, idx) => [
          `#${idx + 1}`,
          it.name,
          String(it.qtySold),
          formatCurrency(it.revenue),
          `${it.buyers.size} compradores / ${it.uniqueSaleIds.size} vendas`
        ]);
    } else {
      reportTitle = "Histórico de Performance e LTV de Clientes";
      headers = [['Cliente', 'Totais Gastos (LTV)', 'Pedidos Concluídos', 'Itens Comprados', 'Última Compra']];
      body = customerStats
        .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .map(cStat => [
          cStat.name,
          formatCurrency(cStat.spentTotal),
          `${cStat.ordersCount} pedido(s)`,
          `${cStat.productsCount} unidade(s)`,
          cStat.lastPurchaseDate ? formatDateShort(cStat.lastPurchaseDate) : '-'
        ]);
    }
    
    doc.text(reportTitle.toUpperCase(), 14, 42);
    
    // Subtitle filters
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const filterText = `Parâmetros: Filtro de Busca: "${searchQuery || 'Nenhum'}" | Período: [${startDate || 'Início'} - ${endDate || 'Hoje'}]`;
    doc.text(filterText, 14, 48);
    
    // Summary panel in PDF
    doc.setFillColor(248, 250, 252); 
    doc.rect(14, 52, 182, 15, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, 52, 182, 15, 'S');
    
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7.5);
    doc.text("VOLUME TOTAL SELECIONADO", 18, 57);
    doc.text("REGISTROS EXPORTADOS", 85, 57);
    doc.text("VALOR MÉDIO DO TICKET", 145, 57);
    
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(formatCurrency(metrics.totalAmount), 18, 63);
    doc.text(`${metrics.count} registro(s)`, 85, 63);
    doc.text(formatCurrency(metrics.avgTicket), 145, 63);
    
    autoTable(doc, {
      startY: 72,
      head: headers,
      body: body,
      theme: 'striped',
      headStyles: { 
        fillColor: [153, 27, 27], 
        textColor: 255, 
        fontSize: 8, 
        fontStyle: 'bold',
        halign: 'left'
      },
      bodyStyles: { 
        fontSize: 7.5,
        textColor: [51, 65, 85],
        cellPadding: 3.5
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      },
      margin: { left: 14, right: 14 }
    });
    
    const cleanFileName = `relatorio-${activeTab}-${new Date().toISOString().substring(0, 10)}.pdf`;
    doc.save(cleanFileName);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header design following elegant visual system */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 leading-none">
            Rastreabilidade & <span className="text-red-800 underline decoration-red-200 decoration-4 underline-offset-4 tracking-tight font-bold">Relatórios Cruzados</span>
          </h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] font-sans mt-2">Navegabilidade de ponta a ponta: Vendas, Encomendas e Histórico Financeiro</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={handleShareReport}
            className="flex items-center gap-2 px-5 py-3 bg-amber-600 hover:bg-amber-700 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer"
            id="btn-share-report"
          >
            <Download size={14} />
            Compartilhar WhatsApp
          </button>

          <button 
            type="button"
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-5 py-3 bg-red-800 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer"
            id="btn-download-pdf"
          >
            <Download size={14} />
            Exportar em PDF
          </button>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="flex border-b border-slate-200/80 gap-2">
        <button
          onClick={() => { setActiveTab('all'); setSearchQuery(''); }}
          className={cn(
            "px-6 py-3 font-bold text-xs uppercase tracking-wider border-b-2 transition-all",
            activeTab === 'all' ? "border-red-800 text-red-800 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          🔍 Rastreamento Geral (Transações & Encomendas)
        </button>
        <button
          onClick={() => { setActiveTab('products'); setSearchQuery(''); }}
          className={cn(
            "px-6 py-3 font-bold text-xs uppercase tracking-wider border-b-2 transition-all",
            activeTab === 'products' ? "border-red-800 text-red-800 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          📦 Estatística por Produtos
        </button>
        <button
          onClick={() => { setActiveTab('customers'); setSearchQuery(''); }}
          className={cn(
            "px-6 py-3 font-bold text-xs uppercase tracking-wider border-b-2 transition-all",
            activeTab === 'customers' ? "border-red-800 text-red-800 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          👥 Histórico de Clientes (LTV)
        </button>
      </div>

      {/* Unified Filters Dashboard */}
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2 text-[10px] uppercase font-black text-slate-400 tracking-wider">
          <Filter size={12} className="text-slate-400" />
          Filtros de Auditoria dinâmica
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Text Search */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Busca Inteligente</label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                placeholder={activeTab === 'all' ? "ID da transação, rastreio, cliente..." : activeTab === 'products' ? "Nome do produto..." : "Nome do cliente..."}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-[16px] text-xs font-bold outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-800 bg-slate-50/50"
              />
            </div>
          </div>

          {/* Customer selection */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Cliente</label>
            <select
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-[16px] text-xs font-bold outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-800 bg-slate-50/50"
            >
              <option value="all">Todos os clientes</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Product selection */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Produto</label>
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-[16px] text-xs font-bold outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-800 bg-slate-50/50"
            >
              <option value="all">Todos os produtos</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Date range helpers */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">De</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-[16px] text-xs font-bold outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-800 bg-slate-50/50 text-slate-700"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Até</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-[16px] text-xs font-bold outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-800 bg-slate-50/50 text-slate-700"
            />
          </div>
        </div>

        {/* Dynamic Reset filters row */}
        {(startDate || endDate || selectedCustomerId !== 'all' || selectedProductId !== 'all' || selectedPaymentMethod !== 'all' || searchQuery) && (
          <div className="flex justify-end pt-1">
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSelectedCustomerId('all');
                setSelectedProductId('all');
                setSelectedPaymentMethod('all');
                setSearchQuery('');
              }}
              className="text-[10px] font-black text-red-800 hover:text-rose-900 flex items-center gap-1 uppercase tracking-wider"
            >
              <RefreshCw size={11} className="animate-spin" style={{ animationDuration: '3s' }} />
              Limpar Filtros Cruzados
            </button>
          </div>
        )}
      </div>

      {/* KPI Stats Panel - Dynamic counts based on filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-[20px] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="size-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign size={20} className="stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Volume Faturado</p>
            <h4 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">{formatCurrency(metrics.totalAmount)}</h4>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[20px] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="size-11 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <ShoppingBag size={18} className="stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Registros Filtrados</p>
            <h4 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">{metrics.count} {metrics.count === 1 ? 'Transação' : 'Transações'}</h4>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[20px] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="size-11 rounded-2xl bg-yellow-50 text-yellow-600 flex items-center justify-center shrink-0">
            <TrendingUp size={20} className="stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Valor Médio (Ticket)</p>
            <h4 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">{formatCurrency(metrics.avgTicket)}</h4>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[20px] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="size-11 rounded-2xl bg-red-50 text-red-800 flex items-center justify-center shrink-0">
            <Truck size={18} className="stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Lotes Importados / Encomendas</p>
            <h4 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">{metrics.trackerPercent.toFixed(0)}% com Rastreio</h4>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-4 border-red-800/10 border-t-red-800 rounded-full animate-spin" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando bancos de dados...</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {/* TAB 1: ALL CROSS-TRACE COMPREHENSIVE REPORTS */}
          {activeTab === 'all' && (
            <motion.div
              key="all"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <h3 className="font-sans font-bold text-slate-900 text-xs uppercase tracking-wider">Histórico de Movimentações Cruzadas</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Trace cada pagamento do cliente de volta ao lote de encomenda dos Correios de forma automática</p>
                </div>
                <div className="text-[10.5px] font-mono font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-xl">
                  {filteredRecords.length} resultado(s)
                </div>
              </div>

              <div className="overflow-x-auto min-w-full">
                <table className="w-full text-left border-collapse table-auto">
                  <thead>
                    <tr className="bg-slate-50/30 border-b border-slate-100">
                      <th className="p-4.5 px-6 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">ID Único</th>
                      <th className="p-4.5 px-6 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Data</th>
                      <th className="p-4.5 px-6 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Cliente</th>
                      <th className="p-4.5 px-6 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Operação</th>
                      <th className="p-4.5 px-6 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Produtos Adquiridos</th>
                      <th className="p-4.5 px-6 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Preço / Total</th>
                      <th className="p-4.5 px-6 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Lote Correios (Vínculo)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/70">
                    {filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-slate-400">
                          <BarChart3 className="mx-auto size-14 stroke-[1.2] text-slate-300 mb-3" />
                          <p className="text-xs font-semibold text-slate-500">Nenhum registro encontrado nos parâmetros escolhidos.</p>
                          <p className="text-[10px] text-slate-400 mt-1">Experimente buscar por outro nome ou remover o filtro de datas.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((rec) => (
                        <tr key={rec.originalRefId + rec.type} className="hover:bg-slate-50/40 transition-colors">
                          {/* Unique Transaction/Sale ID */}
                          <td className="p-4.5 px-6 select-all font-mono font-bold text-[10.5px] text-slate-800">
                            <div className="flex items-center gap-1.5">
                              <span className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors" onClick={() => handleCopy(rec.originalRefId)}>
                                {rec.id}
                              </span>
                              <button 
                                onClick={() => handleCopy(rec.originalRefId)}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                                title="Copiar ID Completo"
                              >
                                {copiedId === rec.originalRefId ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                              </button>
                              {rec.type === 'Venda' && (
                                <button
                                  onClick={() => {
                                    const baseRoute = (import.meta as any).env?.BASE_URL || '/';
                                    const cleanBase = baseRoute.endsWith('/') ? baseRoute : baseRoute + '/';
                                    const link = `${window.location.origin}${cleanBase}?receipt=${rec.originalRefId}`;
                                    navigator.clipboard.writeText(link);
                                    alert("🔗 Comprovante Web Interativo copiado para colar no WhatsApp do cliente!");
                                  }}
                                  className="p-1 pb-1 px-1.5 bg-red-50 text-red-800 hover:bg-red-800 hover:text-white rounded-lg transition-all text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ml-1 shrink-0"
                                  title="Copiar Link de Entrega Interativa"
                                >
                                  <span>Link do Manto</span> <ArrowUpRight size={10} />
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Human readable Date */}
                          <td className="p-4.5 px-6 text-[10.5px] font-medium text-slate-700 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Calendar size={12} className="text-slate-400" />
                              {formatDate(rec.date)}
                            </div>
                          </td>

                          {/* Customer Name */}
                          <td className="p-4.5 px-6 text-[11px] font-black text-slate-900 uppercase tracking-tight">
                            <div className="flex items-center gap-1.5">
                              <User size={13} className="text-red-800" />
                              {rec.customerName}
                            </div>
                          </td>

                          {/* Type */}
                          <td className="p-4.5 px-6 whitespace-nowrap">
                            <span className={cn(
                              "text-[8.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                              rec.type === 'Venda' && "bg-blue-50 text-blue-700 border border-blue-100",
                              rec.type === 'Amortização' && "bg-emerald-50 text-emerald-700 border border-emerald-100",
                              rec.type === 'Lote de Entrada' && "bg-slate-50 text-slate-700 border border-slate-100"
                            )}>
                              {rec.type}
                            </span>
                          </td>

                          {/* Items included */}
                          <td className="p-4.5 px-6 max-w-xs">
                            <div className="space-y-1">
                              {rec.itemsSummary.map((item, idx) => (
                                <div key={idx} className="flex justify-between text-[10.5px] font-medium text-slate-600">
                                  <span className="truncate pr-4 uppercase text-slate-800 font-bold">{item.name}</span>
                                  <span className="shrink-0 font-mono text-[9.5px]">x{item.qty}</span>
                                </div>
                              ))}
                            </div>
                          </td>

                          {/* Grand Total Value */}
                          <td className="p-4.5 px-6 text-[11px] font-black text-slate-950 font-mono whitespace-nowrap">
                            <div className="flex flex-col">
                              <span>{formatCurrency(rec.amount)}</span>
                              <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider font-sans mt-0.5">{rec.paymentMethod}</span>
                            </div>
                          </td>

                          {/* Linked Shipment tracking code */}
                          <td className="p-4.5 px-6">
                            {rec.linkedTrackingCode ? (
                              <div className="flex flex-col gap-1 select-all font-mono">
                                <div className="flex items-center gap-1.5">
                                  <Truck size={13} className="text-slate-500 fill-slate-50" />
                                  <span className="font-bold text-xs text-slate-800 bg-slate-100/80 px-2 py-0.5 rounded-lg border border-slate-200/50">
                                    {rec.linkedTrackingCode}
                                  </span>
                                </div>
                                {rec.linkedShipmentStatus && (
                                  <span className="text-[9px] font-black text-red-800 uppercase tracking-tight ml-4.5">
                                    ✈︎ {rec.linkedShipmentStatus}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[9.5px] text-slate-400 italic">Nenhum vínculo internacional</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* TAB 2: PRODUCT ANALYTICAL VIEW */}
          {activeTab === 'products' && (
            <motion.div
              key="products"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              {/* Leaderboard left */}
              <div className="lg:col-span-2 bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4.5 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="font-sans font-bold text-slate-900 text-xs uppercase tracking-wider">Desempenho Geral de Itens / Vendas</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Produtos classificados por faturamento descendente</p>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/20 border-b border-slate-100">
                        <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Item</th>
                        <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Unidades Vendidas</th>
                        <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Faturado</th>
                        <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Compradores Únicos</th>
                        <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Vendas Diferentes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {productStats.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-12 text-center text-slate-400">Nenhum produto registrado em vendas concluídas.</td>
                        </tr>
                      ) : (
                        productStats
                          .filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                          .map((it, idx) => (
                            <tr key={it.id} className="hover:bg-slate-50/30 transition-colors">
                              <td className="p-4 px-6">
                                <div className="flex items-center gap-3">
                                  <div className="size-8 rounded-xl bg-red-50 text-red-800 flex items-center justify-center font-bold text-xs">
                                    #{idx + 1}
                                  </div>
                                  <span className="font-bold text-xs uppercase text-slate-800">{it.name}</span>
                                </div>
                              </td>
                              <td className="p-4 px-6 font-mono font-bold text-slate-900">x{it.qtySold}</td>
                              <td className="p-4 px-6 font-mono font-bold text-slate-900">{formatCurrency(it.revenue)}</td>
                              <td className="p-4 px-6 font-medium text-slate-600 text-xs">{it.buyers.size} compradores</td>
                              <td className="p-4 px-6 font-medium text-slate-600 text-xs">{it.uniqueSaleIds.size} vendas</td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Product quick info cards */}
              <div className="space-y-4">
                <div className="bg-slate-950 text-white p-6 rounded-[24px] relative overflow-hidden shadow-xl">
                  <div className="absolute right-[-40px] bottom-[-40px] opacity-10">
                    <BarChart3 size={150} />
                  </div>
                  <h4 className="font-sans font-bold text-xs text-red-500 uppercase tracking-[0.15em] mb-1">Destaque de Vendas</h4>
                  <p className="text-[10px] text-slate-300">Produto Líder em Faturamento</p>
                  
                  {productStats.length > 0 ? (
                    <div className="mt-8">
                      <h3 className="text-xl font-bold uppercase tracking-tight text-white mb-1 truncate">{productStats[0].name}</h3>
                      <p className="text-3xl font-mono font-black text-red-500">{formatCurrency(productStats[0].revenue)}</p>
                      <p className="text-[10px] text-slate-400 mt-2 font-medium">Composto por <span className="font-bold text-white">{productStats[0].qtySold} unidades</span> encomendadas em nossa plataforma de pontvenda.</p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mt-4">Sem dados disponíveis.</p>
                  )}
                </div>

                <div className="bg-white border border-slate-100 p-6 rounded-[24px]">
                  <h4 className="font-sans font-bold text-xs text-slate-400 uppercase tracking-[0.1em] mb-4">Volume total faturado</h4>
                  <div className="space-y-4">
                    {productStats.slice(0, 5).map((stat) => (
                      <div key={stat.id} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold uppercase">
                          <span className="text-slate-700 truncate max-w-[150px]">{stat.name}</span>
                          <span className="font-mono text-slate-900">{formatCurrency(stat.revenue)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-105 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-red-800 rounded-full" 
                            style={{ width: `${(stat.revenue / (productStats[0]?.revenue || 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 3: CUSTOMER MULTI-TRACE HISTORICAL */}
          {activeTab === 'customers' && (
            <motion.div
              key="customers"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden"
            >
              <div className="px-6 py-4.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div>
                  <h3 className="font-sans font-bold text-slate-900 text-xs uppercase tracking-wider">Histórico de Performance de Faturamento por Cliente (LTV)</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Entenda quem consome o maior volume financeiro e quais pacotes já enviou</p>
                </div>
                <div className="text-[9px] font-black text-red-800 bg-red-50 border border-red-100/50 uppercase px-2.5 py-1 rounded-lg">
                  LIFETIME VALUE (LTV)
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/10 border-b border-slate-100">
                      <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Cliente</th>
                      <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Totais Gastos Contados</th>
                      <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Pedidos Concluídos</th>
                      <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Itens Comprados</th>
                      <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Lotes / Códs de Rastreios Vinculados</th>
                      <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Última Compra</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customerStats.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-slate-400">Sem histórico disponível.</td>
                      </tr>
                    ) : (
                      customerStats
                        .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((cStat) => (
                          <tr key={cStat.id} className="hover:bg-slate-50/30 transition-colors">
                            <td className="p-4 px-6 font-bold text-slate-900 text-sm uppercase">{cStat.name}</td>
                            <td className="p-4 px-6 font-mono font-bold text-emerald-600 text-[13px]">{formatCurrency(cStat.spentTotal)}</td>
                            <td className="p-4 px-6 text-xs text-slate-600 font-medium">{cStat.ordersCount} pedido(s)</td>
                            <td className="p-4 px-6 font-mono text-xs">{cStat.productsCount} unidade(s)</td>
                            <td className="p-4 px-6">
                              <div className="flex flex-wrap gap-1.5 max-w-xs">
                                {cStat.linkedShipments.size > 0 ? (
                                  Array.from(cStat.linkedShipments).map((track, idx) => (
                                    <span key={idx} className="text-[9.5px] font-mono font-bold bg-slate-100 border border-slate-200/60 text-slate-700 px-2 py-0.5 rounded-lg select-all">
                                      {track}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">Nenhum</span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 px-6 text-xs text-slate-500 font-medium">
                              {cStat.lastPurchaseDate ? (
                                <span className="flex items-center gap-1">
                                  <Clock size={11} />
                                  {formatDateShort(cStat.lastPurchaseDate)}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
