import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy, writeBatch, doc, getDocs, serverTimestamp, addDoc, deleteDoc, getDoc, where, updateDoc } from 'firebase/firestore';
import { Transaction, Sale, Shipment, Customer, Product, Expense } from '../types';
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
  AlertTriangle,
  Plus,
  Tag,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronUp,
  X,
  XCircle,
  RotateCcw,
  CheckCircle,
  Sparkles,
  Percent,
  TrendingDown,
  Scale,
  RefreshCw
} from 'lucide-react';
import { formatCurrency, cn, cleanVariationName, cleanProductNameWithVariation, formatVariationWithGender, formatProductNameWithGender, smartSearchMatch } from '../lib/utils';
import { motion } from 'motion/react';
import { RollingCounter } from '../components/RollingCounter';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function Finance() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filter, setFilter] = useState<'all' | 'payment' | 'debt'>('all');

  const [salesSearch, setSalesSearch] = useState('');
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [isCancellingSale, setIsCancellingSale] = useState<string | null>(null);
  const [auditTab, setAuditTab] = useState<'sales' | 'transactions' | 'auditor'>('sales');
  const [expandedAuditDay, setExpandedAuditDay] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    showCancel?: boolean;
    type?: 'warning' | 'success' | 'error';
  } | null>(null);

  const showConfirm = (options: {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    showCancel?: boolean;
    type?: 'warning' | 'success' | 'error';
  }) => {
    setConfirmModal({
      isOpen: true,
      ...options
    });
  };

  const showAlert = (title: string, description: string, type: 'warning' | 'success' | 'error' = 'success') => {
    setConfirmModal({
      isOpen: true,
      title,
      description,
      confirmText: 'Ok',
      onConfirm: () => {},
      showCancel: false,
      type
    });
  };

  // Unified dynamic transaction filters
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | '7days' | 'month' | 'custom'>('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<'all' | 'Dinheiro' | 'Pix' | 'Cartão' | 'Fiado'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Concluída' | 'Pendente' | 'Cancelada' | 'Pré-venda'>('all');

  const handleShipmentClick = (trackingCode: string) => {
    if (!trackingCode || trackingCode === 'Sem Rastreio') return;
    localStorage.setItem('shipment-search', trackingCode);
    window.dispatchEvent(new CustomEvent('navigate-app', { detail: { page: 'shipments' } }));
    window.dispatchEvent(new CustomEvent('shipment-search-update'));
  };

  const getParsedDate = (el: any) => {
    const rawDate = el?.createdAt || el?.date;
    if (!rawDate) return null;
    if (typeof rawDate.seconds === 'number') return new Date(rawDate.seconds * 1000);
    if (rawDate instanceof Date) return rawDate;
    if (typeof rawDate.toDate === 'function') return rawDate.toDate();
    if (typeof rawDate === 'string') return new Date(rawDate);
    return null;
  };

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

    const unsubExp = onSnapshot(query(collection(db, 'expenses'), orderBy('createdAt', 'desc')), (snapshot) => {
      setExpenses(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
    });

    return () => { 
      unsubSales(); 
      unsubTrans(); 
      unsubShip(); 
      unsubCust(); 
      unsubProd(); 
      unsubExp(); 
    };
  }, []);

  const getCustomerName = (id: string) => customers.find(c => c.id === id)?.name || 'Anônimo';

  const getSaleBalance = (sale: Sale) => {
    if (sale.paymentMethod !== 'Fiado') return 0;
    if (sale.status === 'Cancelada') return 0;
    const paymentsForSale = transactions
      .filter(t => t.saleId === sale.id && t.type === 'payment')
      .reduce((acc, t) => acc + t.amount, 0);
    return Math.max(0, sale.total - paymentsForSale);
  };

  const totalInvoiced = sales.filter(s => s.status !== 'Pré-venda' && s.status !== 'Cancelada' && !s.isAdjustment && !(s.items || []).some(item => item && item.productId === 'sistema_ajuste_auditoria')).reduce((acc, s) => acc + s.total, 0);
  const totalReceived = transactions.filter(t => t.type === 'payment').reduce((acc, t) => acc + t.amount, 0);
  const totalPaidTaxes = shipments.filter(s => s.taxPaid).reduce((acc, s) => acc + (s.taxAmount || 0), 0);
  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);

  const getShipmentForSale = (saleId?: string) => {
    if (!saleId) return null;
    return shipments.find(s => s.items.some(i => i.saleId === saleId));
  };
  
  // Accounts Receivable is the sum of balances of all customer debts
  const accountsReceivable = customers.reduce((acc, c) => acc + (c.totalDebt || 0), 0);
  
  const cashFlow = totalReceived - totalPaidTaxes - totalExpenses;

  const totalCostOfGoods = sales.filter(s => s.status !== 'Pré-venda' && s.status !== 'Cancelada' && !s.isAdjustment && !(s.items || []).some(item => item && item.productId === 'sistema_ajuste_auditoria')).reduce((acc, s) => {
    return acc + s.items.filter(item => !item.isCancelled).reduce((itemAcc, item) => {
      const product = products.find(p => p.id === item.productId);
      return itemAcc + ((product?.costPrice || 0) * item.quantity);
    }, 0);
  }, 0);

  const realProfit = totalInvoiced - totalCostOfGoods - totalPaidTaxes - totalExpenses;
  const profitMargin = totalInvoiced > 0 ? (realProfit / totalInvoiced) * 100 : 0;

  const methods = [
    { name: 'Dinheiro', icon: Banknote, value: transactions.filter(t => t.paymentMethod === 'Dinheiro').reduce((a, b) => a + b.amount, 0), color: 'bg-emerald-50 text-emerald-600' },
    { name: 'Pix', icon: QrCode, value: transactions.filter(t => t.paymentMethod === 'Pix').reduce((a, b) => a + b.amount, 0), color: 'bg-amber-50 text-amber-600' },
    { name: 'Cartão', icon: CreditCard, value: transactions.filter(t => t.paymentMethod === 'Cartão').reduce((a, b) => a + b.amount, 0), color: 'bg-slate-50 text-slate-600' },
    { name: 'Fiado (Pendente)', icon: Wallet, value: accountsReceivable, color: 'bg-red-50 text-red-600' },
  ];

  const auditResults = React.useMemo(() => {
    const unreconciledCancellations: Array<{
      sale: Sale;
      reason: string;
      associatedTransactions: Transaction[];
      associatedShipments: Shipment[];
    }> = [];

    const valueMismatches: Array<{
      sale: Sale;
      expected: number;
      found: number;
      paymentMethod: string;
    }> = [];

    const missingTransactionsDays: Array<{
      dateString: string;
      salesCount: number;
      salesTotal: number;
      transactionsCount: number;
      transactionsTotal: number;
      reason: 'Sem Lançamento de Entrada' | 'Lançamento Sem Venda Base';
      transactions: Transaction[];
    }> = [];

    const customerDebtMismatches: Array<{
      customer: Customer;
      expectedDebt: number;
      savedDebt: number;
      diff: number;
    }> = [];

    const suspiciousMargins: Array<{
      sale: Sale;
      revenue: number;
      cost: number;
      margin: number;
    }> = [];

    const suspiciousTransactions: Array<{
      transaction: Transaction;
      issue: string;
    }> = [];

    // Helper map to group by day (YYYY-MM-DD)
    const dayGroups: {
      [day: string]: {
        sales: Sale[];
        transactions: Transaction[];
      }
    } = {};

    // Group sales and transactions by day
    sales.forEach(s => {
      const pDate = getParsedDate(s);
      if (!pDate) return;
      const dayStr = pDate.toISOString().split('T')[0];
      if (!dayGroups[dayStr]) {
        dayGroups[dayStr] = { sales: [], transactions: [] };
      }
      dayGroups[dayStr].sales.push(s);
    });

    transactions.forEach(t => {
      const pDate = getParsedDate(t);
      if (!pDate) return;
      const dayStr = pDate.toISOString().split('T')[0];
      if (!dayGroups[dayStr]) {
        dayGroups[dayStr] = { sales: [], transactions: [] };
      }
      dayGroups[dayStr].transactions.push(t);
    });

    // 1. Audit Gaps by Day
    Object.keys(dayGroups).forEach(day => {
      const group = dayGroups[day];
      const activeSales = group.sales.filter(s => s.status !== 'Cancelada' && s.status !== 'Pré-venda' && !s.isAdjustment && !(s.items || []).some(item => item && item.productId === 'sistema_ajuste_auditoria'));
      const payments = group.transactions.filter(t => t.type === 'payment' && t.paymentMethod !== 'Fiado');

      const salesSum = activeSales.reduce((acc, s) => acc + s.total, 0);

      // Warn if active sales were made but no payments recorded (excluding pure credit/Fiado sales)
      if (activeSales.length > 0 && activeSales.every(s => s.paymentMethod !== 'Fiado') && payments.length === 0) {
        const dateParts = day.split('-');
        const ptBrDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        missingTransactionsDays.push({
          dateString: ptBrDate,
          salesCount: activeSales.length,
          salesTotal: salesSum,
          transactionsCount: 0,
          transactionsTotal: 0,
          reason: 'Sem Lançamento de Entrada',
          transactions: []
        });
      } else if (activeSales.length === 0 && group.transactions.length > 0) {
        const orphanTransactions = group.transactions.filter(t => {
          if (t.type === 'payment') {
            if (t.saleId) {
              const matchedSale = sales.find(s => s.id === t.saleId);
              if (!matchedSale) return true; // Orphan: references a non-existent sale!
              if (matchedSale.status === 'Cancelada') return false; 
              return false; 
            } else {
              if (t.customerId) {
                const matchedCustomer = customers.find(c => c.id === t.customerId);
                return !matchedCustomer; 
              }
              return true; 
            }
          }
          return false;
        });

        if (orphanTransactions.length > 0) {
          const dateParts = day.split('-');
          const ptBrDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
          missingTransactionsDays.push({
            dateString: ptBrDate,
            salesCount: 0,
            salesTotal: 0,
            transactionsCount: orphanTransactions.length,
            transactionsTotal: orphanTransactions.reduce((acc, t) => acc + t.amount, 0),
            reason: 'Lançamento Sem Venda Base',
            transactions: orphanTransactions
          });
        }
      }
    });

    // 2. Audit Unreconciled Cancellations & Mismatches
    sales.forEach(sale => {
      if (!sale.id) return;
      
      const relatedTransactions = transactions.filter(t => t.saleId === sale.id);
      const relatedShipments = shipments.filter(ship => ship.items?.some(it => it.saleId === sale.id));

      if (sale.status === 'Cancelada') {
        const activeTransactions = relatedTransactions.filter(t => t.type === 'payment');
        if (activeTransactions.length > 0 || relatedShipments.length > 0) {
          unreconciledCancellations.push({
            sale,
            reason: activeTransactions.length > 0 
              ? `Venda cancelada mas possui ${activeTransactions.length} parcelas pagas ativas (${formatCurrency(activeTransactions.reduce((acc, t) => acc + t.amount, 0))}).`
              : `Venda cancelada mas possui tracking de frete ativo.`,
            associatedTransactions: activeTransactions,
            associatedShipments: relatedShipments
          });
        }
      } else if (sale.status !== 'Pré-venda') {
        if (sale.paymentMethod !== 'Fiado') {
          const paidSum = relatedTransactions.filter(t => t.type === 'payment').reduce((acc, t) => acc + t.amount, 0);
          if (Math.abs(paidSum - sale.total) > 0.1) {
            valueMismatches.push({
              sale,
              expected: sale.total,
              found: paidSum,
              paymentMethod: sale.paymentMethod
            });
          }
        } else {
          const downPaymentVal = sale.downPayment || 0;
          if (downPaymentVal > 0) {
            const saleDate = getParsedDate(sale);
            const downPaymentsTrans = relatedTransactions.filter(t => {
              if (t.type !== 'payment') return false;
              if (t.paymentMethod === 'Fiado') return false;
              const transDate = getParsedDate(t);
              if (!transDate || !saleDate) return false;
              return Math.abs(transDate.getTime() - saleDate.getTime()) < 60000;
            });
            const sumDown = downPaymentsTrans.reduce((acc, t) => acc + t.amount, 0);
            if (Math.abs(sumDown - downPaymentVal) > 0.1) {
              valueMismatches.push({
                sale,
                expected: downPaymentVal,
                found: sumDown,
                paymentMethod: 'Fiado (Entrada)'
              });
            }
          }

          const totalPaid = relatedTransactions.filter(t => t.type === 'payment' && t.paymentMethod !== 'Fiado').reduce((acc, t) => acc + t.amount, 0);
          if (totalPaid > sale.total + 0.1) {
            valueMismatches.push({
              sale,
              expected: sale.total,
              found: totalPaid,
              paymentMethod: 'Fiado (Excedeu Total)'
            });
          }
        }
      }
    });

    // 3. New Insight: Gross Margin & Profit Check (Category D)
    sales.forEach(sale => {
      if (sale.status === 'Cancelada' || sale.status === 'Pré-venda') return;
      const saleCost = sale.items.filter(item => !item.isCancelled).reduce((acc, item) => {
        const product = products.find(p => p.id === item.productId);
        return acc + ((product?.costPrice || 0) * item.quantity);
      }, 0);
      const profit = sale.total - saleCost;
      const margin = sale.total > 0 ? (profit / sale.total) * 100 : 0;
      if (margin < 5) {
        suspiciousMargins.push({
          sale,
          revenue: sale.total,
          cost: saleCost,
          margin
        });
      }
    });

    // 4. New Insight: Customer Debt Ledger vs Saved Debt Divergence (Category E)
    customers.forEach(c => {
      const custSales = sales.filter(s => s.customerId === c.id && s.paymentMethod === 'Fiado' && s.status !== 'Cancelada' && s.status !== 'Pré-venda');
      const totalDebtCreated = custSales.reduce((acc, s) => acc + (s.debtAmount !== undefined ? s.debtAmount : s.total), 0);
      const totalPaymentsMade = transactions.filter(t => t.customerId === c.id && t.type === 'payment' && t.paymentMethod !== 'Fiado').reduce((acc, t) => acc + t.amount, 0);
      const expectedDebt = Math.max(0, totalDebtCreated - totalPaymentsMade);
      const savedDebt = c.totalDebt || 0;
      if (Math.abs(savedDebt - expectedDebt) > 0.5) {
        customerDebtMismatches.push({
          customer: c,
          expectedDebt,
          savedDebt,
          diff: Math.abs(savedDebt - expectedDebt)
        });
      }
    });

    // 5. New Insight: Suspicious Transactions Channels (Empty / Unknown Option) (Category F)
    transactions.forEach(t => {
      if (t.type === 'payment') {
        const hasNoMethod = !t.paymentMethod || t.paymentMethod.trim() === '';
        const isOthersWithoutNotes = t.paymentMethod === 'Outros' && (!t.notes || t.notes.trim() === '');
        if (hasNoMethod || isOthersWithoutNotes) {
          suspiciousTransactions.push({
            transaction: t,
            issue: hasNoMethod ? 'Meio de pagamento nulo' : 'Canal "Outros" sem notas descritivas'
          });
        }
      }
    });

    const totalIssues = 
      unreconciledCancellations.length + 
      valueMismatches.length + 
      missingTransactionsDays.length + 
      customerDebtMismatches.length + 
      suspiciousMargins.length + 
      suspiciousTransactions.length;

    const healthPercent = Math.max(0, Math.min(100, 100 - (totalIssues * 6)));
    const isHealthy = totalIssues === 0;

    return {
      unreconciledCancellations,
      valueMismatches,
      missingTransactionsDays,
      customerDebtMismatches,
      suspiciousMargins,
      suspiciousTransactions,
      healthPercent,
      isHealthy
    };
  }, [sales, transactions, shipments, customers, products]);

  const handleReconcileSale = (saleId: string) => {
    if (!saleId) return;
    showConfirm({
      title: "⚠️ FORÇAR RECONCILIAÇÃO DIGITAL ⚠️",
      description: `Deseja realizar a remoção imediata de todos os lançamentos financeiros de caixa e logística órfãos pertencentes à venda cancelada #${saleId.slice(-5).toUpperCase()}? Isso estornará os lançamentos do fluxo de caixa operacional para reequilibrar os relatórios com precisão de centavos!`,
      confirmText: "Sim, Reconciliar",
      cancelText: "Cancelar",
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          
          const relatedTrans = transactions.filter(t => t.saleId === saleId);
          relatedTrans.forEach(t => {
            if (t.id) batch.delete(doc(db, 'transactions', t.id));
          });

          const relatedShipments = shipments.filter(sh => sh.items?.some(it => it.saleId === saleId));
          relatedShipments.forEach(sh => {
            if (sh.id) batch.delete(doc(db, 'shipments', sh.id));
          });

          await batch.commit();
          showAlert("✅ Reconciliado!", `Os lançamentos de caixa e transporte órfãos vinculados à venda #${saleId.slice(-5).toUpperCase()} foram reconciliados e excluídos com sucesso.`, "success");
        } catch (err) {
          console.error(err);
          showAlert("Erro", "Erro ao executar a reconciliação fiscal no Firestore.", "error");
        }
      }
    });
  };

  const handleInspectTransaction = (tId: string) => {
    // 1. Switch active master tab to transactions
    setAuditTab('transactions');
    // 2. Pre-fill the search state with the precise transaction ID
    setSalesSearch(tId);
  };

  const handleDeleteTransactionInline = (tId: string, amount: number) => {
    showConfirm({
      title: "⚠️ EXCLUSÃO DEFINITIVA ⚠️",
      description: `Deseja excluir o lançamento financeiro de ${formatCurrency(amount)}? Esta ação reordenará imediatamente os relatórios, compensações, faturamentos médios e o fluxo de caixa histórico.`,
      confirmText: "Sim, Excluir",
      cancelText: "Cancelar",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'transactions', tId));
          showAlert("✅ Excluído!", "Lançamento excluído com sucesso do banco de dados!", "success");
        } catch (err) {
          console.error(err);
          showAlert("Erro", "Erro ao remover o lançamento financeiro do Firestore.", "error");
        }
      }
    });
  };

  const handleFixCustomerDebt = async (customerId: string, expectedDebt: number) => {
    try {
      await updateDoc(doc(db, 'customers', customerId), {
        totalDebt: expectedDebt,
        updatedAt: serverTimestamp()
      });
      showAlert("✅ Saldo Ajustado!", "O saldo devedor do cliente foi recalculado e perfeitamente sincronizado com o histórico de compras e amortizações.", "success");
    } catch (err) {
      console.error(err);
      showAlert("Erro", "Erro ao corrigir o saldo devedor do cliente no Firestore.", "error");
    }
  };

  const handleAdjustLedgerToCustomerDebt = async (customerId: string, customerName: string, savedDebt: number, expectedDebt: number) => {
    const discrepancy = savedDebt - expectedDebt;
    if (Math.abs(discrepancy) < 0.01) return;

    if (discrepancy > 0) {
      showConfirm({
        title: "⚙️ AJUSTAR HISTÓRICO (LEDGER) ⚙️",
        description: `Deseja criar uma venda de ajuste de Fiado no histórico (Ledger) do cliente ${customerName} no valor de R$ ${discrepancy.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}? Isto irá igualar o seu histórico físico ao saldo real de R$ ${savedDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} que o cliente te deve hoje, fazendo com que esta divergência suma do sistema!`,
        confirmText: "Sim, Lançar Ajuste",
        cancelText: "Cancelar",
        onConfirm: async () => {
          try {
            await addDoc(collection(db, 'sales'), {
              customerId,
              customerName,
              items: [{
                productId: 'sistema_ajuste_auditoria',
                variationId: 'sistema_ajuste_auditoria',
                name: 'Ajuste de Saldo Devedor Histórico (Auditoria)',
                variationName: 'Ajuste de Fluxo',
                quantity: 1,
                price: discrepancy
              }],
              subtotal: discrepancy,
              discount: 0,
              total: discrepancy,
              paymentMethod: 'Fiado',
              status: 'Concluída',
              createdAt: serverTimestamp(),
              isAdjustment: true
            });
            showAlert("✅ Ledger Ajustado!", `O histórico (Ledger) de ${customerName} foi perfeitamente corrigido com um lançamento compensatório de R$ ${discrepancy.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`, "success");
          } catch (err) {
            console.error(err);
            showAlert("Erro", "Erro ao gravar ajuste do histórico no Firestore.", "error");
          }
        }
      });
    } else {
      const paymentAdjustment = Math.abs(discrepancy);
      showConfirm({
        title: "⚙️ LANÇAR AMORTIZAÇÃO DE AJUSTE ⚙️",
        description: `O histórico calcula que o cliente ${customerName} deve mais do que o saldo atual de R$ ${savedDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Deseja registrar um lançamento de pagamento histórico compensatório de R$ ${paymentAdjustment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}? Isso reduzirá o cálculo do Ledger para coincidir perfeitamente com a realidade de R$ ${savedDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
        confirmText: "Sim, Lançar Ajuste",
        cancelText: "Cancelar",
        onConfirm: async () => {
          try {
            await addDoc(collection(db, 'transactions'), {
              customerId,
              amount: paymentAdjustment,
              type: 'payment',
              paymentMethod: 'Outros',
              notes: 'Compensação de Ajuste de Auditoria - Saldo Devedor',
              createdAt: serverTimestamp()
            });
            showAlert("✅ Pagamento Ajustado!", `Registrada a amortização de ajuste no ledger de ${customerName} no valor de R$ ${paymentAdjustment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`, "success");
          } catch (err) {
            console.error(err);
            showAlert("Erro", "Erro ao registrar transação de ajuste no Firestore.", "error");
          }
        }
      });
    }
  };

  const [isResetIconLoading, setIsResetIconLoading] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  // Expense management inputs and states
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState<'Marketing/Ads' | 'Plataforma/Sistemas' | 'Embalagens' | 'Aluguel/Estrutura' | 'Logística Extra' | 'Outros'>('Marketing/Ads');
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expDescription.trim() || !expAmount) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    const val = parseFloat(expAmount);
    if (isNaN(val) || val <= 0) {
      alert("Insira um valor numérico válido maior que zero.");
      return;
    }
    try {
      setIsSavingExpense(true);
      await addDoc(collection(db, 'expenses'), {
        description: expDescription.trim(),
        amount: val,
        category: expCategory,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setExpDescription('');
      setExpAmount('');
      setExpCategory('Marketing/Ads');
    } catch (err) {
      console.error("Erro ao salvar despesa:", err);
      alert("Não foi possível salvar a despesa no Firestore.");
    } finally {
      setIsSavingExpense(false);
    }
  };

  const handleCancelSaleItem = (sale: Sale, itemIndex: number) => {
    if (!sale.id) return;
    if (sale.status === 'Cancelada') {
      showAlert("Aviso", "Esta venda já está cancelada!", "warning");
      return;
    }

    const itemToCancel = sale.items[itemIndex];
    if (!itemToCancel) return;

    showConfirm({
      title: `⚠️ CANCELAR ITEM ⚠️`,
      description: `Tem certeza de que deseja cancelar o item "${cleanProductNameWithVariation(itemToCancel.productName || itemToCancel.name)}" (x${itemToCancel.quantity}) desta venda? Esta ação atualizará o estoque do produto e todos os fluxos financeiros da venda #${sale.id.slice(-5).toUpperCase()}.`,
      confirmText: "Sim, Cancelar Item",
      cancelText: "Voltar",
      onConfirm: async () => {
        try {
          setIsCancellingSale(sale.id!);
          const batch = writeBatch(db);

          // 1. Devolver estoque se a venda estiver concluída ou pendente (não pré-venda)
          if (sale.status !== 'Pré-venda') {
            if (!itemToCancel.isDropshipping && itemToCancel.productId && itemToCancel.variationId) {
              const prodRef = doc(db, 'products', itemToCancel.productId);
              const prodSnap = await getDoc(prodRef);
              if (prodSnap.exists()) {
                const productData = { id: prodSnap.id, ...prodSnap.data() } as Product;
                const updatedVariations = productData.variations.map(v => {
                  if (v.id === itemToCancel.variationId) {
                    return { ...v, stock: v.stock + itemToCancel.quantity };
                  }
                  return v;
                });
                const updatedTotalStock = updatedVariations.reduce((acc, v) => acc + v.stock, 0);

                batch.update(prodRef, {
                  variations: updatedVariations,
                  totalStock: updatedTotalStock,
                  updatedAt: serverTimestamp()
                });
              }
            }
          }

          // 2. Montar lista atualizada de itens com o item marcado como cancelado
          const updatedItems = sale.items.map((it, idx) => {
            if (idx === itemIndex) {
              return { ...it, isCancelled: true };
            }
            return it;
          });

          const activeItems = updatedItems.filter(it => !it.isCancelled);

          if (activeItems.length === 0) {
            // Todos os itens foram cancelados! Cancelar a venda inteira de maneira segura.
            
            // Reverter saldo devedor do cliente se for Fiado
            if (sale.customerId && sale.paymentMethod === 'Fiado' && sale.status !== 'Pré-venda') {
              const custRef = doc(db, 'customers', sale.customerId);
              const custSnap = await getDoc(custRef);
              if (custSnap.exists()) {
                const customerData = custSnap.data() as Customer;
                const rollbackDebt = sale.debtAmount || 0;
                const nextDebt = Math.max(0, (customerData.totalDebt || 0) - rollbackDebt);
                
                batch.update(custRef, {
                  totalDebt: nextDebt,
                  updatedAt: serverTimestamp()
                });
              }
            }

            // Excluir envios relacionados
            const relatedShipments = shipments.filter(ship => ship.items?.some(i => i.saleId === sale.id));
            relatedShipments.forEach(ship => {
              if (ship.id) {
                batch.delete(doc(db, 'shipments', ship.id));
              }
            });

            // Excluir transações financeiras relacionadas
            const transactionsRef = collection(db, 'transactions');
            const qTrans = query(transactionsRef, where('saleId', '==', sale.id));
            const transSnap = await getDocs(qTrans);
            transSnap.forEach(tDoc => {
              batch.delete(doc(db, 'transactions', tDoc.id));
            });

            // Atualizar o status da venda para 'Cancelada'
            const saleRef = doc(db, 'sales', sale.id!);
            batch.update(saleRef, {
              items: updatedItems,
              subtotal: 0,
              total: 0,
              debtAmount: 0,
              status: 'Cancelada',
              history: [
                ...(sale.history || []),
                {
                  status: 'Cancelada',
                  updatedAt: new Date(),
                  notes: `Último item cancelado (${cleanProductNameWithVariation(itemToCancel.productName || itemToCancel.name)}). Venda cancelada na totalidade.`
                }
              ]
            });

          } else {
            // Ainda restam itens ativos na venda
            const newSubtotal = activeItems.reduce((acc, it) => acc + (it.price * it.quantity), 0);
            const newTotal = Math.max(0, newSubtotal - (sale.discount || 0));
            const newDebtAmount = sale.paymentMethod === 'Fiado' ? Math.max(0, newTotal - (sale.downPayment || 0)) : 0;
            const finalDownPaymentValue = newTotal < (sale.downPayment || 0) ? newTotal : (sale.downPayment || 0);

            // Reverter a diferença do débito do cliente se for Fiado
            if (sale.customerId && sale.paymentMethod === 'Fiado' && sale.status !== 'Pré-venda') {
              const custRef = doc(db, 'customers', sale.customerId);
              const custSnap = await getDoc(custRef);
              if (custSnap.exists()) {
                const customerData = custSnap.data() as Customer;
                const prevDebt = sale.debtAmount !== undefined ? sale.debtAmount : sale.total;
                const debtReduction = Math.max(0, prevDebt - newDebtAmount);
                const nextDebt = Math.max(0, (customerData.totalDebt || 0) - debtReduction);

                batch.update(custRef, {
                  totalDebt: nextDebt,
                  updatedAt: serverTimestamp()
                });
              }
            }

            // Remover item cancelado de envios correspondentes
            const relatedShipments = shipments.filter(ship => ship.items?.some(i => i.saleId === sale.id && i.productId === itemToCancel.productId && i.variationId === itemToCancel.variationId));
            relatedShipments.forEach(ship => {
              if (ship.id) {
                const updatedShipmentItems = ship.items.filter(i => !(i.saleId === sale.id && i.productId === itemToCancel.productId && i.variationId === itemToCancel.variationId));
                if (updatedShipmentItems.length === 0) {
                  batch.delete(doc(db, 'shipments', ship.id));
                } else {
                  batch.update(doc(db, 'shipments', ship.id), {
                    items: updatedShipmentItems,
                    updatedAt: serverTimestamp()
                  });
                }
              }
            });

            // Ajustar valores das transações financeiras no Firestore
            const transactionsRef = collection(db, 'transactions');
            const qTrans = query(transactionsRef, where('saleId', '==', sale.id));
            const transSnap = await getDocs(qTrans);
            transSnap.forEach(tDoc => {
              const transData = tDoc.data();
              if (sale.paymentMethod === 'Fiado') {
                if (transData.type === 'debt') {
                  batch.update(doc(db, 'transactions', tDoc.id), {
                    amount: newDebtAmount,
                    updatedAt: serverTimestamp()
                  });
                } else if (transData.type === 'payment' && transData.paymentMethod !== 'Fiado') {
                  if (newTotal < (transData.amount || 0)) {
                    batch.update(doc(db, 'transactions', tDoc.id), {
                      amount: newTotal,
                      updatedAt: serverTimestamp()
                    });
                  }
                }
              } else {
                if (transData.type === 'payment') {
                  batch.update(doc(db, 'transactions', tDoc.id), {
                    amount: newTotal,
                    updatedAt: serverTimestamp()
                  });
                }
              }
            });

            // Atualizar o registro da venda no Firestore
            const saleRef = doc(db, 'sales', sale.id!);
            batch.update(saleRef, {
              items: updatedItems,
              subtotal: newSubtotal,
              total: newTotal,
              debtAmount: newDebtAmount,
              downPayment: finalDownPaymentValue,
              history: [
                ...(sale.history || []),
                {
                  status: sale.status,
                  updatedAt: new Date(),
                  notes: `Cancelado: ${cleanProductNameWithVariation(itemToCancel.productName || itemToCancel.name)} (x${itemToCancel.quantity}). Subtotal atualizado para ${formatCurrency(newSubtotal)}.`
                }
              ]
            });
          }

          await batch.commit();
          showAlert("✅ Cancelamento Concluído!", `O item "${cleanProductNameWithVariation(itemToCancel.productName || itemToCancel.name)}" foi cancelado e estornado com sucesso.`, "success");
        } catch (err) {
          console.error("Erro ao cancelar item no Firestore:", err);
          showAlert("Erro", "Não foi possível cancelar o item. Tente novamente.", "error");
        } finally {
          setIsCancellingSale(null);
        }
      }
    });
  };

  const handleCancelSale = (sale: Sale) => {
    if (!sale.id) return;
    if (sale.status === 'Cancelada') {
      showAlert("Aviso", "Esta venda já está cancelada!", "warning");
      return;
    }

    showConfirm({
      title: `⚠️ CANCELAMENTO DE VENDA #${sale.id.slice(-5).toUpperCase()} ⚠️`,
      description: `Tem certeza de que deseja realizar o cancelamento completo e estornar esta venda? Isso devolverá produtos ao estoque, estornará débitos criados de Fiado (${formatCurrency(sale.debtAmount || 0)}), deletará envios e lançamentos financeiros associados.`,
      confirmText: "Sim, Cancelar Venda",
      cancelText: "Voltar",
      onConfirm: async () => {
        try {
          setIsCancellingSale(sale.id!);
          const batch = writeBatch(db);

          // 1. Return stock of products (skip if pre-sale or if is dropshipping)
          if (sale.status !== 'Pré-venda') {
            for (const item of sale.items) {
              if (item.isDropshipping || !item.productId || !item.variationId) continue;
              
              const prodRef = doc(db, 'products', item.productId);
              const prodSnap = await getDoc(prodRef);
              if (prodSnap.exists()) {
                const productData = { id: prodSnap.id, ...prodSnap.data() } as Product;
                const updatedVariations = productData.variations.map(v => {
                  if (v.id === item.variationId) {
                    return { ...v, stock: v.stock + item.quantity };
                  }
                  return v;
                });
                const updatedTotalStock = updatedVariations.reduce((acc, v) => acc + v.stock, 0);

                batch.update(prodRef, {
                  variations: updatedVariations,
                  totalStock: updatedTotalStock,
                  updatedAt: serverTimestamp()
                });
              }
            }
          }

          // 2. Revert customer debt in Firestore if Fiado
          if (sale.customerId && sale.paymentMethod === 'Fiado' && sale.status !== 'Pré-venda') {
            const custRef = doc(db, 'customers', sale.customerId);
            const custSnap = await getDoc(custRef);
            if (custSnap.exists()) {
              const customerData = custSnap.data() as Customer;
              const rollbackDebt = sale.debtAmount || 0;
              const nextDebt = Math.max(0, (customerData.totalDebt || 0) - rollbackDebt);
              
              batch.update(custRef, {
                totalDebt: nextDebt,
                updatedAt: serverTimestamp()
              });
            }
          }

          // 3. Delete related shipments in Firestore
          const relatedShipments = shipments.filter(ship => ship.items?.some(i => i.saleId === sale.id));
          relatedShipments.forEach(ship => {
            if (ship.id) {
              batch.delete(doc(db, 'shipments', ship.id));
            }
          });

          // 4. Delete related transactions in Firestore
          const transactionsRef = collection(db, 'transactions');
          const qTrans = query(transactionsRef, where('saleId', '==', sale.id));
          const transSnap = await getDocs(qTrans);
          transSnap.forEach(tDoc => {
            batch.delete(doc(db, 'transactions', tDoc.id));
          });

          // 5. Update sale status to 'Cancelada'
          const saleRef = doc(db, 'sales', sale.id!);
          batch.update(saleRef, {
            status: 'Cancelada',
            history: [
              ...(sale.history || []),
              {
                status: 'Cancelada',
                updatedAt: new Date(),
                notes: 'Venda cancelada com estorno de estoque e devolução de valores'
              }
            ]
          });

          await batch.commit();
          showAlert("✅ Cancelamento Concluído!", `A venda #${sale.id!.slice(-5).toUpperCase()} foi cancelada com sucesso. O estoque e o balanço financeiro foram atualizados.`, "success");
        } catch (err) {
          console.error("Erro ao cancelar venda no Firestore:", err);
          showAlert("Erro", "Não foi possível prosseguir com o cancelamento da venda. Tente novamente.", "error");
        } finally {
          setIsCancellingSale(null);
        }
      }
    });
  };

  const handleDeleteExpense = (id?: string) => {
    if (!id) return;
    showConfirm({
      title: "Confirmar Exclusão",
      description: "Deseja realmente excluir permanentemente esta despesa operacional?",
      confirmText: "Sim, Excluir",
      cancelText: "Voltar",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'expenses', id));
          showAlert("✅ Sucesso!", "A despesa operacional selecionada foi removida do banco.", "success");
        } catch (err) {
          console.error("Erro ao deletar despesa:", err);
          showAlert("Erro", "Não foi possível excluir a despesa.", "error");
        }
      }
    });
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const now = new Date();

    // 1. PDF Header (Slate Executive Theme)
    doc.setFillColor(15, 23, 42); // slate-900 (Dark Slate Background for Header)
    doc.rect(0, 0, 210, 42, 'F');

    // Header Title
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text('CLUB DA BOLA', 14, 18);

    doc.setFontSize(9);
    doc.setTextColor(239, 68, 68); // Soft Red text
    doc.text('ERP SYSTEM • RELATÓRIO FINANCEIRO GERAL', 14, 25);

    const customLogoUrl = localStorage.getItem('erp-custom-logo');
    let hasLogo = false;

    if (customLogoUrl) {
      try {
        let format = 'PNG';
        if (customLogoUrl.includes('image/jpeg') || customLogoUrl.includes('image/jpg')) {
          format = 'JPEG';
        } else if (customLogoUrl.includes('image/webp')) {
          format = 'WEBP';
        }
        // Place the logo on the right side of the header
        doc.addImage(customLogoUrl, format, 168, 4, 34, 34, undefined, 'FAST');
        hasLogo = true;
      } catch (imgError) {
        console.error("Error drawing custom logo in PDF:", imgError);
      }
    }

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text(`EXTRATO COMPLETO DE TRANSAÇÕES`, 14, 32);
    doc.text(`Gerado em: ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')} | Produzido por: Brener Gomes`, hasLogo ? 65 : 100, 32);

    // Summary block (Slate style)
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(248, 250, 252); // slate-50
    doc.roundedRect(14, 50, 182, 38, 4, 4, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('RESUMO DO BALANÇO FINANCEIRO', 20, 58);

    doc.setDrawColor(226, 232, 240);
    doc.line(20, 62, 190, 62);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);

    doc.text(`Faturamento Total:`, 20, 68);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(totalInvoiced), 65, 68);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Fluxo de Caixa Líquido:`, 20, 74);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(cashFlow), 65, 74);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Total Contas a Receber:`, 20, 80);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(accountsReceivable), 65, 80);

    const tableData = transactions.filter(t => filter === 'all' || t.type === filter).map(t => {
      const parsedDate = getParsedDate(t);
      const dateStr = parsedDate ? parsedDate.toLocaleDateString('pt-BR') : 'Sem data';
      const cust = customers.find(c => c.id === t.customerId);
      const clientName = cust ? `${cust.name}${cust.contact ? ` (${cust.contact})` : ''}` : 'Consumidor Final';
      return [
        t.type === 'payment' ? 'Amortização' : 'Venda a Prazo',
        clientName,
        dateStr,
        formatCurrency(t.amount)
      ];
    });

    autoTable(doc, {
      startY: 94,
      head: [['Natureza', 'Cliente', 'Data', 'Montante']],
      body: tableData,
    });

    doc.save('financeiro-erp-club-da-bola.pdf');
  };
  
  const resetFinancialData = async () => {
    try {
      setIsResetIconLoading(true);
      setShowConfirmReset(false); // Hide confirmation UI immediately
      console.log("Iniciando limpeza profunda de dados financeiros...");
      
      const collectionsToClear = ['sales', 'transactions', 'shipments', 'compensations', 'expenses'];
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
    const data = transactions.filter(t => filter === 'all' || t.type === filter).map(t => {
      const parsedDate = getParsedDate(t);
      const dateStr = parsedDate ? parsedDate.toLocaleDateString('pt-BR') : 'Sem data';
      const cust = customers.find(c => c.id === t.customerId);
      return {
        Natureza: t.type === 'payment' ? 'Amortização' : 'Venda a Prazo',
        Cliente: cust?.name || 'Consumidor Final',
        Contato: cust?.contact || 'Sem Contato',
        Data: dateStr,
        Valor: t.amount,
        Método: t.paymentMethod || 'N/A'
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Financeiro");
    XLSX.writeFile(wb, "financeiro-erp-club-da-bola.xlsx");
  };

  const exportMonthlyReportPDF = () => {
    const doc = new jsPDF();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const getElementDate = (el: any) => {
      if (!el?.createdAt) return null;
      if (typeof el.createdAt.seconds === 'number') return new Date(el.createdAt.seconds * 1000);
      if (el.createdAt instanceof Date) return el.createdAt;
      if (typeof el.createdAt.toDate === 'function') return el.createdAt.toDate();
      return null;
    };

    // Filter transactions of the current month
    const monthlyTransactions = transactions.filter(t => {
      const d = getElementDate(t);
      return d && d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });

    // Filter sales of the current month
    const monthlySales = sales.filter(s => {
      const d = getElementDate(s);
      const isAdjustment = s.isAdjustment || (s.items || []).some(item => item && item.productId === 'sistema_ajuste_auditoria');
      return s.status !== 'Pré-venda' && s.status !== 'Cancelada' && !isAdjustment && d && d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });

    // Filter shipments of the current month
    const monthlyShipments = shipments.filter(s => {
      const d = getElementDate(s);
      return d && d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });

    // Filter expenses of the current month
    const monthlyExpensesDetailed = expenses.filter(e => {
      const d = getElementDate(e);
      return d && d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });
    const monthlyExpenses = monthlyExpensesDetailed.reduce((acc, e) => acc + e.amount, 0);

    // Calculations for the current month
    const monthlyInvoiced = monthlySales.reduce((acc, s) => acc + s.total, 0);
    const monthlyReceived = monthlyTransactions.filter(t => t.type === 'payment').reduce((acc, t) => acc + t.amount, 0);
    const monthlyTaxes = monthlyShipments.filter(s => s.taxPaid).reduce((acc, s) => acc + (s.taxAmount || 0), 0);
    
    // Cost of goods for monthly sales
    const monthlyCostOfGoods = monthlySales.reduce((acc, s) => {
      return acc + s.items.filter(item => !item.isCancelled).reduce((itemAcc, item) => {
        const product = products.find(p => p.id === item.productId);
        return itemAcc + ((product?.costPrice || 0) * item.quantity);
      }, 0);
    }, 0);

    const monthlyRealProfit = monthlyInvoiced - (monthlyCostOfGoods + monthlyTaxes + monthlyExpenses);
    const monthlyProfitMargin = monthlyInvoiced > 0 ? (monthlyRealProfit / monthlyInvoiced) * 100 : 0;

    const monthName = now.toLocaleString('pt-BR', { month: 'long' });
    const formattedPeriod = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${currentYear}`;

    // PDF Page Design & Header
    doc.setFillColor(15, 23, 42); // Dark slate background header
    doc.rect(0, 0, 210, 42, 'F');

    // Header Title
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text('CLUB DA BOLA', 14, 18);

    doc.setFontSize(9);
    doc.setTextColor(239, 68, 68); // Soft Red text
    doc.text('ERP SYSTEM • AUDITORIA FINANCEIRA INTEGRADA', 14, 25);

    const customLogoUrl = localStorage.getItem('erp-custom-logo');
    let hasLogo = false;

    if (customLogoUrl) {
      try {
        let format = 'PNG';
        if (customLogoUrl.includes('image/jpeg') || customLogoUrl.includes('image/jpg')) {
          format = 'JPEG';
        } else if (customLogoUrl.includes('image/webp')) {
          format = 'WEBP';
        }
        // Place the logo on the right side of the header
        doc.addImage(customLogoUrl, format, 168, 4, 34, 34, undefined, 'FAST');
        hasLogo = true;
      } catch (imgError) {
        console.error("Error drawing custom logo in PDF:", imgError);
      }
    }

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text(`RELATÓRIO DE FECHAMENTO MENSAL - ${formattedPeriod.toUpperCase()}`, 14, 32);
    doc.text(`Gerado em: ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')} | Produzido por: Brener Gomes`, hasLogo ? 65 : 100, 32);

    // Summary Box
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(248, 250, 252); // slate-50
    doc.roundedRect(14, 50, 182, 58, 4, 4, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('RESULTADO OPERACIONAL DO MÊS', 20, 58);

    doc.setDrawColor(226, 232, 240);
    doc.line(20, 62, 190, 62);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);

    doc.text(`Faturamento de Vendas (Mês):`, 20, 69);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(monthlyInvoiced), 85, 69);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Custo das Mercadorias Vendidas (CMV):`, 20, 75);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(monthlyCostOfGoods), 85, 75);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Tributação Corrente (Pagos):`, 20, 81);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(monthlyTaxes), 85, 81);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Despesas Operacionais (Mês):`, 20, 87);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(220, 38, 38); // red-600 despesas
    doc.text(formatCurrency(monthlyExpenses), 85, 87);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Amortizações/Caixa Coletado:`, 20, 93);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(5, 150, 105); // emerald-600
    doc.text(formatCurrency(monthlyReceived), 85, 93);

    // Profit nested card on the right-hand side
    doc.setFillColor(254, 242, 242); // red-50
    doc.setDrawColor(248, 113, 113); // red-400
    doc.roundedRect(118, 65, 72, 32, 3, 3, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(153, 27, 27); // red-800
    doc.text('LUCRO LÍQUIDO OPERACIONAL', 123, 71);

    doc.setFontSize(13);
    doc.setTextColor(153, 27, 27);
    doc.text(formatCurrency(monthlyRealProfit), 123, 79);

    doc.setFontSize(8);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(185, 28, 28);
    doc.text(`Margem Percentual: ${monthlyProfitMargin.toFixed(1)}%`, 123, 85);

    // Section 2: Detailed transactions list
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`CONSOLIDADO HISTÓRICO - LANÇAMENTOS DO MÊS`, 14, 120);

    const tblData = monthlyTransactions.map(t => {
      const dateObj = getElementDate(t);
      const dateStr = dateObj 
        ? `${dateObj.toLocaleDateString('pt-BR')} ${dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        : 'S/D';
      
      const natureStr = t.type === 'payment' ? 'Amortização de Fiado' : 'Venda a Prazo';
      const cust = customers.find(c => c.id === t.customerId);
      const involved = cust ? `${cust.name}${cust.contact ? ` (${cust.contact})` : ''}` : 'Consumidor Final';
      const methodStr = t.paymentMethod || 'Aberto';
      const amountStr = t.type === 'payment' ? `+ ${formatCurrency(t.amount)}` : `- ${formatCurrency(t.amount)}`;

      return [natureStr, involved, dateStr, methodStr, amountStr];
    });

    autoTable(doc, {
      startY: 125,
      head: [['Natureza', 'Parceiro / Cliente', 'Data e Horário', 'Método', 'Montante']],
      body: tblData.length > 0 ? tblData : [['Nenhuma movimentação registrada neste período mensal.', '', '', '', '']],
      theme: 'grid',
      headStyles: {
        fillColor: [153, 27, 27], // brand red-800
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 8,
        font: 'Helvetica'
      },
      columnStyles: {
        4: { halign: 'right', fontStyle: 'bold' }
      }
    });

    // Section 3: Clientes Devedores / Contas a Receber (Fiado Ativo)
    const finalY = (doc as any).lastAutoTable.finalY + 12;
    let startYDebtors = finalY;
    if (startYDebtors > 230) {
      doc.addPage();
      startYDebtors = 20;
    }

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`SITUAÇÃO DE CONTAS A RECEBER (FIADO ATIVO POR CLIENTE)`, 14, startYDebtors);

    const debtorsData = customers
      .filter(c => c.totalDebt > 0)
      .map(c => [
        c.name,
        c.contact || 'Sem Contato',
        formatCurrency(c.totalDebt)
      ]);

    autoTable(doc, {
      startY: startYDebtors + 5,
      head: [['Nome do Cliente', 'Contato / Telefone', 'Total Fiado Pendente (Dívida)']],
      body: debtorsData.length > 0 ? debtorsData : [['Nenhum cliente possui saldo devedor ativo atualmente.', '', '']],
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59], // Slate 800
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 8,
        font: 'Helvetica'
      },
      columnStyles: {
        2: { halign: 'right', fontStyle: 'bold' }
      }
    });

    const filePeriodSlug = formattedPeriod.toLowerCase().replace(/ /g, '-');
    doc.save(`fechamento-mensal-${filePeriodSlug}.pdf`);
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
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={exportMonthlyReportPDF}
            className="flex items-center gap-2 px-6 py-3 bg-red-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all border border-red-900 shadow-lg shadow-red-900/10"
          >
            <FileText size={16} /> Fechamento do Mês
          </button>
          <button 
            onClick={exportToPDF}
            className="flex items-center gap-2 px-6 py-3 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all border border-rose-100 shadow-sm"
          >
            <FileText size={16} /> Geral PDF
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
      <FinanceCard title="Lucro Real (Líquido)" value={formatCurrency(realProfit)} icon={ArrowDownCircle} color="emerald" subtitle={`Margem Líquida: ${profitMargin.toFixed(1)}%`} />
      <FinanceCard title="Contas a Receber" value={formatCurrency(accountsReceivable)} icon={Wallet} color="black" />
      <FinanceCard title="Custos e Despesas" value={formatCurrency(totalCostOfGoods + totalPaidTaxes + totalExpenses)} icon={Receipt} color="amber" subtitle={`CMV: ${formatCurrency(totalCostOfGoods)} • Despesas: ${formatCurrency(totalExpenses)}`} />
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
                <span className="text-lg font-black text-slate-950 font-display tabular-nums tracking-tighter italic">
                  <RollingCounter value={formatCurrency(m.value)} />
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Transactions & Sales List */}
        <div className="xl:col-span-2 bg-white rounded-[24px] md:rounded-[32px] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[750px]">
          <div className="p-4 md:p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30 pb-4">
             {/* Master Tab switcher */}
            <div className="flex bg-slate-100/80 p-1 rounded-full border border-slate-200/50 shadow-inner flex-wrap gap-1 flex-1 md:flex-initial relative">
              {[
                { key: 'sales', label: 'Vendas', icon: <TableIcon size={11} /> },
                { key: 'transactions', label: 'Lançamentos', icon: <Receipt size={11} /> },
                { key: 'auditor', label: 'Conferência', icon: <AlertCircle size={11} />, badge: !auditResults.isHealthy }
              ].map(tab => {
                const isActive = auditTab === tab.key;
                let activeBgColor = "bg-slate-900 shadow-md shadow-slate-900/10";
                let activeTextColor = "text-white";
                let inactiveTextColor = "text-slate-500 hover:text-slate-800";
                
                if (tab.key === 'auditor') {
                  activeBgColor = "bg-red-800 shadow-md shadow-red-900/10";
                  if (!isActive) {
                    inactiveTextColor = "text-red-800 hover:text-red-950 bg-red-50 hover:bg-red-100/60";
                  }
                }

                return (
                  <button
                    key={tab.key}
                    onClick={() => setAuditTab(tab.key as any)}
                    className={cn(
                      "relative px-3.5 py-1.5 md:px-5 md:py-2 text-[10px] font-black rounded-full uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 flex-1 md:flex-initial z-10 select-none",
                      isActive ? activeTextColor : inactiveTextColor
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="activeFinanceTabBackground"
                        className={cn("absolute inset-[1px] rounded-full", activeBgColor)}
                        style={{ zIndex: -1 }}
                        transition={{ type: 'spring', stiffness: 480, damping: 35, mass: 1 }}
                      />
                    )}
                    {tab.icon}
                    <span>{tab.label}</span>
                    {tab.key === 'auditor' && tab.badge && (
                      <span className={cn(
                        "size-2 rounded-full", 
                        isActive ? "bg-white" : "bg-amber-500 animate-pulse"
                      )} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* General client & ticket search filter */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative w-full md:w-auto">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar ID, cliente..."
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-white border border-slate-250 rounded-xl text-[10px] font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-805 shadow-sm w-full md:w-44"
                />
                {salesSearch && (
                  <button onClick={() => setSalesSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Advanced Dynamic Filters Section */}
          <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50/20 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Period filter selection */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-sans">Período</span>
              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-white border border-slate-205 rounded-xl text-[10px] font-extrabold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-800 shadow-sm transition-all"
              >
                <option value="all">Todo Histórico</option>
                <option value="today">Hoje</option>
                <option value="7days">Últimos 7 dias</option>
                <option value="month">Este Mês</option>
                <option value="custom">Personalizado (De / Até)</option>
              </select>
              {periodFilter === 'custom' && (
                <div className="grid grid-cols-2 gap-2 mt-2 animate-fadeIn animate-duration-300">
                  <div>
                    <span className="text-[8px] font-black text-slate-400 uppercase block mb-1">De</span>
                    <input
                      type="date"
                      value={startDateFilter}
                      onChange={(e) => setStartDateFilter(e.target.value)}
                      className="w-full px-2 py-1 border border-slate-200 rounded-lg text-[9px] text-slate-700 font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[8px] font-black text-slate-400 uppercase block mb-1">Até</span>
                    <input
                      type="date"
                      value={endDateFilter}
                      onChange={(e) => setEndDateFilter(e.target.value)}
                      className="w-full px-2 py-1 border border-slate-200 rounded-lg text-[9px] text-slate-700 font-bold focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Type/Method filter selection */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-sans">Tipo / Mét. Pagamento</span>
              <select
                value={paymentTypeFilter}
                onChange={(e) => setPaymentTypeFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-white border border-slate-205 rounded-xl text-[10px] font-extrabold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-800 shadow-sm transition-all"
              >
                <option value="all">Todos Métodos</option>
                <option value="Dinheiro">Dinheiro</option>
                <option value="Pix">Pix</option>
                <option value="Cartão">Cartão</option>
                <option value="Fiado">Fiado</option>
              </select>
            </div>

            {/* Status filter selection */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-sans">Status da Operação</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-white border border-slate-205 rounded-xl text-[10px] font-extrabold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-800 shadow-sm transition-all"
              >
                <option value="all">Todos os Status</option>
                <option value="Concluída">Paga / Concluída</option>
                <option value="Pendente">Fiado (Em aberto)</option>
                <option value="Cancelada">Cancelada / Estornada</option>
                <option value="Pré-venda">Pré-Venda</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {auditTab === 'sales' ? (
              <div className="p-6 space-y-4">
                {(() => {
                  const filteredSales = sales.filter(s => {
                    const isAdjustment = s.isAdjustment || (s.items || []).some(item => item && item.productId === 'sistema_ajuste_auditoria');
                    if (isAdjustment) return false;

                    // 1. Search filter
                    const matchesSearch = smartSearchMatch([s.customerName || 'Consumidor Final', s.id], salesSearch);

                    if (!matchesSearch) return false;

                    // 2. Status Filter
                    if (statusFilter !== 'all') {
                      if (statusFilter === 'Pendente') {
                        const isPendingFiado = (s.paymentMethod === 'Fiado' && getSaleBalance(s) > 0) || s.status === 'Pendente';
                        if (!isPendingFiado) return false;
                      } else if (statusFilter === 'Concluída') {
                        const isCompleted = s.status === 'Concluída' && (s.paymentMethod !== 'Fiado' || getSaleBalance(s) === 0);
                        if (!isCompleted) return false;
                      } else {
                        if (s.status !== statusFilter) return false;
                      }
                    }

                    // 3. Payment Method (Type) Filter
                    if (paymentTypeFilter !== 'all' && s.paymentMethod !== paymentTypeFilter) return false;

                    // 4. Period Filter
                    const sDate = getParsedDate(s);
                    if (periodFilter !== 'all') {
                      if (!sDate) return false;
                      const nowObj = new Date();
                      
                      if (periodFilter === 'today') {
                        const todayStart = new Date(nowObj.getFullYear(), nowObj.getMonth(), nowObj.getDate());
                        if (sDate < todayStart) return false;
                      } else if (periodFilter === '7days') {
                        const sevenDaysAgo = new Date(nowObj.getTime() - 7 * 24 * 60 * 60 * 1000);
                        if (sDate < sevenDaysAgo) return false;
                      } else if (periodFilter === 'month') {
                        const monthStart = new Date(nowObj.getFullYear(), nowObj.getMonth(), 1);
                        if (sDate < monthStart) return false;
                      } else if (periodFilter === 'custom') {
                        if (startDateFilter) {
                          const startLimit = new Date(startDateFilter + 'T00:00:00');
                          if (sDate < startLimit) return false;
                        }
                        if (endDateFilter) {
                          const endLimit = new Date(endDateFilter + 'T23:59:59');
                          if (sDate > endLimit) return false;
                        }
                      }
                    }

                    return true;
                  });

                  if (filteredSales.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 space-y-2">
                        <XCircle size={28} className="text-slate-300 animate-pulse" />
                        <p className="text-[10px] font-black uppercase tracking-widest mt-2">Nenhuma venda encontrada</p>
                        <p className="text-[9px] uppercase tracking-widest text-slate-300 font-bold font-sans">Experimente usar termos mais genéricos nos filtros</p>
                      </div>
                    );
                  }

                  return filteredSales.map(sale => {
                    const isExpanded = expandedSaleId === sale.id;
                    const balance = getSaleBalance(sale);
                    const isCancelled = sale.status === 'Cancelada';
                    
                    return (
                      <div 
                        key={sale.id} 
                        className={cn(
                          "border rounded-2xl transition-all overflow-hidden bg-white hover:border-slate-300",
                          isCancelled ? "border-slate-150 opacity-65 bg-slate-50/50" : "border-slate-150 shadow-sm"
                        )}
                      >
                        {/* Accordion Row */}
                        <div 
                          onClick={() => setExpandedSaleId(isExpanded ? null : sale.id!)}
                          className="p-5 flex flex-wrap items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors select-none"
                        >
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "size-9 rounded-xl flex items-center justify-center font-mono text-[10px] font-black",
                              isCancelled 
                                ? "bg-slate-100 text-slate-400 line-through" 
                                : (sale.paymentMethod === 'Fiado' ? "bg-amber-50 text-amber-600 border border-amber-100" : "bg-red-50 text-red-800 border border-red-100")
                            )}>
                              #{sale.id?.slice(-5).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h5 className={cn("text-[11px] font-black uppercase tracking-tight text-slate-900", isCancelled && "line-through text-slate-400")}>
                                  {sale.customerName || 'Consumidor Final'}
                                </h5>
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider",
                                  isCancelled 
                                    ? "bg-slate-200 text-slate-500" 
                                    : (sale.paymentMethod === 'Fiado' 
                                        ? (balance === 0 ? "bg-emerald-50 text-emerald-600 border border-emerald-100/50" : "bg-amber-50 text-amber-600 border border-amber-100/50 animate-pulse") 
                                        : "bg-slate-905 bg-slate-900 text-white")
                                )}>
                                  {isCancelled ? 'CANCELADA' : (sale.paymentMethod === 'Fiado' ? (balance === 0 ? 'Fiado Pago' : 'Fiado') : sale.paymentMethod)}
                                </span>
                              </div>
                              <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">
                                {sale.createdAt?.seconds 
                                  ? new Date(sale.createdAt.seconds * 1000).toLocaleString('pt-BR') 
                                  : sale.createdAt ? new Date(sale.createdAt).toLocaleString('pt-BR') : 'Sem data'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-6 ml-auto">
                            <div className="text-right">
                              <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Valor total</p>
                              <p className={cn(
                                "text-xs font-black text-slate-950 font-display tabular-nums tracking-tight",
                                isCancelled && "line-through text-slate-400 italic"
                              )}>
                                {formatCurrency(sale.total)}
                              </p>
                            </div>
                            
                            {sale.paymentMethod === 'Fiado' && !isCancelled && (
                              <div className="text-right">
                                <p className="text-[8px] font-black uppercase text-amber-600 tracking-wider">Pendente</p>
                                <p className={cn(
                                  "text-xs font-black font-display tabular-nums tracking-tight",
                                  balance > 0 ? "text-amber-600" : "text-emerald-700"
                                )}>
                                  {formatCurrency(balance)}
                                </p>
                              </div>
                            )}

                            {/* Accordion Row Action Button - Quick Action Cancel Sale */}
                            <div className="flex items-center gap-3">
                              {!isCancelled && sale.status !== 'Pré-venda' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCancelSale(sale);
                                  }}
                                  disabled={isCancellingSale === sale.id}
                                  title="Estorno e cancelamento rápido"
                                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-600 hover:text-white border border-rose-150 transition-all rounded-xl select-none active:scale-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer text-rose-700 font-black uppercase text-[8px]"
                                >
                                  {isCancellingSale === sale.id ? (
                                    <RotateCcw className="animate-spin" size={10} />
                                  ) : (
                                    <XCircle size={10} />
                                  )}
                                  Cancelar
                                </button>
                              )}

                              <div className="text-slate-400 transition-colors">
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Collapsible content */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/20 p-5 space-y-4">
                            <div className="space-y-2">
                              <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Itens da Compra</p>
                              <div className="divide-y divide-slate-100 border border-slate-150 rounded-xl bg-white overflow-hidden shadow-inner">
                                {sale.items.map((item, idx) => {
                                  const itemGender = item.gender || products.find(p => p.id === item.productId || p.name === item.name)?.gender || 'Ambos';
                                  const formattedVar = formatVariationWithGender(item.variationName, itemGender) || 'Única';
                                  return (
                                    <div key={idx} className={cn("p-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 text-xs hover:bg-slate-50/40 transition-colors", item.isCancelled && "bg-rose-50/20 opacity-60")}>
                                      <div>
                                        <p className={cn("font-bold text-slate-800 uppercase tracking-tight", item.isCancelled && "line-through text-slate-400 decoration-rose-500")}>{cleanProductNameWithVariation(item.productName || item.name)}</p>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Grade: <span className="text-slate-700 font-sans">{formattedVar}</span> {item.isDropshipping && '• Dropshipping'}</p>
                                        {item.isCustomized && item.customName && (
                                          <div className="mt-1 flex items-center gap-1.5 bg-amber-50 border border-amber-200/50 rounded-lg px-2 py-0.5 text-[9px] font-black uppercase text-amber-800 tracking-wider w-fit">
                                            <Sparkles size={10} className="text-amber-500 animate-pulse" />
                                            <span>Personalizado: {item.customName} • Nº: {item.customNumber || 'S/N'}</span>
                                          </div>
                                        )}
                                      </div>
                                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 sm:gap-6 font-semibold">
                                      <div className="text-right">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Qtd</p>
                                        <p className={cn("text-[11px] text-slate-850 font-bold tabular-nums", item.isCancelled && "line-through text-slate-400")}>x{item.quantity}</p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Unidade</p>
                                        <p className={cn("text-[11px] text-slate-850 font-bold tabular-nums", item.isCancelled && "line-through text-slate-400")}>{formatCurrency(item.price)}</p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Subtotal</p>
                                        <p className={cn("text-[11px] text-slate-950 font-black tabular-nums", item.isCancelled && "line-through text-slate-350")}>{formatCurrency(item.price * item.quantity)}</p>
                                      </div>

                                      {/* Botão de Cancelar Item Isolado */}
                                      {!isCancelled && (
                                        <div className="pl-1 sm:pl-3">
                                          {item.isCancelled ? (
                                            <span className="px-2 py-0.5 bg-rose-50 text-rose-700 text-[8px] font-extrabold uppercase rounded tracking-wider border border-rose-100 select-none shrink-0">
                                              Cancelado
                                            </span>
                                          ) : (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleCancelSaleItem(sale, idx);
                                              }}
                                              disabled={isCancellingSale === sale.id}
                                              title="Cancelar apenas este item"
                                              className="px-2 py-1 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-150 rounded text-[8px] font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all select-none disabled:opacity-50 flex items-center gap-1 shrink-0"
                                            >
                                              <Trash2 size={10} />
                                              <span>Cancelar</span>
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Logistics details if available */}
                            {getShipmentForSale(sale.id) && (() => {
                              const shipment = getShipmentForSale(sale.id);
                              const trackingCode = shipment?.trackingCode || '';
                              return (
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleShipmentClick(trackingCode);
                                  }}
                                  title="Clique para ver os detalhes da encomenda!"
                                  className="p-3.5 bg-indigo-50/45 hover:bg-indigo-100/40 cursor-pointer active:scale-[0.99] border border-indigo-150 rounded-2xl flex items-center justify-between font-sans shadow-sm transition-all duration-200 group/logistic select-none"
                                >
                                  <div>
                                    <span className="text-[8px] font-black bg-indigo-600 text-white uppercase px-1.5 py-0.5 rounded tracking-wide mr-2">Encomenda vinculada</span>
                                    <span className="text-[10px] font-mono font-bold text-indigo-700 group-hover/logistic:underline">{trackingCode}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-[8px] font-black uppercase text-indigo-500 group-hover/logistic:text-indigo-700 transition-colors">Ver Encomenda →</span>
                                    <span className="text-[9px] font-black bg-white text-indigo-700 border border-indigo-100 px-2.5 py-0.5 rounded-lg uppercase tracking-wider shadow-sm">{shipment?.status}</span>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Audit details block */}
                            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                                {sale.discount > 0 && <span>Desconto: -{formatCurrency(sale.discount)} • </span>}
                                {sale.downPayment > 0 && <span>Entrada: {formatCurrency(sale.downPayment)} • </span>}
                                <span>Subtotal: {formatCurrency(sale.subtotal)}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            ) : auditTab === 'transactions' ? (
              /* Transaction/Lançamentos log list */
              <div className="overflow-x-auto">
                {(() => {
                  const filteredTransactions = transactions.filter(t => {
                    // 1. Natureza filter
                    if (filter !== 'all' && t.type !== filter) return false;
 
                    // 2. Search match (customer or transaction id)
                    const customerNameVal = getCustomerName(t.customerId);
                    const matchesSearch = smartSearchMatch([customerNameVal, t.id], salesSearch);
                    if (!matchesSearch) return false;
 
                    // 3. Payment Method (Type) Filter
                    if (paymentTypeFilter !== 'all' && t.paymentMethod !== paymentTypeFilter) return false;
 
                    // 4. Period Filter
                    const transDate = getParsedDate(t);
                    if (periodFilter !== 'all') {
                      if (!transDate) return false;
                      const nowObj = new Date();
                      
                      if (periodFilter === 'today') {
                        const todayStart = new Date(nowObj.getFullYear(), nowObj.getMonth(), nowObj.getDate());
                        if (transDate < todayStart) return false;
                      } else if (periodFilter === '7days') {
                        const sevenDaysAgo = new Date(nowObj.getTime() - 7 * 24 * 60 * 60 * 1000);
                        if (transDate < sevenDaysAgo) return false;
                      } else if (periodFilter === 'month') {
                        const monthStart = new Date(nowObj.getFullYear(), nowObj.getMonth(), 1);
                        if (transDate < monthStart) return false;
                      } else if (periodFilter === 'custom') {
                        if (startDateFilter) {
                          const startLimit = new Date(startDateFilter + 'T00:00:00');
                          if (transDate < startLimit) return false;
                        }
                        if (endDateFilter) {
                          const endLimit = new Date(endDateFilter + 'T23:59:59');
                          if (transDate > endLimit) return false;
                        }
                      }
                    }
 
                    return true;
                  });
 
                  if (filteredTransactions.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 space-y-2">
                        <XCircle size={28} className="text-slate-300 animate-pulse" />
                        <p className="text-[10px] font-black uppercase tracking-widest mt-2">Nenhum lançamento encontrado</p>
                        <p className="text-[9px] uppercase tracking-widest text-slate-300 font-bold font-sans">Ajuste os filtros ou selecione outra aba</p>
                      </div>
                    );
                  }
 
                  return (
                    <table className="w-full text-left min-w-[800px]">
                      <thead className="sticky top-0 bg-slate-50/80 backdrop-blur-md border-b border-slate-100 z-10 animate-fadeIn">
                        <tr>
                          <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Natureza</th>
                          <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Envolvido</th>
                          <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Canal Pagamento</th>
                          <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest text-center">Temporalidade</th>
                          <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest text-right">Montante</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredTransactions.map(t => (
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
                              <div className="flex items-center gap-1.5">
                                <span className="px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[9px] font-black uppercase tracking-wider block w-fit">
                                  {t.paymentMethod || 'Não especif.'}
                                </span>
                              </div>
                            </td>
                            <td className="px-8 py-5 text-center">
                              <div className="text-[11px] font-black text-slate-600 italic font-sans uppercase">
                                {t.createdAt?.seconds 
                                  ? new Date(t.createdAt.seconds * 1000).toLocaleDateString('pt-BR') 
                                  : t.createdAt ? new Date(t.createdAt).toLocaleDateString('pt-BR') : 'Sem data'} 
                                <span className="text-[9px] text-slate-400 ml-2 font-black uppercase block tracking-widest not-italic">
                                  {t.createdAt?.seconds 
                                    ? new Date(t.createdAt.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) 
                                    : t.createdAt ? new Date(t.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              </div>
                            </td>
                            <td className="px-8 py-5 text-right">
                              <span className={cn(
                                "text-xs font-bold tracking-tight font-display tabular-nums",
                                t.type === 'payment' ? "text-emerald-600" : "text-rose-500"
                              )}>
                                {t.type === 'payment' ? '+' : '-'}{formatCurrency(t.amount)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            ) : (
              /* New Auditor Tab Panel */
              <div className="p-8 space-y-8">
                {/* 1. Auditing Health Index & Explanatory Banner */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 p-6 bg-slate-50 border border-slate-200 rounded-[24px] space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="size-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-bold font-sans shrink-0">
                        %
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">Como funciona o Auditor de Lançamentos de Caixa?</h4>
                        <p className="text-[10px] text-slate-500 mt-1 leading-relaxed max-w-3xl">
                          Nossa inteligência examina a integridade referencial cruzada entre vendas operacionais no PDV, logs físicos de fluxo de caixa, parcelamentos e tracking logístico. Ele sinaliza erros de digitação, valores órfãos gerados por estornos e divergências históricas entre o saldo devedor do cliente e seu histórico de compras.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200/60 text-[10px] text-slate-600 leading-relaxed font-sans">
                      <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-sm">
                        <strong className="text-red-800 uppercase block mb-1">1. Faturamento Bruto de Vendas (ERP Operational)</strong>
                        Calcula as <strong>operações de vendas finalizadas líquidas</strong> de cancelamentos (exclui pré-vendas/orçamentos e vendas "Canceladas"). Representa a receita faturada exata do PDV.
                      </div>
                      <div className="bg-white p-4.5 rounded-2xl border border-slate-150 shadow-sm">
                        <strong className="text-slate-800 uppercase block mb-1">2. Volume Rastreado de Registros (Histórico)</strong>
                        Atua como um <strong>ledger unificado</strong> que lista faturas e amortizações de fiados de forma cumulativa. Isso pode duplicar contagens se houver furos em lançamentos manuais pós-fechamento.
                      </div>
                    </div>
                  </div>

                  {/* Visual Health Gauge Card */}
                  <div className="bg-white p-6 rounded-[24px] border border-slate-200 flex flex-col justify-between shadow-sm relative overflow-hidden" style={{
                    background: 'linear-gradient(135deg, #ffffff 0%, rgba(241, 245, 249, 0.4) 100%)'
                  }}>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Índice de Integridade</span>
                        <span className={cn(
                          "px-2.5 py-1 text-[8.5px] font-mono font-black rounded-lg uppercase border shadow-inner",
                          auditResults.healthPercent >= 90 ? "bg-emerald-50 text-emerald-700 border-emerald-150" :
                          auditResults.healthPercent >= 70 ? "bg-amber-50 text-amber-700 border-amber-150" : "bg-rose-50 text-rose-700 border-rose-150"
                        )}>
                          {auditResults.healthPercent >= 90 ? "Excelente" : auditResults.healthPercent >= 70 ? "Atenção" : "Crítico"}
                        </span>
                      </div>
                      <div className="pt-2">
                        <h3 className="text-3xl font-black font-display text-slate-900 tracking-tight tabular-nums flex items-baseline">
                          {auditResults.healthPercent}%
                        </h3>
                        <p className="text-[9.5px] text-slate-400 font-sans leading-relaxed mt-2">
                          {auditResults.isHealthy 
                            ? "Todas as faturas, custos, comissões de frete e saldos sob a custódia do PDV estão perfeitamente balanceados."
                            : "Erros referenciais ou margens negativas detectadas. Siga as recomendações de correção para otimizar seus balanços."
                          }
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 pt-4">
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200/50">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all duration-700",
                            auditResults.healthPercent >= 90 ? "bg-emerald-500" :
                            auditResults.healthPercent >= 70 ? "bg-amber-500" : "bg-rose-600"
                          )}
                          style={{ width: `${auditResults.healthPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[8px] font-black text-slate-400 uppercase tracking-wider">
                        <span>Ajustado</span>
                        <span className="text-slate-800">100% Sincronizado</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Bento Grid of Audit Metrics KPIs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Card 1: Saúde do Ledger */}
                  <div className="p-5 bg-white border border-slate-200 rounded-[20px] shadow-sm flex items-center gap-4">
                    <div className={cn(
                      "size-10 rounded-xl flex items-center justify-center",
                      auditResults.healthPercent >= 90 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                    )}>
                      <RefreshCw size={18} className={cn(auditResults.healthPercent < 100 && "animate-spin-[15s]")} />
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Status Geral</p>
                      <h4 className="text-sm font-black text-slate-800 tracking-tight uppercase mt-0.5">
                        {auditResults.isHealthy ? "Conforme" : "Inconsistente"}
                      </h4>
                    </div>
                  </div>

                  {/* Card 2: Total Pendências */}
                  <div className="p-5 bg-white border border-slate-200 rounded-[20px] shadow-sm flex items-center gap-4">
                    <div className="size-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center">
                      <Scale size={18} />
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Pendências</p>
                      <h4 className="text-sm font-black text-slate-800 tracking-tight mt-0.5">
                        {auditResults.unreconciledCancellations.length + auditResults.valueMismatches.length + auditResults.missingTransactionsDays.length + auditResults.customerDebtMismatches.length + auditResults.suspiciousTransactions.length} Erros
                      </h4>
                    </div>
                  </div>

                  {/* Card 3: Margens Críticas */}
                  <div className="p-5 bg-white border border-slate-200 rounded-[20px] shadow-sm flex items-center gap-4">
                    <div className={cn(
                      "size-10 rounded-xl flex items-center justify-center",
                      auditResults.suspiciousMargins.length > 0 ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-600"
                    )}>
                      <TrendingDown size={18} />
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Vendas Margem &lt; 5%</p>
                      <h4 className="text-sm font-black text-slate-800 tracking-tight mt-0.5">
                        {auditResults.suspiciousMargins.length} Alertas
                      </h4>
                    </div>
                  </div>

                  {/* Card 4: Saldos Desalinhados de Fiados */}
                  <div className="p-5 bg-white border border-slate-200 rounded-[20px] shadow-sm flex items-center gap-4">
                    <div className={cn(
                      "size-10 rounded-xl flex items-center justify-center",
                      auditResults.customerDebtMismatches.length > 0 ? "bg-amber-50 text-amber-600 animate-pulse" : "bg-slate-50 text-slate-600"
                    )}>
                      <Wallet size={18} />
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Saldos Desalinhados</p>
                      <h4 className="text-sm font-black text-slate-800 tracking-tight mt-0.5">
                        {auditResults.customerDebtMismatches.length} Contas
                      </h4>
                    </div>
                  </div>
                </div>

                {/* 3. Realtime Diagnostic Sections (A to F) */}
                <div className="space-y-8">
                  
                  {/* Category A: Cancelamentos Órfãos */}
                  <div className="space-y-3">
                    <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-rose-600 shrink-0" />
                      A. Cancelamentos Órfãos ({auditResults.unreconciledCancellations.length})
                    </h5>
                    
                    {auditResults.unreconciledCancellations.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic bg-slate-50/50 p-4 border border-dashed rounded-xl">Nenhum cancelamento órfão ou pendente de reconciliação encontrado.</p>
                    ) : (
                      <div className="space-y-3">
                        {auditResults.unreconciledCancellations.map(item => (
                          <div key={item.sale.id} className="p-4 bg-rose-50/40 border border-rose-100 rounded-xl flex items-center justify-between gap-4 flex-wrap">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[9.5px] font-mono font-black text-rose-800 uppercase bg-rose-100 border border-rose-150 px-2 py-0.5 rounded">
                                  VENDA #{item.sale.id?.slice(-5).toUpperCase()}
                                </span>
                                <span className="text-[9.5px] font-extrabold text-slate-700">{item.sale.customerName || 'Consumidor Final'}</span>
                              </div>
                              <p className="text-[9.5px] text-slate-500 mt-1.5 font-sans leading-relaxed">
                                {item.reason}
                              </p>
                            </div>
                            <button
                              onClick={() => handleReconcileSale(item.sale.id!)}
                              className="px-4 py-2 bg-rose-800 hover:bg-rose-950 text-white rounded-xl text-[9.5px] font-black uppercase tracking-widest transition-colors shadow-sm cursor-pointer"
                            >
                              Expurgar Órfãos
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Category B: Divergência de Valores */}
                  <div className="space-y-3">
                    <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-amber-500 shrink-0" />
                      B. Diferenças de Valores de Venda / Transação ({auditResults.valueMismatches.length})
                    </h5>

                    {auditResults.valueMismatches.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic bg-slate-50/50 p-4 border border-dashed rounded-xl">Todos os totais operacionais de vendas coincidem com os lançamentos de caixa correspondentes.</p>
                    ) : (
                      <div className="space-y-3">
                        {auditResults.valueMismatches.map(mismatch => {
                          const relatedTrans = transactions.filter(t => t.saleId === mismatch.sale.id && t.type === 'payment');
                          return (
                            <div key={mismatch.sale.id} className="p-4 bg-amber-50/30 border border-amber-100 rounded-xl space-y-3">
                              <div className="flex items-center justify-between gap-4 flex-wrap">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9.5px] font-mono font-black text-amber-800 uppercase bg-amber-100 border border-amber-200 px-2 py-0.5 rounded">
                                      PEDIDO #{mismatch.sale.id?.slice(-5).toUpperCase()}
                                    </span>
                                    <span className="text-[9.5px] font-extrabold text-slate-700">{mismatch.sale.customerName || 'Consumidor Final'}</span>
                                  </div>
                                  <p className="text-[9.5px] text-slate-500 mt-1.5 font-sans leading-relaxed">
                                    Canal: <strong className="text-slate-800 uppercase">{mismatch.paymentMethod}</strong> • Esperado: <strong className="text-slate-800 font-mono">{formatCurrency(mismatch.expected)}</strong> • Lançado na base de dados: <strong className="text-red-700 font-mono font-extrabold">{formatCurrency(mismatch.found)}</strong>
                                  </p>
                                </div>
                                <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[9px] font-black uppercase tracking-widest font-sans">
                                  Valores Inconsistentes
                                </span>
                              </div>

                              {relatedTrans.length > 0 && (
                                <div className="pt-2 border-t border-amber-200/40 space-y-2">
                                  <p className="text-[8px] font-black uppercase text-amber-800 tracking-widest flex items-center gap-1">
                                    <span className="size-1 rounded-full bg-amber-650 shrink-0" />
                                    Lançamentos vinculados localizados na base de dados (Exclua duplicados):
                                  </p>
                                  <div className="grid grid-cols-1 gap-1.5">
                                    {relatedTrans.map(t => (
                                      <div key={t.id} className="flex items-center justify-between bg-white/70 p-2.5 rounded-lg border border-slate-200/60 text-[9.5px] hover:border-amber-200 transition-colors">
                                        <div className="flex items-center gap-3">
                                          <span className="font-mono text-slate-400 bg-slate-100 px-1 py-0.5 rounded font-bold text-[8px]">ID: {t.id?.slice(-5).toUpperCase() || 'SEM ID'}</span>
                                          <span className="text-slate-650 font-black uppercase text-[8px]">Meio: <strong className="text-slate-800">{t.paymentMethod || 'Outros'}</strong></span>
                                          <span className="text-slate-400 font-sans text-[8.5px]">
                                            {t.createdAt?.seconds 
                                              ? new Date(t.createdAt.seconds * 1000).toLocaleString('pt-BR') 
                                              : t.createdAt ? new Date(t.createdAt).toLocaleString('pt-BR') : 'Sem data'}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <strong className="text-emerald-700 font-mono">{formatCurrency(t.amount)}</strong>
                                          <button
                                            onClick={() => handleDeleteTransactionInline(t.id!, t.amount)}
                                            className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                            title="Excluir lançamento duplicado para reconciliar"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Category C: Dias suspeitos de dados ausentes */}
                  <div className="space-y-3">
                    <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-slate-400 shrink-0" />
                      C. Dias com Lacuna de Lançamento de Caixa / Sem Base ({auditResults.missingTransactionsDays.length})
                    </h5>

                    {auditResults.missingTransactionsDays.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic bg-slate-50/50 p-4 border border-dashed rounded-xl">Excelente! Nossos registros apontam fluxos consistentes de entrada para todos os dias com faturas emitidas.</p>
                    ) : (
                      <div className="space-y-3">
                        {auditResults.missingTransactionsDays.map((day, idx) => {
                          const isExpanded = expandedAuditDay === day.dateString;
                          return (
                            <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                              <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9.5px] font-black text-slate-800 uppercase bg-slate-200 border border-slate-300 px-2 py-0.5 rounded">
                                      {day.dateString}
                                    </span>
                                    <span className={cn(
                                      "text-[10px] font-bold uppercase",
                                      day.reason === 'Sem Lançamento de Entrada' ? "text-amber-700" : "text-sky-700"
                                    )}>{day.reason}</span>
                                  </div>
                                  <p className="text-[9.5px] text-slate-500 mt-1.5 font-sans leading-relaxed">
                                    {day.reason === 'Sem Lançamento de Entrada' 
                                      ? `Houve ${day.salesCount} venda(s) registradas somando ${formatCurrency(day.salesTotal)}, mas nenhum lançamento de entrada em caixa foi feito neste dia. Pode faltar registrar o faturamento!` 
                                      : `Houve ${day.transactionsCount} lançamentos financeiros somando ${formatCurrency(day.transactionsTotal)}, mas nenhuma venda correspondente registrada para esta data.`}
                                  </p>
                                </div>

                                {day.reason === 'Lançamento Sem Venda Base' && (
                                  <button
                                    onClick={() => setExpandedAuditDay(isExpanded ? null : day.dateString)}
                                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-[9.5px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer text-slate-700 transition-colors shadow-sm"
                                  >
                                    {isExpanded ? 'Ocultar Detalhes' : `Exibir Lançamentos (${day.transactionsCount})`}
                                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                  </button>
                                )}
                              </div>

                              {isExpanded && day.reason === 'Lançamento Sem Venda Base' && (
                                <div className="border-t border-slate-200 bg-white/70 divide-y divide-slate-150">
                                  {day.transactions.map((t) => (
                                    <div key={t.id} className="p-3.5 px-5 flex items-center justify-between gap-4 flex-wrap">
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-[9.5px] font-mono">
                                          <span className="font-bold text-slate-700">ID: #{t.id?.slice(-5).toUpperCase() || 'S/ID'}</span>
                                          <span className="text-[8px] bg-slate-100 border text-slate-600 px-1.5 py-0.5 rounded uppercase font-sans font-black tracking-widest">{t.paymentMethod}</span>
                                          {t.type === 'expense' && <span className="text-[8px] bg-red-50 text-red-700 border border-red-100 px-1.5 py-0.5 rounded uppercase font-sans font-black tracking-widest">Despesa</span>}
                                        </div>
                                        <p className="text-[10px] text-slate-500 font-sans">
                                          Cliente: <strong className="text-slate-800 font-sans font-bold">{getCustomerName(t.customerId || '')}</strong>
                                          {t.notes && <span className="italic block mt-0.5 text-slate-400">Obs: "{t.notes}"</span>}
                                        </p>
                                      </div>

                                      <div className="flex items-center gap-3">
                                        <span className="text-sm font-mono font-black text-slate-900 pr-1">{formatCurrency(t.amount)}</span>
                                        <button
                                          onClick={() => handleInspectTransaction(t.id!)}
                                          title="Visualizar nos Lançamentos de Vendas"
                                          className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
                                        >
                                          <Search size={10} /> Localizar
                                        </button>
                                        <button
                                          onClick={() => handleDeleteTransactionInline(t.id!, t.amount)}
                                          title="Excluir Lançamento Órfão"
                                          className="p-1 px-2.5 bg-rose-50 text-rose-700 border border-rose-150 hover:bg-rose-100 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
                                        >
                                          <Trash2 size={10} /> Excluir
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Category D: Auditoria de Margem e Custos de Vendas (New!) */}
                  <div className="space-y-3">
                    <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-rose-700 shrink-0 animate-pulse" />
                      D. Alertas de Margem de Lucro Crítica / Erro de Custo ({auditResults.suspiciousMargins.length})
                    </h5>

                    {auditResults.suspiciousMargins.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic bg-slate-50/50 p-4 border border-dashed rounded-xl">Todas as vendas ativas operam acima da margem mínima recomendada de segurança (5% lucro bruto).</p>
                    ) : (
                      <div className="space-y-3">
                        {auditResults.suspiciousMargins.map((item, idx) => {
                          const roundedMargin = item.margin.toFixed(1);
                          return (
                            <div key={idx} className="p-4 bg-rose-50/20 border border-rose-100 rounded-xl flex items-center justify-between gap-4 flex-wrap">
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[9.5px] font-mono font-black text-rose-900 uppercase bg-rose-100 border border-rose-250 px-2 py-0.5 rounded">
                                    VENDA #{item.sale.id?.slice(-5).toUpperCase()}
                                  </span>
                                  <span className="text-[9.5px] font-extrabold text-slate-700">Cliente: {item.sale.customerName || 'Consumidor Final'}</span>
                                  <span className="text-[9px] font-black bg-rose-600 text-white uppercase px-2 py-0.5 rounded shadow-sm flex items-center gap-1">
                                    {item.margin < 0 ? 'Lucro Negativo' : 'Margem Crítica'} ({roundedMargin}%)
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                                  Esta venda gerou faturamento de <strong className="text-slate-800">{formatCurrency(item.revenue)}</strong>, mas teve um custo estimado de aquisição de mercadorias de <strong className="text-red-800">{formatCurrency(item.cost)}</strong>.
                                  <span className="block mt-1 text-[9px] italic text-slate-400">🚨 Dica de Auditoria: Revise se os preços de custo dos produtos vendidos ou os descontos aplicados nesta nota fiscal estavam devidamente cadastrados.</span>
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Category E: Divergência de Saldo Devedor de Clientes (New!) */}
                  <div className="space-y-3">
                    <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-amber-600 shrink-0" />
                      E. Divergência de Saldo Devedor do Cliente (Ledger vs Saved Debt) ({auditResults.customerDebtMismatches.length})
                    </h5>

                    {auditResults.customerDebtMismatches.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic bg-slate-50/50 p-4 border border-dashed rounded-xl">Perfeito! O saldo devedor atual de todos os clientes confere exatamente com a somatória histórica do ledger.</p>
                    ) : (
                      <div className="space-y-3">
                        {auditResults.customerDebtMismatches.map((item, idx) => (
                          <div key={idx} className="p-4 bg-amber-50/25 border border-amber-200/80 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-1.5 min-w-[200px] flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-black pointer-events-none text-amber-850 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-lg uppercase">
                                  {item.customer.name}
                                </span>
                                {item.customer.contact && <span className="text-[9.5px] text-slate-400 font-mono">({item.customer.contact})</span>}
                              </div>
                              <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                                Cadastrado na ficha do cliente: <strong className="text-amber-800 font-mono font-bold">{formatCurrency(item.savedDebt)}</strong> • Calculado pelo ledger de compras Fiado: <strong className="text-slate-800 font-mono">{formatCurrency(item.expectedDebt)}</strong>.
                                <span className="block mt-1 text-red-700 font-black text-[9px] uppercase tracking-wider">Diferença absoluta: {formatCurrency(item.diff)}</span>
                              </p>
                            </div>
                            <div className="shrink-0 flex flex-col gap-2 w-full md:w-auto">
                              <button
                                onClick={() => handleAdjustLedgerToCustomerDebt(item.customer.id!, item.customer.name, item.savedDebt, item.expectedDebt)}
                                className="w-full md:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm shadow-emerald-200/50"
                              >
                                <Plus size={11} />
                                Lançar Ajuste no Ledger (+{formatCurrency(item.diff)})
                              </button>
                              <button
                                onClick={() => handleFixCustomerDebt(item.customer.id!, item.expectedDebt)}
                                className="w-full md:w-auto px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-lg text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95 border border-slate-200/50"
                              >
                                <RefreshCw size={9} />
                                Forçar Perfil p/ R$ {item.expectedDebt.toFixed(2)}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Category F: Lançamentos com Meio de Pagamento Suspeito (New!) */}
                  <div className="space-y-3">
                    <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-slate-500 shrink-0" />
                      F. Lançamentos com Canal de Pagamento Nulo ou Não Classificado ({auditResults.suspiciousTransactions.length})
                    </h5>

                    {auditResults.suspiciousTransactions.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic bg-slate-50/50 p-4 border border-dashed rounded-xl">Tudo limpo! Todas as transações foram devidamente classificadas com canais de pagamento transparentes (Pix, Dinheiro, Cartão, Fiado).</p>
                    ) : (
                      <div className="space-y-3">
                        {auditResults.suspiciousTransactions.map((item, idx) => (
                          <div key={idx} className="p-4 bg-slate-50 border border-slate-150 rounded-xl flex items-center justify-between gap-4 flex-wrap">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[9.5px] font-mono font-black text-slate-800 bg-slate-200 px-2 py-0.5 rounded">
                                  ID: #{item.transaction.id?.slice(-5).toUpperCase() || 'S/ID'}
                                </span>
                                <span className="text-[9px] font-black uppercase tracking-wider bg-rose-550 text-white px-2 py-0.5 rounded">
                                  {item.issue}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 font-sans">
                                Lançamento de <strong className="text-slate-800">{formatCurrency(item.transaction.amount)}</strong> cadastrado em{" "}
                                <strong className="text-slate-700">
                                  {item.transaction.createdAt?.seconds 
                                    ? new Date(item.transaction.createdAt.seconds * 1000).toLocaleString('pt-BR') 
                                    : item.transaction.createdAt ? new Date(item.transaction.createdAt).toLocaleString('pt-BR') : 'Sem data'}
                                </strong>
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleInspectTransaction(item.transaction.id!)}
                                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                              >
                                Localizar
                              </button>
                              <button
                                onClick={() => handleDeleteTransactionInline(item.transaction.id!, item.transaction.amount)}
                                className="p-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-[9.5px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>
        </div>

      {/* Gestão de Despesas e Custos Fixos */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mt-8">
        {/* Form para Lançar Despesa */}
        <div className="bg-white/60 backdrop-blur-md p-8 rounded-[32px] border border-slate-250 shadow-sm flex flex-col h-fit">
          <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2">
            <Plus size={16} className="text-red-800" />
            Lançar Despesa Operacional
          </h4>
          
          <form onSubmit={handleAddExpense} className="space-y-5">
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Categoria</label>
              <select 
                value={expCategory}
                onChange={(e: any) => setExpCategory(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-850 shadow-sm"
              >
                <option value="Marketing/Ads">Marketing / Anúncios</option>
                <option value="Plataforma/Sistemas">Plataforma / Sistemas</option>
                <option value="Embalagens">Embalagens / Brindes</option>
                <option value="Aluguel/Estrutura">Aluguel / Estrutura</option>
                <option value="Logística Extra">Logística Extra</option>
                <option value="Outros">Outras Despesas</option>
              </select>
            </div>
            
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Descrição</label>
              <input 
                type="text" 
                placeholder="Ex: Anúncios Meta Ads, Aluguel..."
                value={expDescription}
                onChange={e => setExpDescription(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-800 shadow-sm"
              />
            </div>
            
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Valor (R$)</label>
              <input 
                type="number" 
                step="0.01"
                placeholder="0,00"
                value={expAmount}
                onChange={e => setExpAmount(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-800 shadow-sm"
              />
            </div>
            
            <button 
              type="submit"
              disabled={isSavingExpense}
              className="w-full flex items-center justify-center gap-2 py-4 bg-slate-950 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-800 transition-all border border-slate-900 shadow-lg disabled:opacity-50"
            >
              {isSavingExpense ? "Lançando..." : "Lançar Despesa"}
            </button>
          </form>
        </div>

        {/* Histórico de Despesas */}
        <div className="xl:col-span-2 bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[400px]">
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
               <Tag size={16} className="text-red-800" />
               Histórico de Despesas Operacionais (Mês)
            </h4>
            <span className="px-3 py-1 bg-red-50 rounded-xl border border-red-100 text-[9px] font-black text-rose-700 uppercase tracking-widest">
              Total: {formatCurrency(totalExpenses)}
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            {expenses.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                <AlertCircle size={32} className="text-slate-300 animate-pulse" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhuma despesa ou custo fixo lançado</p>
                <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest text-center">Utilize o formulário para registrar anúncios, aluguel, etc.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {expenses.map(exp => (
                  <div key={exp.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-150 rounded-2xl hover:bg-slate-100/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[8px] font-black uppercase text-slate-500 tracking-wider shadow-sm">
                        {exp.category}
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight italic">{exp.description}</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                          {exp.createdAt?.seconds ? new Date(exp.createdAt.seconds * 1000).toLocaleDateString('pt-BR') : 'Sem data'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <span className="text-[13px] font-black text-red-650 font-display tabular-nums tracking-tight">
                        - {formatCurrency(exp.amount)}
                      </span>
                      <button 
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-rose-50 rounded-lg transition-all"
                        title="Excluir Lançamento"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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

      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-slate-150 flex flex-col space-y-6">
            <div className={`size-14 rounded-2xl flex items-center justify-center self-center shadow-lg mb-2 ${
              confirmModal.type === 'error' 
                ? 'bg-rose-50 text-rose-600 shadow-rose-100' 
                : confirmModal.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-600 shadow-emerald-100' 
                  : 'bg-amber-50 text-amber-600 shadow-amber-100'
            }`}>
              <AlertCircle size={28} />
            </div>
            <div className="text-center space-y-3">
              <h3 className="text-[14px] font-black text-slate-800 uppercase tracking-tight leading-snug">{confirmModal.title}</h3>
              <p className="text-[11px] text-slate-500 font-sans leading-relaxed whitespace-pre-line">{confirmModal.description}</p>
            </div>
            <div className="flex gap-3 pt-2">
              {confirmModal.showCancel !== false && (
                <button
                  type="button"
                  onClick={() => setConfirmModal(prev => prev ? { ...prev, isOpen: false } : null)}
                  className="flex-1 py-3 text-[10px] font-black uppercase tracking-wider bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer transition-all active:scale-95"
                >
                  {confirmModal.cancelText || 'Cancelar'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(prev => prev ? { ...prev, isOpen: false } : null);
                }}
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider text-white rounded-xl cursor-pointer transition-all active:scale-95 shadow-md ${
                  confirmModal.type === 'error' 
                    ? 'bg-rose-650 hover:bg-rose-700 shadow-rose-200' 
                    : confirmModal.type === 'success' 
                      ? 'bg-emerald-650 hover:bg-emerald-700 shadow-emerald-200' 
                      : 'bg-red-800 hover:bg-slate-900 shadow-red-900/10'
                }`}
              >
                {confirmModal.confirmText || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function FinanceCard({ title, value, icon: Icon, color, subtitle }: any) {
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
        <h4 className="text-2xl font-bold tracking-tight leading-none font-display tabular-nums uppercase">
          <RollingCounter value={value} />
        </h4>
        {subtitle && (
          <>
            <div className={cn(
              "h-px w-full my-3",
              color === 'red' || color === 'black' 
                ? "bg-gradient-to-r from-transparent via-white/20 to-transparent" 
                : "bg-gradient-to-r from-transparent via-slate-200/60 to-transparent"
            )} />
            <p className={cn(
              "text-[9px] font-black uppercase tracking-[0.1em] leading-none block",
              color === 'red' || color === 'black' ? "text-white/70" : "text-emerald-700 font-mono"
            )}>{subtitle}</p>
          </>
        )}
      </div>
    </motion.div>
  );
}
