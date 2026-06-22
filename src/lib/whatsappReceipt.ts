import { formatCurrency, formatProductNameWithGender } from './utils';
import { generatePixPayload } from '../types';

export function getWhatsAppReceiptText(sale: any, products: any[]) {
  const isPre = sale.status === 'Pré-venda';
  const heading = isPre ? '⚽ *ERP CLUB DA BOLA - Orçamento / Pré-venda* ⚽' : '⚽ *ERP CLUB DA BOLA - Comprovante* ⚽';
  const footer = isPre ? 'Aprovação de orçamento sujeita à disponibilidade de estoque.' : 'Obrigado por comprar no *ERP CLUB DA BOLA*!';

  const hasDiscount = sale.discount && sale.discount > 0;
  const subtotal = sale.subtotal || ((sale.total || 0) + (sale.discount || 0));
  const discountPercent = subtotal > 0 ? Math.round((sale.discount / subtotal) * 100) : 0;

  const displayDateStr = sale.createdAt?.seconds 
    ? new Date(sale.createdAt.seconds * 1000).toLocaleString('pt-BR')
    : (sale.createdAt ? new Date(sale.createdAt).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR'));

  const itemsText = sale.items.map((i: any) => {
    const itemGender = i.gender || products.find(p => p.id === i.productId || p.name === i.name)?.gender || 'Ambos';
    let row = `- ${formatProductNameWithGender(i.name || i.productName, itemGender)} [${i.variationName || i.variation || 'Única'}] x ${i.quantity}: ${formatCurrency(i.price * i.quantity)}`;
    if (i.isCustomized && i.customName) {
      row += `\n  └ 👕 Personalizado: NOME: "${i.customName}" | Nº: ${i.customNumber || 'S/N'}`;
    }
    return row;
  }).join('\n');

  // Determine the total label
  let totalLabel = 'A PAGAR';
  if (!isPre) {
    if (sale.paymentMethod === 'Fiado') {
      totalLabel = 'A PAGAR';
    } else {
      totalLabel = 'VALOR PAGO';
    }
  }

  const message = `${heading}\n` +
    `-------------------------------------------\n` +
    `👤 *Cliente:* ${sale.customerName || 'Cliente'}\n` +
    `📅 *Data:* ${displayDateStr}\n` +
    (!isPre ? `💳 *Pagamento:* ${sale.paymentMethod || 'Dinheiro'}\n` : '') +
    (!isPre && sale.downPayment > 0 ? `💵 *Entrada:* ${formatCurrency(sale.downPayment)}\n` : '') +
    (!isPre && sale.debtAmount > 0 ? `📝 *Pendente:* ${formatCurrency(sale.debtAmount)}\n` : '') +
    `-------------------------------------------\n` +
    `📦 *Itens:*\n${itemsText}\n` +
    `-------------------------------------------\n` +
    (hasDiscount ? `💵 *Subtotal:* ${formatCurrency(subtotal)}\n` : '') +
    (hasDiscount ? `💸 *Desconto Concedido:* -${formatCurrency(sale.discount)} (${discountPercent}% de desconto!)\n` : '') +
    (sale.appliedBalance && sale.appliedBalance > 0 ? `🟩 *Saldo Utilizado:* -${formatCurrency(sale.appliedBalance)}\n` : '') +
    `💰 *${totalLabel}: ${formatCurrency(sale.total - (sale.appliedBalance || 0))}*\n` +
    `-------------------------------------------\n` +
    `_Produzido por: Brener Gomes_\n` +
    `${footer}`;

  const hasPixPayment = !isPre && (sale.paymentMethod === 'Fiado' || sale.paymentMethod === 'Pix');
  const pixAmount = sale.debtAmount || sale.total;

  const pixSection = hasPixPayment ? (
    `-------------------------------------------\n` +
    `💳 *DADOS PARA PAGAMENTO VIA PIX:*\n` +
    `• Banco: *Nubank*\n` +
    `• Beneficiário: *Brener Gomes*\n` +
    `• Chave Pix Celular: \`91993249580\`\n` +
    `• Valor: *${formatCurrency(pixAmount)}*\n`
  ) : '';

  const baseRoute = (import.meta as any).env?.BASE_URL || '/';
  const cleanBase = baseRoute.endsWith('/') ? baseRoute : baseRoute + '/';
  const receiptLink = `${window.location.origin}${cleanBase}?receipt=${sale.id || ''}`;
  const hasCustomization = (sale.items || []).some((it: any) => it.isCustomized);
  const receiptSection = (sale.id && hasCustomization) ? (
    `-------------------------------------------\n` +
    `🔗 *MANTO INTERATIVO ONLINE (Novidade):*\n` +
    (isPre 
      ? `Acompanhe a arte do seu manto personalizado e visualize os detalhes do seu orçamento em tempo real:\n`
      : `Acompanhe a arte do seu manto personalizado de forma interativa, confetes de pagamento e rastreio de logística ao vivo:\n`) +
    `👉 ${receiptLink}\n`
  ) : '';

  // Merge components
  const finalMessage = message.replace(`_Produzido por: Brener Gomes_\n${footer}`, receiptSection + pixSection + `-------------------------------------------\n` + footer + `\n\n_Produzido por: Brener Gomes_`);
  return finalMessage;
}

export function shareWhatsAppReceipt(sale: any, products: any[], backupPhone?: string) {
  if (!sale) return;
  const messageText = getWhatsAppReceiptText(sale, products);
  const encoded = encodeURIComponent(messageText);
  let phone = sale.customerContact || sale.customerWhatsapp || backupPhone || '';
  phone = phone.replace(/\D/g, '');
  let finalPhone = phone;

  if (phone && phone.length <= 11) {
    if (phone.length === 11 || phone.length === 10) {
      finalPhone = '55' + phone;
    }
  }

  try {
    window.open(`https://wa.me/${finalPhone}?text=${encoded}`, '_blank');
  } catch (err) {
    alert("Não foi possível abrir o WhatsApp automaticamente. Por favor, clique no botão de WhatsApp manualmente.");
  }
}
