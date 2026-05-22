import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy, limit, doc, updateDoc, writeBatch, serverTimestamp, getDoc } from 'firebase/firestore';
import { Transaction, Sale, Product, Customer, Shipment } from '../types';
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
  LayoutDashboard
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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  
  // Filters
  const [customerFilter, setCustomerFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [salesTableFilter, setSalesTableFilter] = useState<'all' | 'pending-fiado' | 'completed'>('all');
  const [salesLimit, setSalesLimit] = useState(10);

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

    return () => { unsubSales(); unsubProd(); unsubCust(); unsubTrans(); unsubShip(); };
  }, []);

  // Dynamic Filtering
  const filteredSales = React.useMemo(() => {
    return sales.filter(sale => {
      if (sale.status === 'Pré-venda') return false;
      const matchesCustomer = customerFilter === 'all' || sale.customerId === customerFilter;
      const matchesProduct = productFilter === 'all' || sale.items.some(item => item.productId === productFilter);
      return matchesCustomer && matchesProduct;
    });
  }, [sales, customerFilter, productFilter]);

  const stats = React.useMemo(() => {
    let revenue = 0;
    let profit = 0;
    
    filteredSales.forEach(sale => {
      revenue += sale.total;
      sale.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          profit += (item.price - product.costPrice) * item.quantity;
        }
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

    const efficiencyRatio = revenue > 0 ? ((revenue - debt) / revenue) * 100 : 0;

    return {
      totalRevenue: revenue,
      totalProfit: profit - paidTaxes,
      avgTicket: filteredSales.length > 0 ? revenue / filteredSales.length : 0,
      lowStockItems: products.filter(p => !p.isDropshipping && p.totalStock <= p.minStock).length,
      dropshippingOrders: filteredSales.filter(s => s.items.some(i => i.isDropshipping)).length,
      totalDebt: debt,
      totalOrders: filteredSales.length,
      paidTaxes,
      pendingTaxes,
      efficiencyRatio
    };
  }, [filteredSales, products, customers, customerFilter, shipments]);

  const getSaleBalance = React.useCallback((sale: Sale) => {
    if (sale.paymentMethod !== 'Fiado') return 0;
    const customer = customers.find(c => c.id === sale.customerId);
    if (!customer) {
      const paymentsForSale = transactions
        .filter(t => t.saleId === sale.id && t.type === 'payment')
        .reduce((acc, t) => acc + t.amount, 0);
      return Math.max(0, sale.total - paymentsForSale);
    }

    const custSales = sales
      .filter(s => s.customerId === sale.customerId && s.paymentMethod === 'Fiado' && s.status !== 'Pré-venda')
      .sort((a, b) => {
        const tA = a.createdAt?.seconds || (typeof a.createdAt === 'object' && a.createdAt?.getTime ? a.createdAt.getTime() / 1000 : 0);
        const tB = b.createdAt?.seconds || (typeof b.createdAt === 'object' && b.createdAt?.getTime ? b.createdAt.getTime() / 1000 : 0);
        return tA - tB;
      });

    let remainingDebt = customer.totalDebt || 0;
    for (const s of custSales) {
      const sBalance = Math.min(remainingDebt, s.total);
      remainingDebt -= sBalance;
      if (s.id === sale.id) {
        return sBalance;
      }
    }
    return 0;
  }, [customers, transactions, sales]);

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
          batch.update(custRef, {
            totalDebt: Math.max(0, currentDebt - amount),
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
            batch.update(custRef, {
              totalDebt: Math.max(0, currentDebt - amount),
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
      alert('Compensação realizada com sucesso!');
      setSelectedSale(null);
      setCompAmount('');
    } catch (err) {
      console.error(err);
      alert('Erro ao compensar.');
    } finally {
      setIsCompensating(false);
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

  const customerRanking = React.useMemo(() => {
    const ranking: Record<string, { name: string, total: number, count: number }> = {};
    
    sales.filter(s => s.status !== 'Pré-venda').forEach(sale => {
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
  
  const supplierRanking = React.useMemo(() => {
    const ranking: Record<string, { name: string, totalTax: number, count: number }> = {};
    
    shipments.forEach(s => {
      const supplier = s.supplierName || 'Desconhecido';
      if (!ranking[supplier]) {
        ranking[supplier] = { name: supplier, totalTax: 0, count: 0 };
      }
      ranking[supplier].totalTax += (s.taxAmount || 0);
      ranking[supplier].count += 1;
    });

    return Object.values(ranking).sort((a, b) => b.totalTax - a.totalTax).slice(0, 5);
  }, [shipments]);

      const categoryData = products.reduce((acc: any[], p) => {
    const existing = acc.find(a => a.name === p.category);
    if (existing) existing.value++;
    else acc.push({ name: p.category, value: 1 });
    return acc;
  }, []);

  const COLORS = ['#991b1b', '#d4af37', '#0f172a', '#450a0a', '#78350f'];

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

      {/* Filters Section */}
      <div className="flex flex-wrap items-center gap-3">
        <motion.div 
          whileHover={{ y: -1 }}
          className="bg-white/40 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/60 shadow-lg shadow-slate-200/40 flex items-center gap-3 hover:bg-white/60 transition-all group min-w-[200px]"
        >
          <div className="size-8 bg-slate-900 text-white rounded-lg flex items-center justify-center shrink-0 shadow-lg group-hover:scale-110 transition-transform">
             <Users size={14} />
          </div>
          <div className="flex-1">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 font-sans">Cliente</p>
            <select 
              className="w-full bg-transparent font-black text-slate-900 outline-none text-[11px] appearance-none cursor-pointer uppercase tracking-tight"
              value={customerFilter}
              onChange={e => setCustomerFilter(e.target.value)}
            >
              <option value="all">TODOS</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -1 }}
          className="bg-white/40 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/60 shadow-lg shadow-slate-200/40 flex items-center gap-3 hover:bg-white/60 transition-all group min-w-[200px]"
        >
          <div className="size-8 bg-red-800 text-white rounded-lg flex items-center justify-center shrink-0 shadow-lg group-hover:scale-110 transition-transform">
             <Package size={14} />
          </div>
          <div className="flex-1">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 font-sans">Produto (SKU)</p>
            <select 
              className="w-full bg-transparent font-black text-slate-900 outline-none text-[11px] appearance-none cursor-pointer uppercase tracking-tight"
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
            >
              <option value="all">TODOS</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </motion.div>

        <div className="ml-auto flex items-center gap-2">
           <span className="size-2 bg-emerald-500 rounded-full animate-pulse"></span>
           <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest font-sans">Sistema em Tempo Real</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Consumo Médio" 
          value={formatCurrency(stats.avgTicket)} 
          icon={TrendingUp} 
          trend="Ticket Executivo" 
          positive 
          variant="glass"
        />
        <StatCard 
          title="Performance Logística" 
          value={`${((stats.dropshippingOrders / (stats.totalOrders || 1)) * 100).toFixed(1)}%`} 
          icon={Truck} 
          trend={`${stats.dropshippingOrders} Lotes em Trânsito`} 
          positive 
          variant="glass"
        />
        <StatCard 
          title="Receita Operacional" 
          value={formatCurrency(stats.totalRevenue)} 
          icon={ShoppingCart} 
          trend="Faturamento Bruto" 
          positive 
          variant="glass"
        />
        <StatCard 
          title="Risco de Crédito" 
          value={formatCurrency(stats.totalDebt)} 
          icon={Wallet} 
          trend={`${debtors.length} Contas em Aberto`}
          positive={stats.totalDebt === 0} 
          variant="glass"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm flex items-center justify-between">
           <div className="flex items-center gap-3">
              <div className={cn(
                "size-10 rounded-xl flex items-center justify-center",
                stats.efficiencyRatio > 80 ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
              )}>
                <TrendingUp size={20} />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">Eficiência Receita</p>
                <h4 className="text-xl font-bold text-slate-900 leading-tight font-display tabular-nums">{stats.efficiencyRatio.toFixed(1)}%</h4>
              </div>
           </div>
           <div className="text-right">
              <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.efficiencyRatio}%` }}
                  className={cn("h-full", stats.efficiencyRatio > 80 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]")} 
                />
              </div>
           </div>
        </div>
        <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm flex items-center justify-between">
           <div className="flex items-center gap-3">
              <div className="size-10 bg-rose-100 text-rose-800 rounded-xl flex items-center justify-center shadow-lg shadow-rose-900/5">
                <Receipt size={20} />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">Taxas Pagas</p>
                <h4 className="text-xl font-bold text-slate-900 leading-tight font-display tabular-nums">{formatCurrency(stats.paidTaxes)}</h4>
              </div>
           </div>
           <div className="text-right">
              <p className="text-[9px] font-black uppercase text-rose-800 tracking-widest">Pend: {formatCurrency(stats.pendingTaxes)}</p>
           </div>
        </div>
        <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm flex items-center justify-between md:col-span-2 lg:col-span-1">
           <div className="flex items-center gap-3">
              <div className="size-10 bg-slate-950 text-white rounded-xl flex items-center justify-center">
                <Truck size={20} />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">Lotes Ativos</p>
                <h4 className="text-xl font-bold text-slate-900 leading-tight font-display tabular-nums">{shipments.filter(s => s.status !== 'Entregue').length}</h4>
              </div>
           </div>
           <div className="text-right">
              <p className="text-[9px] font-black uppercase text-amber-500 tracking-widest">Itens: {shipments.reduce((acc, s) => acc + s.items.length, 0)}</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
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
              {supplierRanking.map((rank, index) => (
                <div key={index} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center font-black text-xs border border-slate-700">
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-tight truncate max-w-[100px]">{rank.name}</div>
                      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{rank.count} ENTREGAS</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-amber-500 font-mono tracking-tighter tabular-nums">{formatCurrency(rank.totalTax)}</div>
                    <div className="text-[8px] font-bold text-slate-500 uppercase">TRIBUTAÇÃO ∑</div>
                  </div>
                </div>
              ))}
              {supplierRanking.length === 0 && (
                <p className="text-center py-6 text-white/40 text-[10px] font-black uppercase tracking-widest">Nenhum dado disponível</p>
              )}
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
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                <Tooltip 
                   cursor={{ fill: 'rgba(153, 27, 27, 0.05)' }}
                   contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '16px' }}
                   itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                   labelStyle={{ fontWeight: 'black', marginBottom: '8px', color: '#0f172a' }}
                />
                <Bar yAxisId="left" dataKey="total" fill="#991b1b" radius={[6, 6, 0, 0]} />
                <Bar yAxisId="right" dataKey="quantity" fill="#d4af37" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
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
                      <td colSpan={5} className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
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
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 transition-all font-serif"
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
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={cn(
        "p-5 rounded-2xl border relative overflow-hidden transition-all duration-300 group",
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

      <div className="mt-4 pt-3 border-t border-current/5 flex items-center justify-between">
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
