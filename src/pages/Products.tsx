import React, { useState, useEffect, useContext } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, writeBatch } from 'firebase/firestore';
import { Product, Variation, Sale } from '../types';
import { Plus, Search, Edit2, Trash2, Copy, Package, Box, X, Eye, FileText, Download, TrendingUp, ShoppingBag, Users, Calendar, Calculator, DollarSign, Percent, ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency, calculateMargin, calculateMarkup, cn, cleanVariationName } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { SidebarContext } from '../App';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Products() {
  const { setIsSidebarOpen } = useContext(SidebarContext);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('Todas');
  const [filterGender, setFilterGender] = useState('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Simulator States
  const [simCost, setSimCost] = useState('50');
  const [simTaxOpt, setSimTaxOpt] = useState<'historical' | 'conform' | 'import' | 'none'>('historical');
  const [simCustomMarkup, setSimCustomMarkup] = useState('1.8');
  const [simSellingPriceInput, setSimSellingPriceInput] = useState('120');

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [gender, setGender] = useState<'Masculino' | 'Feminino' | 'Ambos'>('Ambos');
  const [costPrice, setCostPrice] = useState<string>('0');
  const [sellingPrice, setSellingPrice] = useState<string>('0');
  const [minStock, setMinStock] = useState<string>('2');
  const [isDropshipping, setIsDropshipping] = useState(false);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);

  useEffect(() => {
    if (isModalOpen || historyProduct || isSimulatorOpen) {
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(true);
    }
  }, [isModalOpen, historyProduct, isSimulatorOpen, setIsSidebarOpen]);

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const qShipments = query(collection(db, 'shipments'));
    const unsubscribeShipments = onSnapshot(qShipments, (snapshot) => {
      setShipments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'shipments');
    });
    return unsubscribeShipments;
  }, []);

  useEffect(() => {
    const qSales = query(collection(db, 'sales'), orderBy('createdAt', 'desc'));
    const unsubscribeSales = onSnapshot(qSales, (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    });
    return unsubscribeSales;
  }, []);

  // Padronização automática de categorias cadastradas na base de dados para Caixa Alta (CX)
  useEffect(() => {
    if (products.length === 0) return;

    const runAutoStandardization = async () => {
      const nonStandardProducts = products.filter(p => !p.category || p.category !== p.category.toUpperCase().trim());
      if (nonStandardProducts.length === 0) return;

      try {
        const batch = writeBatch(db);
        nonStandardProducts.forEach(p => {
          const productRef = doc(db, 'products', p.id!);
          batch.update(productRef, {
            category: (p.category || 'GERAL').toUpperCase().trim(),
            updatedAt: serverTimestamp()
          });
        });
        await batch.commit();
        console.log(`[Auto-Standardization] ${nonStandardProducts.length} categorias padronizadas em Caixa Alta (CX).`);
      } catch (err) {
        console.error('Erro ao padronizar categorias automaticamente:', err);
      }
    };

    const timer = setTimeout(() => {
      runAutoStandardization();
    }, 1000);
    return () => clearTimeout(timer);
  }, [products]);

  const exportProductPDF = (product: Product, productSales: Sale[]) => {
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
    doc.text('ERP SYSTEM • RELATÓRIO FINANCEIRO E DESEMPENHO DE PRODUTO', 14, 25);

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
    doc.text(`DESEMPENHO COMERCIAL DE PRODUTO`, 14, 32);
    doc.text(`Gerado em: ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')} | Produzido por: Brener Gomes`, hasLogo ? 65 : 100, 32);

    // 2. Product Identity Section
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(248, 250, 252); // slate-50
    doc.roundedRect(14, 50, 182, 38, 4, 4, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('FICHA CADASTRAL DO PRODUTO', 20, 58);

    doc.setDrawColor(226, 232, 240);
    doc.line(20, 62, 190, 62);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);

    doc.text(`Nome do SKU:`, 20, 68);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(product.name, 60, 68);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Categoria / Gênero:`, 20, 74);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${(product.category || '').toUpperCase()} • ${product.gender || 'Ambos'}`, 60, 74);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Preço de Custo / Venda:`, 20, 80);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${formatCurrency(product.costPrice || 0)} / ${formatCurrency(product.sellingPrice || 0)}`, 60, 80);

    // Calculations of specific metrics
    const totalQty = productSales.reduce((acc, sale) => {
      const itemsMatching = (sale.items || []).filter(item => item.productId === product.id);
      return acc + itemsMatching.reduce((sub, i) => sub + (i.quantity || 0), 0);
    }, 0);

    const totalRev = productSales.reduce((acc, sale) => {
      const itemsMatching = (sale.items || []).filter(item => item.productId === product.id);
      return acc + itemsMatching.reduce((sub, i) => sub + ((i.price || product.sellingPrice) * (i.quantity || 0)), 0);
    }, 0);

    const totalCostOfGoods = totalQty * (product.costPrice || 0);
    const estProfit = totalRev - totalCostOfGoods;

    // Stock levels nested box
    doc.setFillColor(254, 243, 199); // amber-50
    doc.setDrawColor(245, 158, 11); // amber-500
    doc.roundedRect(135, 65, 55, 20, 3, 3, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(146, 64, 14); // amber-800
    doc.text('ESTOQUE FÍSICO ATUAL', 139, 71);

    doc.setFontSize(11);
    doc.setTextColor(146, 64, 14);
    doc.text(`${product.totalStock || 0} UN (Mín: ${product.minStock || 0})`, 139, 79);

    // 3. Performance Metrics Grid Panel
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, 94, 182, 32, 4, 4, 'FD');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('UNIDADES VENDIDAS', 20, 103);
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(`${totalQty} Unidades`, 20, 113);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('FATURAMENTO DIRETOR', 75, 103);
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(totalRev), 75, 113);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('LUCRO ESTIMADO', 135, 103);
    doc.setFontSize(13);
    doc.setTextColor(estProfit >= 0 ? 5 : 153, estProfit >= 0 ? 150 : 27, estProfit >= 0 ? 105 : 27); // green vs red
    doc.text(formatCurrency(estProfit), 135, 113);

    // 4. Detailed History Table
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('HISTÓRICO ACUMULADO DE VENDAS DESSE PRODUTO', 14, 141);

    const tableRows: any[][] = [];
    
    // Sort matching sales by date descending
    const sortedSales = [...productSales].sort((a, b) => {
      const dateA = a.createdAt?.seconds ? a.createdAt.seconds : 0;
      const dateB = b.createdAt?.seconds ? b.createdAt.seconds : 0;
      return dateB - dateA;
    });

    sortedSales.forEach(sale => {
      const saleDateObj = sale.createdAt?.seconds 
        ? new Date(sale.createdAt.seconds * 1000) 
        : (sale.createdAt instanceof Date ? sale.createdAt : new Date());
      const dateStr = saleDateObj.toLocaleDateString('pt-BR');
      const refCode = `#${sale.id?.slice(-6).toUpperCase()}`;
      
      const itemsMatching = (sale.items || []).filter(item => item.productId === product.id);
      
      itemsMatching.forEach(item => {
        const variationStr = cleanVariationName(item.variationName) || 'Grade Única';
        const clientStr = sale.customerName || 'Consumidor Final';
        const qtyStr = `${item.quantity || 0} UN`;
        const itemPriceStr = formatCurrency(item.price || product.sellingPrice || 0);
        const methodStr = sale.paymentMethod || 'Outro';
        const itemTotalStr = formatCurrency((item.price || product.sellingPrice || 0) * (item.quantity || 0));
        const statusStr = sale.status || 'Concluída';

        tableRows.push([
          dateStr,
          refCode,
          clientStr,
          variationStr,
          qtyStr,
          itemPriceStr,
          methodStr,
          statusStr,
          itemTotalStr
        ]);
      });
    });

    autoTable(doc, {
      startY: 146,
      head: [['Data', 'Ref Pedido', 'Cliente', 'Grade/Variação', 'Qtd', 'Preço Unit', 'Pagamento', 'Status', 'Total Item']],
      body: tableRows.length > 0 ? tableRows : [['S/D', '-', 'Nenhum registro de venda no histórico.', '-', '-', '-', '-', '-', 'R$ 0,00']],
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 7,
        font: 'Helvetica'
      },
      columnStyles: {
        2: { cellWidth: 35 }, // client name
        3: { cellWidth: 25 }, // variation
        4: { halign: 'center' },
        5: { halign: 'right' },
        7: { halign: 'center' },
        8: { halign: 'right', fontStyle: 'bold' }
      }
    });

    // Summary description under table or on new page if needed
    const finalY = (doc as any).lastAutoTable.finalY + 12;
    doc.setFont('Helvetica', 'oblique');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Este relatório reflete as auditorias de pedidos de venda registradas no banco de dados consolidado.', 14, finalY);

    const fileSlug = (product.name || 'documento').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
    doc.save(`relatorio-produto-${fileSlug}.pdf`);
  };

  const openModal = (product?: Product, isDuplicate = false) => {
    setLastAddedId(null);
    if (product) {
      setName(isDuplicate ? `${product.name} (Cópia)` : product.name);
      setCategory((product.category || '').toUpperCase().trim());
      setGender(product.gender || 'Ambos');
      setCostPrice(product.costPrice.toString());
      setSellingPrice(product.sellingPrice.toString());
      setMinStock(product.minStock.toString());
      setIsDropshipping(!!product.isDropshipping);
      setVariations(product.variations);
      setEditingProduct(isDuplicate ? null : product);
    } else {
      setName('');
      setCategory('');
      setCostPrice('0');
      setSellingPrice('0');
      setMinStock('2');
      setIsDropshipping(false);
      setVariations([]);
      setGender('Ambos');
      setEditingProduct(null);
    }
    setIsModalOpen(true);
  };

  const confirmDelete = (product: Product) => {
    setProductToDelete(product);
    setIsDeleteConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!productToDelete) return;
    try {
      await deleteDoc(doc(db, 'products', productToDelete.id!));
      setIsDeleteConfirmOpen(false);
      setProductToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `products/${productToDelete.id}`);
    }
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

        // Detect delimiter
        const firstLine = lines[0];
        const delimiter = firstLine.includes(';') ? ';' : ',';

        let startIndex = 0;
        const headerLower = firstLine.toLowerCase();
        if (headerLower.includes('nome') || headerLower.includes('produto') || headerLower.includes('categoria')) {
          startIndex = 1;
        }

        const batch = writeBatch(db);
        let count = 0;
        let skipped = 0;

        // Criar um set com nomes normalizados para comparação rápida
        const existingNames = new Set(products.map(p => (p.name || '').toLowerCase().trim()));
        const processedInThisCSV = new Set<string>();

        for (let i = startIndex; i < lines.length; i++) {
          const columns = lines[i].split(delimiter).map(c => c.trim());
          if (columns[0]) {
            // Clean up name from encoding issues
            const cleanName = columns[0].replace(/[^\w\s\u00C0-\u00FF]/gi, '');
            
            const rawName = cleanName || columns[0];
            const normalizedName = rawName.toLowerCase().trim();

            // Verificar se já existe no banco ou se está repetido no CSV
            if (existingNames.has(normalizedName) || processedInThisCSV.has(normalizedName)) {
              skipped++;
              continue;
            }

            const cPrice = parseFloat(columns[2]?.replace(',', '.') || '0') || 0;
            const sPrice = parseFloat(columns[3]?.replace(',', '.') || '0') || 0;
            const mStock = parseInt(columns[4]) || 2;
            
            const productRef = doc(collection(db, 'products'));
            batch.set(productRef, {
              name: rawName,
              category: (columns[1] || 'GERAL').toUpperCase().trim(),
              gender: (columns[6] as any) || 'Ambos',
              costPrice: cPrice,
              sellingPrice: sPrice,
              margin: calculateMargin(cPrice, sPrice),
              markup: calculateMarkup(cPrice, sPrice),
              minStock: mStock,
              totalStock: 0,
              isDropshipping: columns[5]?.toLowerCase() === 'sim' || columns[5]?.toLowerCase() === 'true',
              variations: [],
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
          alert(`ℹ️ Nenhum produto novo para importar.\n\nIgnorados: ${skipped}`);
        }
      } catch (err: any) {
        console.error(err);
        alert('Erro ao processar CSV. Use o formato: Nome; Categoria; Custo; Venda; Estoque Min');
      } finally {
        setIsImporting(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsText(file, 'ISO-8859-1');
  };

  const addVariation = () => {
    const id = Math.random().toString(36).substr(2, 9);
    setVariations([...variations, { id, size: '', color: '', stock: 0 }]);
    setLastAddedId(id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cPrice = parseFloat(costPrice) || 0;
      const sPrice = parseFloat(sellingPrice) || 0;
      const mStock = parseInt(minStock) || 0;
      const totalStock = variations.reduce((acc, v) => acc + (parseInt(v.stock?.toString() || '0') || 0), 0);
      const isShirtCategory = category.toUpperCase().trim().includes('CAMISA');
      const productData = {
        name,
        category: category.toUpperCase().trim(),
        gender,
        costPrice: cPrice,
        sellingPrice: sPrice,
        margin: calculateMargin(cPrice, sPrice),
        markup: calculateMarkup(cPrice, sPrice),
        variations: variations.map(v => ({ 
          ...v, 
          color: isShirtCategory ? '' : (v.color || ''),
          stock: parseInt(v.stock?.toString() || '0') || 0 
        })),
        totalStock,
        minStock: mStock,
        isDropshipping,
        updatedAt: serverTimestamp()
      };

      if (editingProduct) {
        try {
          await updateDoc(doc(db, 'products', editingProduct.id!), productData);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `products/${editingProduct.id}`);
        }
      } else {
        try {
          await addDoc(collection(db, 'products'), productData);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'products');
        }
      }
      setIsModalOpen(false);
      alert('Produto salvo com sucesso!');
    } catch (err: any) {
      console.error(err);
      let message = 'Erro ao salvar produto. Verifique sua conexão.';
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

  const { physicalStock, dropshipStock, physicalValue, dropshipValue, avgMargin, hasOnlyDropshipping } = React.useMemo(() => {
    let pStock = 0;
    let dStock = 0;
    let pValue = 0;
    let dValue = 0;
    let marginSum = 0;
    let isAllDropshipping = products.length > 0;

    products.forEach(p => {
      if (p.isDropshipping) {
        dStock += p.totalStock || 0;
        dValue += (p.costPrice || 0) * (p.totalStock || 0);
      } else {
        pStock += p.totalStock || 0;
        pValue += (p.costPrice || 0) * (p.totalStock || 0);
        isAllDropshipping = false;
      }
      marginSum += p.margin || 0;
    });

    return {
      physicalStock: pStock,
      dropshipStock: dStock,
      physicalValue: pValue,
      dropshipValue: dValue,
      avgMargin: marginSum / (products.length || 1),
      hasOnlyDropshipping: isAllDropshipping && products.length > 0
    };
  }, [products]);

  const sizeAnalysis = React.useMemo(() => {
    const counts: Record<string, { size: string; quantity: number; revenue: number }> = {};
    sales.forEach(sale => {
      if (sale.status === 'Pré-venda') return;
      (sale.items || []).forEach(item => {
        const cleaned = cleanVariationName(item.variationName);
        if (!cleaned) return;
        
        const mainSize = cleaned.split('/')[0].trim();
        if (!mainSize) return;
        
        if (!counts[mainSize]) {
          counts[mainSize] = { size: mainSize, quantity: 0, revenue: 0 };
        }
        counts[mainSize].quantity += item.quantity;
        counts[mainSize].revenue += (item.price * item.quantity);
      });
    });

    const list = Object.values(counts);
    list.sort((a, b) => b.quantity - a.quantity);
    
    const totalQty = list.reduce((sum, item) => sum + item.quantity, 0);
    
    let accumulated = 0;
    return list.map((item, idx) => {
      accumulated += item.quantity;
      const pct = totalQty > 0 ? (item.quantity / totalQty) : 0;
      const accPct = totalQty > 0 ? (accumulated / totalQty) : 0;
      
      let abcClass: 'A' | 'B' | 'C' = 'C';
      if (accPct <= 0.70 || idx === 0) {
        abcClass = 'A';
      } else if (accPct <= 0.90 || idx === 1) {
        abcClass = 'B';
      }
      
      return {
        ...item,
        percentage: pct * 100,
        class: abcClass
      };
    });
  }, [sales]);

  const filtered = products.filter(p => {
    const searchTerm = search.toLowerCase();
    
    // Text search
    const matchesSearch = searchTerm === 'estoque baixo' 
      ? (p.totalStock || 0) <= (p.minStock || 0) && !p.isDropshipping
      : searchTerm === 'dropshipping'
        ? p.isDropshipping
        : p.name.toLowerCase().includes(searchTerm) || p.category.toLowerCase().includes(searchTerm);

    // Category filter
    const matchesCategory = filterCategory === 'Todas' || p.category === filterCategory;

    // Gender filter
    const matchesGender = filterGender === 'Todos' || p.gender === filterGender;

    return matchesSearch && matchesCategory && matchesGender;
  });

  const groupedProducts = React.useMemo(() => {
    const groups: Record<string, Product[]> = {};
    filtered.forEach(p => {
      const cat = (p.category || 'GERAL').toUpperCase().trim();
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(p);
    });

    // Sort categories alphabetically
    const sortedCategories = Object.keys(groups).sort((a, b) => a.localeCompare(b));

    return sortedCategories.map(cat => ({
      categoryName: cat,
      productsList: groups[cat]
    }));
  }, [filtered]);

  const isCategoryExpanded = (catName: string) => {
    if (search.trim() !== '' || filterCategory !== 'Todas' || filterGender !== 'Todos') {
      return true;
    }
    return !!expandedCategories[catName];
  };

  const categories = ['Todas', ...Array.from(new Set(products.map(p => p.category))).sort()];
  const genders = ['Todos', 'Masculino', 'Feminino', 'Ambos'];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 pb-10"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 leading-none">
            Catálogo de <span className="text-red-800 underline decoration-red-200 decoration-4 underline-offset-4 tracking-tight font-bold">Produtos</span>
          </h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] font-sans mt-2">Controle de Inventário e Margens</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          <button 
            type="button"
            onClick={() => setIsSimulatorOpen(true)}
            className="bg-amber-400 hover:bg-amber-500 text-blue-950 font-black py-2.5 px-3 md:py-3 md:px-5 rounded-xl transition-all shadow-lg shadow-amber-500/10 flex items-center justify-center gap-1.5 active:scale-95 text-[10px] md:text-xs uppercase tracking-widest cursor-pointer flex-1 sm:flex-initial"
          >
            <Calculator size={14} className="text-blue-950" /> Simulador
          </button>
          <label className={cn(
            "flex items-center justify-center gap-1.5 px-3 py-2.5 md:px-5 md:py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl cursor-pointer transition-all active:scale-95 text-[10px] md:text-xs uppercase tracking-widest border border-slate-200 shadow-sm flex-1 sm:flex-initial text-center select-none",
            isImporting && "opacity-50 pointer-events-none"
          )}>
            <Box size={14} className="text-red-800" />
            <span>{isImporting ? 'Importando...' : 'Importar Produtos'}</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleCSVImport} disabled={isImporting} />
          </label>
          <button 
            onClick={() => openModal()}
            className="bg-red-800 hover:bg-black text-white font-bold py-2.5 px-3 md:py-3 md:px-6 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 active:scale-95 shadow-red-900/20 text-[10px] md:text-xs flex-1 sm:flex-initial cursor-pointer"
          >
            <Plus size={14} className="text-amber-500" />
            <span>Cadastrar Produto</span>
          </button>
        </div>
      </div>

      {products.some(p => (p.totalStock || 0) <= (p.minStock || 0) && !p.isDropshipping) && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="bg-rose-50 border border-rose-100 rounded-[32px] p-6 flex items-center gap-4 shadow-sm"
        >
          <div className="size-12 bg-rose-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rose-200 shrink-0">
            <Package size={24} className="animate-pulse" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-black text-rose-900 uppercase italic tracking-tighter">Atenção: Estoque Crítico Detectado</h4>
            <p className="text-[10px] font-bold text-rose-600/70 uppercase tracking-widest">
              Existem {products.filter(p => (p.totalStock || 0) <= (p.minStock || 0) && !p.isDropshipping).length} produtos que atingiram ou estão abaixo do limite de segurança.
            </p>
          </div>
          <button 
            onClick={() => setSearch('Estoque Baixo')} 
            className="px-6 py-3 bg-rose-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-black transition-all shadow-lg shadow-rose-900/10"
          >
            Filtrar Itens
          </button>
        </motion.div>
      )}

      <div className="flex flex-col lg:flex-row items-center justify-between gap-4 p-6 bg-white/40 backdrop-blur-md rounded-[32px] border border-white/60 shadow-xl shadow-slate-200/50 mb-4 lg:mb-6">
        <div className="flex flex-col lg:flex-row items-center gap-3 flex-1 w-full">
          <div className="flex-1 relative group w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 size-4 group-focus-within:text-red-800 transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar itens por SKU ou nome..." 
              className="w-full pl-10 pr-10 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-800 transition-all shadow-sm outline-none text-xs font-bold tracking-tight"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search.toLowerCase() === 'estoque baixo' ? (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-colors cursor-pointer"
                title="Limpar filtro"
              >
                <X size={12} />
              </button>
            ) : search ? (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Limpar busca"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>

          <div className="flex flex-row gap-2 w-full lg:w-auto">
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider outline-none focus:ring-2 focus:ring-red-800 transition-all shadow-sm w-full lg:w-44 cursor-pointer"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat === 'Todas' ? 'Todas Categorias' : cat}</option>
              ))}
            </select>
            <select
              value={filterGender}
              onChange={e => setFilterGender(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider outline-none focus:ring-2 focus:ring-red-800 transition-all shadow-sm w-full lg:w-36 cursor-pointer"
            >
              {genders.map(g => (
                <option key={g} value={g}>{g === 'Todos' ? 'Todos Gêneros' : g}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-8 px-6 border-l border-slate-200 hidden lg:flex font-sans">
           {hasOnlyDropshipping ? (
             <>
               <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Estoque Virtual (DS)</p>
                  <p className="text-2xl font-black text-slate-900 font-display tabular-nums tracking-tight leading-none">{dropshipStock} <span className="text-[10px] opacity-40">UN</span></p>
                  <p className="text-[9px] font-medium text-amber-600 uppercase tracking-tight mt-1.5">Local Físico Escaler: 0 UN</p>
               </div>
               <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Giro Potencial de Catálogo</p>
                  <p className="text-2xl font-black text-slate-900 font-display tabular-nums tracking-tight leading-none">{formatCurrency(dropshipValue)}</p>
                  <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-tight mt-1.5">Capital Real Retido: R$ 0,00</p>
               </div>
             </>
           ) : (
             <>
               <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Estoque Físico Local</p>
                  <p className="text-2xl font-black text-slate-900 font-display tabular-nums tracking-tight leading-none">{physicalStock} <span className="text-[10px] opacity-40">UN</span></p>
                  {dropshipStock > 0 && (
                    <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-tight mt-1.5">Dropshipping: {dropshipStock} UN (Virtual)</p>
                  )}
               </div>
               <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Capital Imobilizado (Físico)</p>
                  <p className="text-2xl font-black text-red-800 font-display tabular-nums tracking-tight leading-none">{formatCurrency(physicalValue)}</p>
                  {dropshipValue > 0 && (
                    <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-tight mt-1.5">Giro DS Livre: {formatCurrency(dropshipValue)}</p>
                  )}
               </div>
             </>
           )}
           <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Margem Média</p>
              <p className="text-2xl font-black text-amber-600 font-display tabular-nums tracking-tight leading-none">
                {avgMargin.toFixed(1)}%
              </p>
              <p className="text-[9px] font-medium text-slate-400 uppercase tracking-tight mt-1.5">Lucratividade de Venda</p>
           </div>
        </div>
      </div>

      {sizeAnalysis.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-[32px] p-6 sm:p-8 border border-white/5 shadow-xl relative overflow-hidden mb-6"
        >
          {/* Grid Pattern overlay */}
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none mix-blend-overlay bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
          
          <div className="relative z-10 flex flex-col xl:flex-row gap-8 items-stretch font-sans">
            {/* Left Block: Description with Smart Advice */}
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-3">
                <div className="size-10 bg-red-800 rounded-xl flex items-center justify-center text-white shadow-lg shadow-red-900/20">
                  <TrendingUp size={20} className="text-amber-500" />
                </div>
                <div>
                  <span className="text-[9px] font-black tracking-widest text-amber-500 uppercase block leading-none">Grade de Estoque Inteligente</span>
                  <h3 className="text-lg font-bold tracking-tight mt-1 uppercase font-display leading-tight">Curva ABC de Variações</h3>
                </div>
              </div>
              
              <p className="text-xs text-white/60 leading-relaxed">
                Seu caixa registrou <span className="font-bold text-white">{sizeAnalysis.length} tamanhos/grades</span> distintas vendidas. Esta ferramenta analisa a frequência de liquidez para direcionar sua compra de mercadoria, evitando imobilizar capital em grades que ficam paradas no estoque.
              </p>

              {/* Automated AI insights box */}
              {(() => {
                const classA = sizeAnalysis.filter(s => s.class === 'A').map(s => s.size);
                const classC = sizeAnalysis.filter(s => s.class === 'C').map(s => s.size);
                return (
                   <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-xs space-y-2">
                     <p className="font-bold text-amber-400 uppercase tracking-widest text-[9px] leading-none">Insight do Algoritmo</p>
                     <p className="text-white/85 leading-relaxed">
                       {classA.length > 0 ? (
                         <span>Seus tamanhos mais quentes e com maior frequência de venda são os da classe A (<span className="text-emerald-400 font-bold">{classA.join(', ')}</span>). Certifique-se de mantê-los sempre reabastecidos. </span>
                       ) : null}
                       {classC.length > 0 ? (
                         <span>Por outro lado, as grades (<span className="text-rose-400 font-semibold">{classC.join(', ')}</span>) operam com liquidez reduzida (Classe C). Adquira em baixas frações para evitar encalhar estoque.</span>
                       ) : null}
                     </p>
                   </div>
                );
              })()}
            </div>

            {/* Right Block: Interactive visual grid with Liquidity classes */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
              {sizeAnalysis.slice(0, 6).map((item) => {
                const classColors = {
                  A: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-emerald-900/10",
                  B: "bg-amber-500/10 border-amber-500/20 text-amber-400 shadow-amber-900/10",
                  C: "bg-slate-800/10 border-white/5 text-slate-400 shadow-transparent"
                };

                const adviceLabel = {
                  A: "Estocar Forte",
                  B: "Manter Moderado",
                  C: "Estoque Baixo"
                };

                return (
                  <div 
                    key={item.size}
                    className={cn(
                      "p-4 rounded-2xl border flex flex-col justify-between hover:scale-[1.02] transition-all/30 backdrop-blur-sm shadow-md",
                      classColors[item.class]
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-wider block opacity-70 leading-none">Tamanho</span>
                        <span className="text-xl font-bold font-display italic tracking-tight block mt-1">{item.size}</span>
                      </div>
                      <span className={cn(
                        "text-[8px] font-black px-2 py-1 rounded-md uppercase tracking-widest leading-none border",
                        item.class === 'A' ? "bg-emerald-500 text-slate-950 border-emerald-400" :
                        item.class === 'B' ? "bg-amber-500 text-slate-950 border-amber-400" :
                        "bg-slate-800 border-white/10 text-white"
                      )}>
                        Classe {item.class}
                      </span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                      <div>
                        <p className="text-[8px] font-bold uppercase tracking-wider opacity-60 leading-none">Vendidos</p>
                        <p className="text-xs font-mono font-black italic mt-1 tabular-nums">{item.quantity} un <span className="opacity-40 font-normal text-[9px]">({item.percentage.toFixed(1)}%)</span></p>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] font-bold uppercase tracking-wider opacity-60 leading-none">Diretriz</p>
                        <p className="text-[10px] font-black uppercase tracking-widest mt-1 italic">{adviceLabel[item.class]}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        {/* Desktop Table View */}
        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <Package size={16} className="text-red-800" />
            Catálogo de patrimônio
          </h3>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Exibindo {filtered.length} SKUs Ativos</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse hidden md:table min-w-[900px] lg:min-w-full">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Produto</th>
              <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest">Categoria</th>
              <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest text-right">Preços</th>
              <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest text-center">Grade/Estoque</th>
              <th className="px-8 py-4 text-[10px] uppercase font-black text-slate-400 tracking-widest text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {groupedProducts.map(({ categoryName, productsList }) => (
              <React.Fragment key={categoryName}>
                {/* Category Header Row */}
                <tr 
                  onClick={() => {
                    setExpandedCategories(prev => ({
                      ...prev,
                      [categoryName]: !prev[categoryName]
                    }));
                  }}
                  className="bg-slate-50/65 hover:bg-slate-100/95 cursor-pointer select-none transition-colors border-y border-slate-100"
                >
                  <td colSpan={5} className="px-8 py-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 p-0.5 hover:bg-slate-200 rounded-lg transition-colors">
                          {isCategoryExpanded(categoryName) ? <ChevronDown size={18} className="text-slate-700" /> : <ChevronRight size={18} className="text-slate-700" />}
                        </span>
                        <div className="flex items-baseline gap-2.5">
                          <span className="px-2.5 py-1 bg-slate-900 border border-slate-800 text-amber-500 text-[10px] font-black rounded-xl uppercase tracking-widest leading-none font-sans shadow-sm">
                            {categoryName}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            — {productsList.length} {productsList.length === 1 ? 'Produto cadastrado' : 'Produtos cadastrados'}
                          </span>
                        </div>
                      </div>
                      <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest opacity-65">
                        {isCategoryExpanded(categoryName) ? 'Clique para recolher ▲' : 'Clique para expandir ▼'}
                      </span>
                    </div>
                  </td>
                </tr>

                {/* Product Rows */}
                {isCategoryExpanded(categoryName) && productsList.map(product => (
                  <tr key={product.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="size-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 shadow-inner">
                          <Package size={20} />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm leading-none font-display tracking-tight">{product.name}</div>
                          <div className="flex gap-2 mt-2">
                            {product.isDropshipping && (
                              <div className="text-[8px] px-1.5 py-0.5 bg-amber-500 text-white font-bold rounded uppercase tracking-tight shadow-sm">DS</div>
                            )}
                            {product.gender && (
                              <div className={cn(
                                "text-[8px] px-1.5 py-0.5 font-bold rounded uppercase tracking-tight shadow-sm",
                                product.gender === 'Masculino' ? "bg-blue-500 text-white" : 
                                product.gender === 'Feminino' ? "bg-pink-500 text-white" : 
                                "bg-slate-500 text-white"
                              )}>
                                {product.gender}
                              </div>
                            )}
                            <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Mg: {product.margin.toFixed(0)}%</div>
                            <div className="text-[9px] text-amber-600 font-black uppercase tracking-widest">Mk: {calculateMarkup(product.costPrice, product.sellingPrice).toFixed(0)}%</div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="px-2 py-0.5 bg-slate-900 text-amber-500 text-[10px] font-black rounded uppercase tracking-widest leading-none font-sans">{product.category}</span>
                    </td>
                    <td className="px-8 py-5 text-right font-sans">
                      <div className="text-sm font-black text-slate-950 font-display tabular-nums tracking-tight italic">{formatCurrency(product.sellingPrice)}</div>
                      <div className="text-[9px] text-slate-400 font-black uppercase tabular-nums tracking-widest mt-1">Custo: {formatCurrency(product.costPrice)}</div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-1.5 font-display tabular-nums leading-none">
                          <span className={cn(
                            "text-lg font-black tracking-tighter italic",
                            (product.totalStock || 0) <= (product.minStock || 0) ? "text-red-600" : "text-slate-950"
                          )}>
                            {product.totalStock}
                          </span>
                          {(product.totalStock || 0) <= (product.minStock || 0) && (
                            <div className="size-2 bg-red-600 rounded-full animate-pulse shadow-sm" />
                          )}
                        </div>
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">
                          RESERVA DE ESTOQUE
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setHistoryProduct(product)} className="p-2.5 hover:bg-red-800 hover:text-white text-slate-900 rounded-xl transition-all bg-white shadow-sm border border-slate-100" title="Histórico de Compras">
                          <Eye size={16} />
                        </button>
                        <button onClick={() => openModal(product, true)} className="p-2.5 hover:bg-red-800 hover:text-white text-slate-900 rounded-xl transition-all bg-white shadow-sm border border-slate-100" title="Duplicar">
                          <Copy size={16} />
                        </button>
                        <button onClick={() => openModal(product)} className="p-2.5 hover:bg-red-800 hover:text-white text-slate-900 rounded-xl transition-all bg-white shadow-sm border border-slate-100" title="Editar">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => confirmDelete(product)} className="p-2.5 hover:bg-slate-950 hover:text-white text-slate-900 rounded-xl transition-all bg-white shadow-sm border border-slate-100" title="Excluir">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        </div>

        {/* Mobile List View */}
        <div className="md:hidden space-y-4 px-2 py-4">
          {groupedProducts.map(({ categoryName, productsList }) => (
            <div key={categoryName} className="bg-white rounded-[24px] border border-slate-200/60 shadow-sm overflow-hidden">
              {/* Category Header */}
              <button 
                type="button"
                onClick={() => {
                  setExpandedCategories(prev => ({
                    ...prev,
                    [categoryName]: !prev[categoryName]
                  }));
                }}
                className="w-full flex items-center justify-between p-4 bg-slate-50/70 hover:bg-slate-100/50 border-b border-slate-100 text-left outline-none"
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">
                    {isCategoryExpanded(categoryName) ? <ChevronDown size={16} className="text-slate-800" /> : <ChevronRight size={16} className="text-slate-800" />}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">{categoryName}</span>
                    <span className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">{productsList.length} {productsList.length === 1 ? 'PRODUTO' : 'PRODUTOS'}</span>
                  </div>
                </div>
              </button>

              {/* Category Products */}
              {isCategoryExpanded(categoryName) && (
                <div className="divide-y divide-slate-100">
                  {productsList.map(product => (
                    <div key={product.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="size-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                            <Package size={20} />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm leading-tight">{product.name}</h4>
                            <span className="text-[10px] text-indigo-500 font-black uppercase tracking-widest">{product.category}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-slate-900">{formatCurrency(product.sellingPrice)}</div>
                          <div className={cn(
                            "text-[10px] font-bold uppercase",
                            product.totalStock <= product.minStock ? "text-rose-500" : "text-slate-400"
                          )}>
                            Estoque: {product.totalStock}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex gap-2">
                          <div className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-500 uppercase">Mg: {product.margin.toFixed(1)}%</div>
                          <div className="text-[9px] bg-indigo-50 px-1.5 py-0.5 rounded font-bold text-indigo-500 uppercase">Mk: {calculateMarkup(product.costPrice, product.sellingPrice).toFixed(1)}%</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setHistoryProduct(product)} className="p-2 bg-slate-100 text-slate-600 rounded-lg flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-3" title="Histórico">
                            <Eye size={14} /> Histórico
                          </button>
                          <button onClick={() => openModal(product)} className="p-2 bg-slate-100 text-slate-600 rounded-lg"><Edit2 size={14} /></button>
                          <button onClick={() => confirmDelete(product)} className="p-2 bg-rose-50 text-rose-600 rounded-lg"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl relative z-10 w-full max-w-4xl overflow-hidden border border-slate-200"
            >
              <form onSubmit={handleSubmit}>
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="size-8 bg-black rounded-lg flex items-center justify-center text-amber-500 border border-amber-500/20">
                      <Box size={18} />
                    </div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 font-sans">
                      {editingProduct ? 'Configurar Produto' : 'Cadastrar Novo Item'}
                    </h3>
                  </div>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-200 rounded-lg transition-colors"><X size={20} /></button>
                </div>
                
                <div className="p-8 overflow-y-auto max-h-[85vh] md:max-h-[70vh] grid grid-cols-1 lg:grid-cols-5 gap-8">
                  <div className="lg:col-span-3 space-y-6">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                      <div className="flex items-center gap-3 flex-1">
                        <div className={cn(
                          "size-10 rounded-xl flex items-center justify-center transition-all shrink-0",
                          isDropshipping ? "bg-amber-500 text-white shadow-lg shadow-amber-200" : "bg-white text-slate-400 border border-slate-100"
                        )}>
                          <Package size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-amber-600 tracking-widest leading-none">Modalidade Dropshipping</p>
                          <p className="text-[9px] font-bold text-amber-800/60 uppercase mt-1">Envio feito diretamente pelo fornecedor</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsDropshipping(!isDropshipping)}
                        className={cn(
                          "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-center",
                          isDropshipping ? "bg-amber-500 text-white" : "bg-white text-slate-400 border border-slate-200"
                        )}
                      >
                        {isDropshipping ? 'Ativo' : 'Inativo'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Identificação</label>
                        <input 
                          required 
                          type="text" 
                          value={name} 
                          onChange={e => setName(e.target.value)}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-red-800 font-black text-sm transition-all placeholder:opacity-30"
                          placeholder="Nome do produto"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Segmento/Categoria</label>
                        <input 
                          required 
                          type="text" 
                          value={category} 
                          onChange={e => setCategory(e.target.value.toUpperCase())}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-red-800 font-black text-sm transition-all uppercase animate-fade-in"
                          placeholder="EX: TÊNIS"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Preço Custo</label>
                        <input 
                          required 
                          type="text" 
                          inputMode="decimal"
                          value={costPrice} 
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9,.]/g, '').replace(',', '.');
                            setCostPrice(val);
                          }}
                          onFocus={e => e.target.value === '0' && setCostPrice('')}
                          onBlur={e => e.target.value === '' && setCostPrice('0')}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-red-800 font-black text-sm transition-all"
                        />
                      </div>
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Preço Venda</label>
                        <input 
                          required 
                          type="text" 
                          inputMode="decimal"
                          value={sellingPrice} 
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9,.]/g, '').replace(',', '.');
                            setSellingPrice(val);
                          }}
                          onFocus={e => e.target.value === '0' && setSellingPrice('')}
                          onBlur={e => e.target.value === '' && setSellingPrice('0')}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-red-800 font-black text-sm transition-all"
                        />
                      </div>
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Perfis/Público</label>
                        <select 
                          value={gender} 
                          onChange={e => setGender(e.target.value as any)}
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-red-800 font-black text-xs sm:text-sm transition-all bg-white"
                        >
                          <option value="Masculino">Masculino</option>
                          <option value="Feminino">Feminino</option>
                          <option value="Ambos">Ambos</option>
                        </select>
                      </div>
                      <div className="space-y-1.5 col-span-1">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Estoque Mínimo</label>
                        <input 
                          type="text" 
                          inputMode="numeric"
                          value={minStock} 
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            setMinStock(val);
                          }}
                          onFocus={e => e.target.value === '0' && setMinStock('')}
                          onBlur={e => e.target.value === '' && setMinStock('0')}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-red-800 font-black text-sm transition-all"
                        />
                      </div>
                    </div>

                    <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 text-white font-sans">
                      <div className="grid grid-cols-2 sm:flex sm:gap-8 gap-4 w-full sm:w-auto">
                        <div>
                          <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1 font-sans">Margem Lucro</p>
                          <div className="text-xl sm:text-2xl font-black text-amber-500 tracking-tight">{calculateMargin(parseFloat(costPrice) || 0, parseFloat(sellingPrice) || 0).toFixed(1)}%</div>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1 font-sans">Markup (Mark-on)</p>
                          <div className="text-xl sm:text-2xl font-black text-amber-500 tracking-tight">{calculateMarkup(parseFloat(costPrice) || 0, parseFloat(sellingPrice) || 0).toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="text-left sm:text-right border-t border-slate-800 pt-3 sm:pt-0 sm:border-t-0">
                        <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1 font-sans">Lucro un.</p>
                        <p className="text-lg sm:text-xl font-black text-red-500 tracking-tight">{formatCurrency((parseFloat(sellingPrice) || 0) - (parseFloat(costPrice) || 0))}</p>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                        {category.toUpperCase().trim().includes('CAMISA') ? 'Grade Dimensional (Tamanho)' : 'Grade Dimensional / Cores'}
                      </label>
                      <button 
                        type="button" 
                        onClick={addVariation}
                        className="text-[10px] font-black text-red-800 uppercase flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                      >
                        <Plus size={14} className="text-amber-500" /> Adicionar
                      </button>
                    </div>
                    <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl overflow-y-auto max-h-[400px]">
                      {variations.length === 0 && (
                        <div className="text-center py-10 opacity-30">
                          <Plus className="mx-auto text-slate-800 mb-2" size={32} strokeWidth={1} />
                          <p className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Defina a grade do produto</p>
                        </div>
                      )}
                      {variations.map((v, i) => {
                        const isShirt = category.toUpperCase().trim().includes('CAMISA');
                        return (
                          <div key={v.id} className="grid grid-cols-12 gap-2 items-center p-2 sm:p-0 border-b sm:border-0 border-slate-100 last:border-0">
                            <div className={isShirt ? 'col-span-7' : 'col-span-3'}>
                              <input 
                                autoFocus={v.id === lastAddedId}
                                placeholder="Tamanho"
                                className="w-full text-[10px] font-black px-2 py-2 border rounded-lg border-slate-200 bg-white focus:ring-1 focus:ring-red-800 outline-none"
                                value={v.size}
                                onChange={e => {
                                  const next = [...variations];
                                  next[i].size = e.target.value;
                                  setVariations(next);
                                }}
                              />
                            </div>
                            {!isShirt && (
                              <div className="col-span-4">
                                <input 
                                  placeholder="Cor"
                                  className="w-full text-[10px] font-black px-2 py-2 border rounded-lg border-slate-200 bg-white focus:ring-1 focus:ring-red-800 outline-none"
                                  value={v.color}
                                  onChange={e => {
                                    const next = [...variations];
                                    next[i].color = e.target.value;
                                    setVariations(next);
                                  }}
                                />
                              </div>
                            )}
                            <div className={isShirt ? 'col-span-3' : 'col-span-3'}>
                              <input 
                                type="text"
                                inputMode="numeric"
                                placeholder="Est"
                                className="w-full text-[10px] font-black uppercase px-2 py-2 border rounded-lg border-slate-200 bg-white font-black text-red-800 focus:ring-1 focus:ring-red-800 outline-none"
                                value={v.stock}
                                onKeyDown={e => {
                                  if (e.key === 'Tab' && !e.shiftKey && i === variations.length - 1) {
                                    e.preventDefault();
                                    addVariation();
                                  }
                                }}
                                onChange={e => {
                                  const next = [...variations];
                                  next[i].stock = e.target.value.replace(/[^0-9]/g, '') as any;
                                  setVariations(next);
                                }}
                                onFocus={e => {
                                  if (e.target.value === '0') {
                                    const next = [...variations];
                                    next[i].stock = '' as any;
                                    setVariations(next);
                                  }
                                }}
                                onBlur={e => {
                                  if (e.target.value === '') {
                                    const next = [...variations];
                                    next[i].stock = 0;
                                    setVariations(next);
                                  }
                                }}
                              />
                            </div>
                            <div className="col-span-2 flex justify-center">
                              <button 
                                type="button"
                                onClick={() => setVariations(variations.filter((_, idx) => idx !== i))}
                                className="text-slate-300 hover:text-red-800 transition-colors p-2"
                                title="Remover variação"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 text-[11px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all tracking-widest"
                  >
                    Descartar
                  </button>
                  <button 
                    type="submit"
                    className="px-10 py-3 bg-red-800 hover:bg-black text-white text-[11px] font-black uppercase rounded-xl transition-all shadow-lg shadow-red-900/20 tracking-widest"
                  >
                    Confirmar Produto
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteConfirmOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteConfirmOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl relative z-10 w-full max-w-sm overflow-hidden border border-slate-200 p-8 text-center"
            >
              <div className="size-20 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Trash2 size={40} strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 mb-2 uppercase font-display">Excluir Produto?</h3>
              <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">
                Você está prestes a remover <span className="font-black text-slate-900">"{productToDelete?.name}"</span>. Esta ação não poderá ser desfeita.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="px-6 py-3 bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleDelete}
                  className="px-6 py-3 bg-red-800 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-black shadow-lg shadow-red-200 transition-all"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Product Purchase History Modal */}
      <AnimatePresence>
        {historyProduct && (() => {
          const productSales = sales.filter(s => (s.items || []).some(item => item.productId === historyProduct.id));
          
          const totalUnitsSold = productSales.reduce((acc, sale) => {
            const matching = (sale.items || []).filter(item => item.productId === historyProduct.id);
            return acc + matching.reduce((sum, item) => sum + (item.quantity || 0), 0);
          }, 0);

          const totalRevenue = productSales.reduce((acc, sale) => {
            const matching = (sale.items || []).filter(item => item.productId === historyProduct.id);
            return acc + matching.reduce((sum, item) => sum + ((item.price || historyProduct.sellingPrice || 0) * (item.quantity || 0)), 0);
          }, 0);

          const totalCost = totalUnitsSold * (historyProduct.costPrice || 0);
          const profit = totalRevenue - totalCost;
          const avgPrice = totalUnitsSold > 0 ? (totalRevenue / totalUnitsSold) : 0;

          // Leaderboard logic
          const buyerRankingMap: Record<string, { name: string; quantity: number; revenue: number }> = {};
          productSales.forEach(s => {
            const clientName = s.customerName || 'Consumidor Final';
            const matching = (s.items || []).filter(item => item.productId === historyProduct.id);
            const qty = matching.reduce((sum, item) => sum + (item.quantity || 0), 0);
            const rev = matching.reduce((sum, item) => sum + ((item.price || historyProduct.sellingPrice || 0) * (item.quantity || 0)), 0);
            
            if (!buyerRankingMap[clientName]) {
              buyerRankingMap[clientName] = { name: clientName, quantity: 0, revenue: 0 };
            }
            buyerRankingMap[clientName].quantity += qty;
            buyerRankingMap[clientName].revenue += rev;
          });

          const topBuyers = Object.values(buyerRankingMap).sort((a,b) => b.quantity - a.quantity).slice(0, 3);

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => setHistoryProduct(null)}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-[32px] shadow-2xl relative z-10 w-full max-w-5xl overflow-hidden border border-slate-200"
              >
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="size-8 bg-red-800 text-white rounded-lg flex items-center justify-center border border-red-900/20">
                      <ShoppingBag size={18} />
                    </div>
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 leading-none mb-1">
                        Histórico de vendas
                      </h3>
                      <p className="text-sm font-bold text-slate-900 leading-none">{historyProduct.name}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => exportProductPDF(historyProduct, productSales)}
                      className="px-4 py-2.5 bg-red-800 hover:bg-slate-950 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-red-900/10 flex items-center gap-1.5"
                      title="Emitir PDF de auditoria e performance"
                    >
                      <Download size={14} /> Exportar relatório PDF
                    </button>
                    <button 
                      onClick={() => setHistoryProduct(null)} 
                      className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                <div className="p-8 overflow-y-auto max-h-[75vh] space-y-6 md:space-y-8">
                  {/* Performance Indicators Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-1">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2 leading-none">Unidades Vendidas</span>
                      <span className="text-xl font-black text-slate-900 tracking-tight font-display italic leading-none tabular-nums">
                        {totalUnitsSold} <span className="text-xs opacity-40">UN</span>
                      </span>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2 leading-none">Receita Total Bruta</span>
                      <span className="text-xl font-black text-slate-900 tracking-tight font-display italic leading-none tabular-nums">
                        {formatCurrency(totalRevenue)}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2 leading-none">Preço Médio Praticado</span>
                      <span className="text-xl font-black text-slate-900 tracking-tight font-display italic leading-none tabular-nums">
                        {formatCurrency(avgPrice)}
                      </span>
                    </div>

                    <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-150">
                      <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block mb-2 leading-none">Margem de Lucro Bruta</span>
                      <span className={cn(
                        "text-xl font-black tracking-tight font-display italic leading-none tabular-nums",
                        profit >= 0 ? "text-emerald-700" : "text-rose-700"
                      )}>
                        {formatCurrency(profit)}
                      </span>
                    </div>
                  </div>

                  {/* Leaderboard & Category context */}
                  {topBuyers.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-2 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                        <h4 className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-4 flex items-center gap-1.5 leading-none">
                          <Users size={12} className="text-red-800" /> Maiores Clientes de Referência
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {topBuyers.map((b, idx) => (
                            <div key={idx} className="bg-white p-3.5 rounded-xl border border-slate-100 flex flex-col justify-between">
                              <div>
                                <span className="text-[10px] text-slate-400 font-bold block leading-none mb-1">Rank #{idx+1}</span>
                                <p className="font-bold text-slate-900 text-sm leading-tight line-clamp-1">{b.name}</p>
                              </div>
                              <div className="mt-4 border-t border-slate-50 pt-2 flex justify-between items-baseline">
                                <span className="text-[10px] text-slate-400 font-mono italic">{b.quantity} un</span>
                                <span className="text-xs font-black font-mono text-emerald-600">{formatCurrency(b.revenue)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex flex-col justify-between">
                        <div>
                          <h4 className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none mb-2">Desempenho no Catálogo</h4>
                          <p className="text-xs font-medium text-slate-500 leading-relaxed">
                            Este produto pertence à categoria <span className="font-black text-slate-800 tracking-wide">{(historyProduct.category || '').toUpperCase()}</span>, com markup médio de <span className="font-bold text-slate-800">{(calculateMarkup(historyProduct.costPrice, historyProduct.sellingPrice)).toFixed(0)}%</span> sobre o preço de custo.
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between text-xs">
                          <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Estoque Local:</span>
                          <span className="font-black text-slate-900 font-mono italic">{historyProduct.totalStock || 0} UN</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Chronological Sales Audit Log Table */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[9px] font-black uppercase text-slate-500 tracking-widest leading-none">
                        Transações de Venda (Auditoria de SKU)
                      </h4>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        {productSales.length} Registro(s) de Pedido
                      </span>
                    </div>

                    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                      <div className="overflow-x-auto max-h-[350px]">
                        <table className="w-full text-left border-collapse min-w-[700px]">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="px-6 py-3.5 text-[9px] uppercase font-black text-slate-400 tracking-widest">Data</th>
                              <th className="px-6 py-3.5 text-[9px] uppercase font-black text-slate-400 tracking-widest">Pedido Ref</th>
                              <th className="px-6 py-3.5 text-[9px] uppercase font-black text-slate-400 tracking-widest">Cliente</th>
                              <th className="px-6 py-3.5 text-[9px] uppercase font-black text-slate-400 tracking-widest text-center">Tamanho/Cor</th>
                              <th className="px-6 py-3.5 text-[9px] uppercase font-black text-slate-400 tracking-widest text-center">Quantidade</th>
                              <th className="px-6 py-3.5 text-[9px] uppercase font-black text-slate-400 tracking-widest text-right">Preço Unit.</th>
                              <th className="px-6 py-3.5 text-[9px] uppercase font-black text-slate-400 tracking-widest text-right">Método</th>
                              <th className="px-6 py-3.5 text-[9px] uppercase font-black text-slate-400 tracking-widest text-center">Status</th>
                              <th className="px-6 py-3.5 text-[9px] uppercase font-black text-slate-400 tracking-widest text-right">Subtotal SKU</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 text-xs">
                            {productSales.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="py-12 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px] bg-slate-50/50">
                                  Nenhum registro de venda consolidada encontrado no sistema de caixa para este produto.
                                </td>
                              </tr>
                            ) : (
                              productSales.map(sale => {
                                const saleDateObj = sale.createdAt?.seconds 
                                  ? new Date(sale.createdAt.seconds * 1000) 
                                  : (sale.createdAt instanceof Date ? sale.createdAt : new Date());
                                const dateStr = saleDateObj.toLocaleDateString('pt-BR');
                                const refCode = `#${sale.id?.slice(-6).toUpperCase()}`;
                                
                                const itemsMatching = (sale.items || []).filter(item => item.productId === historyProduct.id);
                                
                                return itemsMatching.map((item, itemIdx) => {
                                  const cleanedVar = cleanVariationName(item.variationName);
                                  return (
                                    <tr key={`${sale.id}-${itemIdx}`} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="px-6 py-4 text-slate-500 font-mono tracking-tight">{dateStr}</td>
                                      <td className="px-6 py-4 font-semibold text-red-800 font-mono">{refCode}</td>
                                      <td className="px-6 py-4 font-bold text-slate-800">{sale.customerName || 'Consumidor Final'}</td>
                                      <td className="px-6 py-4 text-center">
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-black uppercase rounded tracking-wider font-mono">
                                          {cleanedVar || 'Grade Única'}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 text-center font-black text-slate-900 font-mono italic tabular-nums">{item.quantity}</td>
                                      <td className="px-6 py-4 text-right font-mono text-slate-500 tabular-nums">{formatCurrency(item.price || historyProduct.sellingPrice || 0)}</td>
                                      <td className="px-6 py-4 text-right font-bold text-slate-500 uppercase tracking-wide text-[10px]">{sale.paymentMethod || 'Outro'}</td>
                                      <td className="px-6 py-4 text-center">
                                        <span className={cn(
                                          "px-2 py-0.5 text-[8px] font-black uppercase rounded-[6px] tracking-widest leading-none bg-slate-50 text-slate-700",
                                          sale.status === 'Concluída' ? "bg-emerald-50 text-emerald-700" :
                                          sale.status === 'Pendente' ? "bg-amber-50 text-amber-700 font-bold" :
                                          "bg-blue-50 text-blue-700"
                                        )}>
                                          {sale.status || 'Concluída'}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 text-right font-black font-mono text-slate-900 tabular-nums italic">
                                        {formatCurrency((item.price || historyProduct.sellingPrice || 0) * (item.quantity || 0))}
                                      </td>
                                    </tr>
                                  );
                                });
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                  <button 
                    onClick={() => setHistoryProduct(null)}
                    className="px-10 py-3 bg-slate-900 hover:bg-red-800 text-white text-[11px] font-black uppercase rounded-xl transition-all shadow-lg shadow-slate-900/25 tracking-widest"
                  >
                    Fechar Histórico
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Price Simulator Modal */}
      <AnimatePresence>
        {isSimulatorOpen && (() => {
          // Calculate historical metrics from shipments list
          const totalShipmentsCount = shipments.length;
          const taxedShipments = shipments.filter(s => s.hasTax);
          const taxationRate = totalShipmentsCount > 0 ? Math.round((taxedShipments.length / totalShipmentsCount) * 100) : 0;
          
          let totalRatio = 0;
          let count = 0;
          shipments.forEach(s => {
            if (s.hasTax && s.taxAmount > 0) {
              const shipValue = s.items?.reduce((acc: number, itemObj: any) => acc + ((itemObj.price || 0) * (itemObj.quantity || 1)), 0) || 0;
              if (shipValue > 0) {
                totalRatio += (s.taxAmount / shipValue);
                count++;
              }
            }
          });
          const historicalAvgTaxRatio = count > 0 ? (totalRatio / count) : 0.22; // default to 22% fallback

          const currentTaxRate = simTaxOpt === 'none' ? 0 
            : simTaxOpt === 'conform' ? 0.20 
            : simTaxOpt === 'import' ? 0.60 
            : historicalAvgTaxRatio;

          const parsedCost = parseFloat(simCost.replace(',', '.')) || 0;
          const estimatedUnitTax = parsedCost * currentTaxRate;

          // Delivery fees
          const deliveryParagominas = 8.00;
          const deliverySaoLuis = 20.00;

          // Total cost unit scenarios
          const costParaNoTax = parsedCost + deliveryParagominas;
          const costParaWithTax = parsedCost + estimatedUnitTax + deliveryParagominas;

          const costSLNoTax = parsedCost + deliverySaoLuis;
          const costSLWithTax = parsedCost + estimatedUnitTax + deliverySaoLuis;

          // Desired Selling prices under preset markup model (Multiplier)
          const markupVal = parseFloat(simCustomMarkup) || 1.8;
          const sellingParaNoTaxCustom = costParaNoTax * markupVal;
          const sellingParaWithTaxCustom = costParaWithTax * markupVal;
          const sellingSLNoTaxCustom = costSLNoTax * markupVal;
          const sellingSLWithTaxCustom = costSLWithTax * markupVal;

          // Profit Margin Calculator for custom input target selling price
          const targetSelling = parseFloat(simSellingPriceInput.replace(',', '.')) || 120;

          const marginParaNoTax = targetSelling > 0 ? ((targetSelling - costParaNoTax) / targetSelling) * 100 : 0;
          const marginParaWithTax = targetSelling > 0 ? ((targetSelling - costParaWithTax) / targetSelling) * 100 : 0;

          const marginSLNoTax = targetSelling > 0 ? ((targetSelling - costSLNoTax) / targetSelling) * 150 : 0;
          // Wait, let's fix the 150 typo -> it should be 100
          const marginSLNoTaxFixed = targetSelling > 0 ? ((targetSelling - costSLNoTax) / targetSelling) * 100 : 0;
          const marginSLWithTax = targetSelling > 0 ? ((targetSelling - costSLWithTax) / targetSelling) * 100 : 0;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => setIsSimulatorOpen(false)}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-slate-50 rounded-[32px] shadow-2xl relative z-10 w-full max-w-5xl overflow-hidden border border-slate-200/60 flex flex-col max-h-[92vh]"
              >
                {/* Header */}
                <div className="p-6 border-b border-slate-200/60 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-3">
                    <div className="size-10 bg-amber-400 text-blue-950 rounded-2xl flex items-center justify-center border border-amber-500/20 shadow-sm shadow-amber-500/10">
                      <Calculator size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                        Simulador de Precificação Inteligente
                      </h3>
                      <p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5 tracking-widest">Ajuste de Margem Real por Região & Alfândega</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setIsSimulatorOpen(false)} className="text-slate-400 hover:text-slate-650 p-2 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer select-none">
                    <X size={20} />
                  </button>
                </div>

                {/* Content Area with scroll */}
                <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar space-y-6 flex-1 text-slate-700">
                  
                  {/* Explanation Banner regarding recent API lack of updates */}
                  <div className="bg-gradient-to-r from-red-900/10 to-transparent border-l-4 border-red-800 p-4 rounded-r-2xl space-y-1">
                    <p className="text-[10px] font-black uppercase text-red-900 tracking-wider flex items-center gap-2">
                      💡 Suas Perguntas Frequentes: Por que novos códigos de rastreio não mostram eventos na API?
                    </p>
                    <p className="text-[9px] font-bold text-slate-650 leading-normal uppercase">
                      Ao postar novos códigos de importações (Dropshipping internacional), os Correios demoram de 3 a 5 dias úteis para registrar o primeiro evento no banco nacional de dados (quando o objeto chega ao país ou é transferido pelas aduanas internacionais de Shenzhen/Hong Kong).
                      <span className="block mt-1 font-extrabold text-red-850">
                        O ERP Club da Bola foi projetado de forma robusta e possui a solução "Simular Rastreio" na aba dos Correios para você testar ações internas de status no ambiente de testes antes das atualizações oficiais!
                      </span>
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column - Inputs */}
                    <div className="lg:col-span-5 space-y-6 bg-white p-6 rounded-3xl border border-slate-200/50 shadow-sm">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">📂 Variáveis e Custos de Aquisição</h4>
                      
                      {/* Cost Price */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Preço de Custo da Camisa (R$)</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm font-bold">R$</span>
                          <input 
                            type="text"
                            value={simCost}
                            onChange={(e) => setSimCost(e.target.value.replace(/[^0-9,.]/g, ''))}
                            className="w-full bg-slate-50 border border-slate-200 focus:border-red-800 font-mono font-black text-lg text-slate-905 rounded-xl p-3.5 pl-10 transition-colors focus:outline-none"
                            placeholder="0,00"
                          />
                        </div>
                      </div>

                      {/* Tax Scenario Slider/Buttons */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Ajuste de Taxa da Alfândega</label>
                          <span className="text-[9px] font-black text-red-800 bg-red-50 border border-red-100 px-2 py-0.5 rounded uppercase font-mono">
                            {Math.round(currentTaxRate * 100)}% de Imposto
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <button
                            type="button"
                            onClick={() => setSimTaxOpt('none')}
                            className={cn(
                              "p-2.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer",
                              simTaxOpt === 'none' 
                                ? "bg-slate-950 text-white border-slate-950" 
                                : "bg-slate-50 text-slate-600 border-slate-200/60 hover:bg-slate-100"
                            )}
                          >
                            Isento (0%)
                          </button>
                          <button
                            type="button"
                            onClick={() => setSimTaxOpt('conform')}
                            className={cn(
                              "p-2.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer",
                              simTaxOpt === 'conform' 
                                ? "bg-slate-950 text-white border-slate-950" 
                                : "bg-slate-50 text-slate-600 border-slate-200/60 hover:bg-slate-100"
                            )}
                          >
                            Conforme (20%)
                          </button>
                          <button
                            type="button"
                            onClick={() => setSimTaxOpt('import')}
                            className={cn(
                              "p-2.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer",
                              simTaxOpt === 'import' 
                                ? "bg-slate-950 text-white border-slate-950" 
                                : "bg-slate-50 text-slate-600 border-slate-200/60 hover:bg-slate-100"
                            )}
                          >
                            Tributado (60%)
                          </button>
                          <button
                            type="button"
                            onClick={() => setSimTaxOpt('historical')}
                            className={cn(
                              "p-2.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer",
                              simTaxOpt === 'historical' 
                                ? "bg-amber-400 text-blue-950 border-amber-500 shadow-sm" 
                                : "bg-slate-50 text-slate-600 border-slate-200/60 hover:bg-slate-100"
                            )}
                          >
                            História ERP ({(historicalAvgTaxRatio * 100).toFixed(0)}%)
                          </button>
                        </div>

                        {/* Taxation ERP statistics */}
                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/40 text-[9px] text-slate-500 font-bold space-y-1 select-none leading-relaxed">
                          <p className="uppercase text-[8px] tracking-widest text-slate-400 font-black">📊 Estatísticas Reais de Importações</p>
                          <p>• Total de Lotes Importados: <span className="text-slate-800 font-black">{totalShipmentsCount}</span></p>
                          <p>• Taxação Alfandegária: <span className="text-slate-800 font-black">{taxationRate}% de frequência</span></p>
                          <p>• Alíquota Efetiva Média: <span className="text-slate-800 font-black">{(historicalAvgTaxRatio * 100).toFixed(1)}% sobre valor declarado</span></p>
                        </div>
                      </div>

                      {/* Custom Markup Slider (Multiplicador) */}
                      <div className="space-y-2 border-t border-slate-100 pt-4">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase">
                          <span className="text-slate-400">Markup Alvo Desejado</span>
                          <span className="text-slate-805 font-mono text-xs">{markupVal.toFixed(2)}x</span>
                        </div>
                        <input 
                          type="range"
                          min="1.2"
                          max="3.0"
                          step="0.05"
                          value={simCustomMarkup}
                          onChange={(e) => setSimCustomMarkup(e.target.value)}
                          className="w-full accent-red-800 cursor-pointer"
                        />
                        <p className="text-[8px] font-bold tracking-widest text-slate-400 uppercase text-right leading-none">
                          Margem Bruta Equivalente: {(((markupVal - 1) / markupVal) * 100).toFixed(0)}%
                        </p>
                      </div>

                      {/* Custom Target Selling Price Input */}
                      <div className="space-y-1.5 border-t border-slate-100 pt-4">
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Simular Margem com Preço de Venda Próprio</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm font-bold">R$</span>
                          <input 
                            type="text"
                            value={simSellingPriceInput}
                            onChange={(e) => setSimSellingPriceInput(e.target.value.replace(/[^0-9,.]/g, ''))}
                            className="w-full bg-slate-50 border border-slate-200 focus:border-red-800 font-mono font-black text-sm text-slate-950 rounded-xl p-3 pr-4 pl-10 focus:outline-none transition-all"
                            placeholder="Ex: 120,00"
                          />
                        </div>
                      </div>

                    </div>

                    {/* Right Column - Results Comparison */}
                    <div className="lg:col-span-7 space-y-6">
                      
                      {/* Side by side Region Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        {/* Region A: Paragominas */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-200/50 shadow-sm flex flex-col justify-between space-y-4">
                          <div>
                            <div className="flex justify-between items-start border-b border-slate-100 pb-2.5">
                              <div>
                                <h4 className="text-xs font-black text-slate-900 uppercase">Região Paragominas</h4>
                                <p className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Taxa de Logística Padrão</p>
                              </div>
                              <span className="text-[10px] font-black text-blue-900 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded font-mono">
                                + R$ 8,00
                              </span>
                            </div>

                            {/* Options Cost Breakdown */}
                            <div className="mt-3.5 space-y-2">
                              {/* Scenario 1: Isento */}
                              <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100 space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Opção A: Isento Alfândega</span>
                                  <span className="text-[10px] font-bold font-mono text-slate-800">{formatCurrency(costParaNoTax)} custo total</span>
                                </div>
                                <div className="flex items-end justify-between">
                                  <div>
                                    <p className="text-[7.5px] font-bold text-slate-400 uppercase">Preço Recomendado ({markupVal}x)</p>
                                    <p className="text-sm font-extrabold text-slate-950 font-mono tracking-tight">{formatCurrency(sellingParaNoTaxCustom)}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[7.5px] font-bold text-emerald-600 uppercase">Lucro Líquido</p>
                                    <p className="text-[11px] font-black text-emerald-600 font-mono">+{formatCurrency(sellingParaNoTaxCustom - costParaNoTax)}</p>
                                  </div>
                                </div>
                              </div>

                              {/* Scenario 2: Taxed */}
                              <div className="bg-red-50/20 p-3 rounded-2xl border border-red-100/40 space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[9px] font-black text-red-800 uppercase tracking-widest">Opção B: Taxado aduana</span>
                                  <span className="text-[10px] font-bold font-mono text-slate-800">{formatCurrency(costParaWithTax)} custo total</span>
                                </div>
                                <div className="flex items-end justify-between">
                                  <div>
                                    <p className="text-[7.5px] font-bold text-slate-400 uppercase">Preço Recomendado ({markupVal}x)</p>
                                    <p className="text-sm font-extrabold text-slate-950 font-mono tracking-tight">{formatCurrency(sellingParaWithTaxCustom)}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[7.5px] font-bold text-emerald-600 uppercase">Lucro Líquido</p>
                                    <p className="text-[11px] font-black text-emerald-600 font-mono">+{formatCurrency(sellingParaWithTaxCustom - costParaWithTax)}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Custom Target Margin Output */}
                          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1.5 text-[9px] text-slate-600">
                            <p className="text-[8px] font-black uppercase text-slate-400 border-b border-slate-200/50 pb-1">💡 Desempenho em Venda de {formatCurrency(targetSelling)}</p>
                            <div className="flex justify-between">
                              <span>Sem taxa de aduana:</span>
                              <span className="font-extrabold text-slate-900 font-mono">
                                R$ { (targetSelling - costParaNoTax).toFixed(2) } ({marginParaNoTax.toFixed(0)}% margem)
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Com taxa de aduana:</span>
                              <span className="font-extrabold text-slate-900 font-mono">
                                R$ { (targetSelling - costParaWithTax).toFixed(2) } ({marginParaWithTax.toFixed(0)}% margem)
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Region B: São Luís */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-200/50 shadow-sm flex flex-col justify-between space-y-4">
                          <div>
                            <div className="flex justify-between items-start border-b border-slate-100 pb-2.5">
                              <div>
                                <h4 className="text-xs font-black text-slate-900 uppercase">Região São Luís</h4>
                                <p className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Taxa de Logística Longa</p>
                              </div>
                              <span className="text-[10px] font-black text-red-800 bg-red-50 border border-red-100 px-2 py-0.5 rounded font-mono">
                                + R$ 20,00
                              </span>
                            </div>

                            {/* Options Cost Breakdown */}
                            <div className="mt-3.5 space-y-2">
                              {/* Scenario 1: Isento */}
                              <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100 space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Opção A: Isento Alfândega</span>
                                  <span className="text-[10px] font-bold font-mono text-slate-800">{formatCurrency(costSLNoTax)} custo total</span>
                                </div>
                                <div className="flex items-end justify-between">
                                  <div>
                                    <p className="text-[7.5px] font-bold text-slate-400 uppercase">Preço Recomendado ({markupVal}x)</p>
                                    <p className="text-sm font-extrabold text-slate-950 font-mono tracking-tight">{formatCurrency(sellingSLNoTaxCustom)}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[7.5px] font-bold text-emerald-600 uppercase">Lucro Líquido</p>
                                    <p className="text-[11px] font-black text-emerald-600 font-mono">+{formatCurrency(sellingSLNoTaxCustom - costSLNoTax)}</p>
                                  </div>
                                </div>
                              </div>

                              {/* Scenario 2: Taxed */}
                              <div className="bg-red-50/20 p-3 rounded-2xl border border-red-100/40 space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[9px] font-black text-red-800 uppercase tracking-widest">Opção B: Taxado aduana</span>
                                  <span className="text-[10px] font-bold font-mono text-slate-800">{formatCurrency(costSLWithTax)} custo total</span>
                                </div>
                                <div className="flex items-end justify-between">
                                  <div>
                                    <p className="text-[7.5px] font-bold text-slate-400 uppercase">Preço Recomendado ({markupVal}x)</p>
                                    <p className="text-sm font-extrabold text-slate-950 font-mono tracking-tight">{formatCurrency(sellingSLWithTaxCustom)}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[7.5px] font-bold text-emerald-600 uppercase">Lucro Líquido</p>
                                    <p className="text-[11px] font-black text-emerald-600 font-mono">+{formatCurrency(sellingSLWithTaxCustom - costSLWithTax)}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Custom Target Margin Output */}
                          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1.5 text-[9px] text-slate-655">
                            <p className="text-[8px] font-black uppercase text-slate-400 border-b border-slate-200/50 pb-1">💡 Desempenho em Venda de {formatCurrency(targetSelling)}</p>
                            <div className="flex justify-between">
                              <span>Sem taxa de aduana:</span>
                              <span className="font-extrabold text-slate-900 font-mono">
                                R$ { (targetSelling - costSLNoTax).toFixed(2) } ({marginSLNoTaxFixed.toFixed(0)}% margem)
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Com taxa de aduana:</span>
                              <span className="font-extrabold text-slate-900 font-mono">
                                R$ { (targetSelling - costSLWithTax).toFixed(2) } ({marginSLWithTax.toFixed(0)}% margem)
                              </span>
                            </div>
                          </div>
                        </div>

                      </div>

                      {/* Summary Table Suggestion Matrix */}
                      <div className="bg-white p-5 rounded-3xl border border-slate-200/50 shadow-sm space-y-3.5">
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                          <Percent size={15} className="text-red-800" />
                          <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-900">🎯 Matriz Completa de Venda Sugerida por Margens Alvo</h4>
                        </div>
                        
                        <div className="overflow-x-auto">
                          <table className="w-full text-[9px] text-left select-none text-slate-600">
                            <thead>
                              <tr className="border-b border-slate-100 text-slate-400 uppercase font-black tracking-wider text-[8px]">
                                <th className="pb-2">Região + Cenário</th>
                                <th className="pb-2 text-center text-rose-800">Custo Base</th>
                                <th className="pb-2 text-right">M. Conservadora (35%)</th>
                                <th className="pb-2 text-right">M. Recomendada (50%)</th>
                                <th className="pb-2 text-right text-emerald-800">M. Premium (60%)</th>
                              </tr>
                            </thead>
                            <tbody className="font-mono divide-y divide-slate-100 font-bold">
                              {/* Row 1: Paragominas Isento */}
                              <tr className="hover:bg-slate-50/50">
                                <td className="py-2.5 font-sans">Paragominas (Isento)</td>
                                <td className="py-2.5 text-center">{formatCurrency(costParaNoTax)}</td>
                                <td className="py-2.5 text-right font-black text-slate-800">{formatCurrency(costParaNoTax / 0.65)}</td>
                                <td className="py-2.5 text-right font-black text-slate-800">{formatCurrency(costParaNoTax / 0.50)}</td>
                                <td className="py-2.5 text-right font-extrabold text-emerald-800">{formatCurrency(costParaNoTax / 0.40)}</td>
                              </tr>
                              {/* Row 2: Paragominas Taxado */}
                              <tr className="hover:bg-slate-50/50">
                                <td className="py-2.5 font-sans">Paragominas (Taxado)</td>
                                <td className="py-2.5 text-center">{formatCurrency(costParaWithTax)}</td>
                                <td className="py-2.5 text-right font-black text-slate-800">{formatCurrency(costParaWithTax / 0.65)}</td>
                                <td className="py-2.5 text-right font-black text-slate-800">{formatCurrency(costParaWithTax / 0.50)}</td>
                                <td className="py-2.5 text-right font-extrabold text-emerald-805">{formatCurrency(costParaWithTax / 0.40)}</td>
                              </tr>
                              {/* Row 3: São Luís Isento */}
                              <tr className="hover:bg-slate-50/50">
                                <td className="py-2.5 font-sans">São Luís (Isento)</td>
                                <td className="py-2.5 text-center">{formatCurrency(costSLNoTax)}</td>
                                <td className="py-2.5 text-right font-black text-slate-800">{formatCurrency(costSLNoTax / 0.65)}</td>
                                <td className="py-2.5 text-right font-black text-slate-800">{formatCurrency(costSLNoTax / 0.50)}</td>
                                <td className="py-2.5 text-right font-extrabold text-emerald-800">{formatCurrency(costSLNoTax / 0.40)}</td>
                              </tr>
                              {/* Row 4: São Luís Taxado */}
                              <tr className="hover:bg-slate-50/50">
                                <td className="py-2.5 font-sans">São Luís (Taxado)</td>
                                <td className="py-2.5 text-center">{formatCurrency(costSLWithTax)}</td>
                                <td className="py-2.5 text-right font-black text-slate-800">{formatCurrency(costSLWithTax / 0.65)}</td>
                                <td className="py-2.5 text-right font-black text-slate-800">{formatCurrency(costSLWithTax / 0.50)}</td>
                                <td className="py-2.5 text-right font-extrabold text-emerald-800">{formatCurrency(costSLWithTax / 0.40)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                    </div>
                  </div>

                </div>

                {/* Footer Modal Actions */}
                <div className="p-6 bg-white border-t border-slate-200/60 flex justify-end gap-3 rounded-b-[32px]">
                  <button 
                    type="button"
                    onClick={() => {
                      // Pre-fill the standard cost price inside the Deploy Form with the simulation cost!
                      setCostPrice(simCost);
                      setIsSimulatorOpen(false);
                      openModal(); // Open product catalog deployment form
                    }}
                    className="px-6 py-2.5 text-[10px] font-black uppercase text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all tracking-widest flex items-center gap-2 cursor-pointer"
                  >
                    🚀 Aplicar no Cadastro de SKU
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsSimulatorOpen(false)}
                    className="px-10 py-3 bg-slate-900 hover:bg-red-800 text-white text-[11px] font-black uppercase rounded-xl transition-all shadow-lg shadow-slate-900/25 tracking-widest cursor-pointer select-none"
                  >
                    Fechar Simulador
                  </button>
                </div>

              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </motion.div>
  );
}
