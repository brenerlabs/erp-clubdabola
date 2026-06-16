import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, collection, query, onSnapshot, where } from 'firebase/firestore';
import { Sale, Shipment } from '../types';
import { JerseyPreview } from '../components/JerseyPreview';
import { 
  Sparkles, CheckCircle2, Ticket, Calendar, DollarSign, 
  MapPin, Truck, ExternalLink, MessageSquare, ShieldCheck, 
  Clock, Package, RefreshCw, ChevronRight, HelpCircle, ArrowRight
} from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

// Live CSS for Keyframes Confetti and animations
const EXTRA_CSS = `
  @keyframes fall {
    0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
  }
  .animate-confetti {
    animation: fall var(--fall-duration, 4s) linear infinite;
  }
`;

interface PublicReceiptProps {
  receiptId: string;
}

export default function PublicReceipt({ receiptId }: PublicReceiptProps) {
  const [sale, setSale] = useState<Sale | null>(null);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'jersey' | 'tracking'>('jersey');
  const [compensatedAmount, setCompensatedAmount] = useState<number>(0);

  // Load Sale and corresponding Shipment in real-time
  useEffect(() => {
    if (!receiptId) return;

    setLoading(true);
    setError(null);

    // 1. Listen to exact Sale document in real-time
    const saleRef = doc(db, 'sales', receiptId);
    const unsubscribeSale = onSnapshot(saleRef, (saleSnap) => {
      if (!saleSnap.exists()) {
        setError('Comprovante não encontrado. Verifique o link enviado.');
        setLoading(false);
        return;
      }
      
      const saleData = { id: saleSnap.id, ...saleSnap.data() } as Sale;
      setSale(saleData);

      const hasCustObj = saleData.items?.some((it) => it.isCustomized) || false;
      setActiveTab((prev) => {
        if (!hasCustObj) return 'tracking';
        return prev;
      });
      setLoading(false);
    }, (err) => {
      console.error("Error loading public sale receipt:", err);
      setError('Houve um problema de rede ou permissão ao carregar o comprovante.');
      setLoading(false);
    });

    // 2. Listen to Shipments collection to live-track delivery state
    const shipmentsRef = collection(db, 'shipments');
    const unsubscribeShipments = onSnapshot(shipmentsRef, (snapshot) => {
      let matchedShipment: Shipment | null = null;
      snapshot.forEach((docSnap) => {
        const s = { id: docSnap.id, ...docSnap.data() } as Shipment;
        // Check if any item in the shipment corresponds to this sale ID
        const hasSale = s.items?.some((item) => item.saleId === receiptId);
        if (hasSale) {
          matchedShipment = s;
        }
      });
      setShipment(matchedShipment);
    }, (err) => {
      console.error("Error fetching matching shipment:", err);
    });

    // 3. Listen to Transactions collection to calculate exactly how much was paid in real-time
    const transactionsRef = collection(db, 'transactions');
    const qTransactions = query(transactionsRef, where('saleId', '==', receiptId));
    const unsubscribeTransactions = onSnapshot(qTransactions, (snapshot) => {
      let paidSum = 0;
      snapshot.forEach((docSnap) => {
        const t = docSnap.data();
        if (t.type === 'payment') {
          paidSum += t.amount || 0;
        }
      });
      setCompensatedAmount(paidSum);
    }, (err) => {
      console.error("Error fetching matching transactions:", err);
    });

    return () => {
      unsubscribeSale();
      unsubscribeShipments();
      unsubscribeTransactions();
    };
  }, [receiptId]);

  if (loading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-white gap-4 p-4">
        <style>{EXTRA_CSS}</style>
        <div className="size-14 border-4 border-slate-800 border-t-amber-500 rounded-full animate-spin" />
        <div className="text-center space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500 animate-pulse">CLUB DA BOLA</p>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Carregando Manto Landing Page...</p>
        </div>
      </div>
    );
  }

  if (error || !sale) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-white p-6 text-center">
        <div className="size-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mb-4">
          <HelpCircle size={32} className="text-red-500" />
        </div>
        <h2 className="text-xl font-black uppercase tracking-wider mb-2 text-white">Oops! Algo deu errado</h2>
        <p className="text-xs text-slate-400 max-w-sm leading-relaxed mb-6">
          {error || 'Não foi possível encontrar as informações deste pedido.'}
        </p>
        <a 
          href="/"
          className="px-6 py-3 bg-red-800 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-2xl transition-all"
        >
          Voltar para Home
        </a>
      </div>
    );
  }

  const isPreSale = sale.status === 'Pré-venda';
  const isFiado = sale.paymentMethod === 'Fiado' || sale.status === 'Pendente';
  const isPaid = sale.status === 'Concluída' && sale.paymentMethod !== 'Fiado';

  // Determine if payment is confirmed to show digital confetti
  const isPaymentConfirmed = isPaid;

  // Format date helper
  const formattedDate = sale.createdAt?.seconds 
    ? new Date(sale.createdAt.seconds * 1000).toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR');

  // Extract customized items for drawing
  const customizedItem = sale.items?.find((it) => it.isCustomized);
  const hasCustomized = !!customizedItem;
  const previewName = customizedItem?.customName || 'SEU NOME';
  const previewNum = customizedItem?.customNumber || '10';
  const previewProductName = customizedItem?.name || '';

  // Confetti generator helper
  const renderConfetti = () => {
    if (!isPaymentConfirmed) return null;
    const colors = ['bg-red-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-pink-500', 'bg-indigo-500'];
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {Array.from({ length: 80 }).map((_, i) => {
          const randColor = colors[i % colors.length];
          const randLeft = `${Math.random() * 100}%`;
          const randDelay = `${Math.random() * 4}s`;
          const randDuration = `${3 + Math.random() * 4}s`;
          const randSize = `${6 + Math.random() * 8}px`;
          return (
            <div
              key={i}
              className={`absolute top-[-20px] animate-confetti rounded-md ${randColor}`}
              style={{
                left: randLeft,
                width: randSize,
                height: randSize,
                opacity: 0.8,
                '--fall-duration': randDuration,
                animationDelay: randDelay,
              } as React.CSSProperties}
            />
          );
        })}
      </div>
    );
  };

  // Tracking Milestones
  const trackingMilestones = [
    { 
      label: isPreSale ? 'Orçamento Gerado' : 'Pedido Confirmado', 
      desc: isPreSale ? 'Orçamento salvo no sistema' : 'Processado no sistema', 
      key: 'confirmado', 
      active: true 
    },
    { label: 'Postado', desc: 'Despachado na transportadora', key: 'Postado', active: shipment?.status !== 'Processando' && !!shipment },
    { label: 'Em Trânsito', desc: 'Caminho internacional / nacional', key: 'Em Trânsito', active: ['Em Trânsito', 'Chegou no Brasil', 'Fiscalização', 'Em trânsito para o destino final', 'Recebido', 'Entregue'].includes(shipment?.status || '') },
    { label: 'Chegou no Brasil', desc: 'Centro de Triagem Aduaneira', key: 'Chegou no Brasil', active: ['Chegou no Brasil', 'Fiscalização', 'Em trânsito para o destino final', 'Recebido', 'Entregue'].includes(shipment?.status || '') },
    { label: 'Fiscalização', desc: 'Análise aduaneira de rotina', key: 'Fiscalização', active: ['Fiscalização', 'Em trânsito para o destino final', 'Recebido', 'Entregue'].includes(shipment?.status || '') },
    { label: 'Entrega Final', desc: 'Destino final / Entregue', key: 'Entregue', active: shipment?.status === 'Entregue' }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans relative overflow-x-hidden selection:bg-red-800 selection:text-white">
      <style>{EXTRA_CSS}</style>
      
      {/* Background Confetti Congratulatory Effects */}
      {renderConfetti()}

      {/* Cosmic background glows */}
      <div className="absolute top-0 left-1/4 -translate-x-1/2 w-[350px] h-[350px] bg-red-900/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[300px] h-[300px] bg-amber-500/5 rounded-full blur-[80px] pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-md mx-auto px-4 py-6 relative z-10 flex flex-col min-h-screen justify-between pb-10">
        
        {/* Header Branding */}
        <header className="flex flex-col items-center justify-center text-center gap-3 mb-6">
          <div className="flex items-center gap-2">
            <span className="size-8 rounded-xl bg-gradient-to-tr from-red-900 to-amber-500 flex items-center justify-center text-white text-sm font-black shadow-lg shadow-red-900/40">
              CB
            </span>
            <div className="flex flex-col -space-y-1 text-left">
              <h1 className="text-sm font-black uppercase tracking-wider text-white">
                CLUB DA <span className="text-amber-500">BOLA</span>
              </h1>
              <p className="text-[7.5px] font-black text-slate-500 uppercase tracking-widest leading-none">A Grife do Manto Customizado</p>
            </div>
          </div>
        </header>

        {/* Content Wrapper */}
        <div className="space-y-4 flex-1">
          
          {/* Main Hero Card */}
          <div className="bg-slate-900/80 border border-white/5 rounded-3xl p-5 shadow-2xl relative overflow-hidden backdrop-blur-md">
            
            {/* Header Status Badge */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
              <div className="space-y-0.5 text-left">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none block">CÓDIGO DO COMPROVANTE</span>
                <span className="font-mono text-xs font-black text-white p-1 bg-white/5 rounded border border-white/5 uppercase select-all">
                  #{receiptId.slice(-8).toUpperCase()}
                </span>
              </div>
              <div className="text-right">
                {isPreSale ? (
                  <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1">
                    <Clock size={10} className="animate-pulse" /> Aguardando Aprovação
                  </span>
                ) : isFiado ? (
                  <span className="text-[9px] font-black text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1">
                    <Clock size={10} className="animate-pulse" /> Pagamento Pendente
                  </span>
                ) : (
                  <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1">
                    <CheckCircle2 size={10} className="animate-pulse" /> Pago Confirmado
                  </span>
                )}
              </div>
            </div>

            {/* Congratulatory / Status Text */}
            {isPreSale ? (
              <div className="text-center mb-6 space-y-1.5 animate-fadeIn">
                <div className="size-12 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto mb-2 shadow-inner shadow-amber-500/5">
                  <Clock size={20} className="text-amber-400 animate-pulse" />
                </div>
                <h2 className="text-base font-black uppercase text-white tracking-wide">Orçamento Disponível!</h2>
                <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Olá, <strong className="text-white uppercase">{sale.customerName}</strong>! Seu orçamento já está salvo no sistema e <strong className="text-amber-400">aguarda aprovação</strong> para iniciarmos a confecção do seu manto exclusivo.
                </p>
              </div>
            ) : isFiado ? (
              <div className="text-center mb-6 space-y-1.5 animate-fadeIn">
                <div className="size-12 bg-rose-500/10 border border-rose-500/30 rounded-full flex items-center justify-center mx-auto mb-2 shadow-inner shadow-rose-500/5">
                  <Clock size={20} className="text-rose-400 animate-pulse" />
                </div>
                <h2 className="text-base font-black uppercase text-white tracking-wide">Pedido Registrado!</h2>
                <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Fala, <strong className="text-white uppercase">{sale.customerName}</strong>! Seu pedido foi registrado com sucesso. Seu pagamento está como <strong className="text-rose-400">pendente ou em aberto</strong> no sistema. Fale com seu assessor para acertar os detalhes.
                </p>
              </div>
            ) : (
              <div className="text-center mb-6 space-y-1.5 animate-fadeIn">
                <div className="size-12 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-2 shadow-inner shadow-emerald-500/5">
                  <Sparkles size={20} className="text-amber-500 animate-spin" style={{ animationDuration: '6s' }} />
                </div>
                <h2 className="text-base font-black uppercase text-white tracking-wide">Manto Confirmado!</h2>
                <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Fala, <strong className="text-white uppercase">{sale.customerName}</strong>! Tudo pronto com o seu pedido. Preparamos o seu manto com a máxima qualidade e personalização premium.
                </p>
              </div>
            )}

            {/* TAB SELECTOR: Canvas visual vs Rastreamento */}
            {hasCustomized && (
              <div className="grid grid-cols-2 bg-slate-950 p-1.5 rounded-2xl border border-white/5 mb-5">
                <button
                  type="button"
                  onClick={() => setActiveTab('jersey')}
                  className={`py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                    activeTab === 'jersey' 
                      ? 'bg-red-800 text-white shadow-md shadow-red-950/40' 
                      : 'text-slate-500 hover:text-white'
                  }`}
                >
                  👕 Visual do Manto
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('tracking')}
                  className={`py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                    activeTab === 'tracking' 
                      ? 'bg-red-800 text-white shadow-md shadow-red-950/40' 
                      : 'text-slate-500 hover:text-white'
                  }`}
                >
                  📦 Acompanhar Destino
                </button>
              </div>
            )}

            {/* TAB CONTENT: Visual Jersey Live Canvas */}
            {hasCustomized && activeTab === 'jersey' && (
              <div className="space-y-4 animate-fadeIn">
                
                {/* Visual Jersey Preview Component */}
                <JerseyPreview 
                  name={previewName} 
                  number={previewNum} 
                  productName={previewProductName}
                />

                {/* Information Badge */}
                <div className="flex gap-2.5 bg-white/5 rounded-xl p-3 border border-indigo-500/10 text-left">
                  <ShieldCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 text-left">
                    <h4 className="text-[10px] font-extrabold uppercase tracking-wide text-white">Garantia Club da Bola</h4>
                    <p className="text-[8.5px] text-slate-400 leading-relaxed">
                      Todas as nossas camisas passam por uma triagem rigorosa de qualidade (tecidos Dry-Fit premium, escudos bordados de alta definição e costuras duplas reforçadas) antes da entrega.
                    </p>
                  </div>
                </div>

              </div>
            )}

            {/* TAB CONTENT: Shipping & Tracking status */}
            {(!hasCustomized || activeTab === 'tracking') && (
              <div className="space-y-4 animate-fadeIn">
                
                {/* Active Tracking Status Banner */}
                <div className="bg-slate-950 border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-1.5 shadow-inner">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none block">STATUS DE TRANSPORTE</span>
                  
                  <div className="size-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-1">
                    {shipment ? (
                      <Truck size={22} className="text-amber-500 animate-pulse" />
                    ) : (
                      <Clock size={22} className="text-amber-500 animate-pulse" />
                    )}
                  </div>
                  
                  <h3 className="text-sm font-black text-white uppercase tracking-wider leading-none">
                    {shipment ? shipment.status : (isPreSale ? 'Aguardando Aprovação' : 'Aguardando Despacho')}
                  </h3>
                  <p className="text-[9px] text-slate-400 leading-tight max-w-xs uppercase">
                    {shipment 
                      ? 'Nossos fiscais atualizaram o status da sua encomenda recentemente.' 
                      : (isPreSale 
                          ? 'O orçamento aguarda sua aprovação e pagamento para seguir para fila de produção.' 
                          : 'O pedido foi faturado e está na fila para costura, separação e embalagem.')
                    }
                  </p>
                </div>

                {/* Tracking Milestones Progression */}
                <div className="relative bg-slate-950 border border-white/5 rounded-2xl p-4 pl-8 space-y-4 text-left">
                  {/* Vertical progression line */}
                  <div className="absolute top-6 bottom-6 left-6 w-0.5 bg-slate-800" />

                  {trackingMilestones.map((milestone, idx) => (
                    <div key={idx} className="relative flex gap-3.5 items-start">
                      {/* Circle Dot Marker */}
                      <span className={`absolute left-[-21px] size-4 rounded-full border-2 flex items-center justify-center text-[7px] font-black ${
                        milestone.active
                          ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                          : 'bg-slate-900 border-slate-700 text-slate-500'
                      }`}>
                        {idx + 1}
                      </span>

                      <div className="space-y-0.5">
                        <h4 className={`text-[10px] font-black uppercase tracking-wider ${
                          milestone.active ? 'text-white' : 'text-slate-600'
                        }`}>
                          {milestone.label}
                        </h4>
                        <p className="text-[8.5px] text-slate-500 leading-none">
                          {milestone.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Direct Correios Tracker Link Actions */}
                {shipment?.trackingCode ? (
                  <div className="space-y-2">
                    <a 
                      href={`https://rastreamento.correios.com.br/app/index.php?codigo=${shipment.trackingCode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/10"
                    >
                      <span>Acompanhar Correios Rastreio</span> <ExternalLink size={12} />
                    </a>
                    
                    <div className="bg-white/5 rounded-xl border border-white/5 p-2 px-3 flex items-center justify-between text-[9px] font-mono select-all">
                      <span className="text-slate-500">CÓDIGO:</span>
                      <span className="text-white font-extrabold uppercase select-all tracking-wider">{shipment.trackingCode}</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-950 border border-white/5 rounded-2xl p-4.5 text-center text-slate-500 text-[9px] font-medium uppercase leading-tight">
                    Logo que seu objeto for postado nos Correios ou DHL, mandaremos uma notificação em tempo real por WhatsApp com o código para rastreamento.
                  </div>
                )}

              </div>
            )}

            {/* ALWAYS SHOW: Items Summary Details Box */}
            <div className="bg-slate-950 border border-white/5 rounded-2xl p-4 space-y-3 mt-4">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block leading-none">RESUMO DOS ITENS</span>
              
              <div className="space-y-2">
                {sale.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start gap-3 text-xs leading-tight border-b border-white/5 pb-2 last:border-0 last:pb-0">
                    <div className="space-y-0.5 text-left">
                      <p className="font-extrabold text-white text-[11px] uppercase">{item.name}</p>
                      <p className="text-[9px] text-slate-500 font-bold uppercase">
                        Grade: {item.variationName} | Qtd: {item.quantity}
                      </p>
                      {item.isCustomized && (
                        <p className="text-[8.5px] text-amber-500 font-black uppercase tracking-wide flex items-center gap-1 mt-0.5">
                          <span>👕 Personalizado nas costas</span>
                        </p>
                      )}
                    </div>
                    <span className="font-mono font-extrabold text-white text-[11px] shrink-0">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Financial Footer */}
              <div className="border-t border-white/5 pt-3 space-y-1.5 text-xs text-[11px] font-bold">
                {sale.discount ? (
                  <div className="flex justify-between text-slate-500 uppercase">
                    <span>Subtotal</span>
                    <span className="font-mono">{formatCurrency((sale.subtotal || sale.total) + (sale.discount || 0))}</span>
                  </div>
                ) : null}
                {sale.discount ? (
                  <div className="flex justify-between text-rose-500 uppercase">
                    <span>Desconto</span>
                    <span className="font-mono">-{formatCurrency(sale.discount)}</span>
                  </div>
                ) : null}
                {isPreSale ? (
                  <div className="flex justify-between text-white uppercase font-black text-[12px] pt-1 border-t border-white/5">
                    <span>Valor a ser pago</span>
                    <span className="font-mono text-amber-400">{formatCurrency(sale.total)}</span>
                  </div>
                ) : isFiado ? (
                  <div className="space-y-1.5 pt-1 border-t border-white/5">
                    <div className="flex justify-between text-white uppercase font-black text-[11px]">
                      <span>Valor Pago</span>
                      <span className="font-mono text-emerald-400">{formatCurrency(compensatedAmount)}</span>
                    </div>
                    <div className="flex justify-between text-rose-400 uppercase font-black text-[11px]">
                      <span className="flex items-center gap-1">
                        <Clock size={10} className="animate-pulse" /> Valor Pendente
                      </span>
                      <span className="font-mono">{formatCurrency(Math.max(0, sale.total - compensatedAmount))}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between text-white uppercase font-black text-[12px] pt-1 border-t border-white/5">
                    <span>Valor Pago</span>
                    <span className="font-mono text-emerald-400">{formatCurrency(sale.total)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer helper / delivery dates */}
            <div className="border-t border-white/5 pt-4 mt-4 flex items-center justify-between text-[8px] font-black text-slate-500 uppercase tracking-widest">
              <span>DATA DA ENCOMENDA</span>
              <span>{formattedDate}</span>
            </div>

          </div>

          {/* Quick FAQ / Contacts panel */}
          <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-4 flex flex-col gap-3 text-left">
            <h4 className="text-[9px] font-black uppercase text-amber-500 tracking-wider">📞 PRECO DE SUPORTE DIRETO</h4>
            
            <p className="text-[9px] text-slate-400 leading-relaxed">
              Dúvidas sobre o tamanho ideal, prazo ou quer solicitar uma alteração na arte do seu manto? Fale diretamente com o nosso assessor pelo WhatsApp clicando abaixo:
            </p>

            <a 
              href="https://wa.me/5591993249580?text=Ol%C3%A1%2C%20gostaria%20de%20ajuda%20com%20o%20meu%20manto%20Club%20da%20Bola%21"
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
            >
              <MessageSquare size={12} /> Falar com Assessor no WhatsApp
            </a>
          </div>

        </div>

        {/* Dynamic brand copyright */}
        <footer className="text-center pt-8 text-[8px] text-slate-600 font-extrabold uppercase tracking-[0.2em]">
          &copy; {new Date().getFullYear()} CLUB DA BOLA. Todos os direitos reservados.
        </footer>

      </div>
    </div>
  );
}
