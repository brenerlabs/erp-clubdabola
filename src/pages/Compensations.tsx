import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy, where } from 'firebase/firestore';
import { Transaction, Customer } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { 
  History, 
  Calendar, 
  User, 
  Wallet, 
  ArrowDownCircle, 
  Banknote, 
  QrCode, 
  CreditCard, 
  Search, 
  Filter, 
  Share2,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Compensations() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [customerFilter, setCustomerFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    const qTrans = query(
      collection(db, 'transactions'),
      where('type', '==', 'payment'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeTrans = onSnapshot(qTrans, (snapshot) => {
      setTransactions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
      setIsLoading(false);
    });

    const unsubscribeCust = onSnapshot(collection(db, 'customers'), (snapshot) => {
      setCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    });

    return () => { unsubscribeTrans(); unsubscribeCust(); };
  }, []);

  const getCustomerName = (id: string) => {
    return customers.find(c => c.id === id)?.name || 'Consumidor Final';
  };

  const getMethodIcon = (method?: string) => {
    switch (method) {
      case 'Dinheiro': return <Banknote size={16} />;
      case 'Pix': return <QrCode size={16} />;
      case 'Cartão': return <CreditCard size={16} />;
      default: return <Wallet size={16} />;
    }
  };

  const filtered = transactions.filter(t => {
    const matchesCustomer = customerFilter === 'all' || t.customerId === customerFilter;
    const matchesMethod = methodFilter === 'all' || t.paymentMethod === methodFilter;
    const matchesDate = !dateFilter || new Date(t.createdAt?.seconds * 1000).toLocaleDateString('pt-CA') === dateFilter;
    return matchesCustomer && matchesMethod && matchesDate;
  });

  const handleShare = () => {
    const summary = filtered.map(t => 
      `• ${new Date(t.createdAt?.seconds * 1000).toLocaleDateString('pt-BR')} - ${getCustomerName(t.customerId)}: ${formatCurrency(t.amount)} (${t.paymentMethod || 'Outros'})`
    ).join('\n');

    const total = filtered.reduce((acc, t) => acc + t.amount, 0);
    const text = `*RELATÓRIO DE COMPENSAÇÕES - ERP CLUB DA BOLA*\n\n${summary}\n\n*TOTAL: ${formatCurrency(total)}*`;
    
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-[32px] p-10 text-white relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
          <History size={200} />
        </div>
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="size-14 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <History size={28} />
              </div>
              <div>
                <h2 className="text-3xl font-black tracking-tight">Compensações</h2>
                <p className="text-emerald-400 font-bold uppercase tracking-widest text-[10px] opacity-80">Relação de recebimentos para amortização de dívidas</p>
              </div>
            </div>

            <button 
              onClick={handleShare}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
            >
              <Share2 size={16} />
              Share WPP
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
              <p className="text-[9px] font-black uppercase text-emerald-400 mb-1 tracking-widest">Filtrar por Cliente</p>
              <select 
                value={customerFilter}
                onChange={e => setCustomerFilter(e.target.value)}
                className="w-full bg-transparent text-xs font-black text-white outline-none border-none appearance-none cursor-pointer"
              >
                <option value="all" className="text-slate-900">Todos</option>
                {customers.map(c => <option key={c.id} value={c.id} className="text-slate-900">{c.name}</option>)}
              </select>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
              <p className="text-[9px] font-black uppercase text-emerald-400 mb-1 tracking-widest">Forma PGTO</p>
              <select 
                value={methodFilter}
                onChange={e => setMethodFilter(e.target.value)}
                className="w-full bg-transparent text-xs font-black text-white outline-none border-none appearance-none cursor-pointer"
              >
                <option value="all" className="text-slate-900">Todas</option>
                <option value="Dinheiro" className="text-slate-900">Dinheiro</option>
                <option value="Pix" className="text-slate-900">Pix</option>
                <option value="Cartão" className="text-slate-900">Cartão</option>
              </select>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
              <p className="text-[9px] font-black uppercase text-emerald-400 mb-1 tracking-widest">Data Específica</p>
              <input 
                type="date"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                className="w-full bg-transparent text-xs font-black text-white outline-none border-none appearance-none cursor-pointer block"
              />
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
              <p className="text-[9px] font-black uppercase text-emerald-400 mb-1 tracking-widest">Subtotal Filtrado</p>
              <div className="text-lg font-black">{formatCurrency(filtered.reduce((acc, t) => acc + t.amount, 0))}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <Calendar size={16} className="text-emerald-500" />
            Extrato de Movimentações
          </h3>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Exibindo {filtered.length} de {transactions.length} registros</div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Data / Hora</th>
                <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Cliente</th>
                <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Forma PGTO</th>
                <th className="px-8 py-4 text-right text-[10px] uppercase font-black text-slate-400 tracking-widest">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center">
                    <div className="opacity-20 flex flex-col items-center gap-4 text-slate-400">
                       <History size={60} />
                       <p className="font-black uppercase tracking-widest text-xs">Nenhum registro encontrado para este filtro</p>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((t, index) => (
                <motion.tr 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  key={t.id} 
                  className="hover:bg-emerald-50/30 transition-all group"
                >
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="size-10 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                        <Calendar size={18} />
                      </div>
                      <div>
                        <div className="text-xs font-black text-slate-900">{new Date(t.createdAt?.seconds * 1000).toLocaleDateString('pt-BR')}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{new Date(t.createdAt?.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="size-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                        <User size={18} />
                      </div>
                      <div className="text-xs font-black text-slate-800 uppercase tracking-tight">{getCustomerName(t.customerId)}</div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-black uppercase rounded-lg border border-slate-200">
                      {getMethodIcon(t.paymentMethod)}
                      {t.paymentMethod || 'Outros'}
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="text-lg font-black text-emerald-600 flex items-center justify-end gap-2 text-right">
                       <ArrowDownCircle size={18} className="opacity-40" />
                       {formatCurrency(t.amount)}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
