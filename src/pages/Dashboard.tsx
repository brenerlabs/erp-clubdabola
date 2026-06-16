import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy, limit, doc, updateDoc, writeBatch, serverTimestamp, getDoc } from 'firebase/firestore';
import { Transaction, Sale, Product, Customer, Shipment, Expense } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { 
  TrendingUp, 
  Users, 
  Package, 
  ArrowUpRight, 
  ArrowDownRight,
  ShoppingCart,
  DollarSign,
  Calendar,
  Wallet,
  X,
  CreditCard,
  Banknote,
  QrCode,
  CheckCircle2,
  Receipt,
  Truck,
  Activity,
  LayoutDashboard,
  Search,
  Tag,
  SlidersHorizontal,
  Lightbulb,
  Sparkles,
  ChevronDown,
  ChevronUp,
  MessageCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line
} from 'recharts';

export default function Dashboard() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [compAmount, setCompAmount] = useState('');
  const [compMethod, setCompMethod] = useState<'Dinheiro' | 'Cartão' | 'Pix'>('Pix');
  const [isCompensating, setIsCompensating] = useState(false);
  const [showAmortizationSuccess, setShowAmortizationSuccess] = useState(false);
  const [amortizationResult, setAmortizationResult] = useState<{
    clientName: string;
    clientContact: string;
    amount: number;
    clientRemainingDebt: number;
    paymentMethod: string;
  } | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  
  // Filters
  const [customerFilter, setCustomerFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const [salesTableFilter, setSalesTableFilter] = useState<'all' | 'pending-fiado' | 'completed'>('all');
  const [salesLimit, setSalesLimit] = useState(10);
  const [showInsights, setShowInsights] = useState(true);
  const [expandedSuppliers, setExpandedSuppliers] = useState<Record<string, boolean>>({});

  const toggleSupplierExpanded = (name: string) => {
    setExpandedSuppliers(prev => ({
      ...prev,
      [name]: !prev[name]
    }));
  };

  const handleShipmentClick = (trackingCode: string) => {
    if (trackingCode === 'Sem Rastreio') return;
    localStorage.setItem('shipment-search', trackingCode);
    window.dispatchEvent(new CustomEvent('navigate-app', { detail: { page: 'shipments' } }));
    window.dispatchEvent(new CustomEvent('shipment-search-update'));
  };

  const categories = React.useMemo(() => {
    return ['all', ...Array.from(new Set(products.map(p => p.category || ''))).filter(Boolean).sort()];
  }, [products]);

  useEffect(() => {
    const unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('createdAt', 'desc')), (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    });

    const unsubProd = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });

    const unsubCust = onSnapshot(collection(db, 'customers'), (snapshot) => {
      setCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    });

    const unsubTrans = onSnapshot(collection(db, 'transactions'), (snapshot) => {
      setTransactions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    });

    const unsubShip = onSnapshot(collection(db, 'shipments'), (snapshot) => {
      setShipments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Shipment)));
    });

    const unsubExp = onSnapshot(collection(db, 'expenses'), (snapshot) => {
      setExpenses(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
    });

    return () => { 
      unsubSales(); 
      unsubProd(); 
      unsubCust(); 
      unsubTrans(); 
      unsubShip(); 
      unsubExp(); 
    };
  }, []);

  // Dynamic Filtering
  const filteredSales = React.useMemo(() => {
    return sales.filter(sale => {
      if (sale.status === 'Pré-venda' || sale.status === 'Cancelada') return false;
      
      const matchesCustomer = customerFilter === 'all' || sale.customerId === customerFilter;
      const matchesProduct = productFilter === 'all' || sale.items.some(item => item.productId === productFilter);
      
      const matchesGender = genderFilter === 'all' || sale.items.some(item => {
        const p = products.find(prod => prod.id === item.productId);
        return p && (p.gender === genderFilter || p.gender === 'Ambos');
      });
      
      const matchesCategory = categoryFilter === 'all' || sale.items.some(item => {
        const p = products.find(prod => prod.id === item.productId);
        return p && p.category === categoryFilter;
      });
      
      const matchesProductSearch = productSearch.trim() === '' || sale.items.some(item => {
        const p = products.find(prod => prod.id === item.productId);
        const term = productSearch.toLowerCase();
        return (
          (p && p.name.toLowerCase().includes(term)) ||
          item.productName.toLowerCase().includes(term) ||
          item.productId.toLowerCase().includes(term)
        );
      });

      return matchesCustomer && matchesProduct && matchesGender && matchesCategory && matchesProductSearch;
    });
  }, [sales, products, customerFilter, productFilter, genderFilter, categoryFilter, productSearch]);

  const stats = React.useMemo(() => {
    let revenue = 0;
    let profit = 0;
    let totalItemsQuantity = 0;
    
    filteredSales.forEach(sale => {
      revenue += sale.total;
      sale.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          profit += (item.price - product.costPrice) * item.quantity;
        }
        totalItemsQuantity += item.quantity;
      });
    });

    const debt = customers
      .filter(c => customerFilter === 'all' || c.id === customerFilter)
      .reduce((acc, c) => acc + (c.totalDebt || 0), 0);

    const paidTaxes = shipments
      .filter(s => s.taxPaid)
      .reduce((acc, s) => acc + (s.taxAmount || 0), 0);

    const pendingTaxes = shipments
      .filter(s => s.hasTax && !s.taxPaid)
      .reduce((acc, s) => acc + (s.taxAmount || 0), 0);

    const totalExp = expenses.reduce((acc, e) => acc + e.amount, 0);

    const efficiencyRatio = revenue > 0 ? ((revenue - debt) / revenue) * 100 : 0;

    return {
      totalRevenue: revenue,
      totalProfit: profit - paidTaxes - totalExp,
      avgTicket: filteredSales.length > 0 ? revenue / filteredSales.length : 0,
      totalItemsSold: totalItemsQuantity,
      avgItemPrice: totalItemsQuantity > 0 ? revenue / totalItemsQuantity : 0,
      avgItemsPerSale: filteredSales.length > 0 ? totalItemsQuantity / filteredSales.length : 0,
      lowStockItems: products.filter(p => !p.isDropshipping && p.totalStock <= p.minStock).length,
      dropshippingOrders: filteredSales.filter(s => s.items.some(i => i.isDropshipping)).length,
      totalDebt: debt,
      totalOrders: filteredSales.length,
      paidTaxes,
      pendingTaxes,
      totalExpenses: totalExp,
      efficiencyRatio
    };
  }, [filteredSales, products, customers, customerFilter, shipments, expenses]);

  const getSaleBalance = React.useCallback((sale: Sale) => {
    if (sale.paymentMethod !== 'Fiado') return 0;
    if (sale.status === 'Cancelada') return 0;
    const paymentsForSale = transactions
      .filter(t => t.saleId === sale.id && t.type === 'payment')
      .reduce((acc, t) => acc + t.amount, 0);
    return Math.max(0, sale.total - paymentsForSale);
  }, [transactions]);

  const filterStats = React.useMemo(() => {
    const results = filteredSales.filter(sale => {
      if (salesTableFilter === 'all') return true;
      const balance = getSaleBalance(sale);
      if (salesTableFilter === 'pending-fiado') {
        return sale.paymentMethod === 'Fiado' && balance > 0;
      }
      if (salesTableFilter === 'completed') {
        return sale.paymentMethod !== 'Fiado' || balance === 0;
      }
      return true;
    });

    const totalValue = results.reduce((acc, sale) => {
      if (salesTableFilter === 'pending-fiado') {
        return acc + getSaleBalance(sale);
      }
      return acc + sale.total;
    }, 0);

    return {
      count: results.length,
      totalValue
    };
  }, [filteredSales, salesTableFilter, getSaleBalance]);

  const handleCompensate = async () => {
    if (!selectedSale || !compAmount) return;
    const amount = parseFloat(compAmount);
    if (isNaN(amount) || amount <= 0) return alert('Valor inválido');

    setIsCompensating(true);
    let clientName = '';
    let clientContact = '';
    let clientRemainingDebt = 0;

    try {
      const batch = writeBatch(db);
      
      if (selectedSale.id.startsWith('debt-')) {
        // CASE 1: General customer-level payment
        const customerId = selectedSale.customerId;
        const pSales = sales
          .filter(s => s.customerId === customerId && s.paymentMethod === 'Fiado' && s.status !== 'Pré-venda')
          .sort((a, b) => {
            const tA = a.createdAt?.seconds || (typeof a.createdAt === 'object' && a.createdAt?.getTime ? a.createdAt.getTime() / 1000 : 0);
            const tB = b.createdAt?.seconds || (typeof b.createdAt === 'object' && b.createdAt?.getTime ? b.createdAt.getTime() / 1000 : 0);
            return tA - tB;
          });

        let remainingAmount = amount;

        for (const sale of pSales) {
          if (remainingAmount <= 0) break;

          // Calculate direct payments already made on this sale
          const paymentsForSale = transactions
            .filter(t => t.saleId === sale.id && t.type === 'payment')
            .reduce((acc, t) => acc + t.amount, 0);

          const saleBalance = Math.max(0, sale.total - paymentsForSale);

          if (saleBalance > 0) {
            const amountToApply = Math.min(remainingAmount, saleBalance);
            remainingAmount -= amountToApply;

            const transRef = doc(collection(db, 'transactions'));
            batch.set(transRef, {
              customerId: customerId,
              amount: amountToApply,
              type: 'payment',
              paymentMethod: compMethod,
              saleId: sale.id,
              createdAt: serverTimestamp()
            });

            if (paymentsForSale + amountToApply >= sale.total) {
              batch.update(doc(db, 'sales', sale.id!), {
                status: 'Concluída',
                updatedAt: serverTimestamp()
              });
            }
          }
        }

        // Leftover gets logged as a general transaction
        if (remainingAmount > 0) {
          const transRef = doc(collection(db, 'transactions'));
          batch.set(transRef, {
            customerId: customerId,
            amount: remainingAmount,
            type: 'payment',
            paymentMethod: compMethod,
            saleId: null,
            createdAt: serverTimestamp()
          });
        }

        // Update Customer Debt
        const custRef = doc(db, 'customers', customerId);
        const custSnap = await getDoc(custRef);
        if (custSnap.exists()) {
          const currentDebt = custSnap.data().totalDebt || 0;
          clientName = custSnap.data().name || '';
          clientContact = custSnap.data().contact || '';
          clientRemainingDebt = Math.max(0, currentDebt - amount);
          batch.update(custRef, {
            totalDebt: clientRemainingDebt,
            updatedAt: serverTimestamp()
          });
        }
      } else {
        // CASE 2: Payment on a specific sale
        const transRef = doc(collection(db, 'transactions'));
        batch.set(transRef, {
          customerId: selectedSale.customerId,
          amount: amount,
          type: 'payment',
          paymentMethod: compMethod,
          saleId: selectedSale.id,
          createdAt: serverTimestamp()
        });

        // Update Customer Debt
        if (selectedSale.customerId) {
          const custRef = doc(db, 'customers', selectedSale.customerId);
          const custSnap = await getDoc(custRef);
          if (custSnap.exists()) {
            const currentDebt = custSnap.data().totalDebt || 0;
            clientName = custSnap.data().name || '';
            clientContact = custSnap.data().contact || '';
            clientRemainingDebt = Math.max(0, currentDebt - amount);
            batch.update(custRef, {
              totalDebt: clientRemainingDebt,
              updatedAt: serverTimestamp()
            });

            const paymentsForSale = transactions
              .filter(t => t.saleId === selectedSale.id && t.type === 'payment')
              .reduce((acc, t) => acc + t.amount, 0);
            
            if ((paymentsForSale + amount) >= selectedSale.total) {
              batch.update(doc(db, 'sales', selectedSale.id!), {
                status: 'Concluída',
                updatedAt: serverTimestamp()
              });
            }
          }
        }
      }

      await batch.commit();
      
      setAmortizationResult({
        clientName: clientName || selectedSale.customerName || 'Consumidor Final',
        clientContact: clientContact || '',
        amount,
        clientRemainingDebt,
        paymentMethod: compMethod
      });
      setShowAmortizationSuccess(true);

      setSelectedSale(null);
      setCompAmount('');
    } catch (err) {
      console.error(err);
      alert('Erro ao compensar.');
    } finally {
      setIsCompensating(false);
    }
  };

  const shareAmortizationWhatsApp = (res: typeof amortizationResult) => {
    if (!res) return;
    const heading = '⚽ *ERP CLUB DA BOLA - Comprovante de Pagamento* ⚽';
    const message = `${heading}\n` +
      `-------------------------------------------\n` +
      `👤 *Cliente:* ${res.clientName}\n` +
      `📅 *Data:* ${new Date().toLocaleString('pt-BR')}\n` +
      `💵 *Valor Compensado:* ${formatCurrency(res.amount)}\n` +
      `📝 *Saldo Devedor Restante:* ${formatCurrency(res.clientRemainingDebt)}\n` +
      `-------------------------------------------\n` +
      `Obrigado! Seu pagamento foi registrado e seu saldo foi atualizado.\n\n_Produzido por: Brener Gomes_`;

    const encoded = encodeURIComponent(message);
    const phone = res.clientContact.replace(/\D/g, '');
    let finalPhone = phone;
    if (phone && phone.length <= 11) {
      finalPhone = '55' + phone;
    }

    try {
      window.open(`https://wa.me/${finalPhone}?text=${encoded}`, '_blank');
    } catch (err) {
      console.warn("WhatsApp blocked or auto-trigger failed:", err);
      alert("Não foi possível redirecionar para o WhatsApp.");
    }
  };

  // Prepare Chart Data
  const salesByDay = React.useMemo(() => {
    const dates = Array.from({ length: 10 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }).reverse();

    return dates.map(date => {
      const daySales = filteredSales.filter(s => {
        if (!s.createdAt) return false;
        const saleDate = new Date(s.createdAt.seconds * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        return saleDate === date;
      });
      return {
        date,
        total: daySales.reduce((acc, s) => acc + s.total, 0),
        quantity: daySales.reduce((acc, s) => acc + s.items.reduce((sum, i) => sum + i.quantity, 0), 0)
      };
    });
  }, [filteredSales]);

  const monthlyComparisonData = React.useMemo(() => {
    const getElementDate = (el: any) => {
      if (!el?.createdAt) return null;
      if (typeof el.createdAt.seconds === 'number') return new Date(el.createdAt.seconds * 1000);
      if (el.createdAt instanceof Date) return el.createdAt;
      if (typeof el.createdAt.toDate === 'function') return el.createdAt.toDate();
      const sec = el.createdAt.seconds || el.createdAt._seconds;
      if (typeof sec === 'number') return new Date(sec * 1000);
      return null;
    };

    // Prepare last 6 months including the current one
    const monthsData: { monthYearStr: string; monthLabel: string; salesTotal: number; amortizedTotal: number }[] = [];
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1); // avoid month transition overflow
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthYearStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
      monthsData.push({
        monthYearStr,
        monthLabel: monthLabel.toUpperCase(),
        salesTotal: 0,
        amortizedTotal: 0
      });
    }

    // Accumulate Sales
    sales.forEach(sale => {
      if (sale.status === 'Pré-venda') return;
      const d = getElementDate(sale);
      if (!d) return;
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthYearStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      
      const found = monthsData.find(m => m.monthYearStr === monthYearStr);
      if (found) {
        found.salesTotal += sale.total || 0;
      }
    });

    // Accumulate Amortizations (transactions with type === 'payment')
    transactions.forEach(tx => {
      if (tx.type !== 'payment') return;
      const d = getElementDate(tx);
      if (!d) return;
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthYearStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      
      const found = monthsData.find(m => m.monthYearStr === monthYearStr);
      if (found) {
        found.amortizedTotal += tx.amount || 0;
      }
    });

    return monthsData;
  }, [sales, transactions]);

  const customerRanking = React.useMemo(() => {
    const ranking: Record<string, { name: string, total: number, count: number }> = {};
    
    sales.filter(s => s.status !== 'Pré-venda' && s.status !== 'Cancelada').forEach(sale => {
      if (!sale.customerId) return;
      if (!ranking[sale.customerId]) {
        ranking[sale.customerId] = { name: sale.customerName || 'Cliente sem nome', total: 0, count: 0 };
      }
      ranking[sale.customerId].total += sale.total;
      ranking[sale.customerId].count += 1;
    });

    return Object.values(ranking).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [sales]);

  const debtors = customers.filter(c => (c.totalDebt || 0) > 0).sort((a, b) => (b.totalDebt || 0) - (a.totalDebt || 0));
  
  const topGiroProducts = React.useMemo(() => {
    const counts: Record<string, { id: string; name: string; category: string; quantity: number; revenue: number }> = {};
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        const prod = products.find(p => p.id === item.productId);
        if (prod) {
          const key = item.productId;
          if (!counts[key]) {
            counts[key] = {
              id: item.productId,
              name: prod.name,
              category: prod.category || 'Geral',
              quantity: 0,
              revenue: 0
            };
          }
          counts[key].quantity += item.quantity;
          counts[key].revenue += item.price * item.quantity;
        }
      });
    });
    return Object.values(counts).sort((a, b) => b.quantity - a.quantity).slice(0, 4);
  }, [filteredSales, products]);
  
  const businessInsights = React.useMemo(() => {
    const list: { id: string; type: 'warning' | 'success' | 'info'; title: string; desc: string }[] = [];

    // 1. Low Stock alert
    const criticalStock = products.filter(p => !p.isDropshipping && p.totalStock <= p.minStock);
    if (criticalStock.length > 0) {
      const pNames = criticalStock.slice(0, 3).map(p => p.name).join(', ');
      list.push({
        id: 'stock-alert',
        type: 'warning',
        title: '🚨 Alerta de Abastecimento: Estoque Crítico Detectado',
        desc: `${criticalStock.length} produto(s) (${pNames}${criticalStock.length > 3 ? ' e outros' : ''}) estão com o estoque no nível crítico ou zerado. Planeje novas compras para evitar faltas.`
      });
    } else {
      list.push({
        id: 'stock-ok',
        type: 'success',
        title: '✅ Estoque Saudável: Níveis de Segurança Mantidos',
        desc: 'Excelente! Todos os seus produtos físicos ativos estão acima do estoque mínimo de segurança.'
      });
    }

    // 2. High Debt & Active receivables alert
    const totalPendingFiado = sales
      .filter(s => s.paymentMethod === 'Fiado')
      .reduce((acc, s) => acc + getSaleBalance(s), 0);

    const debtorsCount = debtors.length;
    if (totalPendingFiado > 0) {
      const topDebtor = debtors.slice().sort((a,b) => (b.totalDebt || 0) - (a.totalDebt || 0))[0];
      const debtorInfo = topDebtor ? ` O maior saldo pertence a ${topDebtor.name} (${formatCurrency(topDebtor.totalDebt || 0)}).` : '';
      list.push({
        id: 'debtors-alert',
        type: 'warning',
        title: '⚠️ Controle de Inadimplência: Vigilância de Fiado',
        desc: `Há um montante de ${formatCurrency(totalPendingFiado)} pendente no fiado distribuído em ${debtorsCount} cliente(s).${debtorInfo} Monitore as cobranças pela tabela para garantir a liquidez.`
      });
    } else {
      list.push({
        id: 'debtors-ok',
        type: 'success',
        title: '💎 Risco Mínimo: Inadimplência Zerada',
        desc: 'Excelente! Todos os fiados estão completamente quitados. O risco de inadimplência ativa é nulo.'
      });
    }

    // 3. Operating Margin insight
    if (stats.totalRevenue > 0) {
      const marginPercentage = (stats.totalProfit / stats.totalRevenue) * 100;
      if (marginPercentage < 20) {
        list.push({
          id: 'margin-low',
          type: 'info',
          title: '📊 Alerta de Margem: Margem Operacional Estreita',
          desc: `Sua margem consolidada é de ${marginPercentage.toFixed(1)}%. Despesas de ${formatCurrency(stats.totalExpenses)} ou custo aduaneiro estão consumindo sua receita. Reforce markups.`
        });
      } else {
        list.push({
          id: 'margin-healthy',
          type: 'success',
          title: '🏆 Excelência Financeira: Alta Rentabilidade Líquida',
          desc: `Sua taxa de lucro líquido real é de excepcionais ${marginPercentage.toFixed(1)}% sobre o faturamento. Você dominou a balança entre despesas gerais e markup comercial!`
        });
      }
    }

    // 4. Average ticket optimization
    if (stats.avgTicket > 0) {
      if (stats.avgTicket < 150) {
        list.push({
          id: 'ticket-low',
          type: 'info',
          title: '🛒 Alavancagem de Ticket: Otimização de Carrinho',
          desc: `Seu ticket médio de compra por cliente está em ${formatCurrency(stats.avgTicket)}. Estimule vendas casadas no PDV ou dê descontos progressivos em múltiplos itens para expandir esse índice.`
        });
      } else {
        list.push({
          id: 'ticket-high',
          type: 'success',
          title: '⭐ Alto Desempenho: Carrinho de Compra Elevado',
          desc: `Seu ticket médio de ${formatCurrency(stats.avgTicket)} é espetacular. Isso significa que seus clientes estão comprando itens de maior valor agregado ou compondo pacotes completos.`
        });
      }
    }

    // 5. Customer Concentration Insight
    if (sales.length > 0 && stats.totalRevenue > 0) {
      const ranking: Record<string, { name: string, total: number }> = {};
      sales.filter(s => s.status !== 'Pré-venda' && s.status !== 'Cancelada').forEach(sale => {
        if (!sale.customerId) return;
        if (!ranking[sale.customerId]) {
          ranking[sale.customerId] = { name: sale.customerName || 'Cliente', total: 0 };
        }
        ranking[sale.customerId].total += sale.total;
      });
      const sortedRanking = Object.values(ranking).sort((a, b) => b.total - a.total);
      if (sortedRanking.length > 0) {
        const topCust = sortedRanking[0];
        const custShare = (topCust.total / stats.totalRevenue) * 100;
        if (custShare > 25) {
          list.push({
            id: 'customer-concentration',
            type: 'warning',
            title: '⚠️ Concentração de Risco: Alto Volume por Único Cliente',
            desc: `O cliente ${topCust.name} representa sozinho ${custShare.toFixed(1)}% do seu faturamento (${formatCurrency(topCust.total)}). Diversifique abordagens para reduzir a dependência de um único cliente.`
          });
        } else {
          list.push({
            id: 'customer-diversity',
            type: 'success',
            title: '🌱 Carteira Diversificada: Distribuição Saudável de Compras',
            desc: `Sua carteira comercial é bem diversificada! Seu comprador principal (${topCust.name}) representa apenas ${custShare.toFixed(1)}% do faturamento total da loja.`
          });
        }
      }
    }

    // 6. Cash Flow / Efficacy of collections
    if (stats.totalRevenue > 0) {
      if (stats.efficiencyRatio < 90) {
        list.push({
          id: 'efficiency-alert',
          type: 'warning',
          title: '💸 Risco de Capital: Liquidez de Caixa Comprometida',
          desc: `Seu índice de conversão de faturamento em caixa real está em ${stats.efficiencyRatio.toFixed(1)}%. Há muito fiado imobilizado. Acelere cobranças para garantir capital de giro fresco.`
        });
      } else {
        list.push({
          id: 'efficiency-ok',
          type: 'success',
          title: '⚡ Ciclo de Caixa Saudável: Liquidez Comercial Eficiente',
          desc: `Excelente! Seu índice de liquidez líquida imediata sob as vendas é de ${stats.efficiencyRatio.toFixed(1)}%. Seu caixa flui rápido e com baixíssima perda financeira.`
        });
      }
    }

    // 7. Fiscal Incident ratio under shipments
    const totalTaxes = stats.paidTaxes + stats.pendingTaxes;
    if (totalTaxes > 0 && stats.totalRevenue > 0) {
      const taxOnRevenue = (totalTaxes / stats.totalRevenue) * 100;
      if (taxOnRevenue > 10) {
        list.push({
          id: 'fiscal-heavy',
          type: 'warning',
          title: '📈 Carga Tributária Elevada: Impacto de Taxas Alfandegárias',
          desc: `Suas taxas aduaneiras acumuladas (${formatCurrency(totalTaxes)}) compõem ${taxOnRevenue.toFixed(1)}% das receitas líquidas. Verifique com fornecedores formas de atenuar taxas alfandegárias.`
        });
      } else {
        list.push({
          id: 'fiscal-light',
          type: 'success',
          title: '🎯 Tributação sob Controle: Custos Sob Medida',
          desc: `Muito bom! O impacto das taxas aduaneiras totais representa apenas ${taxOnRevenue.toFixed(1)}% do faturamento liquefeito da operação.`
        });
      }
    }

    // 8. Dropshipping Ratio mix
    if (stats.totalOrders > 0) {
      const dsRatio = (stats.dropshippingOrders / stats.totalOrders) * 100;
      if (dsRatio > 40) {
        list.push({
          id: 'ds-heavy',
          type: 'info',
          title: '🔄 Eficiência de Estoque: Modelo de Dropshipping Ativo',
          desc: `${dsRatio.toFixed(1)}% das encomendas operam via Dropshipping. Isso agiliza seu fluxo financeiro mantendo sua estrutura física com passivo zero de estoque.`
        });
      } else if (dsRatio > 0) {
        list.push({
          id: 'ds-hybrid',
          type: 'success',
          title: '⚖️ Flexibilidade Operacional: Modelo Híbrido Equilibrada',
          desc: `Seu modelo híbrido une ${dsRatio.toFixed(1)}% de Dropshipping sob demanda a um estoque físico de giro rápido prontamente disponível.`
        });
      }
    }

    // NEW INSIGHT 9: Client Recurrence
    if (customers.length > 0 && sales.length > 0) {
      const purchaseCounts = customers.map(c => {
        const cSales = sales.filter(s => s.customerId === c.id && s.status !== 'Pré-venda' && s.status !== 'Cancelada');
        return cSales.length;
      });
      const loyalCustomers = purchaseCounts.filter(count => count > 1).length;
      const loyaltyRate = (loyalCustomers / customers.length) * 100;

      if (loyaltyRate > 25) {
        list.push({
          id: 'recurrence-high',
          type: 'success',
          title: '👥 Retenção de Clientes: Fidelidade e Consistência Elevada',
          desc: `${loyaltyRate.toFixed(1)}% da sua carteira (${loyalCustomers} cliente(s)) é recorrente. Isso reduz o custo de aquisição e garante entradas futuras previsíveis.`
        });
      } else {
        list.push({
          id: 'recurrence-low',
          type: 'info',
          title: '✉️ Otimização de Clientes: Baixa Recorrência Ativa',
          desc: `Apenas ${loyaltyRate.toFixed(1)}% dos seus clientes compraram mais de uma vez. Envie cupons de cashback ou promova ações no clube do WhatsApp para recuperá-los.`
        });
      }
    }

    // NEW INSIGHT 10: Logistics Resilience / Delivery times
    const inTransitShipments = shipments.filter(s => s.status !== 'Entregue');
    if (inTransitShipments.length > 0) {
      list.push({
        id: 'logistic-resilience',
        type: 'info',
        title: '📦 Logística Internacional: Trânsito e Desembaraço Ativo',
        desc: `Existem ${inTransitShipments.length} lote(s) travessando portos e aduanas atualmente. Mantenha os clientes atualizados com o código de rastreamento para diminuir a ansiedade e manter a confiança.`
      });
    }

    // NEW INSIGHT 11: Giro de Prateleira / SKU Variety
    const activePhysicalProducts = products.filter(p => !p.isDropshipping && p.totalStock > 0);
    const zeroStockProducts = products.filter(p => !p.isDropshipping && p.totalStock === 0);
    if (zeroStockProducts.length > 0 && activePhysicalProducts.length > 0) {
      const emptyRatio = (zeroStockProducts.length / products.length) * 100;
      if (emptyRatio > 15) {
        list.push({
          id: 'skus-out-of-stock',
          type: 'warning',
          title: '🚨 Níveis Globais de SKU: Itens de Prateleira Esgotados',
          desc: `${zeroStockProducts.length} produtos físicos (${emptyRatio.toFixed(1)}% do catálogo) estão com prateleiras vazias. Reabasteça antes que os concorrentes tomem a preferência.`
        });
      }
    }

    // NEW INSIGHT 12: Curva ABC (Concentração de Faturamento por SKU / Pareto)
    if (sales.length > 0 && stats.totalRevenue > 0) {
      const productSales: Record<string, { name: string; total: number }> = {};
      sales.filter(s => s.status !== 'Pré-venda' && s.status !== 'Cancelada').forEach(sale => {
        sale.items.forEach(item => {
          if (!productSales[item.productId]) {
            productSales[item.productId] = { name: item.name, total: 0 };
          }
          productSales[item.productId].total += item.price * item.quantity;
        });
      });
      
      const sortedProductSales = Object.values(productSales).sort((a, b) => b.total - a.total);
      if (sortedProductSales.length > 0) {
        // Calculate share of the top 3 best-selling products
        const top3Total = sortedProductSales.slice(0, 3).reduce((acc, p) => acc + p.total, 0);
        const top3Share = (top3Total / stats.totalRevenue) * 100;
        const topProductNames = sortedProductSales.slice(0, 3).map(p => p.name).join(', ');

        if (top3Share > 50 && sortedProductSales.length > 3) {
          list.push({
            id: 'abc-concentration',
            type: 'warning',
            title: '🎯 Concentração ABC: Alta Dependência de Poucas SKUs',
            desc: `Seus top 3 produtos (${topProductNames}) respondem por ${top3Share.toFixed(1)}% do faturamento total. Considere diversificar as estratégias de marketing para impulsionar outros itens do catálogo.`
          });
        } else {
          list.push({
            id: 'abc-healthy',
            type: 'success',
            title: '🥗 Catálogo Saudável: Faturamento Bem Distribuído',
            desc: `Excelente distribuição de demanda! Seus 3 principais produtos representam apenas ${top3Share.toFixed(1)}% do faturamento total, indicando um catálogo de vendas resiliente e bem diversificado.`
          });
        }
      }
    }

    // NEW INSIGHT 13: Peso das Despesas Gerais no Cash Flow
    if (stats.totalRevenue > 0 && stats.totalExpenses > 0) {
      const expenseRatio = (stats.totalExpenses / stats.totalRevenue) * 105; // adjustment
      const displayExpenseRatio = (stats.totalExpenses / stats.totalRevenue) * 100;
      if (displayExpenseRatio > 25) {
        list.push({
          id: 'expense-ratio-high',
          type: 'warning',
          title: '💸 Alerta de Margem: Peso das Despesas Operacionais',
          desc: `Suas despesas consolidadas somam ${formatCurrency(stats.totalExpenses)}, o que consome ${displayExpenseRatio.toFixed(1)}% da sua receita bruta. Busque renegociar despesas extras ou assinaturas para elevar suas margens de lucro.`
        });
      } else {
        list.push({
          id: 'expense-ratio-lean',
          type: 'success',
          title: '🐳 Gestão Enxuta: Despesas Sob Rigoroso Controle',
          desc: `Muito eficiente! Suas despesas adicionais comprometem apenas ${displayExpenseRatio.toFixed(1)}% do faturamento total da loja. Isso preserva sua lucratividade nítida.`
        });
      }
    }

    // NEW INSIGHT 14: Cross-selling (Quantidade Média de Itens por Carrinho)
    const completedSales = sales.filter(s => s.status !== 'Pré-venda' && s.status !== 'Cancelada');
    if (completedSales.length > 0) {
      const totalItemsCount = completedSales.reduce((acc, s) => acc + s.items.reduce((sum, i) => sum + i.quantity, 0), 0);
      const avgItemsPerSale = totalItemsCount / completedSales.length;

      if (avgItemsPerSale < 1.6) {
        list.push({
          id: 'cross-selling-low',
          type: 'info',
          title: '🛒 Carrinho Unitário: Oportunidade de Venda Casada',
          desc: `Você vende em média apenas ${avgItemsPerSale.toFixed(1)} produto(s) por transação. Crie kits promocionais ("compre junto", "leve 2 com desconto") para motivar clientes a expandir o carrinho.`
        });
      } else {
        list.push({
          id: 'cross-selling-high',
          type: 'success',
          title: '🛍️ cross-selling Consistente: Alta Composição de Vendas',
          desc: `Excelente! Suas vendas contam com uma média saudável de ${avgItemsPerSale.toFixed(1)} itens por transação, o que reduz custos logísticos unitários e otimiza sua receita.`
        });
      }
    }

    // NEW INSIGHT 15: Liquidez Instantânea vs Meios de Pagamento
    if (completedSales.length > 0 && stats.totalRevenue > 0) {
      const revenueByMethod: Record<string, number> = { Dinheiro: 0, Pix: 0, Cartão: 0, Fiado: 0 };
      completedSales.forEach(s => {
        revenueByMethod[s.paymentMethod] = (revenueByMethod[s.paymentMethod] || 0) + s.total;
      });

      const pixShare = (revenueByMethod['Pix'] / stats.totalRevenue) * 100;
      const cardShare = (revenueByMethod['Cartão'] / stats.totalRevenue) * 100;

      if (pixShare > 40) {
        list.push({
          id: 'pix-liquidity-high',
          type: 'success',
          title: '⚡ Pix em Ascensão: Liquidez Imediata Turbinada',
          desc: `Pagamentos instantâneos via Pix representam ${pixShare.toFixed(1)}% do seu faturamento bruto. Isso blinda seu fluxo de caixa contra atrasos e tarifas de maquininhas/adquirentes.`
        });
      } else if (cardShare > 45) {
        list.push({
          id: 'card-fees-high',
          type: 'info',
          title: '💳 Alerta de Intermediação: Elevada Concentração de Cartões',
          desc: `As vendas no Cartão somam ${cardShare.toFixed(1)}% do faturamento. Considere dar um desconto sutil de 3% a 5% em pagamentos via Pix para impulsionar sua liquidez líquida.`
        });
      }
    }

    // NEW INSIGHT 16: Clientes Registrados Inativos / Churn
    if (customers.length > 0) {
      const inactiveCustomers = customers.filter(c => {
        const hasPurchases = sales.some(s => s.customerId === c.id && s.status !== 'Cancelada');
        return !hasPurchases;
      });
      const roundedRatio = Math.min(100, (inactiveCustomers.length / customers.length) * 100);

      if (roundedRatio > 30 && inactiveCustomers.length > 0) {
        list.push({
          id: 'customers-idle',
          type: 'info',
          title: '💤 Clientes Adormecidos: Potencial de Reativação Comercial',
          desc: `${roundedRatio.toFixed(1)}% dos seus clientes cadastrados (${inactiveCustomers.length} cliente(s)) estão sem compras recentes registradas. Envie uma oferta personalizada via WhatsApp para reaquecê-los.`
        });
      }
    }

    return list;
  }, [products, sales, debtors, stats, getSaleBalance, customers, shipments]);
  
  const supplierRanking = React.useMemo(() => {
    const ranking: Record<string, { 
      name: string; 
      totalTax: number; 
      count: number; 
      shipments: Array<{ id?: string; trackingCode: string; status: string; hasTax: boolean; taxAmount: number }> 
    }> = {};
    
    shipments.forEach(s => {
      const supplier = s.supplierName || 'Desconhecido';
      if (!ranking[supplier]) {
        ranking[supplier] = { name: supplier, totalTax: 0, count: 0, shipments: [] };
      }
      ranking[supplier].totalTax += (s.taxAmount || 0);
      ranking[supplier].count += 1;
      ranking[supplier].shipments.push({
        id: s.id,
        trackingCode: s.trackingCode || 'Sem Rastreio',
        status: s.status || 'Processando',
        hasTax: !!s.hasTax,
        taxAmount: s.taxAmount || 0
      });
    });

    return Object.values(ranking).sort((a, b) => b.totalTax - a.totalTax).slice(0, 5);
  }, [shipments]);

      const categoryData = products.reduce((acc: any[], p) => {
    const existing = acc.find(a => a.name === p.category);
    if (existing) existing.value++;
    else acc.push({ name: p.category, value: 1 });
    return acc;
  }, []);

  const COLORS = ['#8c2828', '#c69c3a', '#e57373', '#94a3b8', '#ab5a5a'];

  return (
    <div className="space-y-8 pb-10">
      {/* Header Summary */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight shadow-sm text-slate-950">
            Painel de <span className="text-red-800 underline decoration-red-200 decoration-4 underline-offset-4 tracking-tight font-bold">Performance</span>
          </h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] mt-2">Visão Geral de Performance e Operações</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="size-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">
                {String.fromCharCode(64 + i)}
              </div>
            ))}
          </div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2 border-l border-slate-200">Analistas Ativos</p>
        </div>
      </div>

      {/* Grade Modular de Desempenho Econômico, Liquidez e Giro (Bento Grid) */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white rounded-[32px] border border-slate-200/50 p-6 md:p-8 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.06),0_1px_4px_rgba(0,0,0,0.01)] hover:shadow-[0_24px_60px_-10px_rgba(0,0,0,0.09),0_1px_6px_rgba(0,0,0,0.02)] transition-all duration-300 flex flex-col gap-6 relative overflow-hidden mb-6"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
          <div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-800"></span>
              </span>
              Grade Modular de Desempenho Econômico e Giro
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Sincronização em tempo real de faturamento, liquidez de carteira e preferências do consumidor</p>
          </div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
            {filteredSales.length} OPERAÇÕES ATIVAS
          </div>
        </div>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200/80 to-transparent" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Pillar 1: Faturamento & Rentabilidade */}
          <div className="space-y-4 md:pr-8 md:border-r border-slate-100">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-black tracking-widest uppercase text-slate-400">01. Desempenho Comercial</span>
              <div className="size-8 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold">
                <TrendingUp size={16} />
              </div>
            </div>
            
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Faturamento Bruto</span>
              <h3 className="text-3xl font-black text-slate-900 font-display tracking-tight leading-none uppercase tabular-nums">
                {formatCurrency(stats.totalRevenue)}
              </h3>
            </div>

            <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200/60 to-transparent" />
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Lucro Líquido Real</span>
                  <span className="text-xs font-black text-emerald-600 font-mono tracking-tight tabular-nums">
                    {formatCurrency(stats.totalProfit)}
                  </span>
                </div>
                {stats.totalRevenue > 0 && (
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-lg uppercase tracking-wider font-mono">
                    {((stats.totalProfit / stats.totalRevenue) * 100).toFixed(1)}% Mg
                  </span>
                )}
              </div>

              {/* Custom Profitability Progress Bar */}
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.totalRevenue > 0 ? Math.min(100, Math.max(0, (stats.totalProfit / stats.totalRevenue) * 100)) : 0}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full bg-emerald-500 rounded-full"
                />
              </div>
            </div>
          </div>

          {/* Pillar 2: Controle de Crédito & Liquidez (Fiados) */}
          <div className="space-y-4 md:px-8 md:border-r border-slate-100">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-black tracking-widest uppercase text-slate-400">02. Crédito & Liquidez</span>
              <div className={cn(
                "size-8 rounded-xl flex items-center justify-center font-bold",
                stats.totalDebt > 0 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
              )}>
                <Wallet size={16} />
              </div>
            </div>
            
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Contas a Receber (Fiado)</span>
              <h3 className="text-3xl font-black text-slate-900 font-display tracking-tight leading-none uppercase tabular-nums">
                {formatCurrency(stats.totalDebt)}
              </h3>
            </div>

            <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200/60 to-transparent" />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Eficiência de Caixa</span>
                  <span className={cn(
                    "text-xs font-black font-mono tracking-tight",
                    stats.efficiencyRatio > 85 ? "text-emerald-600" : "text-amber-600"
                  )}>
                    {stats.efficiencyRatio.toFixed(1)}% Liquidado
                  </span>
                </div>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider bg-slate-50 px-2 py-0.5 rounded-md">
                  {debtors.length} Contas
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.efficiencyRatio}%` }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                  className={cn(
                    "h-full rounded-full relative",
                    stats.efficiencyRatio > 85 ? "bg-emerald-500" : "bg-amber-500"
                  )}
                />
              </div>
            </div>
          </div>

          {/* Pillar 3: Produtos de Alto Giro (Best Sellers) */}
          <div className="space-y-3 md:pl-8">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[9px] font-black tracking-widest uppercase text-slate-400">03. Produtos de Alto Giro</span>
              <div className="size-8 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
                <Sparkles size={14} className="text-blue-500 animate-spin" />
              </div>
            </div>

            <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1">
              {topGiroProducts.length === 0 ? (
                <div className="py-6 text-center text-slate-350 text-[10px] font-bold uppercase tracking-wider">Nenhum giro registrado</div>
              ) : (
                topGiroProducts.map((p, idx) => {
                  const maxQty = topGiroProducts[0].quantity || 1;
                  const percentOfTop = (p.quantity / maxQty) * 100;
                  return (
                    <div key={p.id} className="space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-700 leading-none">
                        <span className="truncate max-w-[130px] tracking-tight">{idx + 1}. {p.name}</span>
                        <span className="tabular-nums font-mono text-slate-500">{p.quantity} un <span className="opacity-40">({formatCurrency(p.revenue)})</span></span>
                      </div>
                      <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${percentOfTop}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Outras Métricas Operacionais */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Card 3: Operacional & Despesas */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98, y: 12 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          whileHover={{ y: -5 }}
          viewport={{ once: true }}
          className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-200/50 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.06),0_1px_4px_rgba(0,0,0,0.01)] hover:shadow-[0_24px_60px_-10px_rgba(0,0,0,0.09),0_1px_6px_rgba(0,0,0,0.02)] transition-all duration-300 flex flex-col justify-between group h-full relative overflow-hidden"
        >
          <div>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                <span className="text-[9px] font-black tracking-widest uppercase text-slate-400">Controle Operacional</span>
              </div>
              <div className="size-8 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold transition-transform group-hover:scale-110">
                <Activity size={16} />
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ticket Médio p/ Venda</span>
                  <span className="text-[8px] bg-blue-50 text-blue-600 border border-blue-100 font-bold px-1.5 py-0.5 rounded uppercase font-sans">AOV</span>
                </div>
                <h3 className="text-2xl font-black text-slate-900 font-display tracking-tight leading-none uppercase tabular-nums">
                  {formatCurrency(stats.avgTicket)}
                </h3>
                <p className="text-[8px] text-slate-400 font-bold uppercase leading-tight">Receita total dividida pelo nº de pedidos</p>
              </div>

              <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200/60 to-transparent my-1" />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Preço Médio p/ Peça</span>
                  <p className="text-sm font-black text-slate-800 tracking-tight tabular-nums">
                    {formatCurrency(stats.avgItemPrice)}
                  </p>
                  <p className="text-[8px] text-slate-400 font-bold uppercase leading-none">Média por item individual</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Itens por Venda</span>
                  <p className="text-sm font-black text-slate-800 tracking-tight tabular-nums">
                    {stats.avgItemsPerSale.toFixed(1)} un
                  </p>
                  <p className="text-[8px] text-slate-400 font-bold uppercase leading-none">UPT (Itens por Carrinho)</p>
                </div>
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200/60 to-transparent mt-5 mb-3" />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Despesas Operacionais</span>
                <span className="text-xs font-black text-slate-700 font-mono tracking-tight tabular-nums">
                   {formatCurrency(stats.totalExpenses)}
                </span>
              </div>
              {stats.totalRevenue > 0 && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg uppercase tracking-wider font-mono">
                  {((stats.totalExpenses / stats.totalRevenue) * 100).toFixed(1)}% do Fatur.
                </span>
              )}
            </div>

            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${stats.totalRevenue > 0 ? Math.min(100, Math.max(0, (stats.totalExpenses / stats.totalRevenue) * 100)) : 0}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="h-full bg-blue-500 rounded-full"
              />
            </div>
          </div>
        </motion.div>

        {/* Card 4: Logística, Lotes & Tributações */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98, y: 12 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          whileHover={{ y: -5 }}
          viewport={{ once: true }}
          className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-200/50 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.06),0_1px_4px_rgba(0,0,0,0.01)] hover:shadow-[0_24px_60px_-10px_rgba(0,0,0,0.09),0_1px_6px_rgba(0,0,0,0.02)] transition-all duration-300 flex flex-col justify-between group h-full relative overflow-hidden"
        >
          <div>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                </span>
                <span className="text-[9px] font-black tracking-widest uppercase text-slate-400">Importação & Logística</span>
              </div>
              <div className="size-8 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center font-bold transition-transform group-hover:scale-110">
                <Truck size={16} />
              </div>
            </div>
            
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tributação Aduaneira Geral</span>
              <h3 className="text-2xl font-black text-slate-900 font-display tracking-tight leading-none uppercase tabular-nums">
                {formatCurrency(stats.paidTaxes + stats.pendingTaxes)}
              </h3>
            </div>
          </div>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200/60 to-transparent mt-5 mb-3" />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Logística Ativa</span>
                <span className="text-xs font-black text-purple-700 font-mono tracking-tight">
                  {shipments.filter(s => s.status !== 'Entregue').length} Lotes Ativos
                </span>
              </div>
              {stats.totalOrders > 0 && (
                <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-black rounded-lg uppercase tracking-wider font-mono">
                  {((stats.dropshippingOrders / stats.totalOrders) * 100).toFixed(1)}% Dropship
                </span>
              )}
            </div>

            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${stats.totalOrders > 0 ? Math.min(100, Math.max(0, (stats.dropshippingOrders / stats.totalOrders) * 100)) : 0}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="h-full bg-purple-500 rounded-full"
              />
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Global Business Health Index */}
        <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-950 rounded-3xl p-6 text-white relative overflow-hidden group border border-slate-900">
             <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform">
                <Activity size={80} />
             </div>
             <div className="relative z-10">
                <p className="text-[8px] font-black text-amber-500 uppercase tracking-[0.3em] mb-1">Taxa de Liquidez</p>
                <div className="flex items-end gap-2">
                   <h4 className="text-3xl font-bold tracking-tight">
                     {Math.floor(stats.efficiencyRatio)}
                     <span className="text-xl text-amber-500">.{(stats.efficiencyRatio % 1).toFixed(1).substring(2) || '0'}</span>
                   </h4>
                   <p className="text-[8px] font-bold text-amber-400/60 mb-1 uppercase tracking-widest">
                     {stats.efficiencyRatio === 100 ? 'Máxima' : `${(100 - stats.efficiencyRatio).toFixed(1)}% Risco`}
                   </p>
                </div>
                <div className="mt-4 flex gap-1.5 overflow-x-auto">
                   {['Liquidez', 'Estores', 'Tributos'].map(tag => (
                     <span key={tag} className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[7px] font-black uppercase tracking-widest whitespace-nowrap">{tag}</span>
                   ))}
                </div>
             </div>
          </div>
          
          <div className="md:col-span-3 bg-red-900 rounded-3xl p-6 text-white flex flex-col justify-center relative overflow-hidden border border-white/5">
             <div className="absolute top-0 right-0 p-6 opacity-10">
                <LayoutDashboard size={60} />
             </div>
             <div className="relative z-10">
                <h4 className="text-sm font-bold tracking-tight mb-4 uppercase font-display">Diretivas Executivas</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                   <div className="bg-black/20 backdrop-blur-sm p-3 rounded-2xl border border-white/5">
                      <p className="text-[8px] font-black text-amber-500 uppercase mb-1">Otimizar</p>
                      <p className="text-[10px] font-black leading-tight uppercase tracking-tight">
                        {stats.pendingTaxes > 0 ? `Taxas Fiscais: R$ ${stats.pendingTaxes.toFixed(0)} pendentes` : "Logística de Importação e Dropshipping"}
                      </p>
                   </div>
                   <div className="bg-black/20 backdrop-blur-sm p-3 rounded-2xl border border-white/5">
                      <p className="text-[8px] font-black text-amber-500 uppercase mb-1">Oportunidade</p>
                      <p className="text-[10px] font-black leading-tight uppercase tracking-tight">
                        {stats.lowStockItems > 0 ? `Abastecer ${stats.lowStockItems} SKUs com estoque mínimo` : "Expandir Mix do Clube da Bola"}
                      </p>
                   </div>
                   <div className="bg-black/20 backdrop-blur-sm p-3 rounded-2xl border border-white/5 hidden md:block">
                      <p className="text-[8px] font-black text-amber-500 uppercase mb-1">Risco</p>
                      <p className="text-[10px] font-black leading-tight uppercase tracking-tight">
                        {stats.totalDebt > 0 ? `Fiado Ativo em R$ ${stats.totalDebt.toFixed(0)} (${(100 - stats.efficiencyRatio).toFixed(1)}% receita)` : "Inadimplência Fiado com Risco Zero"}
                      </p>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* Chart Section */}
        <div className="xl:col-span-2 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Calendar size={18} className="text-red-800" />
                Matriz de Desempenho
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Série Temporal (10 DIB)</p>
            </div>
            <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest">
              <div className="flex items-center gap-1.5"><span className="size-2 bg-red-800 rounded-full"></span> Receita</div>
              <div className="flex items-center gap-1.5"><span className="size-2 bg-amber-500 rounded-full"></span> Unidades</div>
            </div>
          </div>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesByDay}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                <Tooltip 
                   cursor={{ fill: 'rgba(140, 40, 40, 0.02)' }}
                   contentStyle={{ borderRadius: '16px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.06)', padding: '16px' }}
                   itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                   labelStyle={{ fontWeight: 'black', marginBottom: '8px', color: '#0f172a' }}
                />
                <Bar yAxisId="left" dataKey="total" fill="#8c2828" radius={[6, 6, 0, 0]} />
                <Bar yAxisId="right" dataKey="quantity" fill="#c69c3a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Sales vs Amortizations Comparison Chart */}
        <div className="xl:col-span-1 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="flex flex-col mb-6">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <TrendingUp size={18} className="text-red-800" />
              Sales vs. Amortização
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Comparativo Mensal (6 Meses)</p>
          </div>

          <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest mb-6">
            <div className="flex items-center gap-1.5">
              <span className="size-2 bg-red-800 rounded-full" style={{ backgroundColor: '#8c2828' }}></span> Vendas
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 bg-amber-500 rounded-full" style={{ backgroundColor: '#c69c3a' }}></span> Amortizado (Fiado)
            </div>
          </div>

          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyComparisonData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="monthLabel" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} 
                  tickFormatter={(val) => `R$ ${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(140, 40, 40, 0.02)' }}
                  contentStyle={{ borderRadius: '16px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.06)', padding: '16px' }}
                  itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                  labelStyle={{ fontWeight: 'black', marginBottom: '8px', color: '#0f172a' }}
                  formatter={(value: any) => [formatCurrency(Number(value)), '']}
                />
                <Bar dataKey="salesTotal" name="Vendas" fill="#8c2828" radius={[4, 4, 0, 0]} />
                <Bar dataKey="amortizedTotal" name="Amortizado" fill="#c69c3a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Filters Section (Simplified & Full width) */}
        <div className="xl:col-span-3 bg-white/45 backdrop-blur-md p-4 sm:p-5 rounded-[24px] border border-white/60 shadow-lg shadow-slate-200/40 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={14} className="text-slate-500" />
              <span className="text-[10px] font-black uppercase text-slate-800 tracking-widest font-sans">Busca & Filtro de Clientes</span>
            </div>
            <div className="flex items-center gap-2 md:ml-auto">
               <span className="size-2 bg-emerald-500 rounded-full animate-pulse"></span>
               <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest font-sans">Atualização Contínua</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Active Product Name/SKU Search */}
            <div className="bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3 group relative">
              <div className="size-8 bg-amber-500/10 text-amber-600 rounded-lg flex items-center justify-center shrink-0">
                 <Search size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 font-sans">Buscar Produto</p>
                <input 
                  type="text"
                  placeholder="PRODUTO OU SKU..."
                  className="w-full bg-transparent font-black text-slate-900 outline-none text-[11px] placeholder:text-slate-300 uppercase tracking-tight"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                />
              </div>
              {productSearch && (
                <button 
                  onClick={() => setProductSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 bg-slate-50 rounded"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Customer Filter */}
            <div className="bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3 group font-sans">
              <div className="size-8 bg-slate-900 text-white rounded-lg flex items-center justify-center shrink-0">
                 <Users size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 font-sans">Clientes</p>
                <select 
                  className="w-full bg-transparent font-black text-slate-900 outline-none text-[11px] cursor-pointer uppercase tracking-tight"
                  value={customerFilter}
                  onChange={e => setCustomerFilter(e.target.value)}
                >
                  <option value="all">TODOS CLIENTES</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Filters Clear Button if any is changed */}
          {(customerFilter !== 'all' || productSearch !== '') && (
            <div className="flex justify-end pt-1">
              <button 
                onClick={() => {
                  setCustomerFilter('all');
                  setProductSearch('');
                }}
                className="text-[9px] font-black uppercase text-red-850 hover:text-red-900 transition-colors flex items-center gap-1.5"
              >
                <X size={12} /> Limpar Filtros
              </button>
            </div>
          )}
        </div>

        {/* Debtors Section */}
        <div className="bg-slate-950 rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden group border border-slate-900">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-500">
            <Users size={160} />
          </div>
          <div className="relative z-10">
            <h3 className="text-lg font-black uppercase tracking-widest mb-6 flex items-center gap-2">
              <div className="size-8 bg-red-800 rounded-lg flex items-center justify-center text-white">
                <Wallet size={16} />
              </div>
              Inadimplência
            </h3>
            
            <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
              {debtors.length === 0 && (
                <div className="py-10 text-center opacity-40">
                  <CheckCircle2 size={40} className="mx-auto mb-2" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Nenhuma pendência</p>
                </div>
              )}
              {debtors.map(debtor => (
                <div key={debtor.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors">
                  <div>
                    <div className="text-xs font-black uppercase tracking-tight">{debtor.name}</div>
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">AUDITORIA INTERNA</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-rose-400 font-mono tracking-tighter tabular-nums">{formatCurrency(debtor.totalDebt || 0)}</div>
                    <button 
                      onClick={() => {
                        setSelectedSale({ 
                          id: `debt-${debtor.id}`, 
                          customerId: debtor.id, 
                          customerName: debtor.name, 
                          total: debtor.totalDebt || 0,
                          paymentMethod: 'Fiado' as any,
                          items: [],
                          status: 'Pendente',
                          createdAt: null
                        } as any);
                        setCompAmount((debtor.totalDebt || 0).toString());
                      }}
                      className="text-[9px] font-black uppercase text-emerald-400 hover:text-emerald-300 transition-colors mt-1"
                    >
                      Liquidado
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* TOP Customers Ranking */}
        <div className="bg-red-800 rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden group border border-white/5">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-500">
            <TrendingUp size={160} />
          </div>
          <div className="relative z-10">
            <h3 className="text-lg font-black uppercase tracking-widest mb-6 flex items-center gap-2">
              <div className="size-8 bg-amber-500 rounded-lg flex items-center justify-center text-slate-900 shadow-lg shadow-amber-500/20">
                <ArrowUpRight size={16} />
              </div>
              Top Adquirentes
            </h3>
            
            <div className="space-y-4">
              {customerRanking.map((rank, index) => (
                <div key={index} className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-full bg-amber-400 text-slate-900 flex items-center justify-center font-black text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-tight">{rank.name}</div>
                      <div className="text-[9px] font-bold text-white/60 uppercase tracking-widest">{rank.count} OPERAÇÕES</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black font-mono tracking-tighter tabular-nums">{formatCurrency(rank.total)}</div>
                  </div>
                </div>
              ))}
              {customerRanking.length === 0 && (
                <p className="text-center py-6 text-white/40 text-[10px] font-black uppercase tracking-widest">Nenhum dado disponível</p>
              )}
            </div>
          </div>
        </div>

        {/* TOP Suppliers Ranking */}
        <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden group border border-slate-800">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-500">
            <Truck size={160} />
          </div>
          <div className="relative z-10">
            <h3 className="text-lg font-black uppercase tracking-widest mb-6 flex items-center gap-2">
              <div className="size-8 bg-amber-500 rounded-lg flex items-center justify-center text-slate-900">
                <Receipt size={16} />
              </div>
              Fornecedores
            </h3>
            
            <div className="space-y-4">
              {supplierRanking.map((rank, index) => {
                const isExpanded = !!expandedSuppliers[rank.name];
                return (
                  <div 
                    key={index} 
                    className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col hover:bg-white/10 transition-all duration-300"
                  >
                    <div 
                      onClick={() => toggleSupplierExpanded(rank.name)}
                      className="flex items-center justify-between cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center font-black text-xs border border-slate-700">
                          {index + 1}
                        </div>
                        <div>
                          <div className="text-xs font-black uppercase tracking-tight truncate max-w-[120px]">{rank.name}</div>
                          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{rank.count} ENTREGAS</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm font-black text-amber-500 font-mono tracking-tighter tabular-nums">{formatCurrency(rank.totalTax)}</div>
                          <div className="text-[8px] font-bold text-slate-500 uppercase">TRIBUTAÇÃO ∑</div>
                        </div>
                        <div className="text-slate-400 hover:text-white transition-colors">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Cod. Rastreio & Status</span>
                            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                              {rank.shipments.map((ship, idx) => (
                                <div 
                                  key={idx} 
                                  onClick={() => handleShipmentClick(ship.trackingCode)}
                                  className={cn(
                                    "rounded-xl p-2.5 flex items-center justify-between border transition-all duration-200 select-none group/item",
                                    ship.trackingCode !== 'Sem Rastreio' 
                                      ? "bg-black/25 border-white/5 hover:border-amber-500/30 hover:bg-white/10 cursor-pointer active:scale-[0.99]" 
                                      : "bg-black/10 border-white/5 opacity-50"
                                  )}
                                  title={ship.trackingCode !== 'Sem Rastreio' ? "Clique para ver detalhes das encomendas" : undefined}
                                >
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className={cn(
                                        "font-mono text-[11px] font-black tracking-tight transition-colors",
                                        ship.trackingCode !== 'Sem Rastreio' 
                                          ? "text-slate-200 underline decoration-slate-500 decoration-dotted group-hover/item:text-amber-400 group-hover/item:decoration-amber-400" 
                                          : "text-slate-400"
                                      )}>
                                        {ship.trackingCode}
                                      </span>
                                      <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                        ship.status === 'Entregue' 
                                          ? 'bg-emerald-500/20 text-emerald-300' 
                                          : ship.status === 'Recebido' 
                                          ? 'bg-blue-500/20 text-blue-300'
                                          : 'bg-amber-500/20 text-amber-300'
                                      }`}>
                                        {ship.status}
                                      </span>
                                    </div>
                                  </div>
                                  {ship.hasTax ? (
                                    <span className="text-[9px] font-black text-red-400 font-mono">
                                      + {formatCurrency(ship.taxAmount)}
                                    </span>
                                  ) : (
                                    ship.trackingCode !== 'Sem Rastreio' && (
                                      <span className="text-[8px] font-black uppercase tracking-wider text-slate-500 group-hover/item:text-amber-400 transition-colors">
                                        Explorar →
                                      </span>
                                    )
                                  )}
                                </div>
                              ))}
                              {rank.shipments.length === 0 && (
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-center py-2">Sem remessas vinculadas</p>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
              {supplierRanking.length === 0 && (
                <p className="text-center py-6 text-white/40 text-[10px] font-black uppercase tracking-widest">Nenhum dado disponível</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Smart Business Insights Section */}
      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6 mt-6">
        <div className="flex items-center justify-between border-b border-slate-50 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="size-8 bg-amber-500/10 text-amber-600 rounded-lg flex items-center justify-center">
              <Lightbulb size={16} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                Central de Insights de Performance
                <span className="bg-red-100 text-red-800 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">Inteligência</span>
              </h3>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Diagnósticos baseados no fluxo do seu estoque, caixa e inadimplências</p>
            </div>
          </div>
          <button 
            onClick={() => setShowInsights(!showInsights)}
            className="text-[9px] font-black uppercase text-slate-500 hover:text-slate-800 border border-slate-200 rounded-xl px-3 py-1.5 hover:bg-slate-50 transition-all flex items-center gap-1"
          >
            {showInsights ? 'Minimizar Insights' : 'Expandir Insights'}
          </button>
        </div>

        <AnimatePresence>
          {showInsights && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {businessInsights.map((insight) => (
                  <div 
                    key={insight.id} 
                    className={cn(
                      "p-4 rounded-2xl border transition-all duration-300 flex gap-3.5 items-start",
                      insight.type === 'warning' 
                        ? "bg-amber-50/50 border-amber-100 text-amber-900 shadow-sm shadow-amber-500/5" 
                        : insight.type === 'success' 
                        ? "bg-emerald-50/40 border-emerald-100 text-emerald-950" 
                        : "bg-blue-50/40 border-blue-100 text-blue-950"
                    )}
                  >
                    <div className={cn(
                      "size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                      insight.type === 'warning' 
                        ? "bg-amber-100 text-amber-700" 
                        : insight.type === 'success' 
                        ? "bg-emerald-100 text-emerald-700" 
                        : "bg-blue-100 text-blue-700"
                    )}>
                      {insight.type === 'warning' ? (
                        <Activity size={15} />
                      ) : insight.type === 'success' ? (
                        <CheckCircle2 size={15} />
                      ) : (
                        <Sparkles size={15} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-[11px] font-black uppercase tracking-wider mb-1 flex items-center gap-1">
                        {insight.title}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                        {insight.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden mt-6">
        <div className="px-8 py-6 border-b border-slate-50 flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
          <div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Controle de Vendas</h3>
            <div className="flex flex-wrap gap-4 mt-2">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-800 uppercase">
                <span className="size-2 bg-slate-900 rounded-full" /> Pago (Geral)
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-amber-600 uppercase">
                <span className="size-2 bg-amber-500 rounded-full" /> Fiado Ativo
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 uppercase">
                <span className="size-2 bg-emerald-500 rounded-full" /> Fiado Quitado
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            {/* Filter Summary Metrics Panel */}
            <div className="flex items-center justify-between sm:justify-start gap-4 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2">
              <div className="text-left">
                <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Filtrado</p>
                <p className="text-xs font-mono font-black text-slate-850">
                  {filterStats.count} {filterStats.count === 1 ? 'Venda' : 'Vendas'}
                </p>
              </div>
              <div className="h-6 w-[1px] bg-slate-200" />
              <div className="text-left">
                <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider">
                  {salesTableFilter === 'pending-fiado' ? 'Saldo Pendente' : 'Valor Total'}
                </p>
                <p className="text-xs font-mono font-black text-red-800">
                  {formatCurrency(filterStats.totalValue)}
                </p>
              </div>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl select-none justify-between sm:justify-start">
              <button
                onClick={() => { setSalesTableFilter('all'); setSalesLimit(10); }}
                className={cn(
                  "px-3 py-1.5 text-[9px] rounded-lg font-black uppercase tracking-wider transition-all",
                  salesTableFilter === 'all' ? "bg-white text-slate-900 shadow-sm animate-fade-in" : "text-slate-500 hover:text-slate-900"
                )}
              >
                Todas
              </button>
              <button
                onClick={() => { setSalesTableFilter('pending-fiado'); setSalesLimit(10); }}
                className={cn(
                  "px-3 py-1.5 text-[9px] rounded-lg font-black uppercase tracking-wider transition-all",
                  salesTableFilter === 'pending-fiado' ? "bg-white text-slate-900 shadow-sm animate-fade-in" : "text-slate-500 hover:text-slate-900"
                )}
              >
                Fiado em aberto
              </button>
              <button
                onClick={() => { setSalesTableFilter('completed'); setSalesLimit(10); }}
                className={cn(
                  "px-3 py-1.5 text-[9px] rounded-lg font-black uppercase tracking-wider transition-all",
                  salesTableFilter === 'completed' ? "bg-white text-slate-900 shadow-sm animate-fade-in" : "text-slate-500 hover:text-slate-900"
                )}
              >
                Completas / Pagas
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">ID Venda</th>
                <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Cliente</th>
                <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Valor Total</th>
                <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest text-amber-600">Valor Pendente</th>
                <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Status</th>
                <th className="px-6 py-4 text-right text-[10px] uppercase font-black text-slate-400 tracking-widest">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(() => {
                const results = filteredSales.filter(sale => {
                  if (salesTableFilter === 'all') return true;
                  const balance = getSaleBalance(sale);
                  if (salesTableFilter === 'pending-fiado') {
                    return sale.paymentMethod === 'Fiado' && balance > 0;
                  }
                  if (salesTableFilter === 'completed') {
                    return sale.paymentMethod !== 'Fiado' || balance === 0;
                  }
                  return true;
                });

                if (results.length === 0) {
                  return (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
                        Nenhuma venda encontrada para o filtro selecionado
                      </td>
                    </tr>
                  );
                }

                return results.slice(0, salesLimit).map(sale => {
                  const balance = getSaleBalance(sale);
                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 text-xs font-mono text-slate-500">#{sale.id?.slice(-5).toUpperCase()}</td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-black text-slate-900 uppercase tracking-tight">{sale.customerName}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Venda #{sale.id?.slice(-3)}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-bold text-slate-900">{formatCurrency(sale.total)}</div>
                      </td>
                      <td className="px-6 py-4">
                        {sale.paymentMethod === 'Fiado' ? (
                          <div className={cn(
                            "text-xs font-black font-mono tabular-nums",
                            balance > 0 ? "text-amber-600 font-black animate-pulse" : "text-emerald-600"
                          )}>
                            {formatCurrency(balance)}
                          </div>
                        ) : (
                          <div className="text-xs font-mono text-slate-400">-</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-0.5 text-[9px] rounded font-bold uppercase",
                          sale.paymentMethod === 'Fiado' 
                            ? (balance === 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800") 
                            : "bg-slate-900 text-white"
                        )}>
                          {sale.paymentMethod} {balance === 0 && sale.paymentMethod === 'Fiado' && '• Liquidado'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right flex justify-end gap-2">
                        {sale.paymentMethod === 'Fiado' && balance > 0 && (
                          <button 
                            onClick={() => {
                              setSelectedSale(sale);
                              setCompAmount(balance.toString());
                            }}
                            className="flex items-center gap-1.5 px-3 py-1 bg-red-800 text-white text-[9px] font-black uppercase rounded-lg hover:bg-black transition-all shadow-md shadow-red-900/20"
                          >
                            <Wallet size={12} />
                            Amortizar
                          </button>
                        )}
                        <button className="p-1 text-red-800 hover:bg-red-50 rounded border border-transparent hover:border-red-100 transition-all">
                          <ArrowUpRight size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>

        {(() => {
          const results = filteredSales.filter(sale => {
            if (salesTableFilter === 'all') return true;
            const balance = getSaleBalance(sale);
            if (salesTableFilter === 'pending-fiado') {
              return sale.paymentMethod === 'Fiado' && balance > 0;
            }
            if (salesTableFilter === 'completed') {
              return sale.paymentMethod !== 'Fiado' || balance === 0;
            }
            return true;
          });

          if (results.length > salesLimit) {
            return (
              <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex justify-center">
                <button
                  onClick={() => setSalesLimit(prev => prev + 15)}
                  className="text-[10px] font-black uppercase text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1"
                >
                  Ver mais vendas nesta lista ({results.length - salesLimit} restantes)
                </button>
              </div>
            );
          } else if (salesLimit > 10) {
            return (
              <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex justify-center">
                <button
                  onClick={() => setSalesLimit(10)}
                  className="text-[10px] font-black uppercase text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1"
                >
                  Minimizar lista
                </button>
              </div>
            );
          }
          return null;
        })()}
      </div>

      {/* Compensation Modal */}
      <AnimatePresence>
        {selectedSale && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setSelectedSale(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl relative z-10 w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-8 bg-slate-950 text-white relative text-center">
                <button onClick={() => setSelectedSale(null)} className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors"><X size={24} /></button>
                <div className="size-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-md overflow-hidden p-3 border border-white/10">
                   <LayoutDashboard size={32} className="text-white" />
                </div>
                <h3 className="text-2xl font-black tracking-tight italic uppercase">ERP CLUB DA <span className="text-amber-500">BOLA</span></h3>
                <p className="text-amber-500 text-[9px] font-black uppercase tracking-[0.3em] mt-3">{selectedSale.customerName}</p>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Valor da Amortização</label>
                    <button 
                      onClick={() => setCompAmount(selectedSale.total.toString())}
                      className="text-[9px] font-black text-red-800 uppercase tracking-widest hover:text-black"
                    >
                      Valor Total
                    </button>
                  </div>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input 
                      type="number"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 transition-all font-sans"
                      value={compAmount}
                      onChange={e => setCompAmount(e.target.value)}
                      onFocus={e => e.target.value === '0' || e.target.value === selectedSale.total.toString() ? setCompAmount('') : null}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase">Total da Venda/Dívida: {formatCurrency(selectedSale.total)}</p>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Forma de Pagamento</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'Dinheiro', icon: Banknote },
                      { id: 'Pix', icon: QrCode },
                      { id: 'Cartão', icon: CreditCard },
                    ].map(method => (
                      <button
                        key={method.id}
                        onClick={() => setCompMethod(method.id as any)}
                        className={cn(
                          "flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all",
                          compMethod === method.id 
                            ? "bg-amber-50 border-amber-500 text-amber-600 font-black" 
                            : "bg-white border-slate-100 text-slate-400 hover:bg-slate-50"
                        )}
                      >
                        <method.icon size={20} />
                        <span className="text-[9px] font-black uppercase tracking-tight">{method.id}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  disabled={isCompensating}
                  onClick={handleCompensate}
                  className="w-full py-5 bg-red-800 hover:bg-black text-white font-black rounded-2xl uppercase tracking-widest text-xs shadow-xl shadow-red-900/20 transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  {isCompensating ? 'PROCESSANDO...' : 'CONFIRMAR AMORTIZAÇÃO'}
                  {!isCompensating && <CheckCircle2 size={18} />}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Amortization Success Modal */}
      <AnimatePresence>
        {showAmortizationSuccess && amortizationResult && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" 
              onClick={() => setShowAmortizationSuccess(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl relative z-[130] w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-8 text-center bg-red-800 text-white relative">
                <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                  <CheckCircle2 size={240} className="-translate-x-1/4 -translate-y-1/4 text-amber-500" />
                </div>
                <div className="size-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm overflow-hidden p-3 border border-white/10">
                   <CheckCircle2 size={40} className="text-amber-500" />
                </div>
                <h3 className="text-2xl font-black tracking-tight italic uppercase font-sans">Amortização Registrada!</h3>
                <p className="text-white/60 font-bold opacity-80 mt-1 uppercase text-[10px] tracking-widest">O pagamento do cliente foi processado.</p>
              </div>

              <div className="p-8 space-y-6 font-sans">
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 text-center">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Valor Recebido</p>
                  <p className="text-4xl font-black text-slate-900 tracking-tighter font-display tabular-nums leading-none">{formatCurrency(amortizationResult.amount)}</p>
                  <p className="text-[10px] font-black text-slate-500 mt-3 uppercase tracking-widest leading-none">Forma: {amortizationResult.paymentMethod} • {amortizationResult.clientName}</p>
                  
                  <div className="mt-4 pt-3 border-t border-slate-200 flex justify-center">
                     <span className="text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight">
                       Saldo Restante: {formatCurrency(amortizationResult.clientRemainingDebt)}
                     </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 font-sans">
                  <button 
                    onClick={() => {
                      setShowAmortizationSuccess(false);
                    }}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-100 text-slate-800 rounded-2xl hover:bg-slate-200 transition-all group font-black"
                  >
                    <X size={24} className="group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Fechar</span>
                  </button>
                  <button 
                    onClick={() => shareAmortizationWhatsApp(amortizationResult)}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-amber-50 text-amber-700 rounded-2xl hover:bg-amber-100 transition-all group font-black"
                  >
                    <MessageCircle size={24} className="group-hover:scale-110 transition-transform text-amber-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Enviar WhatsApp</span>
                  </button>
                </div>

                <button 
                  onClick={() => setShowAmortizationSuccess(false)}
                  className="w-full py-4 bg-red-800 text-white font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-black transition-all shadow-xl shadow-red-900/20 font-sans"
                >
                  Concluir e Voltar ao Painel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, positive, variant = 'glass' }: any) {
  const containerVariants = {
    glass: "bg-white border-slate-200 shadow-sm",
    gradient: "bg-slate-900 text-white border-slate-800 shadow-xl",
    dark: "bg-slate-950 text-white border-slate-900 shadow-xl",
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className={cn(
        "analytical-card p-6 rounded-[32px] border relative overflow-hidden transition-all duration-300 group shadow-md hover:shadow-xl hover:translate-y-[-2px]",
        containerVariants[variant as keyof typeof containerVariants]
      )}
    >
      <div className="flex justify-between items-start mb-4">
        <div className={cn(
          "p-2 rounded-xl shadow-sm transition-all group-hover:scale-110",
          variant === 'glass' ? "bg-red-800 text-white" : "bg-white/20 text-white"
        )}>
          <Icon size={16} />
        </div>
        <div className={cn(
          "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest",
          variant === 'glass' ? "bg-red-50 text-red-800" : "bg-white/10 text-white/60"
        )}>
          {positive ? 'Ideal' : 'Variação'}
        </div>
      </div>

      <div className="space-y-1 relative z-10">
        <p className={cn(
          "text-[8px] font-black uppercase tracking-[0.2em] leading-none mb-1",
          variant === 'glass' ? "text-slate-400" : "text-white/40"
        )}>{title}</p>
        <h3 className="text-2xl font-bold tracking-tight leading-none font-display tabular-nums uppercase">{value}</h3>
      </div>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200/60 to-transparent my-3.5" />

      <div className="flex items-center justify-between">
        <p className={cn(
          "text-[9px] font-bold flex items-center gap-1.5",
          variant === 'glass' ? "text-slate-500" : "text-white/70"
        )}>
          {trend}
        </p>
        <div className="size-4 rounded-full border border-current/20 flex items-center justify-center opacity-30">
           <ArrowUpRight size={8} />
        </div>
      </div>
    </motion.div>
  );
}
