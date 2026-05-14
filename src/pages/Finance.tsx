import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { Transaction, Sale, Shipment, Customer } from '../types';
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
  LayoutDashboard
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

    return () => { unsubSales(); unsubTrans(); unsubShip(); unsubCust(); };
  }, []);

  const getCustomerName = (id: string) => customers.find(c => c.id === id)?.name || 'Anônimo';

  const getSaleBalance = (sale: Sale) => {
    if (sale.paymentMethod !== 'Fiado') return 0;
    const paymentsForSale = transactions
      .filter(t => t.saleId === sale.id && t.type === 'payment')
      .reduce((acc, t) => acc + t.amount, 0);
    return Math.max(0, sale.total - paymentsForSale);
  };

  const totalInvoiced = sales.reduce((acc, s) => acc + s.total, 0);
  const totalReceived = transactions.filter(t => t.type === 'payment').reduce((acc, t) => acc + t.amount, 0);
  const totalPaidTaxes = shipments.filter(s => s.taxPaid).reduce((acc, s) => acc + (s.taxAmount || 0), 0);

  const getShipmentForSale = (saleId?: string) => {
    if (!saleId) return null;
    return shipments.find(s => s.items.some(i => i.saleId === saleId));
  };
  
  // Accounts Receivable is the sum of balances of all Fiado sales
  const accountsReceivable = sales.reduce((acc, s) => acc + getSaleBalance(s), 0);
  
  const cashFlow = totalReceived - totalPaidTaxes;

  const methods = [
    { name: 'Dinheiro', icon: Banknote, value: transactions.filter(t => t.paymentMethod === 'Dinheiro').reduce((a, b) => a + b.amount, 0), color: 'bg-green-50 text-green-600' },
    { name: 'Pix', icon: QrCode, value: transactions.filter(t => t.paymentMethod === 'Pix').reduce((a, b) => a + b.amount, 0), color: 'bg-indigo-50 text-indigo-600' },
    { name: 'Cartão', icon: CreditCard, value: transactions.filter(t => t.paymentMethod === 'Cartão').reduce((a, b) => a + b.amount, 0), color: 'bg-blue-50 text-blue-600' },
    { name: 'Fiado (Pendente)', icon: Wallet, value: accountsReceivable, color: 'bg-red-50 text-red-600' },
  ];

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
          <h2 className="text-3xl font-black italic tracking-tighter">Financeiro & <span className="text-indigo-500 underline decoration-indigo-200 decoration-4 underline-offset-4">Auditoria</span></h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] mt-1">Gestão de Ativos e Fluxo de Caixa</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={exportToPDF}
            className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all border border-rose-100"
          >
            <FileText size={14} /> PDF
          </button>
          <button 
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all border border-emerald-100"
          >
            <TableIcon size={14} /> Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <FinanceCard title="Faturamento Bruto" value={formatCurrency(totalInvoiced)} icon={ArrowUpCircle} color="indigo" />
        <FinanceCard title="Fluxo de Caixa (Líquido)" value={formatCurrency(cashFlow)} icon={ArrowDownCircle} color="emerald" />
        <FinanceCard title="Contas a Receber" value={formatCurrency(accountsReceivable)} icon={Wallet} color="rose" />
        <FinanceCard title="Taxas Pagas" value={formatCurrency(totalPaidTaxes)} icon={Receipt} color="amber" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Payment Methods Table */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Recebimentos por Canal</h4>
          <div className="space-y-3">
            {methods.map(m => (
              <div key={m.name} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl transition-all hover:bg-white hover:shadow-md hover:-translate-y-0.5 pointer-events-none">
                <div className="flex items-center gap-3">
                  <div className={cn("size-10 rounded-xl flex items-center justify-center shadow-sm", m.name === 'Fiado' ? "bg-rose-500 text-white" : "bg-indigo-500 text-white")}>
                    <m.icon size={18} />
                  </div>
                  <span className="text-sm font-bold text-slate-700">{m.name}</span>
                </div>
                <span className="text-md font-black text-slate-900">{formatCurrency(m.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Transactions List */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
            <h4 className="text-sm font-bold text-slate-800">Extrato de Auditoria</h4>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button 
                onClick={() => setFilter('all')}
                className={cn("px-4 py-1.5 text-[10px] font-bold rounded-md uppercase tracking-wider transition-all", filter === 'all' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
              >
                Tudo
              </button>
              <button 
                onClick={() => setFilter('payment')}
                className={cn("px-4 py-1.5 text-[10px] font-bold rounded-md uppercase tracking-wider transition-all", filter === 'payment' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500")}
              >
                Liquidação
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                <tr>
                  <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Natureza</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Envolvido</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Status Logístico</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Temporalidade</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest text-right">Montante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {transactions.filter(t => filter === 'all' || t.type === filter).map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "size-10 rounded-xl flex items-center justify-center shadow-inner", 
                          t.type === 'payment' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                        )}>
                          {t.type === 'payment' ? <ArrowDownCircle size={18} /> : <ArrowUpCircle size={18} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{t.type === 'payment' ? 'Amortização Fiado' : 'Venda a Prazo'}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Sync via Firestore</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <div className="size-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                          <User size={12} />
                        </div>
                        <span className="text-xs font-bold text-slate-700">{getCustomerName(t.customerId)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {getShipmentForSale(t.saleId) ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <Truck size={12} className="text-indigo-500" />
                            <span className="text-[10px] font-black uppercase text-indigo-600 tracking-tighter">
                              {getShipmentForSale(t.saleId)?.trackingCode || 'Sem Rastreio'}
                            </span>
                          </div>
                          <div className="px-2 py-0.5 bg-slate-100 rounded-full text-[9px] font-bold text-slate-500 inline-block uppercase italic">
                            Status: {getShipmentForSale(t.saleId)?.status}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Sem Lote Ativo</span>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-sm font-medium text-slate-600">
                        {new Date(t.createdAt?.seconds * 1000).toLocaleDateString('pt-BR')} 
                        <span className="text-[10px] text-slate-400 ml-2 font-black uppercase">
                          {new Date(t.createdAt?.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right font-black text-sm">
                      <span className={cn(t.type === 'payment' ? "text-emerald-600" : "text-rose-500")}>
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
    </motion.div>
  );
}

function FinanceCard({ title, value, icon: Icon, color }: any) {
  const configs: any = {
    indigo: 'from-indigo-600 to-indigo-800 shadow-indigo-500/20 text-white',
    emerald: 'bg-white text-slate-900 border-slate-100 shadow-slate-200/50',
    rose: 'bg-slate-900 text-white border-slate-800 shadow-slate-950/20',
    amber: 'from-amber-400 to-amber-600 shadow-amber-500/20 text-white',
  };

  const isGradient = color === 'indigo' || color === 'amber';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5, scale: 1.02 }}
      className={cn(
        "p-8 rounded-[40px] shadow-2xl transition-all border relative overflow-hidden",
        isGradient ? `bg-gradient-to-br ${configs[color]}` : configs[color]
      )}
    >
      <div className="flex justify-between items-start mb-8 relative z-10">
        <div className={cn(
          "size-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform",
          isGradient ? "bg-white/20 text-white" : (color === 'rose' ? "bg-white/10 text-white" : "bg-indigo-600 text-white")
        )}>
          <Icon size={24} />
        </div>
        <div className={cn(
          "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em]",
          isGradient ? "bg-white/20 text-white" : (color === 'rose' ? "bg-white/10 text-white" : "bg-emerald-50 text-emerald-600")
        )}>
          Fiscal Sync
        </div>
      </div>
      
      <div className="relative z-10">
        <p className={cn(
          "text-[10px] font-black uppercase tracking-[0.3em] mb-2",
          isGradient || color === 'rose' ? "text-white/60" : "text-slate-400"
        )}>{title}</p>
        <h4 className="text-3xl font-black italic tracking-tighter">{value}</h4>
      </div>

      {isGradient && (
        <div className="absolute -bottom-12 -left-12 size-32 bg-white/10 rounded-full blur-3xl" />
      )}
    </motion.div>
  );
}
