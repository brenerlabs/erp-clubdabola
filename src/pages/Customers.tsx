import React, { useState, useEffect, useContext } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, where, orderBy, writeBatch } from 'firebase/firestore';
import { Customer, Transaction } from '../types';
import { Plus, Search, Edit2, Trash2, Copy, User, Phone, Wallet, History, ArrowDownCircle, ArrowUpCircle, X } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { SidebarContext } from '../App';

export default function Customers() {
  const { setIsSidebarOpen } = useContext(SidebarContext);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterPending, setFilterPending] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  // Transactions modal
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'payment' | 'debt'>('all');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'perfil' | 'history'>('perfil');

  useEffect(() => {
    if (isModalOpen || isHistoryOpen) {
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(true);
    }
  }, [isModalOpen, isHistoryOpen, setIsSidebarOpen]);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [search]);

  useEffect(() => {
    const q = query(collection(db, 'customers'), orderBy('name', 'asc'));
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
      setActiveTab('perfil');
    } else {
      setName('');
      setContact('');
      setEditingCustomer(null);
      setActiveTab('perfil');
    }
    setIsModalOpen(true);
  };

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        
        if (lines.length === 0) return;

        // Detect delimiter (prefer ; over , if both exist or just one)
        const firstLine = lines[0];
        const delimiter = firstLine.includes(';') ? ';' : ',';
        
        // Remove header if exists (checking for "nome" or "contato")
        let startIndex = 0;
        const headerLower = firstLine.toLowerCase();
        if (headerLower.includes('nome') || headerLower.includes('contato')) {
          startIndex = 1;
        }

        const batch = writeBatch(db);
        let count = 0;
        let skipped = 0;

        // Criar um set com nomes normalizados para comparação rápida
        const existingNames = new Set(customers.map(c => (c.name || '').toLowerCase().trim()));
        const processedInThisCSV = new Set<string>();

        for (let i = startIndex; i < lines.length; i++) {
          const columns = lines[i].split(delimiter).map(c => c.trim());
          if (columns[0]) {
            // Remove characters from encoding issues
            const cleanName = columns[0].replace(/[^\w\s\u00C0-\u00FF]/gi, (match) => {
               return match === '' ? '' : match;
            });
            
            const rawName = cleanName || columns[0];
            const normalizedName = rawName.toLowerCase().trim();

            // Verificar se já existe no banco ou se está repetido no CSV
            if (existingNames.has(normalizedName) || processedInThisCSV.has(normalizedName)) {
              skipped++;
              continue;
            }

            const customerRef = doc(collection(db, 'customers'));
            batch.set(customerRef, {
              name: rawName, 
              contact: columns[1] || '',
              totalDebt: 0,
              updatedAt: serverTimestamp()
            });
            
            processedInThisCSV.add(normalizedName);
            count++;
          }
        }

        if (count > 0) {
          await batch.commit();
          alert(`✅ Sucesso!\n\nImportados: ${count}\nIgnorados (já existentes): ${skipped}`);
        } else {
          alert(`ℹ️ Nenhum cliente novo para importar.\n\nIgnorados: ${skipped}`);
        }
      } catch (err: any) {
        console.error(err);
        alert('Erro ao processar CSV. Verifique a formatação.');
      } finally {
        setIsImporting(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsText(file, 'ISO-8859-1'); // Common encoding for Brazilian CSVs (Excel)
  };

  const openHistory = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsHistoryOpen(true);
    setHistoryTypeFilter('all');
    setHistoryStartDate('');
    setHistoryEndDate('');
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
    
    try {
      // 1. Create Transaction
      try {
        await addDoc(collection(db, 'transactions'), {
          customerId: selectedCustomer.id,
          amount: amount,
          type: 'payment',
          paymentMethod: 'Dinheiro', // Default or add selector
          createdAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'transactions');
      }
  
      // 2. Update Customer Debt
      try {
        await updateDoc(doc(db, 'customers', selectedCustomer.id!), {
          totalDebt: Math.max(0, (selectedCustomer.totalDebt || 0) - amount),
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `customers/${selectedCustomer.id}`);
      }
  
      setPaymentAmount('');
      alert('Pagamento processado com sucesso!');
    } catch (err: any) {
      console.error(err);
      alert('Erro ao processar pagamento. Verifique as permissões.');
    }
  };

  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 11) {
      const match = cleaned.match(/^(\d{2})(\d{1,5})(\d{0,4})$/);
      if (match) {
        return `(${match[1]}) ${match[2]}${match[3] ? `-${match[3]}` : ''}`;
      }
    }
    return value;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formattedContact = formatPhoneNumber(contact);
      const customerData = {
        name,
        contact: formattedContact,
        totalDebt: editingCustomer?.totalDebt || 0,
        updatedAt: serverTimestamp()
      };

      if (editingCustomer) {
        try {
          await updateDoc(doc(db, 'customers', editingCustomer.id!), customerData);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `customers/${editingCustomer.id}`);
        }
      } else {
        try {
          await addDoc(collection(db, 'customers'), customerData);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'customers');
        }
      }
      setIsModalOpen(false);
      alert('Cliente salvo com sucesso!');
    } catch (err: any) {
      console.error(err);
      let message = 'Erro ao salvar cliente. Verifique sua conexão.';
      try {
        const errInfo = JSON.parse(err.message);
        if (errInfo.error.includes('permission')) {
          message = 'Erro de permissão: Apenas o administrador autenticado pode realizar esta ação.';
        }
      } catch {
        // Not JSON
      }
      alert(message);
    }
  };

  const filtered = customers.filter(c => {
    const matchesSearch = (c.name || '').toLowerCase().includes(debouncedSearch.toLowerCase()) || (c.contact || '').includes(debouncedSearch);
    const matchesPending = filterPending ? c.totalDebt > 0 : true;
    return matchesSearch && matchesPending;
  });

  const filteredTransactions = transactions.filter(t => {
    const matchesType = historyTypeFilter === 'all' ? true : t.type === historyTypeFilter;
    
    if (!t.createdAt) return matchesType;
    
    const transDate = new Date(t.createdAt.seconds * 1000);
    const matchesStart = historyStartDate ? transDate >= new Date(historyStartDate + 'T00:00:00') : true;
    const matchesEnd = historyEndDate ? transDate <= new Date(historyEndDate + 'T23:59:59') : true;
    
    return matchesType && matchesStart && matchesEnd;
  });

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 pb-10"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 leading-none">
            Gestão de <span className="text-red-800 underline decoration-red-200 decoration-4 underline-offset-4 tracking-tight font-bold">Clientes</span>
          </h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] font-sans mt-2">Base Global de Clientes e Créditos</p>
        </div>
        <div className="flex items-center gap-2">
          <label className={cn(
            "flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black rounded-xl cursor-pointer transition-all active:scale-95 uppercase tracking-widest text-[10px] font-sans border border-slate-200 shadow-sm",
            isImporting && "opacity-50 pointer-events-none"
          )}>
            <ArrowDownCircle size={20} className="text-red-800" />
            {isImporting ? 'Sincronizando...' : 'Importar Lote'}
            <input type="file" accept=".csv" className="hidden" onChange={handleCSVImport} disabled={isImporting} />
          </label>
          <button 
            onClick={() => openModal()}
            className="bg-red-800 hover:bg-black text-white font-black py-3 px-6 rounded-xl transition-all shadow-lg shadow-red-900/20 flex items-center gap-2 active:scale-95 uppercase tracking-widest text-[10px] font-sans"
          >
            <Plus size={20} className="text-amber-500" /> Integrar Cliente
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row items-center justify-between gap-4 p-6 bg-white/40 backdrop-blur-md rounded-[32px] border border-white/60 shadow-xl shadow-slate-200/50">
        <div className="flex flex-1 items-center gap-4 w-full">
          <div className="relative flex-1 max-w-md group font-sans">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 size-5 group-focus-within:text-red-800 transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar Cliente..." 
              className="w-full pl-12 pr-4 py-3 bg-white/60 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-800 transition-all shadow-sm outline-none text-[10px] font-black uppercase tracking-widest"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          
          <button 
            onClick={() => setFilterPending(!filterPending)}
            className={cn(
              "flex items-center gap-3 px-6 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border font-sans",
              filterPending 
                ? "bg-red-50 border-red-200 text-red-800 shadow-inner" 
                : "bg-white border-slate-100 text-slate-400 hover:bg-slate-50 shadow-sm"
            )}
          >
            <Wallet size={16} />
            Risco Ativo {filterPending && `(${filtered.length})`}
          </button>
        </div>
        
        <div className="flex items-center gap-8 px-6 border-l border-slate-200 hidden lg:flex font-sans">
           <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Total Custódia</p>
              <p className="text-2xl font-black text-slate-900 font-display tabular-nums leading-none tracking-tight">{customers.length}</p>
           </div>
           <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Exposição Total</p>
              <p className="text-2xl font-black text-red-800 font-display tabular-nums leading-none tracking-tight">{formatCurrency(customers.reduce((acc, c) => acc + (c.totalDebt || 0), 0))}</p>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        {/* Desktop Table View */}
        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <User size={16} className="text-red-800" />
            Base de registros
          </h3>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Exibindo {filtered.length} Clientes Ativos</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse hidden md:table min-w-[800px] lg:min-w-full">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Identificação do Cliente</th>
              <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Contato Direto</th>
              <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest text-right">Saldo Pendente</th>
              <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest text-right">Ações Rápidas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(customer => (
              <tr key={customer.id} className="hover:bg-slate-50/80 transition-colors group">
                <td className="px-8 py-5">
                  <div className="flex flex-col">
                    <div className="font-bold text-slate-900 text-base tracking-tight leading-tight font-display">{customer.name}</div>
                    <div className="flex items-center gap-2 mt-2">
                       <span className="px-2 py-0.5 bg-slate-100 text-slate-400 text-[8px] font-black uppercase rounded tracking-widest font-mono">ERP ID: {customer.id?.slice(-4)}</span>
                       {customer.totalDebt > 0 ? (
                         <span className="px-2 py-0.5 bg-red-800/10 text-red-800 text-[8px] font-black uppercase rounded border border-red-800/20 shadow-sm">Débito Ativo</span>
                       ) : (
                         <span className="px-2 py-0.5 bg-amber-500/10 text-amber-700 text-[8px] font-black uppercase rounded border border-amber-500/20 shadow-sm">Conta Confiável</span>
                       )}
                    </div>
                  </div>
                </td>
                <td className="px-8 py-5">
                  <div className="flex items-center gap-2.5 text-[11px] font-black text-slate-600 uppercase tracking-tight">
                    <Phone size={14} className="text-amber-500" />
                    {customer.contact}
                  </div>
                </td>
                <td className="px-8 py-5 text-right font-display tabular-nums">
                  <div className={cn(
                    "text-xl font-bold tracking-tight",
                    customer.totalDebt > 0 ? 'text-red-800' : 'text-slate-900'
                  )}>
                    {formatCurrency(customer.totalDebt)}
                  </div>
                  {customer.totalDebt > 0 && <div className="text-[8px] font-black text-white bg-red-800 rounded-lg px-2 py-0.5 inline-block uppercase tracking-widest mt-1">Atenção Necessária</div>}
                </td>
                <td className="px-8 py-5">
                  <div className="flex items-center justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openHistory(customer)} className="p-2.5 hover:bg-red-800 hover:text-white text-slate-900 rounded-xl transition-all shadow-sm bg-white border border-slate-100" title="Histórico / Pagamento">
                      <Wallet size={16} />
                    </button>
                    <button onClick={() => openModal(customer, true)} className="p-2.5 hover:bg-red-800 hover:text-white text-slate-900 rounded-xl transition-all shadow-sm bg-white border border-slate-100" title="Duplicar">
                      <Copy size={16} />
                    </button>
                    <button onClick={() => openModal(customer)} className="p-2.5 hover:bg-red-800 hover:text-white text-slate-900 rounded-xl transition-all shadow-sm bg-white border border-slate-100" title="Editar">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => deleteDoc(doc(db, 'customers', customer.id!))} className="p-2.5 hover:bg-slate-950 hover:text-white text-slate-900 rounded-xl transition-all shadow-sm bg-white border border-slate-100" title="Excluir">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100">
          {filtered.map(customer => (
            <div key={customer.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{customer.name}</h4>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                    <Phone size={12} className="text-emerald-500" />
                    {customer.contact}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Saldo</p>
                  <p className={cn(
                    "text-sm font-black",
                    customer.totalDebt > 0 ? "text-rose-500" : "text-emerald-600"
                  )}>
                    {formatCurrency(customer.totalDebt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-2">
                  <button onClick={() => openHistory(customer)} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                    <Wallet size={12} /> Pagar
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openModal(customer)} className="p-2 bg-slate-100 text-slate-600 rounded-lg"><Edit2 size={14} /></button>
                  <button onClick={() => deleteDoc(doc(db, 'customers', customer.id!))} className="p-2 bg-rose-50 text-rose-600 rounded-lg"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
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
               className="bg-white rounded-2xl shadow-2xl relative z-10 w-full max-w-2xl overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{editingCustomer ? 'Perfil do Cliente' : 'Novo Cadastro'}</h3>
                  {editingCustomer && <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{editingCustomer.name}</p>}
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-200 rounded-lg transition-colors"><X size={20} /></button>
              </div>

              {editingCustomer && (
                <div className="flex bg-white border-b border-slate-100">
                  <button 
                    onClick={() => setActiveTab('perfil')}
                    className={cn(
                      "flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2",
                      activeTab === 'perfil' ? "border-red-800 text-red-800" : "border-transparent text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Perfil
                  </button>
                  <button 
                    onClick={() => setActiveTab('history')}
                    className={cn(
                      "flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2",
                      activeTab === 'history' ? "border-red-800 text-red-800" : "border-transparent text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Histórico Financeiro
                  </button>
                </div>
              )}

              <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
                {activeTab === 'perfil' ? (
                  <form onSubmit={handleSubmit}>
                    <div className="p-8 space-y-6">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Nome Completo</label>
                        <input 
                          required type="text" value={name} onChange={e => setName(e.target.value)}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-red-800 font-black text-sm transition-all uppercase placeholder:opacity-30"
                          placeholder="Ex: João Silva"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Número de Contato</label>
                        <input 
                          required type="text" value={contact} onChange={e => setContact(e.target.value)}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-red-800 font-black text-sm transition-all"
                          placeholder="(99) 99999-9999"
                        />
                      </div>
                    </div>
                    <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                      <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-[11px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all tracking-widest">Descartar</button>
                      <button type="submit" className="px-10 py-3 bg-red-800 hover:bg-slate-950 text-white text-[11px] font-black uppercase rounded-xl transition-all shadow-lg shadow-red-900/20 tracking-widest">Confirmar Dados</button>
                    </div>
                  </form>
                ) : (
                  <div className="p-8 space-y-8 font-serif">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-950 text-white rounded-2xl p-6 border border-slate-800 shadow-xl">
                        <p className="text-[9px] font-black uppercase text-slate-500 tracking-[0.2em] mb-1">Dívida Total</p>
                        <p className="text-3xl font-black text-red-600 italic tracking-tighter">{formatCurrency(editingCustomer?.totalDebt || 0)}</p>
                      </div>
                      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">Última Transação</p>
                        <p className="text-xl font-black text-slate-900 uppercase tracking-tighter">
                          {transactions.filter(t => t.customerId === editingCustomer?.id).sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds)[0]?.type === 'payment' ? 'Pagamento' : 'Débito'}
                        </p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">
                          {transactions.filter(t => t.customerId === editingCustomer?.id).sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds)[0]?.createdAt?.toDate()?.toLocaleDateString() || 'Nenhuma'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                       <div className="flex items-center justify-between">
                         <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                           <History size={14} /> Histórico Recente
                         </h4>
                         <button 
                           onClick={() => {
                             setIsModalOpen(false);
                             setSelectedCustomer(editingCustomer);
                             setIsHistoryOpen(true);
                           }}
                           className="text-[10px] font-black uppercase text-red-800 hover:underline"
                         >
                           Ver Tudo
                         </button>
                       </div>
                       <div className="space-y-2">
                         {transactions
                           .filter(t => t.customerId === editingCustomer?.id)
                           .slice(0, 5)
                           .map(t => (
                             <div key={t.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm transition-all hover:bg-slate-50">
                               <div className="flex items-center gap-3">
                                 {t.type === 'payment' ? (
                                   <div className="size-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center"><ArrowDownCircle size={16} /></div>
                                 ) : (
                                   <div className="size-8 bg-red-50 text-red-800 rounded-lg flex items-center justify-center"><ArrowUpCircle size={16} /></div>
                                 )}
                                 <div>
                                   <p className="text-[11px] font-black uppercase text-slate-900">{t.type === 'payment' ? 'Pagamento' : 'Débito Pedido'}</p>
                                   <p className="text-[8px] font-bold text-slate-400 uppercase">{t.createdAt?.toDate()?.toLocaleDateString()}</p>
                                 </div>
                               </div>
                               <p className={cn(
                                 "text-sm font-bold tracking-tight font-display",
                                 t.type === 'payment' ? "text-amber-600" : "text-red-800"
                               )}>
                                 {t.type === 'payment' ? '-' : '+'}{formatCurrency(t.amount)}
                               </p>
                             </div>
                           ))
                         }
                         {transactions.filter(t => t.customerId === editingCustomer?.id).length === 0 && (
                            <p className="text-center py-8 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 rounded-2xl border border-dashed border-slate-200">Sem registros</p>
                         )}
                       </div>
                    </div>
                  </div>
                )}
              </div>
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
              className="bg-white rounded-3xl shadow-2xl relative z-10 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] border border-slate-200 font-serif"
            >
              <div className="p-8 border-b border-amber-500 bg-slate-950 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                   <Wallet size={150} />
                </div>
                <div className="flex items-center justify-between mb-8 relative">
                  <div className="flex items-center gap-4">
                    <div className="size-12 bg-red-800 rounded-2xl flex items-center justify-center shadow-lg shadow-red-900/20 border border-white/10">
                      <User size={24} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold tracking-tight uppercase font-display">Exibição de Status: <span className="text-amber-500">{selectedCustomer.name}</span></h3>
                      <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] font-sans">{selectedCustomer.contact} • Auditoria de Inteligência</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">Dívida Acumulada</p>
                    <p className="text-3xl font-black text-red-600 italic tracking-tighter">{formatCurrency(selectedCustomer.totalDebt)}</p>
                  </div>
                </div>
                
                <div className="bg-white/5 rounded-2xl p-5 border border-white/5 relative backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-3 text-[10px] font-black uppercase tracking-widest">
                    <p className="text-amber-500">Processar Amortização de Saldo</p>
                    <button 
                      onClick={() => setPaymentAmount(selectedCustomer.totalDebt.toString())}
                      className="text-white hover:text-amber-500 transition-colors"
                    >
                      Valor Total
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-black">R$</span>
                      <input 
                        type="text" value={paymentAmount} 
                        inputMode="decimal"
                        onChange={e => setPaymentAmount(e.target.value.replace(/[^0-9,.]/g, '').replace(',', '.'))}
                        onFocus={e => e.target.value === '0' ? setPaymentAmount('') : null}
                        onBlur={e => e.target.value === '' ? setPaymentAmount('0') : null}
                        className="w-full bg-white/10 border border-white/10 rounded-xl pl-10 pr-4 py-3 outline-none font-black text-xl text-amber-500 focus:bg-white/20 transition-all placeholder:text-white/20 italic tracking-tighter"
                        placeholder="0,00"
                      />
                    </div>
                    <button 
                      onClick={handlePayment}
                      className="bg-red-800 text-white font-black px-8 rounded-xl hover:bg-black transition-all shadow-lg shadow-red-900/20 text-[10px] uppercase tracking-widest active:scale-95"
                    >
                      Amortização Direta
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                  <div className="flex items-center gap-2">
                    <History size={16} className="text-slate-400" />
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Extrato de Movimentações</h4>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-4 px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
                      <div className="text-right">
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Compensado</p>
                        <p className="text-xs font-black text-emerald-600">
                          {formatCurrency(filteredTransactions.filter(t => t.type === 'payment').reduce((acc, t) => acc + t.amount, 0))}
                        </p>
                      </div>
                      <div className="w-px h-6 bg-slate-100" />
                      <div className="text-right">
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Devido</p>
                        <p className="text-xs font-black text-rose-500">
                          {formatCurrency(filteredTransactions.filter(t => t.type === 'debt').reduce((acc, t) => acc + t.amount, 0))}
                        </p>
                      </div>
                    </div>

                    <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                      {(['all', 'payment', 'debt'] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => setHistoryTypeFilter(type)}
                          className={cn(
                            "px-3 py-1.5 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all",
                            historyTypeFilter === type 
                              ? "bg-slate-900 text-white shadow-md" 
                              : "text-slate-400 hover:text-slate-600"
                          )}
                        >
                          {type === 'all' ? 'Tudo' : type === 'payment' ? 'Pagos' : 'Débitos'}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
                       <input 
                         type="date" 
                         value={historyStartDate}
                         onChange={e => setHistoryStartDate(e.target.value)}
                         className="text-[9px] font-bold text-slate-600 outline-none w-24 bg-transparent"
                       />
                       <span className="text-slate-300">|</span>
                       <input 
                         type="date" 
                         value={historyEndDate}
                         onChange={e => setHistoryEndDate(e.target.value)}
                         className="text-[9px] font-bold text-slate-600 outline-none w-24 bg-transparent"
                       />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredTransactions.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 border-dashed">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhuma transação filtrada</p>
                    </div>
                  )}
                  {filteredTransactions.map(t => (
                    <div key={t.id} className="flex items-center justify-between p-5 bg-white rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
                      <div className="flex items-center gap-4">
                        {t.type === 'payment' ? (
                          <div className="size-10 bg-amber-50 text-amber-700 rounded-xl flex items-center justify-center"><ArrowDownCircle size={20} /></div>
                        ) : (
                          <div className="size-10 bg-red-50 text-red-800 rounded-xl flex items-center justify-center"><ArrowUpCircle size={20} /></div>
                        )}
                        <div>
                          <p className="font-black text-slate-900 text-sm uppercase tracking-tight">{t.type === 'payment' ? 'Pagamento Efetivado' : 'Investimento em Produto'}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                             {new Date(t.createdAt?.seconds * 1000).toLocaleDateString('pt-BR')} 
                             - {new Date(t.createdAt?.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className={cn(
                        "text-lg font-bold tracking-tight",
                        t.type === 'payment' ? 'text-amber-600' : 'text-red-800'
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
    </motion.div>
  );
}
