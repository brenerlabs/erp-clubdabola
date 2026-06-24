import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Sale, Shipment, Transaction, Customer, Product, Expense } from '../types';
import { formatCurrency, cn, smartSearchMatch } from '../lib/utils';
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
  RefreshCw,
  Percent,
  TrendingDown,
  ArrowDownRight,
  Briefcase,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts';

export default function Reports() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Copy state helper
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Active view tab: 'all' | 'products' | 'customers' | 'dre'
  const [activeTab, setActiveTab] = useState<'all' | 'products' | 'customers' | 'dre'>('all');

  // Subview for products tab: 'general' | 'abc'
  const [productSubView, setProductSubView] = useState<'general' | 'abc'>('general');
  // ABC classification criteria: 'revenue' | 'quantity'
  const [abcCriteria, setAbcCriteria] = useState<'revenue' | 'quantity'>('revenue');
  // ABC classification filter: 'all' | 'A' | 'B' | 'C'
  const [abcFilter, setAbcFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');

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

    const unsubExp = onSnapshot(collection(db, 'expenses'), (snapshot) => {
      setExpenses(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
    });

    return () => {
      unsubSales();
      unsubShipments();
      unsubTrans();
      unsubCust();
      unsubProd();
      unsubExp();
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
      const isAdjustment = sale.isAdjustment || (sale.items || []).some(item => item && item.productId === 'sistema_ajuste_auditoria');
      if (isAdjustment) return;
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
      const matchesSearch = smartSearchMatch([
        rec.id,
        rec.originalRefId,
        rec.customerName,
        rec.linkedTrackingCode,
        ...(rec.itemsSummary || []).map(it => it.name)
      ], searchQuery);

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
      // Skip cancelled & adjustments
      if (sale.status === 'Cancelada') return;
      const isAdjustment = sale.isAdjustment || (sale.items || []).some(item => item && item.productId === 'sistema_ajuste_auditoria');
      if (isAdjustment) return;

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


  // 2.5 DYNAMIC ABC CURVE AND INVENTORY TURNOVER (GIRO DE ESTOQUE) CALCULATIONS
  const abcAndTurnoverStats = React.useMemo(() => {
    // 1. Calculate time span in days
    let daysInPeriod = 30;
    if (startDate && endDate) {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      if (diff > 0) daysInPeriod = diff;
    } else if (sales.length > 0) {
      const times = sales
        .map(s => {
          const t = s.createdAt;
          if (!t) return null;
          return t.seconds ? t.seconds * 1000 : new Date(t).getTime();
        })
        .filter((t): t is number => t !== null);
      if (times.length > 1) {
        const min = Math.min(...times);
        const max = Math.max(...times);
        const diff = Math.ceil((max - min) / (1000 * 60 * 60 * 24));
        if (diff > 0) daysInPeriod = diff;
      }
    }

    // 2. Aggregate sales for each product in the filtered period
    const productSalesMap: { [prodId: string]: { qtySold: number; revenue: number } } = {};
    
    sales.forEach(sale => {
      // Filter out cancelled and adjustments
      if (sale.status === 'Cancelada') return;
      const isAdjustment = sale.isAdjustment || (sale.items || []).some(item => item && item.productId === 'sistema_ajuste_auditoria');
      if (isAdjustment) return;

      // Filter by date range if specified
      if (startDate || endDate) {
        const saleTime = sale.createdAt?.seconds ? sale.createdAt.seconds * 1000 : new Date(sale.createdAt).getTime();
        if (startDate) {
          const startTime = new Date(startDate + 'T00:00:00').getTime();
          if (saleTime < startTime) return;
        }
        if (endDate) {
          const endTime = new Date(endDate + 'T23:59:59').getTime();
          if (saleTime > endTime) return;
        }
      }

      // Sum items
      (sale.items || []).forEach(item => {
        if (!productSalesMap[item.productId]) {
          productSalesMap[item.productId] = { qtySold: 0, revenue: 0 };
        }
        productSalesMap[item.productId].qtySold += item.quantity || 0;
        productSalesMap[item.productId].revenue += (item.quantity || 0) * (item.price || 0);
      });
    });

    // 3. Build stats list including ALL products from catalog (so we can see products with 0 sales)
    let list = products.map(prod => {
      const salesData = productSalesMap[prod.id || ''] || { qtySold: 0, revenue: 0 };
      const totalStock = prod.totalStock || 0;
      const minStock = prod.minStock || 0;
      const costPrice = prod.costPrice || 0;
      const sellingPrice = prod.sellingPrice || 0;

      // Turnover rate (Giro de Estoque)
      const turnRate = totalStock > 0 ? (salesData.qtySold / totalStock) : (salesData.qtySold > 0 ? salesData.qtySold : 0);

      // Average daily sales and stock coverage
      const dailyVelocity = salesData.qtySold / daysInPeriod;
      const coverageDays = dailyVelocity > 0 ? (totalStock / dailyVelocity) : (totalStock > 0 ? Infinity : 0);

      // Recommended Action
      let recommendation = 'Estável';
      if (totalStock === 0) {
        recommendation = 'Repor Urgente';
      } else if (salesData.qtySold === 0) {
        recommendation = 'Sem Saída (Promover)';
      } else if (totalStock <= minStock) {
        recommendation = 'Estoque Baixo';
      } else if (coverageDays < 15) {
        recommendation = 'Repor Estoque';
      } else if (coverageDays > 120) {
        recommendation = 'Excesso (Promoção)';
      }

      return {
        id: prod.id || '',
        name: prod.name,
        category: prod.category || 'Outros',
        totalStock,
        minStock,
        costPrice,
        sellingPrice,
        qtySold: salesData.qtySold,
        revenue: salesData.revenue,
        turnRate,
        dailyVelocity,
        coverageDays,
        recommendation
      };
    });

    // 4. Sort based on criteria
    const sortKey = abcCriteria === 'revenue' ? 'revenue' : 'qtySold';
    list.sort((a, b) => b[sortKey] - a[sortKey]);

    // 5. Compute total sum for criteria and assign ABC classes
    const totalSum = list.reduce((sum, item) => sum + item[sortKey], 0);
    
    let runningSum = 0;
    list = list.map(item => {
      runningSum += item[sortKey];
      const cumulativePercent = totalSum > 0 ? (runningSum / totalSum) * 100 : 100;
      
      // Class A: Top 70%
      // Class B: Next 20% (up to 90%)
      // Class C: Bottom 10% (above 90% or 0 sales)
      let abcClass: 'A' | 'B' | 'C' = 'C';
      if (item[sortKey] > 0) {
        if (cumulativePercent <= 70) {
          abcClass = 'A';
        } else if (cumulativePercent <= 90) {
          abcClass = 'B';
        } else {
          abcClass = 'C';
        }
      } else {
        abcClass = 'C'; // 0 sales is always Class C
      }

      return {
        ...item,
        cumulativePercent,
        abcClass
      };
    });

    // 6. Calculate summaries for each ABC class
    const summaries = {
      totalRevenue: list.reduce((acc, x) => acc + x.revenue, 0),
      totalQtySold: list.reduce((acc, x) => acc + x.qtySold, 0),
      classA: { count: 0, revenue: 0, qty: 0 },
      classB: { count: 0, revenue: 0, qty: 0 },
      classC: { count: 0, revenue: 0, qty: 0 },
    };

    list.forEach(item => {
      if (item.abcClass === 'A') {
        summaries.classA.count++;
        summaries.classA.revenue += item.revenue;
        summaries.classA.qty += item.qtySold;
      } else if (item.abcClass === 'B') {
        summaries.classB.count++;
        summaries.classB.revenue += item.revenue;
        summaries.classB.qty += item.qtySold;
      } else {
        summaries.classC.count++;
        summaries.classC.revenue += item.revenue;
        summaries.classC.qty += item.qtySold;
      }
    });

    return {
      list,
      daysInPeriod,
      summaries
    };
  }, [products, sales, startDate, endDate, abcCriteria]);


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
      const isAdjustment = sale.isAdjustment || (sale.items || []).some(item => item && item.productId === 'sistema_ajuste_auditoria');
      if (isAdjustment) return;
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


  // 4. DRE (DEMONSTRATIVO DE RESULTADOS DO EXERCÍCIO) MONTHLY CALCULATION
  const dreByMonth = React.useMemo(() => {
    const monthlyData: {
      [monthKey: string]: {
        monthKey: string;
        monthLabel: string;
        grossRevenue: number;
        cmv: number;
        grossProfit: number;
        expensesTotal: number;
        expensesByCategory: { [category: string]: number };
        netProfit: number;
        margin: number;
        salesCount: number;
        cancelledSalesCount: number;
        cancelledSalesAmount: number;
      }
    } = {};

    const getMonthKeyAndLabel = (timestamp: any) => {
      if (!timestamp) return null;
      const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
      const year = date.getFullYear();
      const month = date.getMonth(); // 0-11
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthsLabel = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      const monthLabel = `${monthsLabel[month]} ${year}`;
      return { monthKey, monthLabel };
    };

    // Process Sales (Gross Revenue and CMV)
    sales.forEach(sale => {
      const monthInfo = getMonthKeyAndLabel(sale.createdAt);
      if (!monthInfo) return;
      const { monthKey, monthLabel } = monthInfo;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          monthKey,
          monthLabel,
          grossRevenue: 0,
          cmv: 0,
          grossProfit: 0,
          expensesTotal: 0,
          expensesByCategory: {
            'Marketing/Ads': 0,
            'Plataforma/Sistemas': 0,
            'Embalagens': 0,
            'Aluguel/Estrutura': 0,
            'Logística Extra': 0,
            'Perdas/Avarias': 0,
            'Consumo Próprio': 0,
            'Outros': 0
          },
          netProfit: 0,
          margin: 0,
          salesCount: 0,
          cancelledSalesCount: 0,
          cancelledSalesAmount: 0
        };
      }

      if (sale.status === 'Cancelada') {
        monthlyData[monthKey].cancelledSalesCount += 1;
        monthlyData[monthKey].cancelledSalesAmount += sale.total;
        return;
      }

      const isAdjustment = sale.isAdjustment || (sale.items || []).some(item => item && item.productId === 'sistema_ajuste_auditoria');
      if (isAdjustment) return;

      monthlyData[monthKey].grossRevenue += sale.total;
      monthlyData[monthKey].salesCount += 1;

      // Calculate CMV (Custo da Mercadoria Vendida)
      let saleCmv = 0;
      sale.items?.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        const cost = product ? (product.costPrice || 0) : 0;
        saleCmv += cost * item.quantity;
      });
      monthlyData[monthKey].cmv += saleCmv;
    });

    // Process Expenses
    expenses.forEach(exp => {
      const monthInfo = getMonthKeyAndLabel(exp.createdAt);
      if (!monthInfo) return;
      const { monthKey, monthLabel } = monthInfo;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          monthKey,
          monthLabel,
          grossRevenue: 0,
          cmv: 0,
          grossProfit: 0,
          expensesTotal: 0,
          expensesByCategory: {
            'Marketing/Ads': 0,
            'Plataforma/Sistemas': 0,
            'Embalagens': 0,
            'Aluguel/Estrutura': 0,
            'Logística Extra': 0,
            'Perdas/Avarias': 0,
            'Consumo Próprio': 0,
            'Outros': 0
          },
          netProfit: 0,
          margin: 0,
          salesCount: 0,
          cancelledSalesCount: 0,
          cancelledSalesAmount: 0
        };
      }

      const category = exp.category || 'Outros';
      const amount = exp.amount || 0;

      monthlyData[monthKey].expensesTotal += amount;
      if (!monthlyData[monthKey].expensesByCategory[category]) {
        monthlyData[monthKey].expensesByCategory[category] = 0;
      }
      monthlyData[monthKey].expensesByCategory[category] += amount;
    });

    // Calculate Final Margins
    Object.keys(monthlyData).forEach(key => {
      const data = monthlyData[key];
      data.grossProfit = data.grossRevenue - data.cmv;
      data.netProfit = data.grossProfit - data.expensesTotal;
      data.margin = data.grossRevenue > 0 ? (data.netProfit / data.grossRevenue) * 100 : 0;
    });

    // Sort by monthKey descending
    return Object.values(monthlyData).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [sales, products, expenses]);


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
        .filter(p => smartSearchMatch([p.name, p.id], searchQuery))
        .map((it, idx) => [
          `#${idx + 1}`,
          it.name,
          String(it.qtySold),
          formatCurrency(it.revenue),
          `${it.buyers.size} compradores / ${it.uniqueSaleIds.size} vendas`
        ]);
    } else if (activeTab === 'customers') {
      reportTitle = "Histórico de Performance e LTV de Clientes";
      headers = [['Cliente', 'Totais Gastos (LTV)', 'Pedidos Concluídos', 'Itens Comprados', 'Última Compra']];
      body = customerStats
        .filter(c => smartSearchMatch([c.name, c.id], searchQuery))
        .map(cStat => [
          cStat.name,
          formatCurrency(cStat.spentTotal),
          `${cStat.ordersCount} pedido(s)`,
          `${cStat.productsCount} unidade(s)`,
          cStat.lastPurchaseDate ? formatDateShort(cStat.lastPurchaseDate) : '-'
        ]);
    } else if (activeTab === 'dre') {
      reportTitle = "Demonstrativo de Resultados do Exercício (DRE) MoM";
      // Get the 5 most recent months (or all) and reverse so it goes chronologically in columns
      const months = dreByMonth.slice(0, 5).reverse();
      headers = [['Indicador / Mês', ...months.map(m => m.monthLabel)]];
      
      const formatRow = (label: string, fieldKey: string, isExpense = false, expenseCategory?: string) => {
        return [
          label,
          ...months.map(m => {
            if (expenseCategory) {
              const val = m.expensesByCategory[expenseCategory] || 0;
              return formatCurrency(val);
            }
            const val = (m as any)[fieldKey] || 0;
            if (fieldKey === 'margin') {
              return `${val.toFixed(1)}%`;
            }
            return formatCurrency(val);
          })
        ];
      };

      body = [
        formatRow('Receita Bruta (A)', 'grossRevenue'),
        formatRow('(-) Custo de Mercadorias Vendidas - CMV (B)', 'cmv'),
        formatRow('(=) Lucro Bruto / Margem de Contribuição (C = A - B)', 'grossProfit'),
        formatRow('(-) Despesas Operacionais Totais (D)', 'expensesTotal'),
        formatRow('     • Marketing & Tráfego Pago', '', true, 'Marketing/Ads'),
        formatRow('     • Plataformas & Sistemas', '', true, 'Plataforma/Sistemas'),
        formatRow('     • Embalagens & Brindes', '', true, 'Embalagens'),
        formatRow('     • Aluguel & Infraestrutura', '', true, 'Aluguel/Estrutura'),
        formatRow('     • Logística Extra', '', true, 'Logística Extra'),
        formatRow('     • Perdas & Avarias de Estoque', '', true, 'Perdas/Avarias'),
        formatRow('     • Consumo Próprio & Amostras', '', true, 'Consumo Próprio'),
        formatRow('     • Outras Despesas Gerais', '', true, 'Outros'),
        formatRow('(=) Lucro Líquido Real (E = C - D)', 'netProfit'),
        formatRow('Margem de Lucratividade Real (%)', 'margin')
      ];
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
    
    if (activeTab === 'dre') {
      const months = dreByMonth.slice(0, 5);
      const sumRevenue = months.reduce((acc, m) => acc + m.grossRevenue, 0);
      const sumNetProfit = months.reduce((acc, m) => acc + m.netProfit, 0);
      const avgMargin = sumRevenue > 0 ? (sumNetProfit / sumRevenue) * 100 : 0;

      doc.text("RECEITA BRUTA TOTAL (PERÍODO)", 18, 57);
      doc.text("LUCRO LÍQUIDO REAL TOTAL", 85, 57);
      doc.text("MARGEM MÉDIA REAL (%)", 145, 57);
      
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(formatCurrency(sumRevenue), 18, 63);
      doc.text(formatCurrency(sumNetProfit), 85, 63);
      doc.text(`${avgMargin.toFixed(1)}%`, 145, 63);
    } else {
      doc.text("VOLUME TOTAL SELECIONADO", 18, 57);
      doc.text("REGISTROS EXPORTADOS", 85, 57);
      doc.text("VALOR MÉDIO DO TICKET", 145, 57);
      
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(formatCurrency(metrics.totalAmount), 18, 63);
      doc.text(`${metrics.count} registro(s)`, 85, 63);
      doc.text(formatCurrency(metrics.avgTicket), 145, 63);
    }
    
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
    <div className="space-y-4 md:space-y-6 pb-6 md:pb-12">
      {/* Header design following elegant visual system */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 leading-none">
            Rastreabilidade & <span className="text-red-800 underline decoration-red-200 decoration-4 underline-offset-4 tracking-tight font-bold">Relatórios Cruzados</span>
          </h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] font-sans mt-2">Navegabilidade de ponta a ponta: Vendas, Encomendas e Histórico Financeiro</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <button 
            type="button"
            onClick={handleShareReport}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black uppercase text-[10px] tracking-widest rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex-1 sm:flex-initial"
            id="btn-share-report"
          >
            <Download size={13} />
            WhatsApp
          </button>

          <button 
            type="button"
            onClick={handleDownloadPDF}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-800 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex-1 sm:flex-initial"
            id="btn-download-pdf"
          >
            <Download size={13} />
            Gerar PDF
          </button>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="flex flex-wrap border-b border-slate-200/80 gap-1 md:gap-2">
        <button
          onClick={() => { setActiveTab('all'); setSearchQuery(''); }}
          className={cn(
            "px-3 py-2 md:px-6 md:py-3 font-bold text-[10px] md:text-xs uppercase tracking-wider border-b-2 transition-all flex-1 md:flex-initial",
            activeTab === 'all' ? "border-red-800 text-red-800 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          🔍 Geral & Encomendas
        </button>
        <button
          onClick={() => { setActiveTab('products'); setSearchQuery(''); }}
          className={cn(
            "px-3 py-2 md:px-6 md:py-3 font-bold text-[10px] md:text-xs uppercase tracking-wider border-b-2 transition-all flex-1 md:flex-initial",
            activeTab === 'products' ? "border-red-800 text-red-800 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          📦 Por Produtos
        </button>
        <button
          onClick={() => { setActiveTab('customers'); setSearchQuery(''); }}
          className={cn(
            "px-3 py-2 md:px-6 md:py-3 font-bold text-[10px] md:text-xs uppercase tracking-wider border-b-2 transition-all flex-1 md:flex-initial",
            activeTab === 'customers' ? "border-red-800 text-red-800 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          👥 Clientes (LTV)
        </button>
        <button
          onClick={() => { setActiveTab('dre'); setSearchQuery(''); }}
          className={cn(
            "px-3 py-2 md:px-6 md:py-3 font-bold text-[10px] md:text-xs uppercase tracking-wider border-b-2 transition-all flex-1 md:flex-initial",
            activeTab === 'dre' ? "border-red-800 text-red-800 font-extrabold" : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          📊 DRE & Lucratividade Real
        </button>
      </div>

      {/* Unified Filters Dashboard */}
      {activeTab !== 'dre' && (
        <div className="bg-white rounded-[20px] md:rounded-[24px] border border-slate-100 shadow-sm p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2 text-[10px] uppercase font-black text-slate-400 tracking-wider">
          <Filter size={12} className="text-slate-400" />
          Filtros de Pesquisa
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {/* Text Search */}
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Procurar</label>
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
      )}

      {/* KPI Stats Panel - Dynamic counts based on filters */}
      {activeTab !== 'dre' && (
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
      )}

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
              className="space-y-6"
            >
              {/* Product Sub-View Toggle Navigation */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-[20px] border border-slate-100 shadow-sm">
                <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:max-w-md">
                  <button
                    onClick={() => setProductSubView('general')}
                    className={cn(
                      "flex-1 py-1.5 px-3 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition-all",
                      productSubView === 'general'
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    📈 Desempenho Geral
                  </button>
                  <button
                    onClick={() => setProductSubView('abc')}
                    className={cn(
                      "flex-1 py-1.5 px-3 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5",
                      productSubView === 'abc'
                        ? "bg-white text-red-800 shadow-sm"
                        : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    🔥 Curva ABC & Giro
                  </button>
                </div>

                <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                  <Clock size={11} />
                  Período analisado: {abcAndTurnoverStats.daysInPeriod} dias
                </div>
              </div>

              {productSubView === 'general' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                              .filter(p => smartSearchMatch([p.name, p.id], searchQuery))
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
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
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
                </div>
              ) : (
                // DYNAMIC ABC CURVE & INVENTORY TURNOVER DASHBOARD
                <div className="space-y-6">
                  {/* Summary Metric Cards (A, B, C, Turnover) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Class A */}
                    <div className="bg-white p-5 rounded-[20px] border border-red-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
                      <div className="absolute right-3 top-3 size-6 rounded-full bg-red-50 text-red-700 flex items-center justify-center font-black text-xs">
                        A
                      </div>
                      <div>
                        <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Classe A (Alto Impacto)</p>
                        <h4 className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(abcAndTurnoverStats.summaries.classA.revenue)}</h4>
                        <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                          {abcAndTurnoverStats.summaries.classA.count} produto(s) • {abcAndTurnoverStats.summaries.classA.qty} vendidos
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-[11px] font-black text-red-800">
                        <span>REPRESENTATIVIDADE</span>
                        <span>
                          {abcAndTurnoverStats.summaries.totalRevenue > 0
                            ? ((abcAndTurnoverStats.summaries.classA.revenue / abcAndTurnoverStats.summaries.totalRevenue) * 100).toFixed(1)
                            : 0}%
                        </span>
                      </div>
                    </div>

                    {/* Class B */}
                    <div className="bg-white p-5 rounded-[20px] border border-amber-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
                      <div className="absolute right-3 top-3 size-6 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center font-black text-xs">
                        B
                      </div>
                      <div>
                        <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Classe B (Médio Impacto)</p>
                        <h4 className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(abcAndTurnoverStats.summaries.classB.revenue)}</h4>
                        <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                          {abcAndTurnoverStats.summaries.classB.count} produto(s) • {abcAndTurnoverStats.summaries.classB.qty} vendidos
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-[11px] font-black text-amber-700">
                        <span>REPRESENTATIVIDADE</span>
                        <span>
                          {abcAndTurnoverStats.summaries.totalRevenue > 0
                            ? ((abcAndTurnoverStats.summaries.classB.revenue / abcAndTurnoverStats.summaries.totalRevenue) * 100).toFixed(1)
                            : 0}%
                        </span>
                      </div>
                    </div>

                    {/* Class C */}
                    <div className="bg-white p-5 rounded-[20px] border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden">
                      <div className="absolute right-3 top-3 size-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-black text-xs">
                        C
                      </div>
                      <div>
                        <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Classe C (Baixo Impacto / Cauda)</p>
                        <h4 className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(abcAndTurnoverStats.summaries.classC.revenue)}</h4>
                        <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                          {abcAndTurnoverStats.summaries.classC.count} produto(s) • {abcAndTurnoverStats.summaries.classC.qty} vendidos
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-[11px] font-black text-slate-500">
                        <span>REPRESENTATIVIDADE</span>
                        <span>
                          {abcAndTurnoverStats.summaries.totalRevenue > 0
                            ? ((abcAndTurnoverStats.summaries.classC.revenue / abcAndTurnoverStats.summaries.totalRevenue) * 100).toFixed(1)
                            : 0}%
                        </span>
                      </div>
                    </div>

                    {/* Stock Turnover Metric */}
                    <div className="bg-slate-900 text-white p-5 rounded-[20px] shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Giro Geral de Estoque</p>
                          <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-900/50">EFICIÊNCIA</span>
                        </div>
                        <h4 className="text-2xl font-mono font-black mt-1">
                          {(() => {
                            const totalStock = products.reduce((acc, p) => acc + (p.totalStock || 0), 0);
                            const totalSold = abcAndTurnoverStats.summaries.totalQtySold;
                            const turn = totalStock > 0 ? (totalSold / totalStock) : 0;
                            return `${turn.toFixed(2)}x`;
                          })()}
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Giro de estoque acumulado de todos os produtos do catálogo</p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-800 text-[10px] text-slate-300 font-medium">
                        Catálogo ativo com {products.length} itens cadastrados
                      </div>
                    </div>
                  </div>

                  {/* Lorenz Curve / ABC Pareto Chart */}
                  <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div>
                        <h4 className="font-sans font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                          <TrendingUp size={14} className="text-red-800" />
                          Curva de Distribuição e Acumulado de Vendas (Pareto)
                        </h4>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">Visão unificada das vendas individuais por produto (barras coloridas por Classe ABC) com linha de faturamento acumulado</p>
                      </div>

                      {/* Criteria Switcher */}
                      <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                        <button
                          onClick={() => setAbcCriteria('revenue')}
                          className={cn(
                            "py-1 px-2.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                            abcCriteria === 'revenue' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                          )}
                        >
                          R$ Faturamento
                        </button>
                        <button
                          onClick={() => setAbcCriteria('quantity')}
                          className={cn(
                            "py-1 px-2.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                            abcCriteria === 'quantity' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                          )}
                        >
                          Unidades Vendidas
                        </button>
                      </div>
                    </div>

                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={abcAndTurnoverStats.list.slice(0, 15).map(item => ({
                            name: item.name.length > 15 ? item.name.slice(0, 15) + '...' : item.name,
                            'Valor': abcCriteria === 'revenue' ? item.revenue : item.qtySold,
                            'Acumulado %': item.cumulativePercent,
                            abcClass: item.abcClass
                          }))}
                          margin={{ top: 10, right: -5, bottom: 0, left: -20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis yAxisId="left" tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{ borderRadius: '16px', border: '1px solid #f1f5f9', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '11px', fontFamily: 'Inter' }}
                            formatter={(value: any, name: string) => {
                              if (name === 'Acumulado %') return [`${parseFloat(value).toFixed(1)}%`, name];
                              return [abcCriteria === 'revenue' ? formatCurrency(value) : `${value} unidades`, name];
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 700, paddingTop: '10px' }} />
                          <Bar yAxisId="left" dataKey="Valor" radius={[4, 4, 0, 0]} barSize={25}>
                            {abcAndTurnoverStats.list.slice(0, 15).map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={
                                  entry.abcClass === 'A' 
                                    ? '#991b1b' 
                                    : entry.abcClass === 'B' 
                                      ? '#d97706' 
                                      : '#64748b'
                                } 
                              />
                            ))}
                          </Bar>
                          <Line yAxisId="right" type="monotone" dataKey="Acumulado %" stroke="#0f172a" strokeWidth={3} dot={{ r: 4, fill: '#0f172a' }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Table with filtering & advanced inventory KPIs */}
                  <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h4 className="font-sans font-bold text-slate-900 text-xs uppercase tracking-wider">Matriz ABC de Giro de Estoque</h4>
                        <p className="text-[10px] text-slate-400 font-medium">Análise de eficiência de capital de giro, cobertura em dias, velocidade de vendas diárias e ações de compra recomendadas</p>
                      </div>

                      {/* ABC Filter pills */}
                      <div className="flex bg-slate-100 p-1 rounded-xl shrink-0 w-fit self-start md:self-center">
                        {[
                          { label: 'Todos', value: 'all' },
                          { label: 'Classe A', value: 'A' },
                          { label: 'Classe B', value: 'B' },
                          { label: 'Classe C', value: 'C' }
                        ].map(p => (
                          <button
                            key={p.value}
                            onClick={() => setAbcFilter(p.value as any)}
                            className={cn(
                              "py-1 px-3 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-all",
                              abcFilter === p.value 
                                ? p.value === 'A'
                                  ? "bg-red-800 text-white shadow-sm"
                                  : p.value === 'B'
                                    ? "bg-amber-600 text-white shadow-sm"
                                    : p.value === 'C'
                                      ? "bg-slate-700 text-white shadow-sm"
                                      : "bg-white text-slate-900 shadow-sm"
                                : "text-slate-400 hover:text-slate-600"
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-50/20 border-b border-slate-100">
                            <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Produto</th>
                            <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Classe</th>
                            <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">Estoque Atual / Min</th>
                            <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Vendas do Período</th>
                            <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Giro de Estoque</th>
                            <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Cobertura</th>
                            <th className="p-4 px-6 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">Ação Sugerida</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {abcAndTurnoverStats.list
                            .filter(item => smartSearchMatch([item.name, item.id, item.category], searchQuery))
                            .filter(item => abcFilter === 'all' || item.abcClass === abcFilter).length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-12 text-center text-slate-400">Nenhum produto correspondente aos filtros de pesquisa ou classe.</td>
                              </tr>
                            ) : (
                              abcAndTurnoverStats.list
                                .filter(item => smartSearchMatch([item.name, item.id, item.category], searchQuery))
                                .filter(item => abcFilter === 'all' || item.abcClass === abcFilter)
                                .map((item) => (
                                  <tr key={item.id} className="hover:bg-slate-50/30 transition-colors">
                                    {/* Product details */}
                                    <td className="p-4 px-6">
                                      <div className="flex flex-col">
                                        <span className="font-bold text-xs uppercase text-slate-800">{item.name}</span>
                                        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mt-0.5">{item.category}</span>
                                      </div>
                                    </td>

                                    {/* Class Badge */}
                                    <td className="p-4 px-6 text-center">
                                      <span className={cn(
                                        "inline-block text-[9.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border",
                                        item.abcClass === 'A'
                                          ? "bg-rose-50 text-rose-800 border-rose-100"
                                          : item.abcClass === 'B'
                                            ? "bg-amber-50 text-amber-800 border-amber-100"
                                            : "bg-slate-50 text-slate-500 border-slate-100"
                                      )}>
                                        Classe {item.abcClass}
                                      </span>
                                    </td>

                                    {/* Stock Current vs Min */}
                                    <td className="p-4 px-6 font-medium text-xs">
                                      <div className="flex items-center gap-2">
                                        {item.totalStock <= item.minStock ? (
                                          <div className="flex items-center gap-1.5 text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md font-bold font-mono">
                                            <AlertTriangle size={11} className="shrink-0" />
                                            <span>{item.totalStock} (mín: {item.minStock})</span>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1.5 text-slate-600 font-mono">
                                            <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                                            <span>{item.totalStock} (mín: {item.minStock})</span>
                                          </div>
                                        )}
                                      </div>
                                    </td>

                                    {/* Sales metrics */}
                                    <td className="p-4 px-6 text-right font-medium">
                                      <div className="flex flex-col">
                                        <span className="font-mono text-xs font-bold text-slate-900">{formatCurrency(item.revenue)}</span>
                                        <span className="text-[10px] text-slate-400 font-bold font-mono mt-0.5">x{item.qtySold} un.</span>
                                      </div>
                                    </td>

                                    {/* Turnover Rate */}
                                    <td className="p-4 px-6 text-right font-bold font-mono text-xs text-slate-800">
                                      {item.turnRate.toFixed(2)}x
                                    </td>

                                    {/* Days of Coverage */}
                                    <td className="p-4 px-6 text-right text-xs font-semibold font-mono">
                                      {(() => {
                                        if (item.totalStock === 0) {
                                          return <span className="text-rose-700 font-bold uppercase text-[9.5px]">Esgotado</span>;
                                        }
                                        if (item.coverageDays === Infinity) {
                                          return <span className="text-slate-400 italic">Sem Demanda</span>;
                                        }
                                        if (item.coverageDays > 365) {
                                          return <span className="text-slate-500">&gt; 1 Ano</span>;
                                        }
                                        return <span className="text-slate-800">{Math.round(item.coverageDays)} dias</span>;
                                      })()}
                                    </td>

                                    {/* Action recommended */}
                                    <td className="p-4 px-6 text-center">
                                      <span className={cn(
                                        "inline-block text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border",
                                        item.recommendation === 'Repor Urgente'
                                          ? "bg-red-50 text-red-700 border-red-100"
                                          : item.recommendation === 'Estoque Baixo' || item.recommendation === 'Repor Estoque'
                                            ? "bg-amber-50 text-amber-700 border-amber-100"
                                            : item.recommendation === 'Excesso (Promoção)'
                                              ? "bg-indigo-50 text-indigo-700 border-indigo-100/50"
                                              : item.recommendation === 'Sem Saída (Promover)'
                                                ? "bg-purple-50 text-purple-700 border-purple-100/50"
                                                : "bg-emerald-50 text-emerald-800 border-emerald-100"
                                      )}>
                                        {item.recommendation}
                                      </span>
                                    </td>
                                  </tr>
                                ))
                            )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
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
                        .filter(c => smartSearchMatch([c.name], searchQuery))
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

          {activeTab === 'dre' && (
            <motion.div
              key="dre"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-6"
            >
              {/* DRE Header and Period Summary */}
              <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-sans font-bold text-slate-900 text-sm uppercase tracking-wider">Demonstrativo de Resultados do Exercício (DRE)</h3>
                    <p className="text-[10px] text-slate-400 font-medium">Análise de lucratividade real consolidando faturamento, CMV de estoque, despesas operacionais e custos com perdas ou retiradas</p>
                  </div>
                  <div className="text-[9px] font-black text-red-800 bg-red-50 border border-red-100/50 uppercase px-2.5 py-1 rounded-lg shrink-0">
                    Lucratividade Mês a Mês
                  </div>
                </div>

                {dreByMonth.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Receita Bruta ({dreByMonth[0].monthLabel})</p>
                      <h4 className="text-base font-bold text-slate-900 mt-1">{formatCurrency(dreByMonth[0].grossRevenue)}</h4>
                      <p className="text-[9px] text-slate-400 mt-0.5 font-medium">{dreByMonth[0].salesCount} vendas realizadas</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Custo de Mercadorias (CMV)</p>
                      <h4 className="text-base font-bold text-slate-900 mt-1">{formatCurrency(dreByMonth[0].cmv)}</h4>
                      <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
                        {dreByMonth[0].grossRevenue > 0 ? ((dreByMonth[0].cmv / dreByMonth[0].grossRevenue) * 100).toFixed(1) : 0}% do faturamento
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Resultado Bruto</p>
                      <h4 className="text-base font-bold text-slate-900 mt-1">{formatCurrency(dreByMonth[0].grossProfit)}</h4>
                      <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
                        Margem: {dreByMonth[0].grossRevenue > 0 ? ((dreByMonth[0].grossProfit / dreByMonth[0].grossRevenue) * 100).toFixed(1) : 0}%
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Despesas Operacionais</p>
                      <h4 className="text-base font-bold text-slate-900 mt-1">{formatCurrency(dreByMonth[0].expensesTotal)}</h4>
                      <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
                        Proporção: {dreByMonth[0].grossRevenue > 0 ? ((dreByMonth[0].expensesTotal / dreByMonth[0].grossRevenue) * 100).toFixed(1) : 0}%
                      </p>
                    </div>

                    <div className={cn(
                      "p-4 rounded-2xl border col-span-2 md:col-span-1",
                      dreByMonth[0].netProfit >= 0 
                        ? "bg-emerald-50/50 border-emerald-100 text-emerald-900" 
                        : "bg-rose-50/50 border-rose-100 text-rose-900"
                    )}>
                      <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Lucro Líquido Real</p>
                      <h4 className="text-base font-bold mt-1">{formatCurrency(dreByMonth[0].netProfit)}</h4>
                      <p className="text-[9px] mt-0.5 font-medium">
                        Margem Real: {dreByMonth[0].margin.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {dreByMonth.length === 0 ? (
                <div className="bg-white rounded-[24px] border border-slate-100 p-12 text-center text-slate-400">
                  <Package className="mx-auto text-slate-300 mb-2" size={32} />
                  <p className="text-sm font-bold">Nenhum dado de faturamento ou despesas encontrado.</p>
                  <p className="text-xs text-slate-400 mt-1">Realize vendas e adicione despesas no painel financeiro para gerar o DRE.</p>
                </div>
              ) : (
                <>
                  {/* Recharts MoM Chart */}
                  <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-6">
                    <h4 className="font-sans font-bold text-slate-900 text-xs uppercase tracking-wider mb-4 flex items-center gap-2">
                      <TrendingUp size={14} className="text-red-800" />
                      Evolução de Lucratividade Mês a Mês
                    </h4>
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={dreByMonth.slice(0, 6).reverse().map(m => ({
                            name: m.monthLabel.split(' ')[0],
                            'Receita Bruta': m.grossRevenue,
                            'Despesas': m.expensesTotal,
                            'Lucro Líquido': m.netProfit,
                            'Margem %': m.margin
                          }))}
                          margin={{ top: 10, right: 10, bottom: 0, left: -10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '16px', border: '1px solid #f1f5f9', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '11px', fontFamily: 'Inter' }}
                            formatter={(value: any, name: string) => {
                              if (name === 'Margem %') return [`${parseFloat(value).toFixed(1)}%`, name];
                              return [formatCurrency(value), name];
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 700, paddingTop: '10px' }} />
                          <Bar dataKey="Receita Bruta" fill="#991b1b" radius={[4, 4, 0, 0]} barSize={25} />
                          <Bar dataKey="Despesas" fill="#64748b" radius={[4, 4, 0, 0]} barSize={25} />
                          <Line type="monotone" dataKey="Lucro Líquido" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Horizontal Tabular DRE Sheet */}
                  <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                      <h4 className="font-sans font-bold text-slate-900 text-xs uppercase tracking-wider">Demonstrativo Detalhado (DRE Estruturado)</h4>
                      <p className="text-[10px] text-slate-400 font-medium">Siga a estrutura contábil padrão para analisar as deduções e margens de contribuição passo a passo</p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-50/40 border-b border-slate-100 text-left">
                            <th className="p-4 px-6 text-[10px] font-black uppercase tracking-wider text-slate-400 border-r border-slate-100 min-w-[280px]">Indicador de Resultados</th>
                            {dreByMonth.slice(0, 5).reverse().map(m => (
                              <th key={m.monthKey} className="p-4 px-6 text-[10px] font-black uppercase tracking-wider text-slate-500 text-right min-w-[140px]">
                                {m.monthLabel}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {/* Revenue Row */}
                          <tr className="bg-slate-50/10 font-bold">
                            <td className="p-4 px-6 text-xs text-slate-900 border-r border-slate-100 uppercase tracking-wide">Receita Bruta de Vendas (A)</td>
                            {dreByMonth.slice(0, 5).reverse().map(m => (
                              <td key={m.monthKey} className="p-4 px-6 text-[13px] font-mono text-slate-900 text-right">
                                {formatCurrency(m.grossRevenue)}
                              </td>
                            ))}
                          </tr>

                          {/* CMV Row */}
                          <tr className="text-slate-600 font-medium">
                            <td className="p-4 px-6 text-xs text-slate-600 border-r border-slate-100 pl-8">(-) Custo de Mercadorias Vendidas - CMV (B)</td>
                            {dreByMonth.slice(0, 5).reverse().map(m => (
                              <td key={m.monthKey} className="p-4 px-6 text-xs font-mono text-right text-rose-700">
                                - {formatCurrency(m.cmv)}
                              </td>
                            ))}
                          </tr>

                          {/* Gross Profit Row */}
                          <tr className="bg-slate-50/50 font-bold border-y border-slate-100">
                            <td className="p-4 px-6 text-xs text-slate-900 border-r border-slate-100 uppercase tracking-wide">(=) Resultado Operacional Bruto (C = A - B)</td>
                            {dreByMonth.slice(0, 5).reverse().map(m => (
                              <td key={m.monthKey} className="p-4 px-6 text-[13px] font-mono text-slate-900 text-right font-black">
                                {formatCurrency(m.grossProfit)}
                              </td>
                            ))}
                          </tr>

                          {/* Expenses Total Header Row */}
                          <tr className="font-bold text-slate-900 bg-slate-50/10">
                            <td className="p-4 px-6 text-xs border-r border-slate-100 uppercase tracking-wide">(-) Despesas Operacionais Gerais (D)</td>
                            {dreByMonth.slice(0, 5).reverse().map(m => (
                              <td key={m.monthKey} className="p-4 px-6 text-xs font-mono text-right text-rose-700">
                                - {formatCurrency(m.expensesTotal)}
                              </td>
                            ))}
                          </tr>

                          {/* Individual Expense Categories */}
                          {[
                            { label: 'Marketing & Tráfego Pago', key: 'Marketing/Ads' },
                            { label: 'Plataformas & Sistemas', key: 'Plataforma/Sistemas' },
                            { label: 'Embalagens & Brindes', key: 'Embalagens' },
                            { label: 'Aluguel & Infraestrutura', key: 'Aluguel/Estrutura' },
                            { label: 'Logística Extra', key: 'Logística Extra' },
                            { label: 'Perdas & Avarias (Ajustes de Estoque)', key: 'Perdas/Avarias', highlight: true },
                            { label: 'Consumo Próprio & Amostras (Ajustes de Estoque)', key: 'Consumo Próprio', highlight: true },
                            { label: 'Outras Despesas de Gestão', key: 'Outros' }
                          ].map(cat => (
                            <tr key={cat.key} className={cn("text-slate-500 hover:bg-slate-50/20 transition-all text-[11.5px]", cat.highlight && "bg-amber-50/20")}>
                              <td className="p-3.5 px-6 border-r border-slate-100 pl-10 flex items-center gap-1.5 font-medium">
                                <span className="text-slate-300">•</span>
                                {cat.label}
                              </td>
                              {dreByMonth.slice(0, 5).reverse().map(m => {
                                const value = m.expensesByCategory[cat.key] || 0;
                                return (
                                  <td key={m.monthKey} className="p-3.5 px-6 font-mono text-right text-slate-600">
                                    {value > 0 ? `- ${formatCurrency(value)}` : '-'}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}

                          {/* Net Profit Row */}
                          <tr className="bg-emerald-50/20 border-t border-slate-200/80 font-bold">
                            <td className="p-4 px-6 text-xs text-emerald-950 border-r border-slate-100 uppercase tracking-wider font-extrabold">(=) Resultado Líquido Real (E = C - D)</td>
                            {dreByMonth.slice(0, 5).reverse().map(m => (
                              <td key={m.monthKey} className={cn(
                                "p-4 px-6 text-sm font-mono text-right font-black",
                                m.netProfit >= 0 ? "text-emerald-700" : "text-rose-700"
                              )}>
                                {formatCurrency(m.netProfit)}
                              </td>
                            ))}
                          </tr>

                          {/* Profit Margin Row */}
                          <tr className="bg-slate-50/30 font-bold">
                            <td className="p-4 px-6 text-xs text-slate-800 border-r border-slate-100 uppercase tracking-wider font-extrabold">Margem de Lucratividade Real (%)</td>
                            {dreByMonth.slice(0, 5).reverse().map(m => (
                              <td key={m.monthKey} className={cn(
                                "p-4 px-6 text-xs font-mono text-right font-bold",
                                m.margin >= 15 ? "text-emerald-600" : m.margin >= 5 ? "text-amber-600" : "text-rose-600"
                              )}>
                                {m.margin.toFixed(1)}%
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
