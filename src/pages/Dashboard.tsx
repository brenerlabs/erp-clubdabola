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
  Truck
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
      lowStockItems: products.filter(p => p.totalStock <= p.minStock).length,
      totalDebt: debt,
      totalOrders: filteredSales.length,
      paidTaxes,
      pendingTaxes,
      efficiencyRatio
    };
  }, [filteredSales, products, customers, customerFilter, shipments]);

  const getSaleBalance = (sale: Sale) => {
    if (sale.paymentMethod !== 'Fiado') return 0;
    // We sum all payment transactions related to this sale.
    // This includes down payments (recorded as transactions in PDV) and later amortizations.
    const paymentsForSale = transactions
      .filter(t => t.saleId === sale.id && t.type === 'payment')
      .reduce((acc, t) => acc + t.amount, 0);
    
    // Note: In older logic, downPayment was subtracted manually. 
    // Now we ensure every payment (including entry) is a transaction.
    return Math.max(0, sale.total - paymentsForSale);
  };

  const handleCompensate = async () => {
    if (!selectedSale || !compAmount) return;
    const amount = parseFloat(compAmount);
    if (isNaN(amount) || amount <= 0) return alert('Valor inválido');

    setIsCompensating(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Log payment transaction
      const transRef = doc(collection(db, 'transactions'));
      batch.set(transRef, {
        customerId: selectedSale.customerId,
        amount: amount,
        type: 'payment',
        paymentMethod: compMethod,
        saleId: selectedSale.id.startsWith('debt-') ? null : selectedSale.id,
        createdAt: serverTimestamp()
      });

      // 2. Update Customer Debt
      if (selectedSale.customerId) {
        const custRef = doc(db, 'customers', selectedSale.customerId);
        const custSnap = await getDoc(custRef);
        if (custSnap.exists()) {
          const currentDebt = custSnap.data().totalDebt || 0;
          batch.update(custRef, {
            totalDebt: Math.max(0, currentDebt - amount),
            updatedAt: serverTimestamp()
          });

          // 3. Mark Sale as Concluída if it's a real sale and paid off
          if (!selectedSale.id.startsWith('debt-') && amount >= selectedSale.total) {
             batch.update(doc(db, 'sales', selectedSale.id!), {
                status: 'Concluída',
                updatedAt: serverTimestamp()
             });
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
    
    sales.forEach(sale => {
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

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

  return (
    <div className="space-y-6">
      {/* Filters Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-indigo-200 transition-colors">
          <div className="size-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
             <Users size={20} />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Filtrar por Cliente</p>
            <select 
              className="w-full bg-transparent font-bold text-slate-800 outline-none text-sm appearance-none cursor-pointer"
              value={customerFilter}
              onChange={e => setCustomerFilter(e.target.value)}
            >
              <option value="all">Todos os Clientes</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-amber-200 transition-colors">
          <div className="size-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
             <Package size={20} />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Filtrar por Produto</p>
            <select 
              className="w-full bg-transparent font-bold text-slate-800 outline-none text-sm appearance-none cursor-pointer"
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
            >
              <option value="all">Todos os Produtos</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard 
          title="Ticket Médio" 
          value={formatCurrency(stats.avgTicket)} 
          icon={TrendingUp} 
          trend="+12.5%" 
          positive 
          color="indigo"
        />
        <StatCard 
          title="Profitabilidade" 
          value={`${((stats.totalProfit / (stats.totalRevenue || 1)) * 100).toFixed(1)}%`} 
          icon={DollarSign} 
          trend={formatCurrency(stats.totalProfit)} 
          positive 
          color="emerald"
        />
        <StatCard 
          title="Total Vendas (Histórico)" 
          value={formatCurrency(stats.totalRevenue)} 
          icon={ShoppingCart} 
          trend="Tempo Real" 
          positive 
          color="indigo"
        />
        <StatCard 
          title="Inadimplência (Fiado)" 
          value={formatCurrency(stats.totalDebt)} 
          icon={Package} 
          trend={`${customers.filter(c => c.totalDebt > 0).length} pendentes`}
          positive={stats.totalDebt === 0} 
          color="rose"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className={cn(
                "size-12 rounded-2xl flex items-center justify-center",
                stats.efficiencyRatio > 80 ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
              )}>
                <TrendingUp size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Eficiência de Recebimento</p>
                <h4 className="text-xl font-black text-slate-900 leading-tight">{stats.efficiencyRatio.toFixed(1)}%</h4>
              </div>
           </div>
           <div className="text-right">
              <p className="text-[9px] font-bold text-slate-400 uppercase">Qualidade do Fluxo</p>
              <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.efficiencyRatio}%` }}
                  className={cn("h-full", stats.efficiencyRatio > 80 ? "bg-emerald-500" : "bg-amber-500")} 
                />
              </div>
           </div>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="size-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center">
                <Receipt size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Taxas de Importação Pagas</p>
                <h4 className="text-xl font-black text-slate-900 leading-tight">{formatCurrency(stats.paidTaxes)}</h4>
              </div>
           </div>
           <div className="text-right">
              <p className="text-[10px] font-black uppercase text-rose-400 tracking-widest">Pendente: {formatCurrency(stats.pendingTaxes)}</p>
              <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Dedução direta do lucro operacional</p>
           </div>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="size-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
                <Truck size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Encaminhamentos Ativos</p>
                <h4 className="text-xl font-black text-slate-900 leading-tight">{shipments.filter(s => s.status !== 'Entregue').length} Lotes</h4>
              </div>
           </div>
           <div className="text-right">
              <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Total Itens: {shipments.reduce((acc, s) => acc + s.items.length, 0)}</p>
              <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Monitoramento via rádio/rastreio</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Debtors Section */}
        <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-500">
            <Users size={160} />
          </div>
          <div className="relative z-10">
            <h3 className="text-lg font-black uppercase tracking-widest mb-6 flex items-center gap-2">
              <div className="size-8 bg-rose-500 rounded-lg flex items-center justify-center text-white">
                <Wallet size={16} />
              </div>
              Pendências Ativas
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
                    <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1 italic">ERP CLUB DA BOLA</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-rose-400">{formatCurrency(debtor.totalDebt || 0)}</div>
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
                      Compensar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* TOP Customers Ranking */}
        <div className="bg-indigo-600 rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-500">
            <TrendingUp size={160} />
          </div>
          <div className="relative z-10">
            <h3 className="text-lg font-black uppercase tracking-widest mb-6 flex items-center gap-2">
              <div className="size-8 bg-white/20 rounded-lg flex items-center justify-center text-white">
                <ArrowUpRight size={16} />
              </div>
              Ranking de Compras
            </h3>
            
            <div className="space-y-4">
              {customerRanking.map((rank, index) => (
                <div key={index} className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-full bg-amber-400 text-slate-900 flex items-center justify-center font-black text-sm">
                      {index + 1}º
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-tight">{rank.name}</div>
                      <div className="text-[9px] font-bold text-white/60 uppercase tracking-widest">{rank.count} pedidos realizados</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black">{formatCurrency(rank.total)}</div>
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
        <div className="bg-emerald-600 rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-500">
            <Truck size={160} />
          </div>
          <div className="relative z-10">
            <h3 className="text-lg font-black uppercase tracking-widest mb-6 flex items-center gap-2">
              <div className="size-8 bg-white/20 rounded-lg flex items-center justify-center text-white">
                <Receipt size={16} />
              </div>
              Taxas por Fornecedor
            </h3>
            
            <div className="space-y-4">
              {supplierRanking.map((rank, index) => (
                <div key={index} className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-full bg-white text-emerald-600 flex items-center justify-center font-black text-sm">
                      {index + 1}º
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-tight truncate max-w-[100px]">{rank.name}</div>
                      <div className="text-[9px] font-bold text-white/60 uppercase tracking-widest">{rank.count} lotes</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black">{formatCurrency(rank.totalTax)}</div>
                    <div className="text-[8px] font-bold text-emerald-200 uppercase">Total Tributos</div>
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
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <Calendar size={18} className="text-indigo-500" />
                Vendas por Período
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Consolidado dos últimos 10 dias</p>
            </div>
            <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest">
              <div className="flex items-center gap-1.5"><span className="size-2 bg-indigo-500 rounded-full"></span> Valor</div>
              <div className="flex items-center gap-1.5"><span className="size-2 bg-emerald-500 rounded-full"></span> Quantidade</div>
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
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '16px' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                  labelStyle={{ fontWeight: 'black', marginBottom: '8px', color: '#0f172a' }}
                />
                <Bar yAxisId="left" dataKey="total" fill="#6366f1" radius={[6, 6, 0, 0]} label={{ position: 'top', fontSize: 10, fontWeight: 900, fill: '#6366f1', formatter: (val: number) => val > 0 ? `R$${val}` : '' }} />
                <Bar yAxisId="right" dataKey="quantity" fill="#10b981" radius={[6, 6, 0, 0]} label={{ position: 'top', fontSize: 10, fontWeight: 900, fill: '#10b981', formatter: (val: number) => val > 0 ? val : '' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden mt-6">
        <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Últimas Vendas</h3>
          <div className="flex gap-4">
            <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 uppercase">
              <span className="size-2 bg-emerald-500 rounded-full" /> Pago
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-amber-600 uppercase">
              <span className="size-2 bg-amber-500 rounded-full" /> Fiado
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
              {filteredSales.slice(0, 10).map(sale => {
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
                        ? (balance === 0 ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700") 
                        : "bg-emerald-100 text-emerald-700"
                    )}>
                      {sale.paymentMethod} {balance === 0 && sale.paymentMethod === 'Fiado' && '• Paga'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    {sale.paymentMethod === 'Fiado' && balance > 0 && (
                      <button 
                        onClick={() => {
                          setSelectedSale(sale);
                          setCompAmount(balance.toString());
                        }}
                        className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500 text-white text-[9px] font-black uppercase rounded-lg hover:bg-emerald-600 transition-all shadow-md shadow-emerald-200"
                      >
                        <Wallet size={12} />
                        Compensar
                      </button>
                    )}
                    <button className="p-1 text-indigo-600 hover:bg-indigo-50 rounded border border-transparent hover:border-indigo-100 transition-all">
                      <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
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
              <div className="p-8 bg-slate-900 text-white relative text-center">
                <button onClick={() => setSelectedSale(null)} className="absolute top-6 right-6 text-white/60 hover:text-white transition-colors"><X size={24} /></button>
                <div className="size-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-md overflow-hidden p-3 border border-white/10">
                   <img 
                    src="https://i.ibb.co/v3Y0V6N/logo-club-da-bola.jpg" 
                    alt="Logo" 
                    className="w-full h-full object-contain" 
                    referrerPolicy="no-referrer" 
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        const fallback = document.createElement('div');
                        fallback.className = "w-full h-full bg-amber-500 rounded flex items-center justify-center text-xs font-black italic text-slate-900";
                        fallback.innerText = "CB";
                        parent.appendChild(fallback);
                      }
                    }}
                   />
                </div>
                <h3 className="text-2xl font-black tracking-tight italic uppercase">ERP CLUB DA <span className="text-amber-500">BOLA</span></h3>
                <p className="text-emerald-400 text-[10px] font-black uppercase tracking-widest mt-2">{selectedSale.customerName}</p>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Valor da Amortização</label>
                    <button 
                      onClick={() => setCompAmount(selectedSale.total.toString())}
                      className="text-[9px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-700"
                    >
                      Valor Total
                    </button>
                  </div>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input 
                      type="number"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
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
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700 font-bold" 
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
                  className="w-full py-5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl uppercase tracking-widest text-xs shadow-xl shadow-emerald-200 transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  {isCompensating ? 'PROCESSANDO...' : 'CONFIRMAR PAGAMENTO'}
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

function StatCard({ title, value, icon: Icon, trend, positive, color }: any) {
  const colors: any = {
    indigo: 'bg-indigo-500 text-white shadow-indigo-100',
    emerald: 'bg-emerald-500 text-white shadow-emerald-100',
    rose: 'bg-rose-500 text-white shadow-rose-100',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
        <div className={cn("p-2 rounded-lg", colors[color])}>
          <Icon size={18} />
        </div>
      </div>
      <div>
        <h3 className="text-2xl font-bold text-slate-900 tracking-tight leading-none mb-2">{value}</h3>
        <p className={cn(
          "text-[10px] font-bold flex items-center gap-1",
          positive ? 'text-emerald-500' : 'text-rose-500'
        )}>
          {positive && <ArrowUpRight size={12} />}
          {!positive && <ArrowDownRight size={12} />}
          {trend}
        </p>
      </div>
    </div>
  );
}
