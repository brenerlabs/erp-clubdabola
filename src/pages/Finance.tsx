import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy, writeBatch, doc, getDocs, serverTimestamp } from 'firebase/firestore';
import { Transaction, Sale, Shipment, Customer, Product } from '../types';
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Wallet, 
  DollarSign, 
  CreditCard, 
  QrCode, 
  Banknote,
  FileText,
  Table as TableIcon,
  Receipt,
  Truck,
  User,
  LayoutDashboard,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { motion } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function Finance() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState<'all' | 'payment' | 'debt'>('all');

  useEffect(() => {
    const unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('createdAt', 'desc')), (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    });

    const unsubTrans = onSnapshot(query(collection(db, 'transactions'), orderBy('createdAt', 'desc')), (snapshot) => {
      setTransactions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    });

    const unsubShip = onSnapshot(collection(db, 'shipments'), (snapshot) => {
      setShipments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Shipment)));
    });

    const unsubCust = onSnapshot(collection(db, 'customers'), (snapshot) => {
      setCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    });

    const unsubProd = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });

    return () => { unsubSales(); unsubTrans(); unsubShip(); unsubCust(); unsubProd(); };
  }, []);

  const getCustomerName = (id: string) => customers.find(c => c.id === id)?.name || 'Anônimo';

  const getSaleBalance = (sale: Sale) => {
    if (sale.paymentMethod !== 'Fiado') return 0;
    const paymentsForSale = transactions
      .filter(t => t.saleId === sale.id && t.type === 'payment')
      .reduce((acc, t) => acc + t.amount, 0);
    return Math.max(0, sale.total - paymentsForSale);
  };

  const totalInvoiced = sales.filter(s => s.status !== 'Pré-venda').reduce((acc, s) => acc + s.total, 0);
  const totalReceived = transactions.filter(t => t.type === 'payment').reduce((acc, t) => acc + t.amount, 0);
  const totalPaidTaxes = shipments.filter(s => s.taxPaid).reduce((acc, s) => acc + (s.taxAmount || 0), 0);

  const getShipmentForSale = (saleId?: string) => {
    if (!saleId) return null;
    return shipments.find(s => s.items.some(i => i.saleId === saleId));
  };
  
  // Accounts Receivable is the sum of balances of all Fiado sales
  const accountsReceivable = sales.filter(s => s.status !== 'Pré-venda').reduce((acc, s) => acc + getSaleBalance(s), 0);
  
  const cashFlow = totalReceived - totalPaidTaxes;

  const totalCostOfGoods = sales.filter(s => s.status !== 'Pré-venda').reduce((acc, s) => {
    return acc + s.items.reduce((itemAcc, item) => {
      const product = products.find(p => p.id === item.productId);
      return itemAcc + ((product?.costPrice || 0) * item.quantity);
    }, 0);
  }, 0);

  const realProfit = totalInvoiced - totalCostOfGoods;
  const profitMargin = totalInvoiced > 0 ? (realProfit / totalInvoiced) * 100 : 0;

  const methods = [
    { name: 'Dinheiro', icon: Banknote, value: transactions.filter(t => t.paymentMethod === 'Dinheiro').reduce((a, b) => a + b.amount, 0), color: 'bg-emerald-50 text-emerald-600' },
    { name: 'Pix', icon: QrCode, value: transactions.filter(t => t.paymentMethod === 'Pix').reduce((a, b) => a + b.amount, 0), color: 'bg-amber-50 text-amber-600' },
    { name: 'Cartão', icon: CreditCard, value: transactions.filter(t => t.paymentMethod === 'Cartão').reduce((a, b) => a + b.amount, 0), color: 'bg-slate-50 text-slate-600' },
    { name: 'Fiado (Pendente)', icon: Wallet, value: accountsReceivable, color: 'bg-red-50 text-red-600' },
  ];

  const [isResetIconLoading, setIsResetIconLoading] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Relatório Financeiro - ERP Club da Bola', 14, 15);
    doc.text(`Faturamento: ${formatCurrency(totalInvoiced)}`, 14, 25);
    doc.text(`Fluxo de Caixa: ${formatCurrency(cashFlow)}`, 14, 32);
    doc.text(`Contas a Receber: ${formatCurrency(accountsReceivable)}`, 14, 39);

    const tableData = transactions.filter(t => filter === 'all' || t.type === filter).map(t => [
      t.type === 'payment' ? 'Amortização' : 'Venda a Prazo',
      new Date(t.createdAt?.seconds * 1000).toLocaleDateString('pt-BR'),
      formatCurrency(t.amount)
    ]);

    autoTable(doc, {
      startY: 50,
      head: [['Natureza', 'Data', 'Montante']],
      body: tableData,
    });

    doc.save('financeiro-erp-club-da-bola.pdf');
  };
  
  const resetFinancialData = async () => {
    try {
      setIsResetIconLoading(true);
      setShowConfirmReset(false); // Hide confirmation UI immediately
      console.log("Iniciando limpeza profunda de dados financeiros...");
      
      const collectionsToClear = ['sales', 'transactions', 'shipments', 'compensations'];
      let totalDeleted = 0;
      
      // 1. Clear operational collections
      for (const colName of collectionsToClear) {
        const snapshot = await getDocs(collection(db, colName));
        console.log(`Limpando ${snapshot.size} documentos de ${colName}...`);
        
        const docs = snapshot.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          const chunk = docs.slice(i, i + 400);
          chunk.forEach(d => {
            batch.delete(doc(db, colName, d.id));
          });
          await batch.commit();
          totalDeleted += chunk.length;
        }
      }
      
      // 2. Clear Customer Debts (Explicitly fetch all to avoid state issues)
      const customerSnapshot = await getDocs(collection(db, 'customers'));
      console.log(`Resetando dívidas de ${customerSnapshot.size} clientes...`);
      
      const customerDocs = customerSnapshot.docs;
      for (let i = 0; i < customerDocs.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = customerDocs.slice(i, i + 400);
        chunk.forEach(c => {
          batch.update(doc(db, 'customers', c.id), {
            totalDebt: 0,
            updatedAt: serverTimestamp()
          });
        });
        await batch.commit();
      }
      
      // 3. Optional: Reset product stock variations if the user considers it "financeiro" (cost of goods)
      // Actually the user said "todo referente a parte financeiro", usually stock is not financeiro in this context unless specified.
      // But keeping what they said: "mantendo os cadastros de clientes e produtos ativos".
      
      console.log("Limpeza financeira concluída!");
      alert(`✅ Sucesso! O financeiro foi completamente zerado.\n\nRegistros apagados: ${totalDeleted}\nClientes com dívida resetada: ${customerSnapshot.size}`);
      window.location.reload();
    } catch (error) {
      console.error("Erro detalhado ao resetar dados:", error);
      alert("Erro ao resetar dados. Ocorreu um erro de permissão ou rede.");
    } finally {
      setIsResetIconLoading(false);
    }
  };

  const exportToExcel = () => {
    const data = transactions.filter(t => filter === 'all' || t.type === filter).map(t => ({
      Natureza: t.type === 'payment' ? 'Amortização' : 'Venda a Prazo',
      Data: new Date(t.createdAt?.seconds * 1000).toLocaleDateString('pt-BR'),
      Valor: t.amount,
      Método: t.paymentMethod || 'N/A'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Financeiro");
    XLSX.writeFile(wb, "financeiro-erp-club-da-bola.xlsx");
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
            Auditoria <span className="text-red-800 underline decoration-red-200 decoration-4 underline-offset-4 tracking-tight font-bold">Financeira</span>
          </h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] font-sans mt-2">Gestão de Ativos e Fluxo de Caixa</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={exportToPDF}
            className="flex items-center gap-2 px-6 py-3 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all border border-rose-100 shadow-sm"
          >
            <FileText size={16} /> Relatório PDF
          </button>
          <button 
            onClick={exportToExcel}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all border border-emerald-100 shadow-sm"
          >
            <TableIcon size={16} /> Planilha Excel
          </button>
        </div>
      </div>

    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      <FinanceCard title="Faturamento Bruto" value={formatCurrency(totalInvoiced)} icon={ArrowUpCircle} color="red" />
      <FinanceCard title="Lucro Real" value={formatCurrency(realProfit)} icon={ArrowDownCircle} color="emerald" subtitle={`Margem: ${profitMargin.toFixed(1)}%`} />
      <FinanceCard title="Contas a Receber" value={formatCurrency(accountsReceivable)} icon={Wallet} color="black" />
      <FinanceCard title="Custos Operacionais" value={formatCurrency(totalCostOfGoods + totalPaidTaxes)} icon={Receipt} color="amber" />
    </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Payment Methods Table */}
        <div className="bg-white/40 backdrop-blur-md p-8 rounded-[32px] border border-white/60 shadow-xl shadow-slate-200/50 h-fit">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
            <CreditCard size={14} className="text-red-800" />
            Recebimentos por canal
          </h4>
          <div className="space-y-4">
            {methods.map(m => (
              <div key={m.name} className="flex items-center justify-between p-5 bg-white/60 border border-slate-100 rounded-[24px] transition-all hover:bg-white hover:shadow-lg hover:-translate-y-0.5 pointer-events-none shadow-sm">
                <div className="flex items-center gap-4">
                  <div className={cn("size-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform", m.name === 'Fiado (Pendente)' ? "bg-rose-500 text-white shadow-rose-200" : "bg-slate-900 text-white shadow-slate-200")}>
                    <m.icon size={20} />
                  </div>
                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">{m.name}</span>
                </div>
                <span className="text-lg font-black text-slate-950 font-display tabular-nums tracking-tighter italic">{formatCurrency(m.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Transactions List */}
        <div className="xl:col-span-2 bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[650px]">
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
               <Receipt size={16} className="text-red-800" />
               Extrato de auditoria
            </h4>
            <div className="flex bg-slate-100 p-1.5 rounded-xl shadow-inner border border-slate-200">
              <button 
                onClick={() => setFilter('all')}
                className={cn("px-6 py-2 text-[10px] font-black rounded-lg uppercase tracking-widest transition-all", filter === 'all' ? "bg-slate-950 text-white shadow-md" : "text-slate-400 hover:text-slate-600")}
              >
                Tudo
              </button>
              <button 
                onClick={() => setFilter('payment')}
                className={cn("px-6 py-2 text-[10px] font-black rounded-lg uppercase tracking-widest transition-all", filter === 'payment' ? "bg-slate-950 text-white shadow-md" : "text-slate-400 hover:text-slate-600")}
              >
                Liquidação
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[800px]">
              <thead className="sticky top-0 bg-slate-50/80 backdrop-blur-md border-b border-slate-100 z-10">
                <tr>
                  <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Natureza</th>
                  <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Envolvido</th>
                  <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Status Logístico</th>
                  <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Temporalidade</th>
                  <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest text-right">Montante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {transactions.filter(t => filter === 'all' || t.type === filter).map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "size-10 rounded-xl flex items-center justify-center shadow-inner", 
                          t.type === 'payment' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                        )}>
                          {t.type === 'payment' ? <ArrowDownCircle size={18} /> : <ArrowUpCircle size={18} />}
                        </div>
                        <div>
                          <p className="text-[11px] font-black text-slate-950 uppercase tracking-tight italic">{t.type === 'payment' ? 'Amortização Fiado' : 'Venda a Prazo'}</p>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Sincronização Fiscal</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <div className="size-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 border border-white shadow-sm">
                          <User size={14} />
                        </div>
                        <span className="text-[11px] font-black text-slate-700 uppercase tracking-tight italic underline decoration-red-200 decoration-2 underline-offset-2">{getCustomerName(t.customerId)}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      {getShipmentForSale(t.saleId) ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Truck size={14} className="text-indigo-500" />
                            <span className="text-[10px] font-black uppercase text-indigo-600 tracking-tighter">
                              {getShipmentForSale(t.saleId)?.trackingCode || 'Sem Rastreio'}
                            </span>
                          </div>
                          <div className="px-2 py-0.5 bg-indigo-50 rounded-lg text-[8px] font-black text-indigo-600 inline-block uppercase tracking-widest border border-indigo-100">
                            {getShipmentForSale(t.saleId)?.status}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic opacity-40">N/A</span>
                      )}
                    </td>
                    <td className="px-8 py-5">
                      <div className="text-[11px] font-black text-slate-600 italic font-sans uppercase">
                        {new Date(t.createdAt?.seconds * 1000).toLocaleDateString('pt-BR')} 
                        <span className="text-[9px] text-slate-400 ml-2 font-black uppercase block tracking-widest not-italic">
                          {new Date(t.createdAt?.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <span className={cn(
                        "text-lg font-bold tracking-tight font-display tabular-nums",
                        t.type === 'payment' ? "text-emerald-600" : "text-rose-500"
                      )}>
                        {t.type === 'payment' ? '+' : '-'}{formatCurrency(t.amount)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="mt-12 p-8 bg-rose-50/50 border border-rose-100 rounded-[32px] group hover:border-rose-200 transition-all">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 text-center md:text-left">
            <div className="size-14 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-200">
              <AlertTriangle size={28} className={isResetIconLoading ? "animate-spin" : "animate-pulse"} />
            </div>
            <div>
              <h4 className="text-lg font-black text-rose-900 uppercase tracking-tighter italic">Zona de Segurança de Dados</h4>
              <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mt-1">Limpeza permanente de registros operacionais e financeiros</p>
            </div>
          </div>

          {!showConfirmReset ? (
            <button 
              onClick={() => setShowConfirmReset(true)}
              className="flex items-center gap-3 px-8 py-4 bg-rose-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-rose-700 transition-all shadow-xl shadow-rose-200 active:scale-95"
            >
              <Trash2 size={18} />
              Resetar Operações e Custos
            </button>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest animate-bounce">Tem certeza absoluta?</p>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowConfirmReset(false)}
                  className="px-6 py-3 bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-300 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={resetFinancialData}
                  disabled={isResetIconLoading}
                  className="px-8 py-4 bg-red-600 text-white rounded-xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-red-700 transition-all shadow-xl shadow-red-200 disabled:opacity-50"
                >
                  {isResetIconLoading ? "PROCESSANDO..." : "SIM, LIMPAR TUDO"}
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="mt-4 text-[9px] text-rose-300 font-bold uppercase text-center md:text-right tracking-widest">
          * Apenas Transações, Vendas, Encomendas e Histórico Financeiro serão excluídos.
        </p>
      </div>
    </motion.div>
  );
}

function FinanceCard({ title, value, icon: Icon, color }: any) {
  const configs: any = {
    red: 'bg-red-800 text-white shadow-xl shadow-red-900/20 border-red-700',
    emerald: 'bg-white/40 backdrop-blur-md text-slate-900 border-white/60 shadow-xl shadow-slate-200/40',
    black: 'bg-slate-950 text-white border-white/10 shadow-xl shadow-slate-950/20',
    amber: 'bg-white text-slate-900 border-slate-200 shadow-sm',
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={cn(
        "p-6 rounded-[32px] border transition-all relative overflow-hidden group",
        configs[color]
      )}
    >
      <div className="flex justify-between items-start mb-6 relative z-10">
        <div className={cn(
          "size-10 rounded-2xl flex items-center justify-center transition-all group-hover:scale-110 shadow-lg",
          color === 'red' ? "bg-white/20 text-white" : (color === 'emerald' ? "bg-slate-900 text-white shadow-slate-200" : (color === 'black' ? "bg-white/10 text-white" : "bg-amber-100 text-amber-600"))
        )}>
          <Icon size={20} />
        </div>
        <div className={cn(
          "px-3 py-1 bg-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest border border-white/5",
          color === 'red' || color === 'black' ? "text-white/60" : "bg-slate-100 text-slate-400"
        )}>
          {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
        </div>
      </div>
      
      <div className="relative z-10">
        <p className={cn(
          "text-[10px] font-black uppercase tracking-[0.3em] mb-2 leading-none",
          color === 'red' || color === 'black' ? "text-white/40" : "text-slate-400"
        )}>{title}</p>
        <h4 className="text-2xl font-bold tracking-tight leading-none font-display tabular-nums uppercase">{value}</h4>
      </div>
    </motion.div>
  );
}
