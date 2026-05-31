import React, { useState, useEffect, useContext } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, writeBatch, orderBy, deleteDoc } from 'firebase/firestore';
import { Product, Customer, SaleItem, Variation, Sale } from '../types';
import { Search, ShoppingCart, User, Plus, Minus, Trash2, CreditCard, Banknote, QrCode, ClipboardList, Send, X, CheckCircle2, MessageCircle, FileImage, Share2, Receipt, FileText } from 'lucide-react';
import { formatCurrency, cn, cleanObject, cleanVariationName } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { SidebarContext } from '../App';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function PDV() {
  const { setIsSidebarOpen } = useContext(SidebarContext);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [activeTab, setActiveTab] = useState<'checkout' | 'prevendas'>('checkout');
  const [loadedPreSaleId, setLoadedPreSaleId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'Dinheiro' | 'Cartão' | 'Pix' | 'Fiado'>('Dinheiro');
  const [downPayment, setDownPayment] = useState<string>('');
  const [discountPerc, setDiscountPerc] = useState<string>('0');
  const [discountVal, setDiscountVal] = useState<string>('0');
  const [isFinishing, setIsFinishing] = useState(false);
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [sendWhatsAppOnFinish, setSendWhatsAppOnFinish] = useState(true);

  useEffect(() => {
    setIsSidebarOpen(false);
    return () => setIsSidebarOpen(true);
  }, [setIsSidebarOpen]);

  useEffect(() => {
    const qProd = query(collection(db, 'products'), orderBy('name', 'asc'));
    const unsubProd = onSnapshot(qProd, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });
    const qCust = query(collection(db, 'customers'), orderBy('name', 'asc'));
    const unsubCust = onSnapshot(qCust, (snapshot) => {
      setCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    });
    const qSales = query(collection(db, 'sales'), orderBy('createdAt', 'desc'));
    const unsubSales = onSnapshot(qSales, (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    });
    return () => { unsubProd(); unsubCust(); unsubSales(); };
  }, []);

  const addToCart = (product: Product, variation: Variation) => {
    if (!product.isDropshipping && variation.stock <= 0) return alert('Estoque esgotado!');
    
    const existing = cart.find(item => item.productId === product.id && item.variationId === variation.id);
    if (existing) {
      if (!product.isDropshipping && existing.quantity >= variation.stock) return alert('Limite de estoque atingido!');
      setCart(cart.map(item => 
        (item.productId === product.id && item.variationId === variation.id) 
          ? { ...item, quantity: item.quantity + 1 } 
          : item
      ));
    } else {
      const formattedVariation = cleanVariationName(
        [variation.size, variation.color].join(' / ')
      );

      setCart([...cart, {
        productId: product.id!,
        variationId: variation.id,
        name: product.name,
        variationName: formattedVariation,
        quantity: 1,
        price: product.sellingPrice || 0,
        isDropshipping: product.isDropshipping || false
      }]);
    }
  };

  const updateQuantity = (pId: string, vId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.productId === pId && item.variationId === vId) {
        const product = products.find(p => p.id === pId);
        const variation = product?.variations.find(v => v.id === vId);
        const nextQty = item.quantity + delta;
        if (nextQty <= 0) return item;
        if (product && !product.isDropshipping && variation && nextQty > variation.stock) return item;
        return { ...item, quantity: nextQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const safeFloat = (val: string | number) => {
    const f = parseFloat(val.toString().replace(',', '.'));
    return isFinite(f) ? f : 0;
  };

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const total = Math.max(0, subtotal - safeFloat(discountVal));

  const handleDiscountPercChange = (valStr: string) => {
    const val = valStr.replace(',', '.');
    setDiscountPerc(valStr);
    const p = parseFloat(val) || 0;
    const v = (subtotal * p) / 100;
    setDiscountVal(v.toFixed(2).replace('.', ','));
  };

  const handleDiscountValChange = (valStr: string) => {
    const val = valStr.replace(',', '.');
    setDiscountVal(valStr);
    const v = parseFloat(val) || 0;
    const p = subtotal > 0 ? (v * 100) / subtotal : 0;
    setDiscountPerc(p.toFixed(1).replace('.', ','));
  };
  const loadPreSale = (preSale: Sale) => {
    setCart(preSale.items);
    
    const customer = customers.find(c => c.id === preSale.customerId);
    setSelectedCustomer(customer || null);
    
    // Set discount values
    if (preSale.discount > 0) {
      setDiscountVal(preSale.discount.toString());
      const sub = preSale.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
      const perc = sub > 0 ? (preSale.discount * 100) / sub : 0;
      setDiscountPerc(perc.toFixed(1).replace('.', ','));
    } else {
      setDiscountVal('0');
      setDiscountPerc('0');
    }
    
    setPaymentMethod(preSale.paymentMethod || 'Dinheiro');
    setDownPayment(preSale.downPayment ? preSale.downPayment.toString() : '');
    
    if (preSale.createdAt) {
      try {
        const d = new Date(preSale.createdAt.seconds ? preSale.createdAt.seconds * 1000 : preSale.createdAt);
        setSaleDate(d.toISOString().split('T')[0]);
      } catch (err) {
        setSaleDate(new Date().toISOString().split('T')[0]);
      }
    }
    
    setLoadedPreSaleId(preSale.id || null);
    setActiveTab('checkout');
  };

  const deletePreSale = async (preSaleId: string) => {
    if (confirm("Tem certeza que deseja apagar esta pré-venda?")) {
      try {
        await deleteDoc(doc(db, 'sales', preSaleId));
        if (loadedPreSaleId === preSaleId) {
          setLoadedPreSaleId(null);
        }
      } catch (err) {
        console.error(err);
        alert("Erro ao excluir pré-venda.");
      }
    }
  };

  const finishSale = async (isPreSale = false) => {
    if (cart.length === 0) return;
    if (!isPreSale && paymentMethod === 'Fiado' && !selectedCustomer) {
      alert('Selecione um cliente para venda no Fiado!');
      return;
    }

    setIsFinishing(true);
    try {
      const batch = writeBatch(db);
      
      const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
      const finalDiscount = safeFloat(discountVal);
      const finalDownPayment = isPreSale ? 0 : safeFloat(downPayment);
      const saleTotal = Math.max(0, subtotal - finalDiscount);
      const debtAmount = !isPreSale && paymentMethod === 'Fiado' ? Math.max(0, saleTotal - finalDownPayment) : 0;

      // Ensure stable date
      let finalDate: Date = new Date();
      if (saleDate) {
        try {
          const [y, m, d] = saleDate.split('-').map(Number);
          finalDate = new Date(y, m - 1, d, 12, 0, 0);
          if (isNaN(finalDate.getTime())) finalDate = new Date();
        } catch (e) {
          finalDate = new Date();
        }
      }

      // 1. Create/Update Sale Record
      const saleRef = loadedPreSaleId ? doc(db, 'sales', loadedPreSaleId) : doc(collection(db, 'sales'));
      const finalStatus = isPreSale ? 'Pré-venda' : (paymentMethod === 'Fiado' && debtAmount > 0 ? 'Pendente' : 'Concluída');
      
      const saleData = {
        customerId: selectedCustomer?.id || null,
        customerName: selectedCustomer?.name || 'Consumidor Final',
        items: cart.map(item => ({
          productId: item.productId || null,
          variationId: item.variationId || null,
          name: item.name || '',
          variationName: item.variationName || '',
          quantity: item.quantity || 0,
          price: item.price || 0,
          isDropshipping: !!item.isDropshipping
        })),
        subtotal,
        discount: finalDiscount,
        total: saleTotal,
        downPayment: finalDownPayment,
        debtAmount,
        paymentMethod: isPreSale ? 'Dinheiro' : paymentMethod,
        status: finalStatus,
        createdAt: finalDate,
        systemCreatedAt: serverTimestamp(),
        customerContact: selectedCustomer?.contact || null,
        history: [{
          status: finalStatus,
          updatedAt: finalDate,
          notes: isPreSale ? 'Pré-venda gravada' : (loadedPreSaleId ? 'Pré-venda convertida em Venda' : 'Venda finalizada no PDV')
        }]
      };

      batch.set(saleRef, cleanObject(saleData));

      // ONLY for a real sale (not pre-sale):
      if (!isPreSale) {
        // 2. Update Stock (Skip for dropshipping)
        cart.forEach(item => {
          if (item.isDropshipping) return;
          
          const product = products.find(p => p.id === item.productId);
          if (product) {
            const nextVariations = product.variations.map(v => 
              v.id === item.variationId ? { ...v, stock: Math.max(0, v.stock - item.quantity) } : v
            );
            const nextTotalStock = nextVariations.reduce((acc, v) => acc + v.stock, 0);
            batch.update(doc(db, 'products', item.productId), cleanObject({
              variations: nextVariations,
              totalStock: nextTotalStock,
              updatedAt: serverTimestamp()
            }));
          }
        });

        // 3. Update Customer Debt and Transactions
        if (selectedCustomer) {
          if (paymentMethod === 'Fiado') {
            if (finalDownPayment > 0) {
              const entryTransRef = doc(collection(db, 'transactions'));
              batch.set(entryTransRef, cleanObject({
                customerId: selectedCustomer.id || null,
                amount: finalDownPayment,
                type: 'payment',
                paymentMethod: 'Dinheiro',
                saleId: saleRef.id,
                createdAt: finalDate
              }));
            }

            if (debtAmount > 0) {
              batch.update(doc(db, 'customers', selectedCustomer.id!), cleanObject({
                totalDebt: (selectedCustomer.totalDebt || 0) + debtAmount,
                updatedAt: serverTimestamp()
              }));

              const debtTransRef = doc(collection(db, 'transactions'));
              batch.set(debtTransRef, cleanObject({
                customerId: selectedCustomer.id || null,
                amount: debtAmount,
                type: 'debt',
                saleId: saleRef.id,
                createdAt: finalDate
              }));
            }
          } else {
            const paymentTransRef = doc(collection(db, 'transactions'));
            batch.set(paymentTransRef, cleanObject({
              customerId: selectedCustomer.id || null,
              amount: saleTotal,
              type: 'payment',
              paymentMethod,
              saleId: saleRef.id,
              createdAt: finalDate
            }));
          }
        } else {
          const paymentTransRef = doc(collection(db, 'transactions'));
          batch.set(paymentTransRef, cleanObject({
            customerId: 'Consumidor Final',
            amount: saleTotal,
            type: 'payment',
            paymentMethod,
            saleId: saleRef.id,
            createdAt: finalDate
          }));
        }
      }

      await batch.commit();

      const finishedSale = {
        id: saleRef.id,
        customerName: selectedCustomer?.name || 'Consumidor Final',
        customerContact: selectedCustomer?.contact || null,
        items: [...cart],
        total: saleTotal,
        downPayment: finalDownPayment,
        debtAmount: debtAmount,
        paymentMethod: isPreSale ? 'Dinheiro' : paymentMethod,
        date: finalDate,
        status: finalStatus
      };

      setLastSale(finishedSale);
      setShowSuccessModal(true);

      // Reset Form
      setCart([]);
      setSelectedCustomer(null);
      setPaymentMethod('Dinheiro');
      setDownPayment('');
      setDiscountPerc('0');
      setDiscountVal('0');
      setSaleDate(new Date().toISOString().split('T')[0]);
      setLoadedPreSaleId(null);

      // Handle Auto WhatsApp (Only for real sales)
      if (!isPreSale && sendWhatsAppOnFinish && selectedCustomer?.contact) {
        try {
          shareWhatsApp(finishedSale);
        } catch (e) {
          console.warn("WhatsApp auto-trigger blocked by browser:", e);
        }
      }
    } catch (err: any) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, 'PDV_Batch_Commit');
    } finally {
      setIsFinishing(false);
    }
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()));

  const shareWhatsApp = (saleToShare?: any) => {
    const sale = saleToShare || lastSale;
    if (!sale) return;
    
    const itemsText = sale.items.map((i: any) => {
      const cleaned = cleanVariationName(i.variationName);
      const varSuffix = cleaned ? ` (${cleaned})` : '';
      return `- ${i.name}${varSuffix} x ${i.quantity}: ${formatCurrency(i.price * i.quantity)}`;
    }).join('\n');

    const isPre = sale.status === 'Pré-venda';
    const heading = isPre ? '⚽ *ERP CLUB DA BOLA - Orçamento / Pré-venda* ⚽' : '⚽ *ERP CLUB DA BOLA - Comprovante* ⚽';
    const footer = isPre ? 'Aprovação de orçamento sujeita à disponibilidade de estoque.' : 'Obrigado por comprar no *ERP CLUB DA BOLA*!';

    const hasDiscount = sale.discount && sale.discount > 0;

    const message = `${heading}\n` +
      `-------------------------------------------\n` +
      `👤 *Cliente:* ${sale.customerName}\n` +
      `📅 *Data:* ${sale.date?.toLocaleString ? sale.date.toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR')}\n` +
      (!isPre ? `💳 *Pagamento:* ${sale.paymentMethod}\n` : '') +
      (!isPre && sale.downPayment > 0 ? `💵 *Entrada:* ${formatCurrency(sale.downPayment)}\n` : '') +
      (!isPre && sale.debtAmount > 0 ? `📝 *Pendente:* ${formatCurrency(sale.debtAmount)}\n` : '') +
      `-------------------------------------------\n` +
      `📦 *Itens:*\n${itemsText}\n` +
      `-------------------------------------------\n` +
      (hasDiscount ? `💵 *Subtotal:* ${formatCurrency(sale.subtotal || (sale.total + sale.discount))}\n` : '') +
      (hasDiscount ? `💸 *Desconto:* -${formatCurrency(sale.discount)}\n` : '') +
      `💰 *TOTAL: ${formatCurrency(sale.total)}*\n` +
      `-------------------------------------------\n` +
      `${footer}`;

    const encoded = encodeURIComponent(message);
    const phone = sale.customerContact ? sale.customerContact.replace(/\D/g, '') : '';
    let finalPhone = phone;
    
    // Add Brazil country code if missing (assumes Brazil)
    if (phone && phone.length <= 11) {
      finalPhone = '55' + phone;
    }

    try {
      window.open(`https://wa.me/${finalPhone}?text=${encoded}`, '_blank');
    } catch (err) {
      alert("Não foi possível abrir o WhatsApp automaticamente. Por favor, clique no botão de WhatsApp manualmente.");
    }
  };

  const getBudgetWhatsAppUrl = () => {
    const now = new Date();
    const validityDate = new Date();
    validityDate.setDate(now.getDate() + 7); // Valid for 7 days
    const discountValue = safeFloat(discountVal);

    const textItems = cart.map((i: any) => {
      const cleaned = cleanVariationName(i.variationName);
      const varStr = cleaned ? ` (${cleaned})` : '';
      return `- ${i.name}${varStr} x${i.quantity}: ${formatCurrency(i.price * i.quantity)}`;
    }).join('\n');

    const whatsappText = `⚽ *CLUB DA BOLA - Orçamento* ⚽\n` +
      `-------------------------------------------\n` +
      `👤 *Cliente:* ${selectedCustomer ? selectedCustomer.name : 'Consumidor Final'}\n` +
      `📅 *Data de Emissão:* ${now.toLocaleDateString('pt-BR')}\n` +
      `⏳ *Validade:* ${validityDate.toLocaleDateString('pt-BR')} (7 dias)\n` +
      `-------------------------------------------\n` +
      `📦 *Itens do Orçamento:*\n${textItems}\n` +
      `-------------------------------------------\n` +
      (discountValue > 0 ? `💵 *Subtotal:* ${formatCurrency(subtotal)}\n` : '') +
      (discountValue > 0 ? `💸 *Desconto Aplicado:* -${formatCurrency(discountValue)}\n` : '') +
      `💰 *VALOR TOTAL: ${formatCurrency(total)}*\n` +
      `-------------------------------------------\n` +
      `📞 *Contato Club da Bola:*\n` +
      `• WhatsApp: (91) 99324-9580\n\n` +
      `*Atenção:* O PDF completo e detalhado do seu orçamento foi gerado e baixado no seu dispositivo. Favor anexá-lo a esta conversa para fechar seu pedido!`;

    const encoded = encodeURIComponent(whatsappText);
    const phone = selectedCustomer?.contact ? selectedCustomer.contact.replace(/\D/g, '') : '';
    let finalPhone = phone;
    if (phone && phone.length <= 11) {
      finalPhone = '55' + phone;
    }
    return `https://wa.me/${finalPhone}?text=${encoded}`;
  };

  const openBudgetWhatsApp = () => {
    const url = getBudgetWhatsAppUrl();
    try {
      window.open(url, '_blank');
    } catch (err) {
      alert("Não foi possível redirecionar para o WhatsApp automaticamente.");
    }
  };

  const generateBudgetPDF = (isManualDownloadOnly: boolean = false) => {
    if (cart.length === 0) return alert('O carrinho está vazio!');

    const doc = new jsPDF();
    const now = new Date();
    const validityDate = new Date();
    validityDate.setDate(now.getDate() + 7); // Valid for 7 days

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
    doc.text('ERP SYSTEM • ORÇAMENTO DE PRODUTOS', 14, 25);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text(`PROPOSTA COMERCIAL / PRÉ-VENDA COMERCIAL`, 14, 32);
    doc.text(`Gerado em: ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`, 140, 32);

    // Club da Bola info section on header right or subheader
    // Let's make an organization details card
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(248, 250, 252); // slate-50
    doc.roundedRect(14, 50, 182, 38, 4, 4, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('DADOS DO DOCUMENTO & CONTATO', 20, 58);

    doc.setDrawColor(226, 232, 240);
    doc.line(20, 62, 190, 62);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);

    doc.text(`Cliente:`, 20, 68);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(selectedCustomer ? selectedCustomer.name : 'Consumidor Final', 60, 68);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Contato Cliente:`, 20, 74);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(selectedCustomer?.contact || 'S/D', 60, 74);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Emissor:`, 20, 80);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Club da Bola Sports`, 60, 80);

    // Contato Club da Bola block
    doc.setFillColor(254, 243, 199); // amber-50
    doc.setDrawColor(245, 158, 11); // amber-500
    doc.roundedRect(132, 65, 58, 15, 3, 3, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(146, 64, 14); // amber-800
    doc.text('CONTATO CLUB DA BOLA', 136, 70);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(146, 64, 14);
    doc.text('WhatsApp: (91) 99324-9580', 136, 75);

    // 3. Financial Summary card in PDF
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, 94, 182, 26, 4, 4, 'FD');

    const discountValue = safeFloat(discountVal);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('SUBTOTAL DOS ITENS', 20, 102);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(subtotal), 20, 111);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('DESCONTOS APLICADOS', 80, 102);
    doc.setFontSize(11);
    doc.setTextColor(discountValue > 0 ? 153 : 15, discountValue > 0 ? 27 : 23, discountValue > 0 ? 27 : 42);
    doc.text(`-${formatCurrency(discountValue)}`, 80, 111);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('TOTAL ESTIMADO', 140, 102);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(total), 140, 111);

    // 4. Detailed Items Table
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('LISTA DE ITENS SELECIONADOS NO ORÇAMENTO', 14, 130);

    const tableRows = cart.map((item, idx) => {
      const pIdx = idx + 1;
      const variationName = cleanVariationName(item.variationName) || 'Grade Única';
      const unitPriceStr = formatCurrency(item.price);
      const qtyStr = `${item.quantity} UN`;
      const subtotalItemStr = formatCurrency(item.price * item.quantity);

      return [pIdx, item.name, variationName, qtyStr, unitPriceStr, subtotalItemStr];
    });

    autoTable(doc, {
      startY: 135,
      head: [['#', 'Produto/SKU', 'Grade/Variação', 'Quantidade', 'Preço Unit.', 'Total Líquido']],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 8.5,
        font: 'Helvetica'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 70 },
        2: { cellWidth: 35, halign: 'center' },
        3: { halign: 'center', cellWidth: 20 },
        4: { halign: 'right', cellWidth: 22 },
        5: { halign: 'right', cellWidth: 25, fontStyle: 'bold' }
      }
    });

    // Valid conditions
    const finalY = (doc as any).lastAutoTable.finalY + 12;
    doc.setFont('Helvetica', 'oblique');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);

    doc.text(`Observações importantes:`, 14, finalY);
    doc.text(`• Proposta comercial válida até: ${validityDate.toLocaleDateString('pt-BR')}.`, 14, finalY + 5);
    doc.text(`• O presente documento não garante reserva de mercadoria física em estoque prévia à aprovação.`, 14, finalY + 10);
    doc.text(`• Club da Bola • Atendimento esportivo de excelência.`, 14, finalY + 15);

    const fileSlug = (selectedCustomer ? selectedCustomer.name : 'avulso').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
    doc.save(`orcamento-clubdabola-${fileSlug}.pdf`);

    if (!isManualDownloadOnly) {
      setShowBudgetModal(true);
    }
  };

  const [isCartVisible, setIsCartVisible] = useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col md:flex-row gap-4 md:gap-6 relative pb-6 md:pb-10"
    >
      {/* Mobile Cart Toggle Bar */}
      <div className="md:hidden sticky top-0 bg-slate-950/95 backdrop-blur-md p-3 rounded-2xl text-white shadow-xl z-[45] flex items-center justify-between border border-white/5 mx-1 mb-2">
        <div className="flex items-center gap-2">
          <div className="size-10 bg-red-800/20 rounded-xl flex items-center justify-center border border-red-800/30">
            <ShoppingCart size={20} className="text-red-500" />
          </div>
          <div>
            <p className="text-[7px] font-black uppercase tracking-widest text-white/50 leading-none mb-1 font-sans">Subtotal</p>
            <p className="text-lg font-black leading-none font-display tabular-nums tracking-tight">{formatCurrency(total)}</p>
          </div>
        </div>
        <button 
          onClick={() => setIsCartVisible(!isCartVisible)}
          className={cn(
            "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-lg",
            isCartVisible ? "bg-slate-800 text-white" : "bg-red-800 text-white shadow-red-800/20"
          )}
        >
          {isCartVisible ? 'Voltar' : 'Finalizar'}
        </button>
      </div>

      {/* Success Modal */}
      {/* ... (Success modal remains the same as it uses fixed inset-0) */}
      <AnimatePresence>
        {showSuccessModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl relative z-10 w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-8 text-center bg-red-800 text-white relative">
                <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                  <CheckCircle2 size={240} className="-translate-x-1/4 -translate-y-1/4 text-amber-500" />
                </div>
                <div className="size-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm overflow-hidden p-3 border border-white/10">
                   <CheckCircle2 size={40} className="text-amber-500" />
                </div>
                <h3 className="text-2xl font-black tracking-tight italic uppercase font-sans">Venda Finalizada!</h3>
                <p className="text-white/60 font-bold opacity-80 mt-1 uppercase text-[10px] tracking-widest">Transação processada com sucesso.</p>
              </div>

              <div className="p-8 space-y-6">
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 text-center font-sans">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Total Recebido</p>
                  <p className="text-4xl font-black text-slate-900 tracking-tighter font-display tabular-nums leading-none">{formatCurrency(lastSale?.total || 0)}</p>
                  <p className="text-[10px] font-black text-slate-500 mt-2 uppercase tracking-widest leading-none">{lastSale?.paymentMethod} • {lastSale?.customerName}</p>
                  {lastSale?.downPayment > 0 && (
                    <div className="mt-3 flex justify-center gap-4 text-[10px] font-black uppercase tracking-tight">
                       <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">Entrada: {formatCurrency(lastSale.downPayment)}</span>
                       <span className="text-red-800 bg-red-50 px-2 py-1 rounded-lg">Pendente: {formatCurrency(lastSale.debtAmount)}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => {
                      setShowSuccessModal(false);
                      setShowDetailsModal(true);
                    }}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-100 text-slate-800 rounded-2xl hover:bg-slate-200 transition-all group font-black"
                  >
                    <ClipboardList size={24} className="group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Ver Detalhes</span>
                  </button>
                  <button 
                    onClick={() => shareWhatsApp()}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-amber-50 text-amber-700 rounded-2xl hover:bg-amber-100 transition-all group font-black"
                  >
                    <MessageCircle size={24} className="group-hover:scale-110 transition-transform text-amber-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Enviar WhatsApp</span>
                  </button>
                </div>

                <button 
                  onClick={() => setShowSuccessModal(false)}
                  className="w-full py-4 bg-red-800 text-white font-black rounded-2xl uppercase tracking-widest text-xs hover:bg-black transition-all shadow-xl shadow-red-900/20"
                >
                  Continuar Vendendo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Details Modal */}
      <AnimatePresence>
        {showDetailsModal && lastSale && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowDetailsModal(false)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] shadow-2xl relative z-10 w-full max-w-lg overflow-hidden border border-slate-200"
            >
              <div className="p-8 bg-slate-950 text-white relative">
                 <button 
                   onClick={() => setShowDetailsModal(false)}
                   className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors"
                 >
                   <X size={24} />
                 </button>
                 <div className="flex items-center gap-4 mb-2">
                   <div className="size-12 bg-red-800 rounded-2xl flex items-center justify-center shadow-lg border border-white/5">
                      <Receipt size={24} className="text-white" />
                   </div>
                   <div>
                      <h3 className="text-2xl font-bold tracking-tight uppercase font-display">Detalhes da <span className="text-amber-500">Venda</span></h3>
                      <p className="text-[9px] font-black uppercase text-white/40 tracking-[0.3em]">ID: {lastSale.id}</p>
                   </div>
                 </div>
              </div>

              <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh] custom-scrollbar">
                {/* Sale Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Cliente</p>
                    <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{lastSale.customerName}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Pagamento</p>
                    <p className="text-sm font-black text-red-800 uppercase tracking-tight">{lastSale.paymentMethod}</p>
                  </div>
                </div>

                {/* Items List */}
                <div className="space-y-4">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2 border-l-2 border-amber-500">Itens do Pedido</p>
                  <div className="space-y-2">
                    {lastSale.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center p-4 bg-white rounded-3xl border border-slate-100 shadow-sm">
                         <div>
                            <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{item.name}</p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                              {cleanVariationName(item.variationName) ? `${cleanVariationName(item.variationName)} x ${item.quantity}` : `x ${item.quantity}`}
                            </p>
                         </div>
                         <p className="text-sm font-black text-red-800">{formatCurrency(item.price * item.quantity)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial Breakdown */}
                <div className="bg-slate-950 rounded-[32px] p-6 text-white space-y-3 font-sans border border-slate-900">
                  <div className="flex justify-between items-center opacity-40 text-[10px] font-black uppercase tracking-widest">
                     <span>Subtotal</span>
                     <span>{formatCurrency(lastSale.items.reduce((acc: number, i: any) => acc + (i.price * i.quantity), 0))}</span>
                  </div>
                  <div className="flex justify-between items-center opacity-40 text-[10px] font-black uppercase tracking-widest">
                     <span>Descontos</span>
                     <span>-{formatCurrency(lastSale.items.reduce((acc: number, i: any) => acc + (i.price * i.quantity), 0) - lastSale.total)}</span>
                  </div>
                  <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                     <span className="text-xs font-black uppercase tracking-[0.2em] text-amber-500">Total da Venda</span>
                     <span className="text-3xl font-bold tracking-tight">{formatCurrency(lastSale.total)}</span>
                  </div>
                  {lastSale.downPayment > 0 && (
                    <div className="pt-3 border-t border-white/5 grid grid-cols-2 gap-4">
                       <div>
                          <p className="text-[9px] font-black uppercase text-amber-500 mb-1 tracking-widest">Entrada Paga</p>
                          <p className="text-sm font-black text-white">{formatCurrency(lastSale.downPayment)}</p>
                       </div>
                       <div>
                          <p className="text-[9px] font-black uppercase text-red-800 mb-1 tracking-widest">Saldo Pendente</p>
                          <p className="text-sm font-black text-white">{formatCurrency(lastSale.debtAmount)}</p>
                       </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => shareWhatsApp()}
                    className="flex items-center justify-center gap-2 p-4 bg-amber-500 text-slate-950 rounded-2xl hover:bg-amber-600 transition-all font-black uppercase tracking-widest text-[10px] shadow-lg shadow-amber-500/20"
                  >
                    <MessageCircle size={18} />
                    WhatsApp
                  </button>
                  <button 
                    onClick={() => setShowDetailsModal(false)}
                    className="flex items-center justify-center gap-2 p-4 bg-slate-900 text-white rounded-2xl hover:bg-black transition-all font-black uppercase tracking-widest text-[10px]"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Budget Generated Modal */}
      <AnimatePresence>
        {showBudgetModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowBudgetModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl relative z-10 w-full max-w-sm overflow-hidden border border-slate-200"
            >
              <div className="p-8 text-center bg-slate-900 text-white relative">
                <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
                  <FileText size={240} className="-translate-x-1/4 -translate-y-1/4" />
                </div>
                <div className="size-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm p-3 border border-white/5">
                  <FileText size={32} className="text-amber-500" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight italic">Orçamento Pronto!</h3>
                <p className="text-white/60 font-bold opacity-80 mt-1 uppercase text-[9px] tracking-widest leading-relaxed">
                  Gerado e disponibilizado para envio e download.
                </p>
              </div>

              <div className="p-6 space-y-5">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-center font-sans">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Calculado</p>
                  <p className="text-3xl font-black text-slate-900 tracking-tighter leading-none tabular-nums font-display">{formatCurrency(total)}</p>
                  <p className="text-[9px] font-bold text-slate-500 mt-1.5 uppercase tracking-widest">{selectedCustomer ? selectedCustomer.name : 'Consumidor Final'}</p>
                </div>

                <div className="space-y-4">
                  <button 
                    onClick={() => generateBudgetPDF(true)}
                    className="w-full flex items-center justify-center gap-2.5 p-3.5 bg-slate-900 hover:bg-black text-white rounded-xl transition-all font-black uppercase tracking-widest text-[9.5px]"
                  >
                    <FileText size={16} className="text-amber-500" />
                    Baixar PDF do Orçamento
                  </button>
                  <button 
                    onClick={openBudgetWhatsApp}
                    className="w-full flex items-center justify-center gap-2.5 p-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-all font-black uppercase tracking-widest text-[9.5px] shadow-md shadow-amber-500/10"
                  >
                    <MessageCircle size={16} />
                    Enviar pelo WhatsApp
                  </button>
                </div>

                <button 
                  onClick={() => setShowBudgetModal(false)}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 font-bold rounded-xl transition-all uppercase tracking-widest text-[9px]"
                >
                  Fechar Janela
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Search & Products Grid */}
      <div className={cn(
        "flex-1 flex flex-col gap-6 overflow-hidden transition-all duration-300",
        isCartVisible ? "hidden md:flex" : "flex"
      )}>
        <div className="sticky top-0 z-20 bg-slate-50/80 backdrop-blur-md pb-4 pt-1">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-red-800 transition-colors size-6" />
            <input 
              type="text" 
              placeholder="Buscar por nome ou categoria..." 
              className="w-full pl-14 pr-6 py-4 bg-white border border-gray-100 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-red-800/20 focus:border-red-800 font-black text-sm md:text-base tracking-tight placeholder:text-slate-300 transition-all"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-4">
          {filteredProducts.map(product => (
            <div key={product.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col group hover:-translate-y-1 hover:shadow-md hover:border-red-800/30 transition-all duration-300 ease-out">
              <div className="mb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-1.5 py-0.5 bg-slate-100 text-[8px] font-black text-slate-400 rounded uppercase tracking-wider">{product.category}</span>
                  {product.gender && (
                    <span className={cn(
                      "px-1.5 py-0.5 text-[8px] font-black rounded uppercase tracking-wider",
                      product.gender === 'Masculino' ? "bg-blue-50 text-blue-600" : 
                      product.gender === 'Feminino' ? "bg-pink-50 text-pink-600" : 
                      "bg-slate-50 text-slate-400"
                    )}>
                      {product.gender === 'Ambos' ? 'UNI' : product.gender.substring(0, 3)}
                    </span>
                  )}
                </div>
                <h4 className="font-sans font-black text-slate-900 mt-1 line-clamp-1 leading-none text-xs uppercase tracking-tight">{product.name}</h4>
              </div>
              <div className="mt-auto space-y-2">
                <div className="text-xs md:text-sm font-black text-red-800 font-display tabular-nums leading-none">{formatCurrency(product.sellingPrice)}</div>
                <div className="flex flex-wrap gap-1 items-stretch justify-start">
                  {product.variations.map(v => (
                    <button 
                      key={v.id}
                      disabled={!product.isDropshipping && v.stock <= 0}
                      onClick={() => {
                        addToCart(product, v);
                      }}
                      className={cn(
                        "text-[9px] px-2 py-1.5 border rounded font-black transition-all truncate uppercase relative flex-1 min-w-[45%] text-center",
                        (!product.isDropshipping && v.stock <= 0) 
                          ? "bg-gray-50 border-gray-100 text-gray-200 cursor-not-allowed opacity-40 shadow-none scale-100" 
                          : "bg-white border-slate-200 text-slate-600 hover:border-red-800 hover:bg-red-50 hover:text-red-800 active:scale-95 shadow-sm",
                        product.isDropshipping && "border-amber-100 text-amber-600 bg-amber-50/20"
                      )}
                    >
                      {[v.size, v.color].map(x => x?.trim()).filter(x => x && x !== '' && x.toUpperCase() !== 'N/A').join(' - ')} <span className="opacity-40">{product.isDropshipping ? 'DS' : v.stock}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart & Checkout */}
      <div className={cn(
        "w-full md:w-[400px] flex flex-col gap-6 h-full transition-all duration-300",
        isCartVisible ? "flex" : "hidden md:flex"
      )}>
        <div className="bg-slate-950 text-white rounded-2xl md:rounded-[32px] p-4 md:p-6 flex flex-col h-full shadow-2xl relative overflow-hidden border border-slate-900">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <ShoppingCart size={120} />
          </div>
          
          <div className="flex items-center gap-3 mb-4 md:mb-5 shrink-0 relative">
            <div className="size-10 bg-red-800 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/20">
              <ShoppingCart size={20} />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white leading-none">
                Venda <span className="text-red-600 underline decoration-red-400 decoration-4 underline-offset-4 tracking-tight font-bold">Checkout</span>
              </h2>
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em] font-sans mt-0.5">Finalização de pedido</p>
            </div>
            <span className="ml-auto bg-white/10 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-amber-500">
              {cart.reduce((a, b) => a + b.quantity, 0)}
            </span>
          </div>

          {/* Segment Toggle */}
          <div className="grid grid-cols-2 p-1 bg-black/50 border border-white/5 rounded-2xl mb-4 shrink-0 font-sans">
            <button 
              onClick={() => setActiveTab('checkout')}
              className={cn(
                "py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                activeTab === 'checkout' ? "bg-red-800 text-white shadow-lg" : "text-white/40 hover:text-white"
              )}
            >
              Novo Carrinho
            </button>
            <button 
              onClick={() => setActiveTab('prevendas')}
              className={cn(
                "py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all relative",
                activeTab === 'prevendas' ? "bg-red-800 text-white shadow-lg" : "text-white/40 hover:text-white"
              )}
            >
              Pré-Vendas
              {sales.filter(s => s.status === 'Pré-venda').length > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[8px] font-black px-1.5 py-0.5 rounded-full animate-bounce">
                  {sales.filter(s => s.status === 'Pré-venda').length}
                </span>
              )}
            </button>
          </div>

          <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
            {activeTab === 'checkout' ? (
              <>
                {/* Scrollable Area for Cart and Fields */}
                <div className="flex-1 overflow-y-auto pr-1 -mr-1 custom-scrollbar space-y-6 pb-20">
                  {/* Loaded pre-sale warning alert */}
                  {loadedPreSaleId && (
                    <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ClipboardList size={14} className="text-amber-500 animate-pulse" />
                        <div>
                          <p className="text-[8px] font-black uppercase text-amber-500 tracking-wider">Modo Edição de Pré-venda</p>
                          <p className="text-[10px] font-bold text-slate-300 uppercase">Aprovando pedido ID: #{loadedPreSaleId.slice(-6).toUpperCase()}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          setLoadedPreSaleId(null);
                          setCart([]);
                          setSelectedCustomer(null);
                          setDiscountVal('0');
                          setDiscountPerc('0');
                        }} 
                        className="text-[8px] bg-white/15 px-2.5 py-1.5 rounded-lg hover:bg-white/20 transition-all font-black text-amber-400 uppercase tracking-widest"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                  {/* Checkout Form (Top) */}
                  <div className="space-y-4 pb-6 border-b border-white/10">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Informações da Venda</div>
                    {/* Customer Selector */}
                    <div className="relative group">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 size-4 group-focus-within:text-amber-500" />
                      <select 
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs font-black uppercase outline-none appearance-none hover:bg-white/10 focus:ring-1 focus:ring-amber-500 transition-all text-white/80"
                        value={selectedCustomer?.id || ''}
                        onChange={e => {
                          const c = customers.find(cust => cust.id === e.target.value);
                          setSelectedCustomer(c || null);
                        }}
                      >
                        <option value="" className="bg-slate-900 text-white">Consumidor Final</option>
                        {customers.map(c => <option key={c.id} value={c.id} className="bg-slate-900 text-white">{c.name}</option>)}
                      </select>
                    </div>
                    {selectedCustomer && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="px-4 py-2 bg-red-800/10 border border-red-800/20 rounded-xl flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <User size={12} className="text-red-400" />
                          <span className="text-[10px] font-black uppercase text-red-200">{selectedCustomer.name}</span>
                        </div>
                        <button onClick={() => setSelectedCustomer(null)} className="text-red-400 hover:text-white transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </motion.div>
                    )}

                    {/* Payment Methods */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: 'Dinheiro', icon: Banknote },
                        { id: 'Pix', icon: QrCode },
                        { id: 'Cartão', icon: CreditCard },
                        { id: 'Fiado', icon: ClipboardList },
                      ].map(method => (
                        <button
                          key={method.id}
                          onClick={() => setPaymentMethod(method.id as any)}
                          className={cn(
                            "flex flex-col items-center gap-1 p-2 rounded-xl transition-all border",
                            paymentMethod === method.id 
                              ? "bg-red-800 border-amber-500 text-white shadow-lg shadow-red-900/10" 
                              : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          <method.icon size={18} />
                          <span className="text-[8px] font-black uppercase tracking-tight">{method.id}</span>
                        </button>
                      ))}
                    </div>

                    {paymentMethod === 'Fiado' && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="relative group"
                      >
                        <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 size-4 group-focus-within:text-emerald-400" />
                        <input 
                          type="text"
                          inputMode="decimal"
                          placeholder="Valor de Entrada (Opcional)"
                          className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold outline-none hover:bg-white/10 focus:ring-1 focus:ring-emerald-500 transition-all text-white/80"
                          value={downPayment}
                          onChange={e => setDownPayment(e.target.value.replace(/[^0-9,.]/g, ''))}
                          onFocus={e => e.target.value === '0' ? setDownPayment('') : null}
                          onBlur={e => e.target.value === '' ? setDownPayment('') : null}
                        />
                      </motion.div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-[10px] font-black group-focus-within:text-amber-400">% Desc.</span>
                        <input 
                          type="text"
                          inputMode="decimal"
                          className="w-full bg-white/5 border border-white/10 rounded-xl pl-16 pr-4 py-2.5 text-xs font-bold outline-none hover:bg-white/10 focus:ring-1 focus:ring-amber-500 transition-all text-white/80"
                          value={discountPerc}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9,.]/g, '');
                            handleDiscountPercChange(val);
                          }}
                          onFocus={e => e.target.value === '0' ? setDiscountPerc('') : null}
                          onBlur={e => e.target.value === '' ? setDiscountPerc('0') : null}
                        />
                      </div>
                      <div className="relative group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-[10px] font-black group-focus-within:text-amber-400">R$ Desc.</span>
                        <input 
                          type="text"
                          inputMode="decimal"
                          className="w-full bg-white/5 border border-white/10 rounded-xl pl-16 pr-4 py-2.5 text-xs font-bold outline-none hover:bg-white/10 focus:ring-1 focus:ring-amber-500 transition-all text-white/80"
                          value={discountVal}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9,.]/g, '');
                            handleDiscountValChange(val);
                          }}
                          onFocus={e => e.target.value === '0' ? setDiscountVal('') : null}
                          onBlur={e => e.target.value === '' ? setDiscountVal('0') : null}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="relative group font-sans">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-[9px] font-black group-focus-within:text-white uppercase tracking-widest leading-none">Venda em:</span>
                        <input 
                          type="date"
                          className="w-full bg-white/5 border border-white/10 rounded-xl pl-24 pr-4 py-2.5 text-xs font-black outline-none hover:bg-white/10 focus:ring-1 focus:ring-red-800 transition-all text-white/90"
                          value={saleDate}
                          onChange={e => setSaleDate(e.target.value)}
                        />
                      </div>

                      <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl border border-white/10 cursor-pointer group hover:bg-white/10 transition-all" onClick={() => setSendWhatsAppOnFinish(!sendWhatsAppOnFinish)}>
                        <div className={cn(
                          "size-5 rounded flex items-center justify-center border transition-all",
                          sendWhatsAppOnFinish ? "bg-amber-500 border-amber-600 text-slate-950" : "bg-transparent border-white/20"
                        )}>
                          {sendWhatsAppOnFinish && <MessageCircle size={12} />}
                        </div>
                        <span className="text-[10px] font-black uppercase text-white/60 group-hover:text-white transition-colors tracking-widest">WhatsApp</span>
                      </div>
                    </div>
                  </div>

                  {/* Cart Items List */}
                  <div className="space-y-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Itens no Carrinho ({cart.length})</div>
                    {cart.length === 0 && (
                      <div className="py-12 flex flex-col items-center justify-center opacity-30 gap-4">
                        <div className="size-16 rounded-full border-2 border-dashed border-white flex items-center justify-center">
                          <Plus />
                        </div>
                        <p className="font-black text-sm tracking-tight uppercase">Carrinho Vazio</p>
                      </div>
                    )}
                    <AnimatePresence mode="popLayout">
                      {cart.map(item => (
                        <motion.div 
                          layout
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          key={item.variationId} 
                          className="bg-white/10 rounded-2xl p-4 border border-white/10 hover:border-red-500/50 transition-all shadow-lg group/item"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                 <p className="font-black text-xs leading-tight text-white uppercase group-hover/item:text-amber-400 transition-colors">{item.name}</p>
                                 {item.isDropshipping && (
                                   <span className="text-[7px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded italic animate-pulse">DS</span>
                                 )}
                              </div>
                              {cleanVariationName(item.variationName) && (
                                <p className="text-[8px] font-black text-white/30 mt-1 uppercase tracking-widest">{cleanVariationName(item.variationName)}</p>
                              )}
                            </div>
                            <p className="font-black text-sm ml-2 text-white tabular-nums tracking-tighter">{formatCurrency(item.price * item.quantity)}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center bg-black/40 rounded-xl p-1 border border-white/5 shadow-inner">
                              <button onClick={() => updateQuantity(item.productId, item.variationId, -1)} className="size-8 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"><Minus size={14} /></button>
                              <span className="w-10 text-center font-black text-sm text-white tabular-nums">{item.quantity}</span>
                              <button onClick={() => updateQuantity(item.productId, item.variationId, 1)} className="size-8 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"><Plus size={14} /></button>
                            </div>
                            <div className="text-[9px] font-black text-white/30 uppercase tracking-widest">Un: {formatCurrency(item.price)}</div>
                            <button 
                              onClick={() => setCart(cart.filter(c => c.variationId !== item.variationId))}
                              className="ml-auto size-9 flex items-center justify-center text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Sticky Bottom Summary */}
                <div className="mt-auto space-y-4 pt-6 border-t border-white/10 shrink-0 bg-slate-950 z-10 -mx-4 md:-mx-6 px-4 md:px-6">
                  <div className="flex flex-col gap-1 px-4 py-3 bg-white/5 rounded-2xl border border-white/5 font-display">
                    <div className="flex justify-between items-center opacity-40">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white">Subtotal</span>
                      <span className="text-sm font-black text-white tabular-nums tracking-tight">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-amber-500 uppercase tracking-widest">Total Líquido</span>
                      <span className="text-3xl font-bold tracking-tight text-white tabular-nums">{formatCurrency(total)}</span>
                    </div>
                  </div>

                  {cart.length > 0 && (
                    <button 
                      onClick={generateBudgetPDF}
                      className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 rounded-xl transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-[10px] shadow-lg shadow-amber-500/15 font-sans active:scale-95"
                    >
                      <FileText size={15} /> Gerar Orçamento PDF
                    </button>
                  )}

                  {paymentMethod === 'Fiado' && !selectedCustomer && (
                    <div className="bg-red-950/50 border border-red-800/50 p-2 rounded-xl text-center">
                      <p className="text-[9px] font-black uppercase text-red-400">Selecione um cliente para Fiado</p>
                    </div>
                  )}

                  {loadedPreSaleId ? (
                    <div className="flex flex-col gap-2">
                      <button 
                        disabled={isFinishing || cart.length === 0 || (paymentMethod === 'Fiado' && !selectedCustomer)}
                        onClick={() => finishSale(false)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-900 disabled:text-slate-700 disabled:shadow-none text-white font-black py-4 rounded-xl transition-all shadow-xl flex items-center justify-center gap-2 uppercase tracking-wider text-[10px]"
                      >
                        {isFinishing ? 'PROCESSANDO...' : 'CONVERTER EM VENDA REAL'}
                        {!isFinishing && <CheckCircle2 size={16} />}
                      </button>
                      <button 
                        disabled={isFinishing || cart.length === 0}
                        onClick={() => finishSale(true)}
                        className="w-full bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-amber-500 font-black py-3 rounded-xl transition-all flex items-center justify-center gap-2 uppercase tracking-wider text-[10px]"
                      >
                        {isFinishing ? 'PROCESSANDO...' : 'ATUALIZAR PRÉ-VENDA'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <button 
                        disabled={isFinishing || cart.length === 0 || (paymentMethod === 'Fiado' && !selectedCustomer)}
                        onClick={() => finishSale(false)}
                        className="w-full bg-red-800 hover:bg-black disabled:bg-slate-900 disabled:text-slate-700 disabled:shadow-none text-white font-black py-4 rounded-xl transition-all shadow-xl shadow-red-900/30 flex items-center justify-center gap-2 active:scale-[0.98] uppercase tracking-wider text-[10px]"
                      >
                        {isFinishing ? 'PROCESSANDO...' : 'FINALIZAR VENDA'}
                        {!isFinishing && <Send size={16} />}
                      </button>
                      <button 
                        disabled={isFinishing || cart.length === 0}
                        onClick={() => finishSale(true)}
                        className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-900 text-amber-500 border border-white/5 font-black py-3 rounded-xl transition-all flex items-center justify-center gap-2 uppercase tracking-wider text-[10px]"
                      >
                        {isFinishing ? 'PROCESSANDO...' : 'SALVAR COMO PRÉ-VENDA'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 relative">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4 px-1">Pré-vendas Ativas ({sales.filter(s => s.status === 'Pré-venda').length})</div>
                
                <div className="flex-1 overflow-y-auto pr-1 -mr-1 custom-scrollbar space-y-3 pb-6">
                  {sales.filter(s => s.status === 'Pré-venda').length === 0 ? (
                    <div className="py-24 flex flex-col items-center justify-center opacity-35 gap-4">
                      <div className="size-16 rounded-full border-2 border-dashed border-white flex items-center justify-center text-white/50 animate-pulse">
                        <ClipboardList size={28} />
                      </div>
                      <p className="font-black text-xs tracking-widest uppercase text-slate-300">Nenhuma pré-venda salva</p>
                    </div>
                  ) : (
                    sales.filter(s => s.status === 'Pré-venda').map(preSale => (
                      <div key={preSale.id} className="bg-white/5 hover:bg-white/10 p-5 rounded-2xl border border-white/5 hover:border-amber-500/30 transition-all shadow-md space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-wider text-amber-500">ID #{preSale.id?.slice(-6).toUpperCase()}</p>
                            <h4 className="font-sans font-black text-xs text-white uppercase mt-0.5 truncate max-w-[150px]">{preSale.customerName || 'Consumidor Final'}</h4>
                            <p className="text-[8px] font-medium text-white/40 mt-0.5">
                              {preSale.createdAt?.seconds 
                                ? new Date(preSale.createdAt.seconds * 1000).toLocaleDateString('pt-BR') 
                                : 'Sem data'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] font-black uppercase tracking-wider text-white/40">Total Estimado</p>
                            <p className="text-base font-black text-white italic">{formatCurrency(preSale.total)}</p>
                          </div>
                        </div>

                        <div className="border-t border-white/5 pt-2.5 space-y-1">
                          {preSale.items.map((it: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-[9px] font-bold text-white/50 uppercase">
                              <span>{it.quantity}x {it.name}</span>
                              <span>{formatCurrency(it.price * it.quantity)}</span>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2">
                          <button 
                            onClick={() => {
                              deletePreSale(preSale.id!);
                            }}
                            className="py-2 border border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all"
                          >
                            Apagar
                          </button>
                          <button 
                            onClick={() => {
                              loadPreSale(preSale);
                            }}
                            className="py-2 bg-amber-500 text-slate-950 hover:bg-amber-400 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all"
                          >
                            Carregar
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
