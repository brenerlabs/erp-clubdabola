import React, { useState, useEffect, useRef, useContext } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, setDoc, getDoc, orderBy } from 'firebase/firestore';
import { Customer, Sale, CustomerPhoto } from '../types';
import { Plus, Search, Trash2, Camera, Upload, Image as ImageIcon, Sparkles, X, Settings, Check, HelpCircle, FileImage, Copy, Lightbulb, TrendingUp } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { SidebarContext } from '../App';

// Utility to resize images on-the-fly using HTML5 Canvas to keep Firestore payloads lightweight
export function resizeImage(file: File, maxWidth: number, maxHeight: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const image = new Image();
      image.onload = () => {
        let width = image.width;
        let height = image.height;
        
        // Calculate aspect ratio bounds
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(readerEvent.target?.result as string);
          return;
        }

        // Enable ultra high-quality smoothing and rendering for maximum sharpness
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(image, 0, 0, width, height);

        // Preserve original quality/transparency for PNGs, use high quality factor for JPEGs
        const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
        if (isPng) {
          const dataUrl = canvas.toDataURL('image/png');
          resolve(dataUrl);
        } else {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.95); // High sharpness (95%)
          resolve(dataUrl);
        }
      };
      image.onerror = (err) => reject(err);
      image.src = readerEvent.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

export default function Mural() {
  const { setIsSidebarOpen } = useContext(SidebarContext);
  const [activeSubTab, setActiveSubTab] = useState<'photos' | 'logo'>('photos');

  // Customer Photos state
  const [photos, setPhotos] = useState<CustomerPhoto[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  // New photo modal state
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [photoScale, setPhotoScale] = useState<number>(1.0);
  const [photoOffsetX, setPhotoOffsetX] = useState<number>(0);
  const [photoOffsetY, setPhotoOffsetY] = useState<number>(0);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [photoDescription, setPhotoDescription] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // States & Refs for real-time dragging (align/frame) on the feed cards and modal
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isDraggingModalPhoto, setIsDraggingModalPhoto] = useState(false);
  const [localOffsets, setLocalOffsets] = useState<{ [id: string]: { x: number; y: number } }>({});
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Social Proof Insights panel states
  const [showInsights, setShowInsights] = useState(false);
  const [insightName, setInsightName] = useState('Campeão');
  const [insightVoucher, setInsightVoucher] = useState('DESCONTO10');
  const [isCopied, setIsCopied] = useState(false);

  // Settings State
  const [logoFile, setLogoFile] = useState<string | null>(null);
  const [logoScale, setLogoScale] = useState<number>(1.0);
  const [isSavingLogo, setIsSavingLogo] = useState(false);
  const [logoSuccessMsg, setLogoSuccessMsg] = useState(false);

  useEffect(() => {
    if (isPhotoModalOpen) {
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(true);
    }
  }, [isPhotoModalOpen, setIsSidebarOpen]);

  // Read data on snapshot
  useEffect(() => {
    // Read photos
    const qPhotos = query(collection(db, 'customer_photos'), orderBy('createdAt', 'desc'));
    const unsubPhotos = onSnapshot(qPhotos, (snapshot) => {
      setPhotos(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CustomerPhoto)));
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    // Read customers
    const qCust = query(collection(db, 'customers'), orderBy('name', 'asc'));
    const unsubCust = onSnapshot(qCust, (snapshot) => {
      setCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    });

    // Read sales
    const qSales = query(collection(db, 'sales'), orderBy('createdAt', 'desc'));
    const unsubSales = onSnapshot(qSales, (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    });

    // Read saved logo
    const getLogo = async () => {
      try {
        const docRef = doc(db, 'settings', 'appearance');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setLogoFile(docSnap.data().logoUrl || null);
          setLogoScale(docSnap.data().logoScale ?? 1.0);
        }
      } catch (err) {
        console.error("Error reading logo configuration", err);
      }
    };
    getLogo();

    return () => {
      unsubPhotos();
      unsubCust();
      unsubSales();
    };
  }, []);

  // Relative insights metrics calculations
  const totalSalesCount = sales.length;
  const salesWithPhotosCount = photos.filter(p => p.saleId).length;
  const socialProofRatio = totalSalesCount > 0 ? ((salesWithPhotosCount / totalSalesCount) * 100).toFixed(0) : "0";
  const totalCustomersWithPhotos = new Set(photos.map(p => p.customerId)).size;
  const totalUniqueCustomersCount = customers.length;
  const customerCoverageRatio = totalUniqueCustomersCount > 0 ? ((totalCustomersWithPhotos / totalUniqueCustomersCount) * 100).toFixed(0) : "0";

  // Filtered customers for dropdown autocomplete
  const filteredCustomers = customerSearchQuery
    ? customers.filter(c => c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()))
    : customers;

  // Sales linked to the selected customer
  const customerSales = selectedCustomerId
    ? sales.filter(s => s.customerId === selectedCustomerId)
    : [];

  const handleChooseCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer.id || '');
    setSelectedCustomerName(customer.name);
    setCustomerSearchQuery(customer.name);
    setShowCustomerDropdown(false);
    setSelectedSaleId(''); // Reset sale selection
  };

  const handlePhotoUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadProgress(true);
      // For customer photos, 1200px width/height provides outstanding custom presentation detail with full sharpness
      const base64Url = await resizeImage(file, 1200, 1200);
      setSelectedPhotoFile(base64Url);
    } catch (err) {
      console.error(err);
      alert("Erro ao processar imagem. Verifique o formato do arquivo.");
    } finally {
      setUploadProgress(false);
    }
  };

  const handleAddPhotoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPhotoFile) {
      alert("Por favor, selecione ou tire uma foto do cliente.");
      return;
    }
    if (!selectedCustomerId) {
      alert("Por favor, selecione um cliente real cadastrado.");
      return;
    }

    try {
      setUploadProgress(true);

      // Find selected sale info for audit context
      let saleDateStr: string | null = null;
      let saleItemsStr: string | null = null;

      if (selectedSaleId) {
        const foundSale = sales.find(s => s.id === selectedSaleId);
        if (foundSale) {
          saleDateStr = foundSale.createdAt?.toDate ? foundSale.createdAt.toDate().toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
          saleItemsStr = foundSale.items.map(it => {
            const extra = (it.isCustomized && it.customName) ? ` (*Pers: ${it.customName} - Nº: ${it.customNumber || 'S/N'}*)` : '';
            return `${it.quantity}x ${it.name}${extra}`;
          }).join(', ');
        }
      }

      if (editingPhotoId) {
        // Edit existing publication
        await updateDoc(doc(db, 'customer_photos', editingPhotoId), {
          customerId: selectedCustomerId,
          customerName: selectedCustomerName,
          saleId: selectedSaleId || null,
          saleDate: saleDateStr,
          saleItemsSummary: saleItemsStr,
          photoUrl: selectedPhotoFile,
          description: photoDescription,
          scale: photoScale,
          offsetX: photoOffsetX,
          offsetY: photoOffsetY,
        });
        alert("Publicação atualizada com sucesso!");
      } else {
        // Create new publication
        await addDoc(collection(db, 'customer_photos'), {
          customerId: selectedCustomerId,
          customerName: selectedCustomerName,
          saleId: selectedSaleId || null,
          saleDate: saleDateStr,
          saleItemsSummary: saleItemsStr,
          photoUrl: selectedPhotoFile,
          description: photoDescription,
          scale: photoScale,
          offsetX: photoOffsetX,
          offsetY: photoOffsetY,
          createdAt: new Date(), // Local fallback or standard ServerTimestamp mock
        });
        alert("Nova foto guardada com sucesso no mural!");
      }

      // Clear form & close
      setSelectedPhotoFile(null);
      setSelectedCustomerId('');
      setSelectedCustomerName('');
      setCustomerSearchQuery('');
      setSelectedSaleId('');
      setPhotoDescription('');
      setPhotoScale(1.0);
      setPhotoOffsetX(0);
      setPhotoOffsetY(0);
      setEditingPhotoId(null);
      setIsPhotoModalOpen(false);

    } catch (err) {
      console.error("Error saving photo:", err);
      alert("Erro ao salvar foto no banco de dados.");
    } finally {
      setUploadProgress(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm("Confirma a exclusão definitiva desta foto de cliente do mural? Esse processo removerá a publicação permanentemente.")) return;
    try {
      await deleteDoc(doc(db, 'customer_photos', photoId));
      alert("Foto removida com sucesso do mural!");
    } catch (err) {
      console.error("Error removing customer photo:", err);
      alert("Erro ao remover foto do mural.");
    }
  };

  // Upload main logo for the business
  const handleLogoUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsSavingLogo(true);
      // For header logos/favicons, 512px provides amazing crisp high-res quality at tiny size
      const base64Url = await resizeImage(file, 512, 512);
      setLogoFile(base64Url);

      // Save to Firebase settings
      const settingsRef = doc(db, 'settings', 'appearance');
      await setDoc(settingsRef, {
        logoUrl: base64Url,
        updatedAt: new Date()
      }, { merge: true });

      // Save to localStorage for instant client-side read on page loads
      localStorage.setItem('erp-custom-logo', base64Url);

      // Dynamically update favicon link so the browser tab logo updates on the fly!
      const existingFavicon = document.querySelector("link[rel*='icon']");
      if (existingFavicon) {
        existingFavicon.setAttribute('href', base64Url);
      } else {
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = base64Url;
        document.head.appendChild(link);
      }

      // Fire a custom event to alert App.tsx that the global logo has updated
      window.dispatchEvent(new CustomEvent('logo-updated', { detail: { logoUrl: base64Url, logoScale } }));

      setLogoSuccessMsg(true);
      setTimeout(() => setLogoSuccessMsg(false), 4000);

    } catch (err) {
      console.error("Error saving logo:", err);
      alert("Erro ao processar e salvar a logo.");
    } finally {
      setIsSavingLogo(false);
    }
  };

  const handleResetLogo = async () => {
    if (!confirm("Deseja voltar para a logo padrão do ERP?")) return;
    try {
      setIsSavingLogo(true);
      const settingsRef = doc(db, 'settings', 'appearance');
      await setDoc(settingsRef, {
        logoUrl: '',
        logoScale: 1.0,
        updatedAt: new Date()
      }, { merge: true });

      setLogoFile(null);
      setLogoScale(1.0);
      localStorage.removeItem('erp-custom-logo');
      localStorage.removeItem('erp-custom-logo-scale');

      // Dispatch event to put the default icon back
      window.dispatchEvent(new CustomEvent('logo-updated', { detail: { logoUrl: '', logoScale: 1.0 } }));

      // Reset favicon web icon back to standard or let it use browser default
      setLogoSuccessMsg(true);
      setTimeout(() => setLogoSuccessMsg(false), 4000);
    } catch (err) {
      console.error(err);
      alert("Erro ao redefinir a logo.");
    } finally {
      setIsSavingLogo(false);
    }
  };

  // Drag handlers for feed cards and modal photos
  const handleMouseDown = (e: React.MouseEvent, item: CustomerPhoto) => {
    if (!item.id) return;
    e.preventDefault();
    setDraggingId(item.id);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartOffset.current = {
      x: localOffsets[item.id]?.x ?? item.offsetX ?? 0,
      y: localOffsets[item.id]?.y ?? item.offsetY ?? 0
    };
  };

  const handleMouseMove = (e: React.MouseEvent, item: CustomerPhoto) => {
    if (!item.id || draggingId !== item.id) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    
    const newX = dragStartOffset.current.x + Math.round(deltaX);
    const newY = dragStartOffset.current.y + Math.round(deltaY);

    setLocalOffsets(prev => ({
      ...prev,
      [item.id!]: { x: newX, y: newY }
    }));
  };

  const handleMouseUpOrLeave = async (item: CustomerPhoto) => {
    if (!item.id || draggingId !== item.id) return;
    setDraggingId(null);
    
    const finalOffset = localOffsets[item.id];
    if (finalOffset) {
      try {
        await updateDoc(doc(db, 'customer_photos', item.id), {
          offsetX: finalOffset.x,
          offsetY: finalOffset.y
        });
      } catch (err) {
        console.error("Error saving framing offsets:", err);
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent, item: CustomerPhoto) => {
    if (!item.id) return;
    const touch = e.touches[0];
    setDraggingId(item.id);
    dragStartPos.current = { x: touch.clientX, y: touch.clientY };
    dragStartOffset.current = {
      x: localOffsets[item.id]?.x ?? item.offsetX ?? 0,
      y: localOffsets[item.id]?.y ?? item.offsetY ?? 0
    };
  };

  const handleTouchMove = (e: React.TouchEvent, item: CustomerPhoto) => {
    if (!item.id || draggingId !== item.id) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - dragStartPos.current.x;
    const deltaY = touch.clientY - dragStartPos.current.y;
    
    const newX = dragStartOffset.current.x + Math.round(deltaX);
    const newY = dragStartOffset.current.y + Math.round(deltaY);

    setLocalOffsets(prev => ({
      ...prev,
      [item.id!]: { x: newX, y: newY }
    }));
  };

  // Drag handlers for the modal photo (before saving/uploading)
  const handleModalPhotoMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingModalPhoto(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartOffset.current = { x: photoOffsetX, y: photoOffsetY };
  };

  const handleModalPhotoMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingModalPhoto) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    
    setPhotoOffsetX(dragStartOffset.current.x + Math.round(deltaX));
    setPhotoOffsetY(dragStartOffset.current.y + Math.round(deltaY));
  };

  const handleModalPhotoMouseUpOrLeave = () => {
    setIsDraggingModalPhoto(false);
  };

  const handleModalPhotoTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDraggingModalPhoto(true);
    dragStartPos.current = { x: touch.clientX, y: touch.clientY };
    dragStartOffset.current = { x: photoOffsetX, y: photoOffsetY };
  };

  const handleModalPhotoTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingModalPhoto) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - dragStartPos.current.x;
    const deltaY = touch.clientY - dragStartPos.current.y;
    
    setPhotoOffsetX(dragStartOffset.current.x + Math.round(deltaX));
    setPhotoOffsetY(dragStartOffset.current.y + Math.round(deltaY));
  };

  return (
    <div className="flex flex-col gap-6 font-sans">
      {/* Title block with submenu */}
      <div className="bg-white rounded-[32px] p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 font-sans tracking-tight">Mural de Fotos & Ajustes de Logo</h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Sua vitrine afetiva e personalização da identidade do ERP</p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1 self-start md:self-center">
          <button 
            onClick={() => setActiveSubTab('photos')}
            className={cn(
              "px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeSubTab === 'photos' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Camera size={14} /> Mural de Clientes
          </button>
          <button 
            onClick={() => setActiveSubTab('logo')}
            className={cn(
              "px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeSubTab === 'logo' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Settings size={14} /> Logo e Capa (Favicon)
          </button>
        </div>
      </div>

      {activeSubTab === 'photos' && (
        <>
          {/* Action Header */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white rounded-[24px] p-4 border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
              <h2 className="text-xs font-black uppercase text-slate-800 tracking-widest flex items-center gap-2">
                <Sparkles size={16} className="text-amber-500 animate-pulse" /> Mural de Encomendas ({photos.length})
              </h2>
              <button
                onClick={() => setShowInsights(!showInsights)}
                className={cn(
                  "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border self-start sm:self-center",
                  showInsights 
                    ? "bg-amber-50 text-amber-800 border-amber-200 shadow-inner" 
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 border-slate-200 shadow-sm"
                )}
                type="button"
              >
                <Lightbulb size={12} className={cn(showInsights && "animate-bounce text-amber-600")} />
                {showInsights ? 'Recolher Insights' : 'Ver Insights & Dicas do Clube'}
              </button>
            </div>

            <button 
              onClick={() => {
                setEditingPhotoId(null);
                setSelectedPhotoFile(null);
                setSelectedCustomerId('');
                setSelectedCustomerName('');
                setCustomerSearchQuery('');
                setSelectedSaleId('');
                setPhotoDescription('');
                setPhotoScale(1.0);
                setPhotoOffsetX(0);
                setPhotoOffsetY(0);
                setIsPhotoModalOpen(true);
              }}
              className="w-full sm:w-auto px-6 py-3.5 bg-red-800 hover:bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md hover:scale-[1.01] flex items-center justify-center gap-2"
            >
              <Plus size={14} /> Registrar Nova Foto de Cliente
            </button>
          </div>

          {/* Social Proof & Qualitative Insights Bento-Layout Panel */}
          <AnimatePresence>
            {showInsights && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 border border-slate-200 rounded-[32px] p-6 mb-6">
                  
                  {/* Card 1: Cobertura de Prova Social */}
                  <div className="bg-white border border-slate-200/60 rounded-2xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Poder de Prova Social</span>
                        <div className="p-1.5 bg-rose-50 text-red-800 rounded-lg">
                          <TrendingUp size={14} />
                        </div>
                      </div>
                      <h4 className="text-[11px] font-black uppercase text-slate-800 tracking-wide mb-1">Métricas de Engajamento</h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-medium">As fotos geram até 40% mais cliques em campanhas e catálogos.</p>
                      
                      <div className="mt-5 space-y-3.5">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-600">
                          <span>Cobertura de Vendas</span>
                          <span className="font-mono text-xs">{socialProofRatio}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/30">
                          <div 
                            className="bg-red-800 h-full rounded-full transition-all duration-1000" 
                            style={{ width: `${Math.min(100, Number(socialProofRatio))}%` }}
                          />
                        </div>
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 pt-1">
                          <span>{salesWithPhotosCount} de {totalSalesCount} fotos cadastradas com vendas</span>
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 pt-3.5 border-t border-slate-100 text-[9px] text-slate-450 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100/10">
                      <strong>Meta Saudável:</strong> Alcançar 30% de cobertura no ano para elevar a credibilidade geral do seu e-commerce.
                    </div>
                  </div>

                  {/* Card 2: Caimento & Modelagem de Mantos */}
                  <div className="bg-white border border-slate-200/60 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Guia de Ajustes de Caimento</span>
                        <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
                          <Check size={14} />
                        </div>
                      </div>
                      <h4 className="text-[11px] font-black uppercase text-slate-800 tracking-wide mb-1 flex items-center gap-1.5">
                        <span>Jogador vs Torcedor</span>
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-medium">Mapeamento qualitativo de tamanho e estrutura base de fardas.</p>
                      
                      <div className="mt-4 space-y-2.5 text-[10px] uppercase font-bold text-slate-600">
                        <div className="flex items-center gap-2 bg-emerald-50/50 p-2 rounded-xl border border-emerald-100/50">
                          <span className="text-emerald-600 text-xs font-sans">✓</span>
                          <span><strong>Manto Torcedor:</strong> Caimento padrão e fiel ao tamanho nominal (96% precisão).</span>
                        </div>
                        <div className="flex items-center gap-2 bg-amber-50/50 p-2 rounded-xl border border-amber-100/50">
                          <span className="text-amber-600 text-xs font-sans">⚠</span>
                          <span><strong>Manto Jogador:</strong> Versão slim. Orientar compradores a solicitar +1 tamanho acima!</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 text-[8.5px] text-slate-400 tracking-wider uppercase font-black flex items-center justify-between">
                      <span>Evita Devoluções</span>
                      <span className="text-red-800">Custo de Freite Reverso -95%</span>
                    </div>
                  </div>

                  {/* Card 3: Gerador Copiador de Script Whatsapp */}
                  <div className="bg-white border border-slate-200/60 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Captador de Prova Social</span>
                        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                          <Plus size={14} />
                        </div>
                      </div>
                      <div>
                        <h4 className="text-[11px] font-black uppercase text-slate-800 tracking-wide mb-1">Pedir Foto do Manto</h4>
                        <p className="text-[11px] text-slate-400 mb-3 font-medium">Insira os dados para gerar mensagens personalizadas de incentivo.</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Nome Cliente</label>
                          <input 
                            type="text" 
                            className="w-full text-xs font-bold px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none text-slate-750"
                            value={insightName}
                            onChange={(e) => setInsightName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Cupom Incentivo</label>
                          <input 
                            type="text" 
                            className="w-full text-xs font-bold px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none text-slate-750"
                            value={insightVoucher}
                            onChange={(e) => setInsightVoucher(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Msg text preview */}
                      <div className="bg-slate-55 text-[10px] text-slate-650 p-2.5 rounded-xl border border-slate-150 font-mono line-clamp-3 leading-relaxed relative bg-slate-50/50">
                        <div className="absolute inset-0 bg-gradient-to-t from-white/95 via-white/40 to-transparent" />
                        <span className="text-[8.5px] text-slate-400 block font-sans font-black uppercase tracking-wider mb-1">Prévia Whatsapp:</span>
                        {`Fala, ${insightName}! ... Frete Grátis com cupom ${insightVoucher}`}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const message = `Fala, *${insightName}*! Tudo bem? ⚽\n\nPassando para agradecer a preferência no *Club da Bola*! Seu manto já chegou e aposto que ficou daquele jeito! 🤩\n\nPoderia fortalecer sua opinião tirando uma foto irada vestindo a camisa para nosso Mural de Clientes? 📸\n\nPra te premiar, na sua próxima compra você ganha 10% de desconto ou Frete Grátis com o cupom: *${insightVoucher}*. Que tal?\n\nForte abraço! Tamo junto! 🔥🤙\n\n_Produzido por: Brener Gomes_`;
                        navigator.clipboard.writeText(message);
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2000);
                      }}
                      className={cn(
                        "w-full mt-4 py-3 rounded-xl text-[10px] uppercase font-black tracking-widest flex items-center justify-center gap-1.5 transition-all text-white",
                        isCopied ? "bg-emerald-600" : "bg-slate-900 hover:bg-slate-950 shadow-sm"
                      )}
                    >
                      {isCopied ? (
                        <>
                          <Check size={12} /> Copiado com Sucesso!
                        </>
                      ) : (
                        <>
                          <Copy size={12} /> Copiar Mensagem Pronta
                        </>
                      )}
                    </button>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Photos Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {loading ? (
              <div className="col-span-full py-20 flex flex-col items-center justify-center gap-3">
                <div className="size-10 border-2 border-slate-200 border-t-red-800 rounded-full animate-spin" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">Carregando fotos do mural...</p>
              </div>
            ) : photos.length === 0 ? (
              <div className="col-span-full bg-white rounded-[32px] p-20 border border-slate-200 flex flex-col items-center justify-center text-center">
                <div className="size-16 bg-slate-50 text-slate-300 rounded-3xl flex items-center justify-center mb-4">
                  <Camera size={28} />
                </div>
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-2">Seu Mural está vazio</h3>
                <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">Guarde fotos de qualidade dos seus clientes vestindo as camisas vendidas. Isso serve como excelente prova social e dado qualitativo de caimento dos mantos.</p>
                <button 
                  onClick={() => {
                    setEditingPhotoId(null);
                    setSelectedPhotoFile(null);
                    setSelectedCustomerId('');
                    setSelectedCustomerName('');
                    setCustomerSearchQuery('');
                    setSelectedSaleId('');
                    setPhotoDescription('');
                    setPhotoScale(1.0);
                    setIsPhotoModalOpen(true);
                  }}
                  className="px-6 py-3 bg-red-800 text-white rounded-xl text-[10px] uppercase font-black tracking-widest hover:bg-slate-900 transition-all font-sans"
                >
                  Subir Primeira Foto
                </button>
              </div>
            ) : (
              photos.map((item) => (
                <motion.div 
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border rounded-[28px] overflow-hidden shadow-sm group hover:shadow-xl transition-all duration-300 relative flex flex-col border-slate-200 p-4"
                >
                  {/* Polaroid Frame Container */}
                  <div 
                    className="aspect-square w-full rounded-2xl overflow-hidden bg-slate-950 relative border border-slate-100 select-none"
                    style={{ cursor: (item.scale || 1.0) > 0.1 ? 'grab' : 'default' }}
                    onMouseDown={(e) => handleMouseDown(e, item)}
                    onMouseMove={(e) => handleMouseMove(e, item)}
                    onMouseUp={() => handleMouseUpOrLeave(item)}
                    onMouseLeave={() => handleMouseUpOrLeave(item)}
                    onTouchStart={(e) => handleTouchStart(e, item)}
                    onTouchMove={(e) => handleTouchMove(e, item)}
                    onTouchEnd={() => handleMouseUpOrLeave(item)}
                  >
                    <img 
                      src={item.photoUrl} 
                      alt={item.customerName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover rounded-2xl pointer-events-none transition-transform duration-75 ease-out origin-center"
                      style={{ 
                        transform: `scale(${item.scale || 1.0}) translate(${(localOffsets[item.id || '']?.x ?? item.offsetX ?? 0) / (item.scale || 1.0)}px, ${(localOffsets[item.id || '']?.y ?? item.offsetY ?? 0) / (item.scale || 1.0)}px)`
                      }}
                    />
                    
                    {/* Floating Zoom Controls for Photo Mural */}
                    <div className="absolute bottom-3 left-3 right-3 bg-black/60 backdrop-blur-md rounded-xl p-1.5 flex items-center justify-between gap-1.5 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                      <span className="text-[8px] font-black uppercase text-white/80 tracking-wider pl-1 font-sans">Zoom Foto</span>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            const nextScale = Math.max(0.1, (item.scale || 1.0) - 0.1);
                            if (item.id) {
                              await updateDoc(doc(db, 'customer_photos', item.id), { scale: nextScale });
                            }
                          }}
                          className="size-5 rounded bg-white/15 flex items-center justify-center text-white text-xs hover:bg-white/30 transition-all font-black"
                          type="button"
                          title="Focar menos / Restringir"
                        >
                          -
                        </button>
                        <span className="text-[9px] font-mono font-black text-amber-500 min-w-[34px] text-center bg-white/5 py-0.5 rounded">
                          {Math.round((item.scale || 1.0) * 100)}%
                        </span>
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            const nextScale = Math.min(3.0, (item.scale || 1.0) + 0.1);
                            if (item.id) {
                              await updateDoc(doc(db, 'customer_photos', item.id), { scale: nextScale });
                            }
                          }}
                          className="size-5 rounded bg-white/15 flex items-center justify-center text-white text-xs hover:bg-white/30 transition-all font-black"
                          type="button"
                          title="Focar mais / Ampliar"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Floating delete option */}
                    <button 
                      onClick={() => item.id && handleDeletePhoto(item.id)}
                      className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-red-800 text-white rounded-xl shadow-lg transition-all scale-90 group-hover:scale-100 opacity-0 group-hover:opacity-100 z-10"
                      title="Excluir do mural"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Descriptions block (Inside the polaroid aesthetic area) */}
                  <div className="pt-4 pb-1 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-slate-900 uppercase tracking-tight truncate">{item.customerName}</span>
                        {item.saleId && (
                          <span className="text-[7.5px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase tracking-widest font-sans">Venda</span>
                        )}
                      </div>

                      {item.saleDate && (
                        <p className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mt-1 flex items-center gap-1">
                          <span>Vendido em {item.saleDate}</span>
                        </p>
                      )}

                      {item.saleItemsSummary && (
                        <p className="text-[9px] font-medium text-slate-500 italic mt-1 line-clamp-1 truncate" title={item.saleItemsSummary}>
                          Manto(s): {item.saleItemsSummary}
                        </p>
                      )}

                      {item.description && (
                        <p className="text-[10px] text-slate-600 mt-2 bg-slate-50 border border-slate-100 p-2.5 rounded-xl font-sans leading-relaxed">
                          "{item.description}"
                        </p>
                      )}
                    </div>

                    {/* Actions Row */}
                    <div className="mt-4 pt-3 border-t border-slate-150 flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingPhotoId(item.id || null);
                          setSelectedPhotoFile(item.photoUrl);
                          setSelectedCustomerId(item.customerId);
                          
                          const foundCust = customers.find(c => c.id === item.customerId);
                          setSelectedCustomerName(foundCust?.name || item.customerName);
                          setCustomerSearchQuery(foundCust?.name || item.customerName);
                          setSelectedSaleId(item.saleId || '');
                          setPhotoDescription(item.description || '');
                          setPhotoScale(item.scale || 1.0);
                          setPhotoOffsetX(item.offsetX || 0);
                          setPhotoOffsetY(item.offsetY || 0);
                          setIsPhotoModalOpen(true);
                        }}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border border-slate-200/50"
                      >
                        <Settings size={12} className="text-slate-500" /> Editar Card
                      </button>
                      <button
                        onClick={() => item.id && handleDeletePhoto(item.id)}
                        className="p-2 border border-rose-200 hover:bg-rose-50 text-red-700 rounded-xl transition-all"
                        title="Deletar foto"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                       <span>Qualitativo</span>
                       <span>ERP CLUB DA BOLA</span>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </>
      )}

      {activeSubTab === 'logo' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Instructions Column */}
          <div className="md:col-span-4 bg-slate-900 text-white rounded-[32px] p-8 border border-slate-800 flex flex-col justify-between gap-8 h-fit">
            <div className="space-y-6">
              <div className="size-12 rounded-2xl bg-amber-500 text-slate-900 flex items-center justify-center">
                <Settings size={22} />
              </div>
              <div>
                <h3 className="text-md font-black uppercase tracking-wider text-amber-500">Logotipia Global</h3>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">Ao fazer o upload da logo aqui ela substituirá instantaneamente a logo do ERP no cabeçalho, na barra lateral (desktop) e no menu inferior de expansão (celular).</p>
              </div>

              <div className="space-y-3.5 border-t border-white/5 pt-6 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <div className="flex items-center gap-3">
                  <div className="size-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[8px]">✓</div>
                  <span>Injeção dinâmica de Favicon</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="size-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[8px]">✓</div>
                  <span>Redimensionamento Automático</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="size-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[8px]">✓</div>
                  <span>Sincronização em tempo real</span>
                </div>
              </div>
            </div>
            
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Controles internos · Configuração</p>
          </div>

          {/* Action Upload Box Column */}
          <div className="md:col-span-8 bg-white rounded-[32px] p-8 border border-slate-200 shadow-sm space-y-8">
            <div>
              <h3 className="text-sm font-black text-slate-850 uppercase tracking-wider">Trocar Imagem de Identidade</h3>
              <p className="text-xs text-slate-400 mt-1">Insira um arquivo de imagem (JPG ou PNG). O sistema irá compactar e injetar em toda a plataforma.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-center">
              {/* Box 1: Current Logo View */}
              <div className="border border-slate-100 rounded-3xl p-6 bg-slate-50/50 flex flex-col items-center justify-center text-center aspect-square md:aspect-auto md:h-56">
                {isSavingLogo ? (
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="size-10 border-2 border-slate-200 border-t-red-800 rounded-full animate-spin" />
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">Escrevendo no Banco...</p>
                  </div>
                ) : logoFile ? (
                  <div className="space-y-4">
                    <div className="size-28 rounded-2xl border border-slate-200 shadow-md flex items-center justify-center mx-auto overflow-hidden bg-slate-100 relative">
                      <img 
                        src={logoFile} 
                        alt="Logo ERP" 
                        style={{ transform: `scale(${logoScale})` }}
                        className="w-full h-full object-cover rounded-2xl transition-transform duration-300" 
                        referrerPolicy="no-referrer" 
                      />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Sua Logo Ativa</p>
                      
                      {/* Zoom Controls for Active Logo */}
                      <div className="flex items-center justify-center gap-2 mt-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200 w-36 mx-auto">
                        <button
                          type="button"
                          onClick={async () => {
                            const nextScale = Math.max(0.1, logoScale - 0.1);
                            setLogoScale(nextScale);
                            const settingsRef = doc(db, 'settings', 'appearance');
                            await setDoc(settingsRef, { logoScale: nextScale }, { merge: true });
                            localStorage.setItem('erp-custom-logo-scale', nextScale.toString());
                            window.dispatchEvent(new CustomEvent('logo-updated', { detail: { logoUrl: logoFile, logoScale: nextScale } }));
                          }}
                          className="size-6 bg-white hover:bg-slate-200 rounded-lg flex items-center justify-center text-slate-700 text-xs font-bold shadow-sm transition-all font-sans"
                        >
                          -
                        </button>
                        <span className="text-[9px] font-mono font-black text-red-800">
                          {Math.round(logoScale * 100)}%
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            const nextScale = Math.min(2.5, logoScale + 0.1);
                            setLogoScale(nextScale);
                            const settingsRef = doc(db, 'settings', 'appearance');
                            await setDoc(settingsRef, { logoScale: nextScale }, { merge: true });
                            localStorage.setItem('erp-custom-logo-scale', nextScale.toString());
                            window.dispatchEvent(new CustomEvent('logo-updated', { detail: { logoUrl: logoFile, logoScale: nextScale } }));
                          }}
                          className="size-6 bg-white hover:bg-slate-200 rounded-lg flex items-center justify-center text-slate-700 text-xs font-bold shadow-sm transition-all font-sans"
                        >
                          +
                        </button>
                      </div>

                      <button 
                        onClick={handleResetLogo}
                        className="text-[9px] font-bold text-red-600 uppercase tracking-widest mt-3.5 hover:underline hover:text-red-700 block mx-auto"
                      >
                        Remover e Voltar ao Padrão
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="size-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                      <ImageIcon size={28} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Nenhuma logo personalizada</p>
                      <p className="text-[9.5px] text-slate-400 mt-1 max-w-[180px] mx-auto text-center">Usando ícone dinâmico padrão</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Box 2: Drop & Upload Inputs */}
              <div className="relative border-2 border-dashed border-slate-200 hover:border-slate-400 rounded-3xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all aspect-square md:aspect-auto md:h-56 bg-slate-50/20 group">
                <input 
                  type="file" 
                  accept="image/*" 
                  className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                  onChange={handleLogoUploadChange}
                  disabled={isSavingLogo}
                />
                <div className="space-y-3">
                  <div className="size-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                    <Upload size={20} />
                  </div>
                  <div>
                    <span className="text-xs font-black text-slate-700 uppercase block">Arrastar ou Escolher Foto</span>
                    <span className="text-[9px] text-slate-400 mt-1.5 block">Favicon, PNG ou JPG de alta qualidade</span>
                  </div>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {logoSuccessMsg && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-emerald-50 text-emerald-800 p-4 rounded-xl border border-emerald-100 text-[10px] font-black uppercase tracking-wider flex items-center gap-2"
                >
                  <Check size={14} /> Logo e capa sincronizados com sucesso no sistema e cabeçalhos!
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Customer select photo Modal */}
      <AnimatePresence>
        {isPhotoModalOpen && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] max-w-lg w-full flex flex-col shadow-2xl overflow-hidden border border-slate-100 relative max-h-[90vh]"
            >
              <div className="bg-slate-900 p-6 text-white flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-red-800 flex items-center justify-center">
                    <Camera size={14} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-rose-50 uppercase tracking-widest leading-none">
                      {editingPhotoId ? 'Editar Publicação de Manto' : 'Registrar Manto no Cliente'}
                    </h3>
                    <p className="text-[9px] text-slate-400 uppercase font-bold tracking-widest mt-1">Conectar momento afetivo à base de vendas</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsPhotoModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white bg-white/5 rounded-lg transition-all"
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleAddPhotoSubmit} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                {/* Photo Dropzone */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Foto do Cliente vestindo o Manto</label>
                  
                  {selectedPhotoFile ? (
                    <div className="space-y-4">
                      <div 
                        className="relative aspect-video rounded-2xl overflow-hidden border border-slate-200 group bg-slate-950 flex items-center justify-center select-none"
                        style={{ cursor: photoScale > 0.1 ? 'grab' : 'default' }}
                        onMouseDown={handleModalPhotoMouseDown}
                        onMouseMove={handleModalPhotoMouseMove}
                        onMouseUp={handleModalPhotoMouseUpOrLeave}
                        onMouseLeave={handleModalPhotoMouseUpOrLeave}
                        onTouchStart={handleModalPhotoTouchStart}
                        onTouchMove={handleModalPhotoTouchMove}
                        onTouchEnd={handleModalPhotoMouseUpOrLeave}
                      >
                        <img 
                          src={selectedPhotoFile} 
                          alt="Preview" 
                          className="w-full h-full object-cover transition-transform duration-75 ease-out pointer-events-none origin-center" 
                          style={{ transform: `scale(${photoScale}) translate(${photoOffsetX / photoScale}px, ${photoOffsetY / photoScale}px)` }}
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            setSelectedPhotoFile(null);
                            setPhotoScale(1.0);
                            setPhotoOffsetX(0);
                            setPhotoOffsetY(0);
                          }}
                          className="absolute top-3 right-3 p-2 bg-black/60 text-white rounded-xl hover:bg-red-800 transition-all shadow-lg z-10"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      {/* Zoom Controls inside Modal */}
                      <div className="flex items-center justify-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 w-44 mx-auto">
                        <button
                          type="button"
                          onClick={() => {
                            const nextScale = Math.max(0.1, photoScale - 0.1);
                            setPhotoScale(nextScale);
                          }}
                          className="size-7 bg-white hover:bg-slate-200 rounded-lg flex items-center justify-center text-slate-700 text-xs font-bold shadow-sm transition-all font-sans"
                        >
                          -
                        </button>
                        <span className="text-[10px] font-mono font-black text-slate-800 min-w-[50px] text-center">
                          {Math.round(photoScale * 100)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const nextScale = Math.min(3.0, photoScale + 0.1);
                            setPhotoScale(nextScale);
                          }}
                          className="size-7 bg-white hover:bg-slate-200 rounded-lg flex items-center justify-center text-slate-700 text-xs font-bold shadow-sm transition-all font-sans"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative border-2 border-dashed border-slate-200 hover:border-slate-400 bg-slate-50/30 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all aspect-video">
                      <input 
                        required
                        type="file" 
                        accept="image/*" 
                        className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                        onChange={handlePhotoUploadChange}
                        disabled={uploadProgress}
                      />
                      {uploadProgress ? (
                        <div className="space-y-2">
                          <div className="size-8 border-2 border-slate-200 border-t-red-800 rounded-full animate-spin mx-auto" />
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Processando Foto...</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="size-12 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 mx-auto">
                            <Upload size={18} />
                          </div>
                          <div>
                            <span className="text-xs font-black text-slate-700 uppercase block">Selecionar Foto do Cliente</span>
                            <span className="text-[9px] text-slate-400 mt-1 block">Tire no celular ou escolha da galeria</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Autocomplete Customer Select */}
                <div className="space-y-2 relative">
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Vincular Cliente do Clube</label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      required
                      type="text"
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-red-800 font-sans text-sm font-semibold text-slate-800 placeholder:text-slate-300"
                      placeholder="Pesquise o nome do cliente..."
                      value={customerSearchQuery}
                      onChange={(e) => {
                        setCustomerSearchQuery(e.target.value);
                        setShowCustomerDropdown(true);
                        if (!e.target.value) {
                          setSelectedCustomerId('');
                          setSelectedCustomerName('');
                          setSelectedSaleId('');
                        }
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                    />
                  </div>

                  {/* Customer autocomplete results dropdown */}
                  <AnimatePresence>
                    {showCustomerDropdown && (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute top-full left-0 right-0 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-20 divide-y mt-1.5 custom-scrollbar"
                      >
                        {filteredCustomers.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400 font-bold uppercase tracking-wider">
                            Nenhum cliente cadastrado com esse nome
                          </div>
                        ) : (
                          filteredCustomers.map(cust => (
                            <div 
                              key={cust.id}
                              onClick={() => cust && handleChooseCustomer(cust)}
                              className="px-4 py-3 text-xs font-semibold text-slate-750 hover:bg-slate-50 cursor-pointer flex items-center justify-between"
                            >
                              <span>{cust.name}</span>
                              <span className="text-[8.5px] font-black text-slate-400">{cust.contact}</span>
                            </div>
                          ))
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Choose Customer Sale if selected */}
                {selectedCustomerId && (
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider flex items-center gap-1">
                      Venda / Pedido Relacionado <span className="text-[8px] text-slate-400 font-normal lowercase">(opcional)</span>
                    </label>
                    <select 
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-red-800 font-sans text-sm font-semibold text-slate-800"
                      value={selectedSaleId}
                      onChange={(e) => setSelectedSaleId(e.target.value)}
                    >
                      <option value="">Não vincular a uma venda específica</option>
                      {customerSales.map(sl => (
                        <option key={sl.id} value={sl.id}>
                          {sl.createdAt?.toDate ? sl.createdAt.toDate().toLocaleDateString('pt-BR') : 'Data Indisp'}: {sl.items.map(it => `${it.quantity}x ${it.name}${it.isCustomized && it.customName ? ` [Personalizado: ${it.customName}]` : ''}`).join(' | ')} ({formatCurrency(sl.total)})
                        </option>
                      ))}
                    </select>
                    {customerSales.length === 0 && (
                      <p className="text-[9px] text-amber-600 font-bold uppercase tracking-wider">O cliente selecionado ainda não possui vendas registradas no sistema.</p>
                    )}
                  </div>
                )}

                {/* Qualititative Description / Comments */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Anotações Qualitativas (Tamanho, Caimento, Feedback)</label>
                  <textarea 
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-red-800 font-sans text-xs focus:border-red-800 transition-all font-medium min-h-24"
                    placeholder="Ex: Felipe adorou o caimento G da camisa de jogador do Brasil. Achou o tecido excelente e super confortável..."
                    value={photoDescription}
                    onChange={(e) => setPhotoDescription(e.target.value)}
                  />
                </div>

                {/* Form submit buttons */}
                <div className="bg-slate-50 border-t border-slate-100 -mx-8 -mb-8 p-6 flex justify-end gap-3 mt-8">
                  <button 
                    type="button" 
                    onClick={() => {
                      setEditingPhotoId(null);
                      setSelectedPhotoFile(null);
                      setSelectedCustomerId('');
                      setSelectedCustomerName('');
                      setCustomerSearchQuery('');
                      setSelectedSaleId('');
                      setPhotoDescription('');
                      setPhotoScale(1.0);
                      setIsPhotoModalOpen(false);
                    }}
                    className="px-6 py-2.5 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all tracking-widest"
                  >
                    Descartar
                  </button>
                  <button 
                    type="submit"
                    disabled={uploadProgress || !selectedCustomerId}
                    className="px-10 py-3 bg-red-800 hover:bg-slate-950 text-white text-[10px] font-black uppercase rounded-xl transition-all shadow-lg tracking-widest disabled:opacity-40"
                  >
                    {editingPhotoId ? 'Salvar Edição' : 'Salvar no Mural'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
