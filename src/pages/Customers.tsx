import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, where, orderBy } from 'firebase/firestore';
import { Customer, Transaction } from '../types';
import { Plus, Search, Edit2, Trash2, Copy, User, Phone, Wallet, History, ArrowDownCircle, ArrowUpCircle, X } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [filterPending, setFilterPending] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  // Transactions modal
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');

  // Form State
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'customers'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    });
    return unsubscribe;
  }, []);

  const openModal = (customer?: Customer, isDuplicate = false) => {
    if (customer) {
      setName(isDuplicate ? `${customer.name} (Cópia)` : customer.name);
      setContact(customer.contact);
      setEditingCustomer(isDuplicate ? null : customer);
    } else {
      setName('');
      setContact('');
      setEditingCustomer(null);
    }
    setIsModalOpen(true);
  };

  const openHistory = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsHistoryOpen(true);
    // Fetch transactions
    const q = query(
      collection(db, 'transactions'), 
      where('customerId', '==', customer.id),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    });
    return unsubscribe;
  };

  const handlePayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (!selectedCustomer || isNaN(amount) || amount <= 0) return;
    
    // 1. Create Transaction
    await addDoc(collection(db, 'transactions'), {
      customerId: selectedCustomer.id,
      amount: amount,
      type: 'payment',
      paymentMethod: 'Dinheiro', // Default or add selector
      createdAt: serverTimestamp()
    });

    // 2. Update Customer Debt
    await updateDoc(doc(db, 'customers', selectedCustomer.id!), {
      totalDebt: Math.max(0, (selectedCustomer.totalDebt || 0) - amount),
      updatedAt: serverTimestamp()
    });

    setPaymentAmount('');
    alert('Pagamento processado com sucesso!');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const customerData = {
        name,
        contact,
        totalDebt: editingCustomer?.totalDebt || 0,
        updatedAt: serverTimestamp()
      };

      if (editingCustomer) {
        await updateDoc(doc(db, 'customers', editingCustomer.id!), customerData);
      } else {
        await addDoc(collection(db, 'customers'), customerData);
      }
      setIsModalOpen(false);
      alert('Cliente salvo com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar cliente. Verifique sua conexão.');
    }
  };

  const filtered = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.contact.includes(search);
    const matchesPending = filterPending ? c.totalDebt > 0 : true;
    return matchesSearch && matchesPending;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative w-96 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 size-5 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Filtrar por nome ou celular..." 
              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm outline-none text-sm font-medium"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          
          <button 
            onClick={() => setFilterPending(!filterPending)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all border",
              filterPending 
                ? "bg-rose-50 border-rose-200 text-rose-600 shadow-inner" 
                : "bg-white border-slate-100 text-slate-400 hover:bg-slate-50"
            )}
          >
            <Wallet size={16} />
            Pendentes {filterPending && `(${filtered.length})`}
          </button>
        </div>
        <button 
          onClick={() => openModal()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center gap-2 active:scale-95"
        >
          <Plus size={20} /> Cadastrar Cliente
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Identificação do Cliente</th>
              <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Contato Direto</th>
              <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest text-right">Saldo Pendente</th>
              <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest text-right">Ações Rápidas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(customer => (
              <tr key={customer.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-6 py-5">
                  <div>
                    <div className="font-bold text-slate-900 text-sm leading-tight">{customer.name}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">REGISTRADO NO ERP CLUB DA BOLA</div>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-slate-600">
                    <Phone size={14} className="text-emerald-500" />
                    {customer.contact}
                  </div>
                </td>
                <td className="px-6 py-5 text-right">
                  <div className={cn(
                    "text-md font-black",
                    customer.totalDebt > 0 ? 'text-rose-500' : 'text-emerald-600'
                  )}>
                    {formatCurrency(customer.totalDebt)}
                  </div>
                  {customer.totalDebt > 0 && <div className="text-[9px] font-black text-rose-300 uppercase">Atenção Necessária</div>}
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openHistory(customer)} className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-colors shadow-sm bg-white" title="Histórico / Pagamento">
                      <Wallet size={16} />
                    </button>
                    <button onClick={() => openModal(customer, true)} className="p-2 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-colors shadow-sm bg-white" title="Duplicar">
                      <Copy size={16} />
                    </button>
                    <button onClick={() => openModal(customer)} className="p-2 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors shadow-sm bg-white" title="Editar">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => deleteDoc(doc(db, 'customers', customer.id!))} className="p-2 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors shadow-sm bg-white" title="Excluir">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Customer Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl relative z-10 w-full max-w-lg overflow-hidden border border-slate-200"
            >
              <form onSubmit={handleSubmit}>
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">{editingCustomer ? 'Perfil do Cliente' : 'Novo Cadastro'}</h3>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-200 rounded-lg transition-colors"><X size={20} /></button>
                </div>
                <div className="p-8 space-y-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Nome Completo</label>
                    <input 
                      required type="text" value={name} onChange={e => setName(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-sm transition-all"
                      placeholder="Ex: João Silva"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Número de Contato</label>
                    <input 
                      required type="text" value={contact} onChange={e => setContact(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-sm transition-all"
                      placeholder="(99) 99999-9999"
                    />
                  </div>
                </div>
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-[11px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all tracking-widest">Descartar</button>
                  <button type="submit" className="px-10 py-2.5 bg-indigo-600 hover:bg-slate-900 text-white text-[11px] font-black uppercase rounded-xl transition-all shadow-lg shadow-indigo-100 tracking-widest">Confirmar Dados</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {isHistoryOpen && selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsHistoryOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl relative z-10 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-8 border-b border-indigo-500 bg-slate-900 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                   <Wallet size={150} />
                </div>
                <div className="flex items-center justify-between mb-8 relative">
                  <div className="flex items-center gap-4">
                    <div className="size-12 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                      <User size={24} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black tracking-tight">{selectedCustomer.name}</h3>
                      <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest">{selectedCustomer.contact} • ERP CLUB DA BOLA</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">Dívida Acumulada</p>
                    <p className="text-3xl font-black text-rose-400">{formatCurrency(selectedCustomer.totalDebt)}</p>
                  </div>
                </div>
                
                <div className="bg-white/5 rounded-2xl p-5 border border-white/5 relative">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Processar Amortização de Saldo</p>
                    <button 
                      onClick={() => setPaymentAmount(selectedCustomer.totalDebt.toString())}
                      className="text-[9px] font-black text-indigo-400 uppercase tracking-widest hover:text-white transition-colors"
                    >
                      Valor Total
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-bold">R$</span>
                      <input 
                        type="number" value={paymentAmount} 
                        onChange={e => setPaymentAmount(e.target.value)}
                        onFocus={e => e.target.value === '0' ? setPaymentAmount('') : null}
                        className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 pr-4 py-3 outline-none font-black text-xl text-indigo-300 focus:bg-white/20 transition-all transition-all placeholder:text-white/20"
                        placeholder="0,00"
                      />
                    </div>
                    <button 
                      onClick={handlePayment}
                      className="bg-indigo-500 text-white font-black px-8 rounded-xl hover:bg-indigo-400 transition-all shadow-lg shadow-indigo-900/40 text-xs uppercase tracking-widest active:scale-95"
                    >
                      Processar Baixa
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
                <div className="flex items-center gap-2 mb-6">
                   <History size={16} className="text-slate-400" />
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Extrato de Movimentações</h4>
                </div>
                <div className="space-y-3">
                  {transactions.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 border-dashed">
                      <p className="text-xs font-bold text-slate-400 uppercase">Nenhum registro encontrado</p>
                    </div>
                  )}
                  {transactions.map(t => (
                    <div key={t.id} className="flex items-center justify-between p-5 bg-white rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
                      <div className="flex items-center gap-4">
                        {t.type === 'payment' ? (
                          <div className="size-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center"><ArrowDownCircle size={20} /></div>
                        ) : (
                          <div className="size-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center"><ArrowUpCircle size={20} /></div>
                        )}
                        <div>
                          <p className="font-black text-slate-900 text-sm">{t.type === 'payment' ? 'Pagamento Efetivado' : 'Compra Realizada'}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                             {new Date(t.createdAt?.seconds * 1000).toLocaleDateString('pt-BR')} 
                             - {new Date(t.createdAt?.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className={cn(
                        "text-lg font-black",
                        t.type === 'payment' ? 'text-emerald-600' : 'text-rose-500'
                      )}>
                        {t.type === 'payment' ? '-' : '+'}{formatCurrency(t.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-6 bg-white border-t border-slate-100 flex justify-end">
                <button onClick={() => setIsHistoryOpen(false)} className="px-8 py-2.5 text-[11px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all tracking-widest">Fechar Janela</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
