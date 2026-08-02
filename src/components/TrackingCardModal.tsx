import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Download, 
  Share2, 
  Copy, 
  Check, 
  ExternalLink, 
  Package, 
  Truck, 
  ShieldCheck, 
  QrCode, 
  Shirt, 
  Sparkles,
  Barcode,
  CheckCircle2,
  Calendar,
  User,
  MapPin,
  Clock
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { safeHtml2Canvas } from '../lib/html2canvasSanitizer';
import { Shipment, Product, Customer } from '../types';
import { formatProductNameWithGender, formatCurrency } from '../lib/utils';
import { cn } from '../lib/utils';

interface TrackingCardModalProps {
  shipment: Shipment | null;
  customerId?: string | null;
  products: Product[];
  customers: Customer[];
  onClose: () => void;
}

export default function TrackingCardModal({
  shipment,
  customerId,
  products,
  customers,
  onClose
}: TrackingCardModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  if (!shipment) return null;

  // Filter customer & items
  const relevantCustomer = customerId ? customers.find(c => c.id === customerId) : null;
  const itemsToDisplay = customerId 
    ? shipment.items.filter(i => i.customerId === customerId)
    : shipment.items;

  // Customer name
  const customerName = relevantCustomer?.name 
    || itemsToDisplay[0]?.customerName 
    || 'Cliente VIP';
  
  const customerPhone = relevantCustomer?.contact || '';
  const cleanPhone = customerPhone.replace(/\D/g, '');

  // First item product photo
  const firstItem = itemsToDisplay[0];
  const firstProduct = firstItem ? products.find(p => p.id === firstItem.productId) : null;
  const photoUrl = firstProduct?.photoUrl || '';

  // Tracking link
  const trackingLink = `https://rastreamento.correios.com.br/app/index.php?codigo=${shipment.trackingCode}`;

  // Formatted status badge color
  const getStatusBadge = (status: Shipment['status']) => {
    switch (status) {
      case 'Entregue':
      case 'Recebido':
        return { bg: 'bg-emerald-500', text: 'text-white', label: '✅ ENTREGUE / DISPONÍVEL' };
      case 'Em Trânsito':
      case 'Em trânsito para o destino final':
        return { bg: 'bg-amber-500', text: 'text-slate-950', label: '🚚 EM TRÂNSITO' };
      case 'Chegou no Brasil':
        return { bg: 'bg-blue-600', text: 'text-white', label: '🇧🇷 CHEGOU NO BRASIL' };
      case 'Postado':
        return { bg: 'bg-emerald-600', text: 'text-white', label: '📦 POSTADO NOS CORREIOS' };
      case 'Fiscalização':
        return { bg: 'bg-purple-600', text: 'text-white', label: '⚠️ FISCALIZAÇÃO ADUANEIRA' };
      default:
        return { bg: 'bg-slate-700', text: 'text-white', label: '⏳ PROCESSANDO' };
    }
  };

  const statusInfo = getStatusBadge(shipment.status);

  // Copy tracking code
  const handleCopyCode = () => {
    navigator.clipboard.writeText(shipment.trackingCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // WhatsApp text message formatted
  const itemsListFormatted = itemsToDisplay.map(i => {
    const itemGender = i.gender || products.find(p => p.id === i.productId)?.gender || 'Ambos';
    let text = `- ${i.quantity}x ${formatProductNameWithGender(i.productName, itemGender)}`;
    if (i.isCustomized && (i.customName || i.customNumber)) {
      text += ` (${i.customName || ''} #${i.customNumber || ''})`;
    }
    return text;
  }).join('\n');

  const fullWhatsAppMessage = `Fala, *${customerName}*! Tudo bem? ⚽\n\nAqui está o seu *Comprovante Oficial de Rastreio* do seu pedido na *Club da Bola*:\n\n📌 *Código de Rastreio:* *${shipment.trackingCode}*\n🚚 *Status Atual:* ${shipment.status}\n\n*Produto(s):*\n${itemsListFormatted}\n\n🔗 *Acompanhe pelo link oficial:* ${trackingLink}\n\nQualquer dúvida estamos à disposição! Tamo junto! 🔥🤙`;

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(fullWhatsAppMessage);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Open WhatsApp
  const handleSendWhatsApp = () => {
    const url = cleanPhone 
      ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(fullWhatsAppMessage)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(fullWhatsAppMessage)}`;
    window.open(url, '_blank');
  };

  // Download Card image as PNG
  const handleDownloadPNG = async () => {
    if (!cardRef.current) return;
    setIsGenerating(true);
    try {
      const canvas = await safeHtml2Canvas(cardRef.current, {
        scale: 3, // High DPI image
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#0b0f19',
        logging: false
      });

      const image = canvas.toDataURL('image/png', 1.0);
      const downloadLink = document.createElement('a');
      downloadLink.href = image;
      downloadLink.download = `Comprovante_Rastreio_${shipment.trackingCode}_${customerName.replace(/\s+/g, '_')}.png`;
      downloadLink.click();
    } catch (err) {
      console.error('Error generating image PNG:', err);
      alert('Não foi possível gerar a imagem automaticamente. Tente tirar um print do cartão.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Native share if supported
  const handleNativeShare = async () => {
    if (!cardRef.current) return;
    setIsGenerating(true);
    try {
      const canvas = await safeHtml2Canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#0b0f19'
      });

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `comprovante_${shipment.trackingCode}.png`, { type: 'image/png' });
        
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Rastreio ${shipment.trackingCode} - Club da Bola`,
            text: fullWhatsAppMessage,
            files: [file]
          });
        } else {
          // Fallback to PNG download
          handleDownloadPNG();
        }
      }, 'image/png');
    } catch (e) {
      console.error('Share error:', e);
      handleDownloadPNG();
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 overflow-y-auto custom-scrollbar">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative z-10 w-full max-w-lg bg-slate-900 border border-slate-800 rounded-[32px] shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]"
        >
          {/* Header Bar */}
          <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/90 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="size-9 bg-red-800/20 text-red-500 rounded-xl border border-red-800/30 flex items-center justify-center">
                <Truck size={20} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-1.5">
                  Cartão de Rastreio WhatsApp
                </h3>
                <p className="text-[9.5px] font-bold text-slate-400">
                  Comprovante visual pronto para envio e download
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="size-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Modal Scrollable Content */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar flex-1">
            
            {/* ======================================================== */}
            {/* THE VISUAL CARD CONTAINER FOR HTML2CANVAS CONVERSION */}
            {/* ======================================================== */}
            <div className="flex justify-center">
              <div 
                ref={cardRef}
                className="w-full max-w-[420px] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white rounded-[28px] border border-slate-800 shadow-2xl overflow-hidden relative font-sans p-6 space-y-5"
                style={{
                  backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(153, 27, 27, 0.25), transparent 70%), radial-gradient(circle at 100% 100%, rgba(30, 41, 59, 0.4), transparent 50%)'
                }}
              >
                {/* Subtle Grid Watermark Pattern */}
                <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" />

                {/* Top Card Header */}
                <div className="flex items-start justify-between border-b border-slate-800/80 pb-4 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="size-11 rounded-2xl bg-gradient-to-br from-red-700 to-red-900 border border-red-500/40 flex items-center justify-center text-white shadow-lg shadow-red-950/50 shrink-0">
                      <Shirt size={22} className="stroke-[2.2]" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black tracking-widest text-red-500 uppercase block">
                        ERP CLUB DA BOLA
                      </span>
                      <h4 className="text-sm font-black uppercase text-white tracking-tight leading-tight">
                        Comprovante de Envio
                      </h4>
                      <p className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide">
                        Rastreamento Oficial
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-[8.5px] font-black uppercase tracking-wider shadow-xs inline-block",
                      statusInfo.bg, statusInfo.text
                    )}>
                      {statusInfo.label}
                    </span>
                    <p className="text-[8px] text-slate-400 font-mono font-bold mt-1">
                      {new Date().toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>

                {/* Product Preview & Shirt Badge */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 relative z-10 space-y-3">
                  <div className="flex items-center gap-3.5">
                    {/* Shirt Photo Thumbnail or Jersey Icon */}
                    <div className="size-20 rounded-xl bg-slate-950 border border-slate-700/80 flex items-center justify-center overflow-hidden shrink-0 shadow-inner relative group">
                      {photoUrl ? (
                        <img 
                          src={photoUrl} 
                          alt="Camisa" 
                          className="w-full h-full object-cover"
                          crossOrigin="anonymous"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-500">
                          <Shirt size={32} className="text-red-500/70" />
                          <span className="text-[7px] font-black text-slate-500 uppercase mt-0.5">Manto Oficial</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent pointer-events-none" />
                    </div>

                    {/* Products details */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1 text-[8.5px] font-black text-red-400 uppercase tracking-widest">
                        <Sparkles size={10} />
                        <span>Manto Selecionado ({itemsToDisplay.length})</span>
                      </div>
                      
                      <div className="space-y-1 max-h-20 overflow-hidden">
                        {itemsToDisplay.map((item, idx) => {
                          const gender = item.gender || products.find(p => p.id === item.productId)?.gender || 'Ambos';
                          return (
                            <div key={idx} className="text-xs font-black text-white uppercase leading-tight truncate">
                              {item.quantity}x {formatProductNameWithGender(item.productName, gender)}
                              {item.isCustomized && (
                                <span className="block text-[9px] text-amber-400 font-extrabold normal-case">
                                  ✨ Person. #{item.customNumber || ''} {item.customName || ''}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Customer & Destination Section */}
                <div className="grid grid-cols-2 gap-2.5 relative z-10">
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-2.5">
                    <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
                      <User size={10} className="text-red-500" /> Destinatário
                    </span>
                    <p className="text-xs font-black text-white uppercase truncate mt-0.5">
                      {customerName}
                    </p>
                    {customerPhone && (
                      <p className="text-[9px] font-mono font-extrabold text-slate-400 mt-0.5">
                        {customerPhone}
                      </p>
                    )}
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-2.5">
                    <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
                      <MapPin size={10} className="text-red-500" /> Logística
                    </span>
                    <p className="text-xs font-black text-emerald-400 uppercase truncate mt-0.5">
                      Correios / Int.
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 mt-0.5 uppercase">
                      Envio Direto
                    </p>
                  </div>
                </div>

                {/* Big Tracking Code & Barcode Box */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border-2 border-red-800/40 rounded-2xl p-4 text-center space-y-2 relative z-10 shadow-lg">
                  <span className="text-[8.5px] font-black uppercase tracking-widest text-slate-400 block">
                    CÓDIGO DE RASTREAMENTO OFICIAL
                  </span>

                  <div className="inline-block bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl">
                    <span className="text-lg sm:text-xl font-mono font-black tracking-widest text-amber-400 select-all">
                      {shipment.trackingCode}
                    </span>
                  </div>

                  {/* Simulated Visual Barcode */}
                  <div className="flex justify-center items-center gap-[2px] h-9 pt-1 opacity-80 px-4">
                    {[3,1,2,4,1,3,2,1,4,2,1,3,1,2,4,1,2,3,1,4,2,1,3,2,1,4,1,2,3,1,4,2].map((w, i) => (
                      <div 
                        key={i} 
                        className="bg-slate-200 h-full rounded-xs" 
                        style={{ width: `${w * 1.5}px` }} 
                      />
                    ))}
                  </div>

                  <p className="text-[8px] font-mono font-bold text-slate-500 uppercase tracking-widest pt-0.5">
                    ACOMPANHAMENTO LOGÍSTICO EM TEMPO REAL
                  </p>
                </div>

                {/* Footer Authenticity Seal */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[8px] font-bold text-slate-400 uppercase tracking-wider relative z-10">
                  <div className="flex items-center gap-1 text-emerald-400">
                    <ShieldCheck size={12} />
                    <span>Autenticidade Garantida ERP</span>
                  </div>
                  <span className="text-slate-500 font-mono">CLUB DA BOLA ⚽</span>
                </div>
              </div>
            </div>

            {/* Quick Text Message Preview Box */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-slate-400">
                <span>Mensagem de Texto Formatada:</span>
                <button
                  onClick={handleCopyMessage}
                  className="text-xs text-red-400 hover:text-red-300 font-bold flex items-center gap-1 cursor-pointer"
                >
                  {copiedText ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copiedText ? 'Copiado!' : 'Copiar Texto'}</span>
                </button>
              </div>
              <div className="text-[10px] text-slate-300 font-mono bg-slate-900/90 border border-slate-800 rounded-xl p-3 max-h-28 overflow-y-auto whitespace-pre-wrap scrollbar-thin">
                {fullWhatsAppMessage}
              </div>
            </div>

          </div>

          {/* Modal Bottom Actions Bar */}
          <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/95 flex flex-col sm:flex-row items-center gap-2.5 shrink-0">
            {/* Download PNG Button */}
            <button
              onClick={handleDownloadPNG}
              disabled={isGenerating}
              className="w-full sm:w-1/2 py-3 px-4 bg-gradient-to-r from-red-800 to-red-900 hover:from-red-700 hover:to-red-800 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-red-950/40 transition-all active:scale-95 cursor-pointer border border-red-700/50"
            >
              <Download size={16} />
              <span>{isGenerating ? 'Gerando PNG...' : 'Baixar Cartão (PNG)'}</span>
            </button>

            {/* Send WhatsApp Button */}
            <button
              onClick={handleSendWhatsApp}
              className="w-full sm:w-1/2 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all active:scale-95 cursor-pointer"
            >
              <Share2 size={16} />
              <span>Enviar WhatsApp</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
