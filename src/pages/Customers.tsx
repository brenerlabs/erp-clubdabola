import React, { useState, useEffect, useContext } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, where, orderBy, writeBatch } from 'firebase/firestore';
import { Customer, Transaction, Sale } from '../types';
import { Plus, Search, Edit2, Trash2, Copy, User, Phone, Wallet, History, ArrowDownCircle, ArrowUpCircle, X, ShoppingBag, Star, FileText } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { SidebarContext } from '../App';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const [sales, setSales] = useState<Sale[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [filterDebt, setFilterDebt] = useState<'all' | 'has-debt' | 'no-debt'>('all');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'payment' | 'debt'>('all');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'perfil' | 'history'>('perfil');
  const [historyTab, setHistoryTab] = useState<'transacoes' | 'pedidos' | 'favoritos'>('transacoes');

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

    const unsubSales = onSnapshot(collection(db, 'sales'), (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    });

    return () => { unsubscribe(); unsubSales(); };
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
      const batch = writeBatch(db);
      
      // Get all non-Pre-venda Fiado sales for this customer
      const pSales = sales
        .filter(s => s.customerId === selectedCustomer.id && s.paymentMethod === 'Fiado' && s.status !== 'Pré-venda')
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

          // Create a payment transaction linked to this specific sale
          const transRef = doc(collection(db, 'transactions'));
          batch.set(transRef, {
            customerId: selectedCustomer.id,
            amount: amountToApply,
            type: 'payment',
            paymentMethod: 'Dinheiro',
            saleId: sale.id,
            createdAt: new Date()
          });

          // Mark as Concluída if fully paid off
          if (paymentsForSale + amountToApply >= sale.total) {
            batch.update(doc(db, 'sales', sale.id!), {
              status: 'Concluída',
              updatedAt: serverTimestamp()
            });
          }
        }
      }

      // If there is still a remaining payment amount (or if they had no pending sales at all),
      // we log it as a general payment transaction with no specific saleId.
      if (remainingAmount > 0) {
        const transRef = doc(collection(db, 'transactions'));
        batch.set(transRef, {
          customerId: selectedCustomer.id,
          amount: remainingAmount,
          type: 'payment',
          paymentMethod: 'Dinheiro',
          saleId: null,
          createdAt: new Date()
        });
      }

      // Update Customer Debt
      const custRef = doc(db, 'customers', selectedCustomer.id!);
      batch.update(custRef, {
        totalDebt: Math.max(0, (selectedCustomer.totalDebt || 0) - amount),
        updatedAt: serverTimestamp()
      });

      await batch.commit();

      setPaymentAmount('');
      alert('Amortização processada com sucesso!');
    } catch (err: any) {
      console.error(err);
      alert('Erro ao processar pagamento: ' + err.message);
    }
  };

  const exportCustomerPDF = () => {
    if (!selectedCustomer) return;

    const doc = new jsPDF();
    const now = new Date();

    // PDF Page Design & Header
    doc.setFillColor(15, 23, 42); // slate-900 (Dark Slate Background for Header)
    doc.rect(0, 0, 210, 42, 'F');

    // Header Title
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text('CLUB DA BOLA', 14, 18);

    doc.setFontSize(9);
    doc.setTextColor(239, 68, 68); // Soft Red text
    doc.text('ERP SYSTEM • HISTÓRICO FINANCEIRO CONSOLIDADO', 14, 25);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text(`EXTRATO DE AUDITORIA E COMPRAS`, 14, 32);
    doc.text(`Gerado em: ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`, 140, 32);

    // Customer Identity Section
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(248, 250, 252); // slate-50
    doc.roundedRect(14, 50, 182, 38, 4, 4, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('CADASTRO DO CLIENTE', 20, 58);

    doc.setDrawColor(226, 232, 240);
    doc.line(20, 62, 190, 62);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);

    doc.text(`Nome do Cliente:`, 20, 68);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(selectedCustomer.name, 60, 68);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Contato / Telefone:`, 20, 74);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(selectedCustomer.contact || 'S/D', 60, 74);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`ERP Identificador (ID):`, 20, 80);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(selectedCustomer.id || 'N/A', 60, 80);

    // Financial Status nested box on the right of Identity
    doc.setFillColor(254, 242, 242); // red-50
    doc.setDrawColor(248, 113, 113); // red-450
    doc.roundedRect(125, 65, 65, 20, 3, 3, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(153, 27, 27); // red-800
    doc.text('SALDO DEVEDOR ATUAL', 129, 71);

    doc.setFontSize(11);
    doc.setTextColor(153, 27, 27);
    doc.text(formatCurrency(selectedCustomer.totalDebt || 0), 129, 79);

    // Secondary KPI Row under basic info
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, 94, 182, 32, 4, 4, 'FD');

    // Calculate customer metrics
    const totalPurchased = customerSales.reduce((acc, s) => acc + s.total, 0);
    const totalPayments = transactions.filter(t => t.type === 'payment').reduce((acc, t) => acc + t.amount, 0);
    const totalOrdersCount = customerSales.length;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('TOTAL DE PEDIDOS', 20, 103);
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(`${totalOrdersCount}`, 20, 113);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('MONTANTE COMPRADO', 70, 103);
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(totalPurchased), 70, 113);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('MONTANTE LIQUIDADO', 135, 103);
    doc.setFontSize(13);
    doc.setTextColor(5, 150, 105); // emerald-600
    doc.text(formatCurrency(totalPayments), 135, 113);

    // List of Orders Table Header
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('HISTÓRICO CRONOLÓGICO DE PEDIDOS', 14, 138);

    const formatItemsColumn = (items: any[]) => {
      return items.map(i => `${i.quantity}x ${i.name} ${i.variationName ? `(${i.variationName})` : ''}`).join(', ');
    };

    const ordersTableData = customerSales.map(s => {
      const sDateObj = s.createdAt?.seconds 
        ? new Date(s.createdAt.seconds * 1000) 
        : (s.createdAt instanceof Date ? s.createdAt : new Date());
      
      const dateStr = sDateObj.toLocaleDateString('pt-BR');
      const orderRef = `#${s.id?.slice(-6).toUpperCase()}`;
      const itemsList = formatItemsColumn(s.items);
      const method = s.paymentMethod || 'Outro';
      const statusStr = s.status || 'Concluída';
      const totalStr = formatCurrency(s.total);

      return [dateStr, orderRef, itemsList, method, statusStr, totalStr];
    });

    autoTable(doc, {
      startY: 143,
      head: [['Data', 'Ref Pedido', 'Produtos Adquiridos', 'Método', 'Status', 'Valor Total']],
      body: ordersTableData.length > 0 ? ordersTableData : [['S/D', '-', 'Nenhum pedido cadastrado no histórico.', '-', '-', 'R$ 0,00']],
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42], // slate-900 (executive theme)
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 7.5,
        font: 'Helvetica'
      },
      columnStyles: {
        2: { cellWidth: 70 }, // Wide cell for products list
        5: { halign: 'right', fontStyle: 'bold' }
      }
    });

    // Let's add Payments Table lower down or on next page if we need
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    
    // Check if we need to render transactions/payments
    const customerPayments = transactions.filter(t => t.type === 'payment');
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    
    // If it goes off page bounds, let's render appropriately
    let startYPayments = finalY;
    if (startYPayments > 230) {
      doc.addPage();
      startYPayments = 20;
    }
    
    doc.text('HISTÓRICO DE COMPENSAÇÕES E PAGAMENTOS (AMORTIZAÇÕES)', 14, startYPayments);

    const paymentsTableData = customerPayments.map(t => {
      const pDateObj = t.createdAt?.seconds 
        ? new Date(t.createdAt.seconds * 1000) 
        : (t.createdAt instanceof Date ? t.createdAt : new Date());
      const dateStr = `${pDateObj.toLocaleDateString('pt-BR')} ${pDateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      const typeStr = 'Compensação de Saldo';
      const detailStr = t.saleId ? `Abatimento do Pedido #${t.saleId.slice(-6).toUpperCase()}` : 'Crédito Avulso / Amortização Geral';
      const methodStr = t.paymentMethod || 'Dinheiro';
      const amountStr = `- ${formatCurrency(t.amount)}`;

      return [dateStr, typeStr, detailStr, methodStr, amountStr];
    });

    autoTable(doc, {
      startY: startYPayments + 5,
      head: [['Data e Horário', 'Tipo de Operação', 'Destinação de Recursos', 'Método', 'Valor Pago']],
      body: paymentsTableData.length > 0 ? paymentsTableData : [['S/D', '-', 'Nenhum pagamento registrado ainda.', '-', 'R$ 0,00']],
      theme: 'grid',
      headStyles: {
        fillColor: [153, 27, 27], // brand red-800
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 7.5,
        font: 'Helvetica'
      },
      columnStyles: {
        2: { cellWidth: 70 },
        4: { halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105] } // Green text for payouts
      }
    });

    const fileSlug = selectedCustomer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    doc.save(`historico-vendas-${fileSlug}.pdf`);
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
    const term = debouncedSearch.toLowerCase();
    const matchesSearch = (c.name || '').toLowerCase().includes(term) || (c.contact || '').includes(term);
    const matchesDebt = filterDebt === 'has-debt' ? c.totalDebt > 0 : filterDebt === 'no-debt' ? c.totalDebt <= 0 : true;
    return matchesSearch && matchesDebt;
  });

  const filteredTransactions = transactions.filter(t => {
    const matchesType = historyTypeFilter === 'all' ? true : t.type === historyTypeFilter;
    
    if (!t.createdAt) return matchesType;
    
    const transDate = new Date(t.createdAt.seconds * 1000);
    const matchesStart = historyStartDate ? transDate >= new Date(historyStartDate + 'T00:00:00') : true;
    const matchesEnd = historyEndDate ? transDate <= new Date(historyEndDate + 'T23:59:59') : true;
    
    return matchesType && matchesStart && matchesEnd;
  });

  const getFavoriteProducts = () => {
    if (!selectedCustomer) return [];
    
    const productCounts: Record<string, { name: string, count: number }> = {};
    
    sales
      .filter(s => s.customerId === selectedCustomer.id)
      .flatMap(s => s.items)
      .forEach(item => {
        const key = item.productId + (item.variationName || '');
        if (!productCounts[key]) {
          productCounts[key] = { name: item.name + (item.variationName ? ` (${item.variationName})` : ''), count: 0 };
        }
        productCounts[key].count += item.quantity;
      });

    return Object.values(productCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  };

  const customerSales = selectedCustomer ? sales.filter(s => s.customerId === selectedCustomer.id).sort((a,b) => b.createdAt?.seconds - a.createdAt?.seconds) : [];


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
        <div className="flex flex-col sm:flex-row items-center gap-4 flex-1 w-full max-w-2xl">
          <div className="flex-1 relative group w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 size-5 group-focus-within:text-red-800 transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar Cliente..." 
              className="w-full pl-12 pr-4 py-3 bg-white/60 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-800 transition-all shadow-sm outline-none text-[10px] font-black tracking-widest"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <select
              value={filterDebt}
              onChange={e => setFilterDebt(e.target.value as any)}
              className="bg-white/60 border border-slate-200 rounded-2xl px-4 py-3 text-[9px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-red-800 transition-all shadow-sm flex-1 sm:flex-initial"
            >
              <option value="all">Todos os Clientes</option>
              <option value="has-debt">Com Dívida Ativa</option>
              <option value="no-debt">Sem Dívida</option>
            </select>
          </div>
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
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-red-800 font-black text-sm transition-all placeholder:opacity-30"
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
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={exportCustomerPDF}
                      className="px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 active:scale-95"
                      title="Exportar Extrato Consolidado PDF"
                    >
                      <FileText size={14} className="text-amber-500" />
                      PDF
                    </button>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">Dívida Acumulada</p>
                      <p className="text-3xl font-black text-red-600 italic tracking-tighter">{formatCurrency(selectedCustomer.totalDebt)}</p>
                    </div>
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
              
              <div className="flex-1 overflow-y-auto bg-slate-50">
                <div className="flex bg-white border-b border-slate-200">
                  <button 
                    onClick={() => setHistoryTab('transacoes')}
                    className={cn(
                      "flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2",
                      historyTab === 'transacoes' ? "border-red-800 text-red-800 bg-red-50/30" : "border-transparent text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <div className="flex items-center justify-center gap-2">
                       <History size={14} /> Transações
                    </div>
                  </button>
                  <button 
                    onClick={() => setHistoryTab('pedidos')}
                    className={cn(
                      "flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2",
                      historyTab === 'pedidos' ? "border-red-800 text-red-800 bg-red-50/30" : "border-transparent text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <div className="flex items-center justify-center gap-2">
                       <ShoppingBag size={14} /> Pedidos
                    </div>
                  </button>
                  <button 
                    onClick={() => setHistoryTab('favoritos')}
                    className={cn(
                      "flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2",
                      historyTab === 'favoritos' ? "border-red-800 text-red-800 bg-red-50/30" : "border-transparent text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <div className="flex items-center justify-center gap-2">
                       <Star size={14} /> Favoritos
                    </div>
                  </button>
                </div>

                <div className="p-8">
                {historyTab === 'transacoes' && (
                  <div className="animate-in fade-in slide-in-from-bottom-4">
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
                )}

                {historyTab === 'pedidos' && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4">
                    {customerSales.length === 0 && (
                      <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 border-dashed">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhum pedido realizado</p>
                      </div>
                    )}
                    {customerSales.map(sale => (
                      <div key={sale.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pedido #{sale.id?.slice(-6).toUpperCase()}</p>
                            <p className="text-xs font-bold text-slate-600">{new Date(sale.createdAt?.seconds * 1000).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right">
                             <p className="text-lg font-black text-slate-900 italic tracking-tighter">{formatCurrency(sale.total)}</p>
                             <p className="text-[9px] font-black uppercase text-amber-500 tracking-widest">{sale.paymentMethod}</p>
                          </div>
                        </div>
                        <div className="space-y-2 border-t border-slate-50 pt-4">
                          {sale.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-[10px] font-bold uppercase text-slate-500">
                              <span>{item.quantity}x {item.name} {item.variationName && `(${item.variationName})`}</span>
                              <span>{formatCurrency(item.price * item.quantity)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {historyTab === 'favoritos' && (
                  <div className="animate-in fade-in slide-in-from-bottom-4">
                    {getFavoriteProducts().length === 0 ? (
                      <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 border-dashed">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nenhuma preferência mapeada</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {getFavoriteProducts().map((fav, idx) => (
                          <div key={idx} className="flex items-center justify-between p-6 bg-white rounded-[24px] border border-slate-100 shadow-sm group hover:border-red-100 transition-all">
                             <div className="flex items-center gap-4">
                               <div className="size-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shadow-md">
                                 <Star size={20} fill="currentColor" />
                               </div>
                               <div>
                                 <p className="text-[11px] font-black uppercase text-slate-900 tracking-tight">{fav.name}</p>
                                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Comprado {fav.count} {fav.count === 1 ? 'vez' : 'vezes'}</p>
                               </div>
                             </div>
                             <div className="px-4 py-2 bg-red-50 text-red-800 rounded-xl text-[10px] font-black uppercase tracking-widest">
                                FAVORITO #{idx + 1}
                             </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                </div>
              </div>
              <div className="p-6 bg-white border-t border-slate-100 flex justify-end gap-3">
                <button 
                  onClick={exportCustomerPDF}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-red-800 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-md flex items-center gap-2 active:scale-95"
                >
                  <FileText size={14} className="text-amber-500" />
                  Exportar Extrato PDF
                </button>
                <button onClick={() => setIsHistoryOpen(false)} className="px-8 py-2.5 text-[11px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all tracking-widest">Fechar Janela</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
