import React, { useState, useEffect, useRef, useContext } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, setDoc, getDoc, orderBy } from 'firebase/firestore';
import { Customer, Sale, CustomerPhoto } from '../types';
import { Plus, Search, Trash2, Camera, Upload, Image as ImageIcon, Sparkles, X, Settings, Check, HelpCircle, FileImage, Copy, Lightbulb, TrendingUp, Contrast, Instagram, Share2, Download } from 'lucide-react';
import { formatCurrency, cn, smartSearchMatch } from '../lib/utils';
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
  const [mantoType, setMantoType] = useState<string>('Manto I (Home)');
  const [filterMantoType, setFilterMantoType] = useState<string>('Todos');
  const [uploadProgress, setUploadProgress] = useState(false);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [photoDescription, setPhotoDescription] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Stories Generator state
  const [isStoriesModalOpen, setIsStoriesModalOpen] = useState(false);
  const [selectedPhotoForStories, setSelectedPhotoForStories] = useState<CustomerPhoto | null>(null);
  const [storiesText, setStoriesText] = useState('Cliente satisfeito vestindo o manto sagrado! ⚽🔥');
  const [storiesCoupon, setStoriesCoupon] = useState('CLUB10');
  const [storiesTheme, setStoriesTheme] = useState<'red' | 'black' | 'green' | 'gold'>('red');
  const [storiesShowLogo, setStoriesShowLogo] = useState(true);
  const [isDownloadingStory, setIsDownloadingStory] = useState(false);
  const [isStoryCopied, setIsStoryCopied] = useState(false);

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

  // High contrast readability state
  const [highContrast, setHighContrast] = useState<boolean>(() => {
    return localStorage.getItem('mural-high-contrast') === 'true';
  });

  const toggleHighContrast = () => {
    const newVal = !highContrast;
    setHighContrast(newVal);
    localStorage.setItem('mural-high-contrast', String(newVal));
  };

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

  // Filtered photos based on Manto type
  const filteredPhotos = photos.filter(p => {
    if (filterMantoType === 'Todos') return true;
    return (p.mantoType || 'Manto I (Home)') === filterMantoType;
  });

  // Filtered customers for dropdown autocomplete
  const filteredCustomers = customerSearchQuery
    ? customers.filter(c => smartSearchMatch([c.name, c.contact, c.instagram], customerSearchQuery))
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
          mantoType: mantoType || 'Manto I (Home)',
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
          mantoType: mantoType || 'Manto I (Home)',
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
      setMantoType('Manto I (Home)');
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

  const handleDownloadStory = async () => {
    if (!selectedPhotoForStories) return;
    try {
      setIsDownloadingStory(true);
      
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");

      // 1. Background Gradient
      const grad = ctx.createLinearGradient(0, 0, 0, 1920);
      if (storiesTheme === 'red') {
        grad.addColorStop(0, '#310a0a');
        grad.addColorStop(0.5, '#7f1d1d');
        grad.addColorStop(1, '#1e0505');
      } else if (storiesTheme === 'black') {
        grad.addColorStop(0, '#18181b');
        grad.addColorStop(0.5, '#09090b');
        grad.addColorStop(1, '#020202');
      } else if (storiesTheme === 'green') {
        grad.addColorStop(0, '#064e3b');
        grad.addColorStop(0.5, '#022c22');
        grad.addColorStop(1, '#021e17');
      } else { // gold
        grad.addColorStop(0, '#78350f');
        grad.addColorStop(0.5, '#451a03');
        grad.addColorStop(1, '#1c0a00');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);

      // Helper to draw rounded rectangle clip
      const drawRoundedRect = (cx: number, cy: number, w: number, h: number, r: number) => {
        ctx.beginPath();
        ctx.moveTo(cx + r, cy);
        ctx.lineTo(cx + w - r, cy);
        ctx.quadraticCurveTo(cx + w, cy, cx + w, cy + r);
        ctx.lineTo(cx + w, cy + h - r);
        ctx.quadraticCurveTo(cx + w, cy + h, cx + w - r, cy + h);
        ctx.lineTo(cx + r, cy + h);
        ctx.quadraticCurveTo(cx, cy + h, cx, cy + h - r);
        ctx.lineTo(cx, cy + r);
        ctx.quadraticCurveTo(cx, cy, cx + r, cy);
        ctx.closePath();
      };

      // 2. Custom or Default Brand Logo
      if (storiesShowLogo) {
        if (logoFile) {
          try {
            const logoImg = new Image();
            logoImg.crossOrigin = "anonymous";
            await new Promise((resolve, reject) => {
              logoImg.onload = resolve;
              logoImg.onerror = reject;
              logoImg.src = logoFile;
            });
            // Draw logo centered
            const logoW = 120 * logoScale;
            const logoH = 120 * logoScale;
            ctx.drawImage(logoImg, 540 - logoW / 2, 80, logoW, logoH);
          } catch (e) {
            console.error("Error drawing logo on canvas", e);
          }
        } else {
          // Draw a standard beautiful logo
          ctx.font = "900 48px Inter, sans-serif";
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.fillText("⚽ CLUB BOLA", 540, 150);
        }
      }

      // 3. Customer Photo (Polaroid Frame styled inside Stories)
      // Card Container dimensions
      const cardX = 140;
      const cardY = 280;
      const cardW = 800;
      const cardH = 1060;
      const cardR = 40;

      // Draw Card shadow and background
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
      ctx.shadowBlur = 40;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 15;
      ctx.fillStyle = "#ffffff";
      drawRoundedRect(cardX, cardY, cardW, cardH, cardR);
      ctx.fill();

      // Reset shadows for content
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Draw Customer Image frame inside the card
      const imgX = 180;
      const imgY = 320;
      const imgW = 720;
      const imgH = 800;
      const imgR = 24;

      // Load Customer Photo
      try {
        const custImg = new Image();
        custImg.crossOrigin = "anonymous";
        await new Promise((resolve, reject) => {
          custImg.onload = resolve;
          custImg.onerror = reject;
          custImg.src = selectedPhotoForStories.photoUrl;
        });

        ctx.save();
        drawRoundedRect(imgX, imgY, imgW, imgH, imgR);
        ctx.clip();

        // Draw image using scale and offsets
        const scale = selectedPhotoForStories.scale || 1.0;
        const oX = selectedPhotoForStories.offsetX || 0;
        const oY = selectedPhotoForStories.offsetY || 0;

        // Calculate aspect fill ratios
        const imgAspect = custImg.width / custImg.height;
        const frameAspect = imgW / imgH;
        let drawW = imgW;
        let drawH = imgH;
        if (imgAspect > frameAspect) {
          drawW = imgH * imgAspect;
        } else {
          drawH = imgW / imgAspect;
        }

        // Apply scaling
        drawW *= scale;
        drawH *= scale;

        // Center position + custom offset coordinates
        const drawX = imgX + (imgW - drawW) / 2 + oX * 2.5; 
        const drawY = imgY + (imgH - drawH) / 2 + oY * 2.5;

        ctx.drawImage(custImg, drawX, drawY, drawW, drawH);
        ctx.restore();
      } catch (e) {
        console.error("Error loading/drawing customer image", e);
        // Fallback placeholder color
        ctx.fillStyle = "#334155";
        drawRoundedRect(imgX, imgY, imgW, imgH, imgR);
        ctx.fill();
      }

      // Draw Customer Name inside Card Bottom area
      ctx.fillStyle = "#1e293b";
      ctx.font = "900 44px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(selectedPhotoForStories.customerName.toUpperCase(), 540, 1200);

      // Draw Manto Type Tag overlay inside the card bottom area
      const typeText = selectedPhotoForStories.mantoType || 'Manto I (Home)';
      ctx.font = "800 24px Inter, sans-serif";
      const tagTextWidth = ctx.measureText(typeText.toUpperCase()).width;
      const tagW = tagTextWidth + 40;
      const tagH = 50;
      const tagX = 540 - tagW / 2;
      const tagY = 1235;

      ctx.fillStyle = "#f1f5f9";
      drawRoundedRect(tagX, tagY, tagW, tagH, 12);
      ctx.fill();

      ctx.fillStyle = "#475569";
      ctx.fillText(typeText.toUpperCase(), 540, tagY + 33);

      // 4. Marketing Text underneath Card
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 36px Inter, sans-serif";
      ctx.textAlign = "center";
      
      // Draw wrapped marketing caption text
      const words = storiesText.split(' ');
      let line = '';
      let textY = 1410;
      const maxLineWidth = 850;
      const lineHeight = 50;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxLineWidth && n > 0) {
          ctx.fillText(line, 540, textY);
          line = words[n] + ' ';
          textY += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, 540, textY);

      // 5. Stylized Discount Coupon voucher box
      const coupBoxY = 1640;
      const coupBoxW = 700;
      const coupBoxH = 150;
      const coupBoxX = 540 - coupBoxW / 2;

      // Draw Coupon Background
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      drawRoundedRect(coupBoxX, coupBoxY, coupBoxW, coupBoxH, 24);
      ctx.fill();

      // Draw Dashed Border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 4;
      ctx.setLineDash([15, 10]);
      drawRoundedRect(coupBoxX, coupBoxY, coupBoxW, coupBoxH, 24);
      ctx.stroke();
      ctx.setLineDash([]); // clear dash

      // Coupon Text inside Box
      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      ctx.font = "900 24px Inter, sans-serif";
      ctx.fillText("USE O CUPOM DE DESCONTO EXCLUSIVO", 540, coupBoxY + 50);

      ctx.fillStyle = "#fbbf24"; 
      ctx.font = "900 52px monospace";
      ctx.fillText(storiesCoupon.toUpperCase(), 540, coupBoxY + 115);

      // 6. Trigger PNG Download
      const dataUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `story_${selectedPhotoForStories.customerName.toLowerCase().replace(/\s+/g, '_')}.png`;
      downloadLink.href = dataUrl;
      downloadLink.click();
      
      alert("Story gerado e baixado com sucesso em alta definição!");
    } catch (err) {
      console.error("Error generating Story download", err);
      alert("Houve um erro ao gerar a arte do Story. Tente novamente.");
    } finally {
      setIsDownloadingStory(false);
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
    <div className={cn(
      "flex flex-col gap-6 font-sans transition-all duration-200",
      highContrast && "bg-zinc-950 p-6 rounded-[40px] border border-zinc-850"
    )}>
      {/* Title block with submenu */}
      <div className={cn(
        "rounded-[32px] p-6 border shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all duration-200",
        highContrast 
          ? "bg-black border-white border-4 text-white" 
          : "bg-white border-slate-200 text-slate-900"
      )}>
        <div className="flex-1">
          <h1 className={cn(
            "text-2xl font-black font-sans tracking-tight",
            highContrast ? "text-yellow-400" : "text-slate-900"
          )}>Mural de Fotos & Ajustes de Logo</h1>
          <p className={cn(
            "text-[10px] font-bold uppercase tracking-widest mt-1",
            highContrast ? "text-white" : "text-slate-400"
          )}>Sua vitrine afetiva e personalização da identidade do ERP</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* High Contrast Toggle Button */}
          <button
            onClick={toggleHighContrast}
            className={cn(
              "px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 border",
              highContrast
                ? "bg-yellow-400 text-black border-black border-2 shadow-[3px_3px_0px_rgba(255,255,255,1)] hover:bg-yellow-300"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 shadow-sm"
            )}
            title="Alternar Modo de Alto Contraste"
          >
            <Contrast size={14} className={cn(highContrast && "animate-pulse")} />
            <span>{highContrast ? 'Contraste: ATIVO' : 'Alto Contraste'}</span>
          </button>

          <div className={cn(
            "flex p-0.5 rounded-full border shadow-inner select-none relative gap-0.5 justify-start self-start md:self-center",
            highContrast 
              ? "bg-zinc-900 border-zinc-700" 
              : "bg-slate-100/80 border-slate-200/50"
          )}>
            {[
              { key: 'photos', label: 'Mural de Clientes', icon: <Camera size={14} /> },
              { key: 'logo', label: 'Logo e Capa (Favicon)', icon: <Settings size={14} /> }
            ].map(tab => {
              const isActive = activeSubTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveSubTab(tab.key as any)}
                  className={cn(
                    "relative px-5 py-2 text-[10px] rounded-full font-extrabold uppercase tracking-widest transition-colors cursor-pointer select-none z-10 flex items-center justify-center gap-2",
                    isActive 
                      ? highContrast 
                        ? "text-black font-black" 
                        : "text-slate-900 font-black" 
                      : highContrast 
                        ? "text-zinc-400 hover:text-white" 
                        : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="activeMuralSubTabBackground"
                      className={cn(
                        "absolute inset-[1px] rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.04)]",
                        highContrast 
                          ? "bg-yellow-400 border border-yellow-500" 
                          : "bg-white border border-slate-200/40"
                      )}
                      style={{ zIndex: -1 }}
                      transition={{ type: 'spring', stiffness: 480, damping: 35, mass: 1 }}
                    />
                  )}
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

       {activeSubTab === 'photos' && (
        <>
          {/* Action Header */}
          <div className={cn(
            "flex flex-col sm:flex-row items-center justify-between gap-4 rounded-[24px] p-4 border transition-all duration-200",
            highContrast 
              ? "bg-black border-white border-4 text-white shadow-[4px_4px_0px_rgba(255,255,255,1)]" 
              : "bg-white border-slate-200 shadow-sm"
          )}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
              <h2 className={cn(
                "text-xs font-black uppercase tracking-widest flex items-center gap-2",
                highContrast ? "text-yellow-400" : "text-slate-800"
              )}>
                <Sparkles size={16} className={cn(highContrast ? "text-yellow-450 animate-pulse" : "text-amber-500 animate-pulse")} /> Mural de Encomendas ({photos.length})
              </h2>
              <button
                onClick={() => setShowInsights(!showInsights)}
                className={cn(
                  "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border self-start sm:self-center",
                  highContrast
                    ? showInsights
                      ? "bg-yellow-400 text-black border-black border-2"
                      : "bg-zinc-900 text-white border-zinc-700 hover:bg-zinc-850"
                    : showInsights 
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
                setMantoType('Manto I (Home)');
                setIsPhotoModalOpen(true);
              }}
              className={cn(
                "w-full sm:w-auto px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                highContrast
                  ? "bg-yellow-400 hover:bg-yellow-300 text-black border-black border-2 font-black shadow-[3px_3px_0px_rgba(255,255,255,1)]"
                  : "bg-red-800 hover:bg-slate-950 text-white shadow-md hover:scale-[1.01]"
              )}
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
                <div className={cn(
                  "grid grid-cols-1 md:grid-cols-3 gap-6 border rounded-[32px] p-6 mb-6 transition-all duration-200",
                  highContrast 
                    ? "bg-zinc-950 border-white border-2" 
                    : "bg-slate-50 border-slate-200"
                )}>
                  
                  {/* Card 1: Cobertura de Prova Social */}
                  <div className={cn(
                    "rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden transition-all duration-200 border",
                    highContrast 
                      ? "bg-black border-white border-2 text-white" 
                      : "bg-white border-slate-200/60 shadow-sm"
                  )}>
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-wider",
                          highContrast ? "text-yellow-400" : "text-slate-400"
                        )}>Poder de Prova Social</span>
                        <div className={cn(
                          "p-1.5 rounded-lg",
                          highContrast ? "bg-white text-black" : "bg-rose-50 text-red-800"
                        )}>
                          <TrendingUp size={14} />
                        </div>
                      </div>
                      <h4 className={cn(
                        "text-[11px] font-black uppercase tracking-wide mb-1",
                        highContrast ? "text-white" : "text-slate-800"
                      )}>Métricas de Engajamento</h4>
                      <p className={cn(
                        "text-[11px] leading-relaxed font-medium",
                        highContrast ? "text-yellow-100" : "text-slate-400"
                      )}>As fotos geram até 40% mais cliques em campanhas e catálogos.</p>
                      
                      <div className="mt-5 space-y-3.5">
                        <div className={cn(
                          "flex items-center justify-between text-[10px] font-black uppercase",
                          highContrast ? "text-white" : "text-slate-600"
                        )}>
                          <span>Cobertura de Vendas</span>
                          <span className="font-mono text-xs">{socialProofRatio}%</span>
                        </div>
                        <div className={cn(
                          "w-full rounded-full h-2 overflow-hidden border",
                          highContrast ? "bg-zinc-800 border-zinc-700" : "bg-slate-100 border-slate-200/30"
                        )}>
                          <div 
                            className={cn(
                              "h-full rounded-full transition-all duration-1000",
                              highContrast ? "bg-yellow-400" : "bg-red-800"
                            )}
                            style={{ width: `${Math.min(100, Number(socialProofRatio))}%` }}
                          />
                        </div>
                        <p className={cn(
                          "text-[9px] font-semibold uppercase tracking-widest flex items-center gap-1.5 pt-1",
                          highContrast ? "text-yellow-400" : "text-slate-400"
                        )}>
                          <span>{salesWithPhotosCount} de {totalSalesCount} fotos cadastradas com vendas</span>
                        </p>
                      </div>
                    </div>
                    <div className={cn(
                      "mt-4 pt-3.5 text-[9px] leading-relaxed p-2.5 rounded-xl border",
                      highContrast 
                        ? "bg-zinc-900 border-zinc-800 text-zinc-300" 
                        : "bg-slate-50 border-slate-105 text-slate-450"
                    )}>
                      <strong>Meta Saudável:</strong> Alcançar 30% de cobertura no ano para elevar a credibilidade geral do seu e-commerce.
                    </div>
                  </div>

                  {/* Card 2: Caimento & Modelagem de Mantos */}
                  <div className={cn(
                    "rounded-2xl p-5 flex flex-col justify-between border transition-all duration-200",
                    highContrast 
                      ? "bg-black border-white border-2 text-white" 
                      : "bg-white border-slate-200/60 shadow-sm"
                  )}>
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-wider",
                          highContrast ? "text-yellow-400" : "text-slate-400"
                        )}>Guia de Ajustes de Caimento</span>
                        <div className={cn(
                          "p-1.5 rounded-lg",
                          highContrast ? "bg-white text-black" : "bg-emerald-50 text-emerald-700"
                        )}>
                          <Check size={14} />
                        </div>
                      </div>
                      <h4 className={cn(
                        "text-[11px] font-black uppercase tracking-wide mb-1 flex items-center gap-1.5",
                        highContrast ? "text-white" : "text-slate-800"
                      )}>
                        <span>Jogador vs Torcedor</span>
                      </h4>
                      <p className={cn(
                        "text-[11px] leading-relaxed font-medium",
                        highContrast ? "text-yellow-100" : "text-slate-400"
                      )}>Mapeamento qualitativo de tamanho e estrutura base de fardas.</p>
                      
                      <div className="mt-4 space-y-2.5 text-[10px] uppercase font-bold">
                        <div className={cn(
                          "flex items-center gap-2 p-2 rounded-xl border",
                          highContrast 
                            ? "bg-zinc-900 border-zinc-850 text-white" 
                            : "bg-emerald-50/50 border-emerald-100/50 text-slate-600"
                        )}>
                          <span className={cn("text-xs font-sans", highContrast ? "text-yellow-450 font-black" : "text-emerald-600")}>✓</span>
                          <span><strong>Manto Torcedor:</strong> Caimento padrão e fiel ao tamanho nominal (96% precisão).</span>
                        </div>
                        <div className={cn(
                          "flex items-center gap-2 p-2 rounded-xl border",
                          highContrast 
                            ? "bg-zinc-900 border-zinc-850 text-white" 
                            : "bg-amber-50/50 border-amber-100/50 text-slate-600"
                        )}>
                          <span className={cn("text-xs font-sans", highContrast ? "text-yellow-450 font-black" : "text-amber-600")}>⚠</span>
                          <span><strong>Manto Jogador:</strong> Versão slim. Orientar compradores a solicitar +1 tamanho acima!</span>
                        </div>
                      </div>
                    </div>
                    <div className={cn(
                      "mt-4 pt-3 text-[8.5px] tracking-wider uppercase font-black flex items-center justify-between border-t",
                      highContrast ? "border-zinc-800 text-yellow-450" : "border-slate-100 text-slate-400"
                    )}>
                      <span>Evita Devoluções</span>
                      <span className={highContrast ? "text-white font-black" : "text-red-800"}>Custo de Frete Reverso -95%</span>
                    </div>
                  </div>

                  {/* Card 3: Gerador Copiador de Script Whatsapp */}
                  <div className={cn(
                    "rounded-2xl p-5 flex flex-col justify-between border transition-all duration-200",
                    highContrast 
                      ? "bg-black border-white border-2 text-white" 
                      : "bg-white border-slate-200/60 shadow-sm"
                  )}>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-wider",
                          highContrast ? "text-yellow-400" : "text-slate-400"
                        )}>Captador de Prova Social</span>
                        <div className={cn(
                          "p-1.5 rounded-lg",
                          highContrast ? "bg-white text-black" : "bg-blue-50 text-blue-600"
                        )}>
                          <Plus size={14} />
                        </div>
                      </div>
                      <div>
                        <h4 className={cn(
                          "text-[11px] font-black uppercase tracking-wide mb-1",
                          highContrast ? "text-white" : "text-slate-800"
                        )}>Pedir Foto do Manto</h4>
                        <p className={cn(
                          "text-[11px] leading-relaxed font-medium",
                          highContrast ? "text-yellow-100" : "text-slate-400"
                        )}>Insira os dados para gerar mensagens personalizadas de incentivo.</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className={cn(
                            "text-[8px] font-black uppercase tracking-widest",
                            highContrast ? "text-zinc-400" : "text-slate-400"
                          )}>Nome Cliente</label>
                          <input 
                            type="text" 
                            className={cn(
                              "w-full text-xs font-bold px-3 py-1.5 border rounded-lg outline-none",
                              highContrast 
                                ? "bg-zinc-900 border-zinc-750 text-white focus:border-yellow-400" 
                                : "bg-slate-50 border-slate-200 text-slate-750"
                            )}
                            value={insightName}
                            onChange={(e) => setInsightName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className={cn(
                            "text-[8px] font-black uppercase tracking-widest",
                            highContrast ? "text-zinc-400" : "text-slate-400"
                          )}>Cupom Incentivo</label>
                          <input 
                            type="text" 
                            className={cn(
                              "w-full text-xs font-bold px-3 py-1.5 border rounded-lg outline-none",
                              highContrast 
                                ? "bg-zinc-900 border-zinc-750 text-white focus:border-yellow-400" 
                                : "bg-slate-50 border-slate-200 text-slate-750"
                            )}
                            value={insightVoucher}
                            onChange={(e) => setInsightVoucher(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Msg text preview */}
                      <div className={cn(
                        "text-[10px] p-2.5 rounded-xl font-mono line-clamp-3 leading-relaxed relative border",
                        highContrast 
                          ? "bg-zinc-900 border-zinc-800 text-zinc-350" 
                          : "bg-slate-50 border-slate-150 text-slate-650"
                      )}>
                        {!highContrast && <div className="absolute inset-0 bg-gradient-to-t from-white/95 via-white/40 to-transparent" />}
                        <span className={cn(
                          "text-[8.5px] block font-sans font-black uppercase tracking-wider mb-1",
                          highContrast ? "text-yellow-400" : "text-slate-400"
                        )}>Prévia Whatsapp:</span>
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
                        "w-full mt-4 py-3 rounded-xl text-[10px] uppercase font-black tracking-widest flex items-center justify-center gap-1.5 transition-all text-white border",
                        isCopied 
                          ? "bg-emerald-600 border-emerald-500" 
                          : highContrast
                            ? "bg-yellow-400 border-black text-black font-black hover:bg-yellow-300 shadow-[2px_2px_0px_rgba(255,255,255,1)]"
                            : "bg-slate-900 hover:bg-slate-950 border-slate-950 shadow-sm"
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

          {/* Manto Categories Filter Bar */}
          <div className={cn(
            "flex flex-wrap items-center gap-2 mb-6 p-2 rounded-2xl border transition-all",
            highContrast 
              ? "bg-black border-white border-2" 
              : "bg-slate-50 border-slate-200/60"
          )}>
            {[
              { key: 'Todos', label: 'Todos os Mantos' },
              { key: 'Manto I (Home)', label: 'Manto I (Home)' },
              { key: 'Manto II (Away)', label: 'Manto II (Away)' },
              { key: 'Goleiro', label: 'Goleiro' },
              { key: 'Retrô', label: 'Retrô' },
              { key: 'Treino', label: 'Treino' }
            ].map((cat) => {
              const count = cat.key === 'Todos' 
                ? photos.length 
                : photos.filter(p => (p.mantoType || 'Manto I (Home)') === cat.key).length;
              const isActive = filterMantoType === cat.key;
              
              return (
                <button
                  key={cat.key}
                  onClick={() => setFilterMantoType(cat.key)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-250 flex items-center gap-2 border",
                    isActive
                      ? highContrast
                        ? "bg-yellow-400 text-black border-black font-black"
                        : "bg-red-800 text-white border-red-800 shadow-sm font-black scale-102"
                      : highContrast
                        ? "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:bg-zinc-850"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-800"
                  )}
                >
                  {cat.label}
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-md text-[8px] font-mono",
                    isActive
                      ? highContrast
                        ? "bg-black text-yellow-450"
                        : "bg-red-900/40 text-rose-100"
                      : highContrast
                        ? "bg-zinc-850 text-zinc-400"
                        : "bg-slate-100 text-slate-500"
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Photos Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {loading ? (
              <div className="col-span-full py-20 flex flex-col items-center justify-center gap-3">
                <div className={cn(
                  "size-10 border-2 rounded-full animate-spin",
                  highContrast ? "border-zinc-800 border-t-yellow-400" : "border-slate-200 border-t-red-800"
                )} />
                <p className={cn(
                  "text-[10px] font-bold uppercase tracking-widest animate-pulse",
                  highContrast ? "text-yellow-400" : "text-slate-400"
                )}>Carregando fotos do mural...</p>
              </div>
            ) : photos.length === 0 ? (
              <div className={cn(
                "col-span-full rounded-[32px] p-20 border flex flex-col items-center justify-center text-center transition-all duration-200",
                highContrast 
                  ? "bg-black border-white border-4 text-white" 
                  : "bg-white border-slate-200"
              )}>
                <div className={cn(
                  "size-16 rounded-3xl flex items-center justify-center mb-4",
                  highContrast ? "bg-zinc-900 text-yellow-400 border border-zinc-850" : "bg-slate-50 text-slate-300"
                )}>
                  <Camera size={28} />
                </div>
                <h3 className={cn(
                  "text-sm font-black uppercase tracking-wider mb-2",
                  highContrast ? "text-yellow-400" : "text-slate-700"
                )}>Seu Mural está vazio</h3>
                <p className={cn(
                  "text-xs max-w-sm mb-6 leading-relaxed",
                  highContrast ? "text-zinc-300 font-bold" : "text-slate-400"
                )}>Guarde fotos de qualidade dos seus clientes vestindo as camisas vendidas. Isso serve como excelente prova social e dado qualitativo de caimento dos mantos.</p>
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
                    setMantoType('Manto I (Home)');
                    setIsPhotoModalOpen(true);
                  }}
                  className={cn(
                    "px-6 py-3 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all font-sans",
                    highContrast
                      ? "bg-yellow-400 text-black border-black border-2 shadow-[3px_3px_0px_rgba(255,255,255,1)] hover:bg-yellow-300"
                      : "bg-red-800 text-white hover:bg-slate-900"
                  )}
                >
                  Subir Primeira Foto
                </button>
              </div>
            ) : filteredPhotos.length === 0 ? (
              <div className={cn(
                "col-span-full rounded-[32px] p-20 border flex flex-col items-center justify-center text-center transition-all duration-200",
                highContrast 
                  ? "bg-black border-white border-4 text-white" 
                  : "bg-white border-slate-200"
              )}>
                <div className={cn(
                  "size-16 rounded-3xl flex items-center justify-center mb-4",
                  highContrast ? "bg-zinc-900 text-yellow-400 border border-zinc-850" : "bg-slate-50 text-slate-300"
                )}>
                  <Camera size={28} />
                </div>
                <h3 className={cn(
                  "text-sm font-black uppercase tracking-wider mb-2",
                  highContrast ? "text-yellow-400" : "text-slate-700"
                )}>Nenhum Manto Encontrado</h3>
                <p className={cn(
                  "text-xs max-w-sm mb-6 leading-relaxed",
                  highContrast ? "text-zinc-300 font-bold" : "text-slate-400"
                )}>Não há nenhuma foto associada ao filtro "{filterMantoType}" no momento. Altere a categoria ou cadastre fotos novas com esta etiqueta!</p>
                <button 
                  onClick={() => setFilterMantoType('Todos')}
                  className={cn(
                    "px-6 py-3 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all font-sans",
                    highContrast
                      ? "bg-yellow-400 text-black border-black border-2 shadow-[3px_3px_0px_rgba(255,255,255,1)] hover:bg-yellow-300"
                      : "bg-slate-900 text-white hover:bg-slate-950"
                  )}
                >
                  Ver Todos os Mantos
                </button>
              </div>
            ) : (
              filteredPhotos.map((item) => (
                <motion.div 
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    "rounded-[28px] overflow-hidden transition-all duration-300 relative flex flex-col p-4 border",
                    highContrast 
                      ? "bg-black border-white border-4 text-white shadow-[4px_4px_0px_rgba(255,255,255,1)]" 
                      : "bg-white border-slate-200 shadow-sm group hover:shadow-xl"
                  )}
                >
                  {/* Polaroid Frame Container - Click "Editar Card" to adjust zoom/placement */}
                  <div 
                    className={cn(
                      "aspect-[9/16] w-full rounded-2xl overflow-hidden bg-slate-900 relative select-none border",
                      highContrast ? "border-white" : "border-slate-100"
                    )}
                  >
                    <img 
                      src={item.photoUrl} 
                      alt={item.customerName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full rounded-2xl pointer-events-none transition-all duration-350 ease-out origin-center object-cover bg-slate-950"
                      style={{ 
                        transform: `scale(${item.scale || 1.0}) translate(${(localOffsets[item.id || '']?.x ?? item.offsetX ?? 0) / (item.scale || 1.0)}px, ${(localOffsets[item.id || '']?.y ?? item.offsetY ?? 0) / (item.scale || 1.0)}px)`
                      }}
                    />

                    {/* Category Overlay Badge */}
                    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 items-start">
                      <span className={cn(
                        "text-[8px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest backdrop-blur-md shadow-sm border",
                        highContrast
                          ? "bg-black/90 text-yellow-400 border-white/50"
                          : "bg-slate-950/80 text-white border-white/10"
                      )}>
                        {item.mantoType || 'Manto I (Home)'}
                      </span>
                    </div>
                    
                    {/* Floating Zoom Controls for Photo Mural */}
                    <div className={cn(
                      "absolute bottom-3 left-3 right-3 rounded-xl p-1.5 flex items-center justify-between gap-1.5 border opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10",
                      highContrast 
                        ? "bg-black border-white text-white opacity-100" 
                        : "bg-black/60 backdrop-blur-md border-white/10"
                    )}>
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
                          className={cn(
                            "size-5 rounded flex items-center justify-center text-xs font-black transition-all",
                            highContrast ? "bg-white text-black hover:bg-yellow-400" : "bg-white/15 text-white hover:bg-white/30"
                          )}
                          type="button"
                          title="Focar menos / Restringir"
                        >
                          -
                        </button>
                        <span className={cn(
                          "text-[9px] font-mono font-black min-w-[34px] text-center py-0.5 rounded",
                          highContrast ? "text-yellow-400 bg-zinc-900" : "text-amber-500 bg-white/5"
                        )}>
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
                          className={cn(
                            "size-5 rounded flex items-center justify-center text-xs font-black transition-all",
                            highContrast ? "bg-white text-black hover:bg-yellow-400" : "bg-white/15 text-white hover:bg-white/30"
                          )}
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
                      className={cn(
                        "absolute top-3 right-3 p-2 rounded-xl shadow-lg transition-all scale-90 z-10",
                        highContrast 
                          ? "bg-black hover:bg-red-700 text-white border border-white opacity-100" 
                          : "bg-black/60 hover:bg-red-800 text-white opacity-0 group-hover:opacity-100 group-hover:scale-100"
                      )}
                      title="Excluir do mural"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Descriptions block (Inside the polaroid aesthetic area) */}
                  <div className="pt-4 pb-1 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn(
                          "text-xs font-black uppercase tracking-tight truncate",
                          highContrast ? "text-yellow-400 text-sm font-black" : "text-slate-900"
                        )}>{item.customerName}</span>
                        {item.saleId && (
                          <span className={cn(
                            "text-[7.5px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest font-sans border",
                            highContrast ? "bg-white text-black border-white" : "bg-slate-100 text-slate-600 border-slate-200"
                          )}>Venda</span>
                        )}
                      </div>

                      {item.saleDate && (
                        <p className={cn(
                          "text-[8.5px] font-bold uppercase tracking-wider mt-1 flex items-center gap-1",
                          highContrast ? "text-white" : "text-slate-400"
                        )}>
                          <span>Vendido em {item.saleDate}</span>
                        </p>
                      )}

                      {item.saleItemsSummary && (
                        <p className={cn(
                          "text-[9px] mt-1 line-clamp-1 truncate font-semibold",
                          highContrast ? "text-zinc-300" : "text-slate-500 italic"
                        )} title={item.saleItemsSummary}>
                          Manto(s): {item.saleItemsSummary}
                        </p>
                      )}

                      {item.description && (
                        <p className={cn(
                          "text-[10px] mt-2 p-2.5 rounded-xl font-sans leading-relaxed border",
                          highContrast 
                            ? "bg-zinc-900 border-zinc-800 text-white font-black" 
                            : "bg-slate-50 border-slate-100 text-slate-600"
                        )}>
                          "{item.description}"
                        </p>
                      )}
                    </div>

                    {/* Actions Row */}
                    <div className={cn(
                      "mt-4 pt-3 flex items-center gap-2 border-t",
                      highContrast ? "border-zinc-800" : "border-slate-150"
                    )}>
                      <button
                        onClick={() => {
                          setSelectedPhotoForStories(item);
                          setStoriesText(`Manto sagrado do(a) ${item.customerName}! ⚽🔥`);
                          setStoriesCoupon('CLUBBOLA10');
                          setStoriesTheme('red');
                          setStoriesShowLogo(true);
                          setIsStoriesModalOpen(true);
                        }}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 border",
                          highContrast
                            ? "bg-yellow-400 hover:bg-yellow-300 text-black border-black border-2 font-black"
                            : "bg-red-800 hover:bg-red-900 text-white shadow-sm"
                        )}
                        title="Gerar Story de Instagram"
                      >
                        <Instagram size={11} /> Story
                      </button>
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
                          setMantoType(item.mantoType || 'Manto I (Home)');
                          setIsPhotoModalOpen(true);
                        }}
                        className={cn(
                          "py-2 px-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 border",
                          highContrast
                            ? "bg-zinc-900 hover:bg-zinc-800 text-white border-white border"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200/50"
                        )}
                        title="Editar detalhes do card"
                      >
                        <Settings size={11} className={highContrast ? "text-white" : "text-slate-500"} /> Editar
                      </button>
                      <button
                        onClick={() => item.id && handleDeletePhoto(item.id)}
                        className={cn(
                          "p-2 border rounded-xl transition-all",
                          highContrast
                            ? "border-red-600 bg-red-950 text-red-200 hover:bg-red-900"
                            : "border-rose-200 hover:bg-rose-50 text-red-700"
                        )}
                        title="Deletar foto"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div className={cn(
                      "mt-3 pt-2 flex items-center justify-between text-[8px] font-black uppercase tracking-widest border-t",
                      highContrast ? "border-zinc-800 text-yellow-400" : "border-slate-100 text-slate-400"
                    )}>
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
          <div className={cn(
            "md:col-span-8 rounded-[32px] p-8 border space-y-8 transition-all duration-200",
            highContrast 
              ? "bg-black border-white border-4 text-white shadow-[4px_4px_0px_rgba(255,255,255,1)]" 
              : "bg-white border-slate-200 shadow-sm"
          )}>
            <div>
              <h3 className={cn(
                "text-sm font-black uppercase tracking-wider",
                highContrast ? "text-yellow-400" : "text-slate-850"
              )}>Trocar Imagem de Identidade</h3>
              <p className={cn(
                "text-xs mt-1",
                highContrast ? "text-zinc-300" : "text-slate-400"
              )}>Insira um arquivo de imagem (JPG ou PNG). O sistema irá compactar e injetar em toda a plataforma.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-center">
              {/* Box 1: Current Logo View */}
              <div className={cn(
                "border rounded-3xl p-6 flex flex-col items-center justify-center text-center aspect-square md:aspect-auto md:h-56 transition-all duration-200",
                highContrast 
                  ? "bg-zinc-900 border-zinc-700 text-white" 
                  : "bg-slate-50/50 border-slate-100"
              )}>
                {isSavingLogo ? (
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className={cn(
                      "size-10 border-2 rounded-full animate-spin",
                      highContrast ? "border-zinc-800 border-t-yellow-400" : "border-slate-200 border-t-red-800"
                    )} />
                    <p className={cn(
                      "text-[9px] font-bold uppercase tracking-widest animate-pulse",
                      highContrast ? "text-yellow-400" : "text-slate-400"
                    )}>Escrevendo no Banco...</p>
                  </div>
                ) : logoFile ? (
                  <div className="space-y-4">
                    <div className={cn(
                      "size-28 rounded-2xl border shadow-md flex items-center justify-center mx-auto overflow-hidden relative",
                      highContrast ? "bg-zinc-950 border-zinc-700" : "bg-slate-100 border-slate-200"
                    )}>
                      <img 
                        src={logoFile} 
                        alt="Logo ERP" 
                        style={{ transform: `scale(${logoScale})` }}
                        className="w-full h-full object-cover rounded-2xl transition-transform duration-300" 
                        referrerPolicy="no-referrer" 
                      />
                    </div>
                    <div>
                      <p className={cn(
                        "text-[10px] font-black uppercase tracking-wider",
                        highContrast ? "text-white" : "text-slate-900"
                      )}>Sua Logo Ativa</p>
                      
                      {/* Zoom Controls for Active Logo */}
                      <div className={cn(
                        "flex items-center justify-center gap-2 mt-2 p-1.5 rounded-xl border w-36 mx-auto",
                        highContrast ? "bg-zinc-950 border-zinc-800" : "bg-slate-100 border-slate-200"
                      )}>
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
                          className={cn(
                            "size-6 rounded-lg flex items-center justify-center text-xs font-bold shadow-sm transition-all font-sans",
                            highContrast ? "bg-zinc-800 hover:bg-zinc-700 text-white" : "bg-white hover:bg-slate-200 text-slate-700"
                          )}
                        >
                          -
                        </button>
                        <span className={cn(
                          "text-[9px] font-mono font-black",
                          highContrast ? "text-yellow-400" : "text-red-800"
                        )}>
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
                          className={cn(
                            "size-6 rounded-lg flex items-center justify-center text-xs font-bold shadow-sm transition-all font-sans",
                            highContrast ? "bg-zinc-800 hover:bg-zinc-700 text-white" : "bg-white hover:bg-slate-200 text-slate-700"
                          )}
                        >
                          +
                        </button>
                      </div>

                      <button 
                        onClick={handleResetLogo}
                        className={cn(
                          "text-[9px] font-bold uppercase tracking-widest mt-3.5 hover:underline block mx-auto",
                          highContrast ? "text-red-400 hover:text-red-300" : "text-red-600 hover:text-red-700"
                        )}
                      >
                        Remover e Voltar ao Padrão
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className={cn(
                      "size-16 rounded-2xl flex items-center justify-center mx-auto",
                      highContrast ? "bg-zinc-800 text-yellow-400" : "bg-slate-100 text-slate-400"
                    )}>
                      <ImageIcon size={28} />
                    </div>
                    <div>
                      <p className={cn(
                        "text-[10px] font-black uppercase tracking-wider",
                        highContrast ? "text-zinc-300" : "text-slate-500"
                      )}>Nenhuma logo personalizada</p>
                      <p className={cn(
                        "text-[9.5px] mt-1 max-w-[180px] mx-auto text-center",
                        highContrast ? "text-zinc-500" : "text-slate-400"
                      )}>Usando ícone dinâmico padrão</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Box 2: Drop & Upload Inputs */}
              <div className={cn(
                "relative border-2 border-dashed rounded-3xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all aspect-square md:aspect-auto md:h-56 group",
                highContrast
                  ? "bg-zinc-900 border-white hover:border-yellow-400 text-white"
                  : "bg-slate-50/20 border-slate-200 hover:border-slate-400"
              )}>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                  onChange={handleLogoUploadChange}
                  disabled={isSavingLogo}
                />
                <div className="space-y-3">
                  <div className={cn(
                    "size-12 rounded-xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform",
                    highContrast ? "bg-zinc-800 text-yellow-400" : "bg-slate-100 text-slate-500"
                  )}>
                    <Upload size={20} />
                  </div>
                  <div>
                    <span className={cn(
                      "text-xs font-black uppercase block",
                      highContrast ? "text-white" : "text-slate-700"
                    )}>Arrastar ou Escolher Foto</span>
                    <span className={cn(
                      "text-[9px] mt-1.5 block",
                      highContrast ? "text-zinc-400" : "text-slate-400"
                    )}>Favicon, PNG ou JPG de alta qualidade</span>
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
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                "rounded-[32px] max-w-lg w-full flex flex-col shadow-2xl overflow-hidden relative max-h-[90vh] transition-all duration-200 border",
                highContrast 
                  ? "bg-black border-white border-4 text-white" 
                  : "bg-white border-slate-100"
              )}
            >
              <div className={cn(
                "p-6 flex items-center justify-between border-b transition-all duration-200",
                highContrast ? "bg-zinc-950 border-zinc-800 text-white" : "bg-slate-900 border-slate-800 text-white"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "size-8 rounded-lg flex items-center justify-center",
                    highContrast ? "bg-yellow-400 text-black" : "bg-red-800 text-white"
                  )}>
                    <Camera size={14} className={highContrast ? "text-black" : "text-white"} />
                  </div>
                  <div>
                    <h3 className={cn(
                      "text-xs font-black uppercase tracking-widest leading-none",
                      highContrast ? "text-yellow-400" : "text-rose-50"
                    )}>
                      {editingPhotoId ? 'Editar Publicação de Manto' : 'Registrar Manto no Cliente'}
                    </h3>
                    <p className={cn(
                      "text-[9px] uppercase font-bold tracking-widest mt-1",
                      highContrast ? "text-white" : "text-slate-400"
                    )}>Conectar momento afetivo à base de vendas</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsPhotoModalOpen(false)}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    highContrast ? "text-zinc-400 hover:text-white bg-zinc-900" : "text-slate-400 hover:text-white bg-white/5"
                  )}
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleAddPhotoSubmit} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                {/* Photo Dropzone */}
                <div className="space-y-2">
                  <label className={cn(
                    "text-[10px] uppercase font-black tracking-wider",
                    highContrast ? "text-yellow-400" : "text-slate-400"
                  )}>Foto do Cliente vestindo o Manto</label>
                  
                  {selectedPhotoFile ? (
                    <div className="space-y-4">
                      <div 
                        className={cn(
                          "relative aspect-[9/16] w-full max-w-[260px] mx-auto rounded-2xl overflow-hidden border group bg-slate-950 flex items-center justify-center select-none",
                          highContrast ? "border-zinc-750" : "border-slate-200"
                        )}
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
                          className="w-full h-full transition-all duration-350 ease-out pointer-events-none origin-center object-cover bg-slate-950" 
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
                          className={cn(
                            "absolute top-3 right-3 p-2 text-white rounded-xl transition-all shadow-lg z-10",
                            highContrast ? "bg-red-600 hover:bg-red-500" : "bg-black/60 hover:bg-red-800"
                          )}
                        >
                          <X size={14} />
                        </button>
                      </div>

                      {/* Zoom Controls inside Modal */}
                      <div className={cn(
                        "flex items-center justify-center gap-2 p-2 rounded-xl border w-44 mx-auto",
                        highContrast ? "bg-zinc-950 border-zinc-850" : "bg-slate-50 border-slate-200"
                      )}>
                        <button
                          type="button"
                          onClick={() => {
                            const nextScale = Math.max(0.1, photoScale - 0.1);
                            setPhotoScale(nextScale);
                          }}
                          className={cn(
                            "size-7 rounded-lg flex items-center justify-center text-xs font-bold shadow-sm transition-all font-sans",
                            highContrast ? "bg-zinc-800 hover:bg-zinc-750 text-white" : "bg-white hover:bg-slate-200 text-slate-700"
                          )}
                        >
                          -
                        </button>
                        <span className={cn(
                          "text-[10px] font-mono font-black min-w-[50px] text-center",
                          highContrast ? "text-yellow-400" : "text-slate-800"
                        )}>
                          {Math.round(photoScale * 100)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const nextScale = Math.min(3.0, photoScale + 0.1);
                            setPhotoScale(nextScale);
                          }}
                          className={cn(
                            "size-7 rounded-lg flex items-center justify-center text-xs font-bold shadow-sm transition-all font-sans",
                            highContrast ? "bg-zinc-800 hover:bg-zinc-750 text-white" : "bg-white hover:bg-slate-200 text-slate-700"
                          )}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={cn(
                      "relative border-2 border-dashed bg-slate-50/30 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all aspect-video",
                      highContrast ? "bg-zinc-900 border-white hover:border-yellow-450" : "border-slate-200 hover:border-slate-400"
                    )}>
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
                          <div className={cn(
                            "size-8 border-2 rounded-full animate-spin mx-auto",
                            highContrast ? "border-zinc-800 border-t-yellow-400" : "border-slate-200 border-t-red-800"
                          )} />
                          <p className={cn(
                            "text-[9px] font-bold uppercase tracking-widest animate-pulse",
                            highContrast ? "text-yellow-400" : "text-slate-400"
                          )}>Processando Foto...</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className={cn(
                            "size-12 rounded-xl flex items-center justify-center mx-auto",
                            highContrast ? "bg-zinc-800 text-yellow-400" : "bg-white shadow-sm border border-slate-100 text-slate-400"
                          )}>
                            <Upload size={18} />
                          </div>
                          <div>
                            <span className={cn(
                              "text-xs font-black uppercase block",
                              highContrast ? "text-white" : "text-slate-700"
                            )}>Selecionar Foto do Cliente</span>
                            <span className={cn(
                              "text-[9px] mt-1 block",
                              highContrast ? "text-zinc-450" : "text-slate-400"
                            )}>Tire no celular ou escolha da galeria</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Autocomplete Customer Select */}
                <div className="space-y-2 relative">
                  <label className={cn(
                    "text-[10px] uppercase font-black tracking-wider",
                    highContrast ? "text-yellow-400" : "text-slate-400"
                  )}>Vincular Cliente do Clube</label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      required
                      type="text"
                      className={cn(
                        "w-full pl-11 pr-4 py-3 border rounded-xl outline-none transition-all font-sans text-sm font-semibold",
                        highContrast
                          ? "bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 focus:ring-1 focus:ring-yellow-450 focus:border-yellow-450"
                          : "bg-white border-slate-200 text-slate-800 placeholder:text-slate-300 focus:ring-1 focus:ring-red-800"
                      )}
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
                        className={cn(
                          "absolute top-full left-0 right-0 max-h-48 overflow-y-auto border rounded-xl shadow-xl z-20 divide-y mt-1.5 custom-scrollbar",
                          highContrast
                            ? "bg-zinc-950 border-zinc-800 divide-zinc-850"
                            : "bg-white border-slate-200 divide-slate-100"
                        )}
                      >
                        {filteredCustomers.length === 0 ? (
                          <div className={cn(
                            "p-4 text-center text-xs font-bold uppercase tracking-wider",
                            highContrast ? "text-zinc-500" : "text-slate-400"
                          )}>
                            Nenhum cliente cadastrado com esse nome
                          </div>
                        ) : (
                          filteredCustomers.map(cust => (
                            <div 
                              key={cust.id}
                              onClick={() => cust && handleChooseCustomer(cust)}
                              className={cn(
                                "px-4 py-3 text-xs font-semibold cursor-pointer flex items-center justify-between transition-all",
                                highContrast 
                                  ? "text-white hover:bg-zinc-850" 
                                  : "text-slate-750 hover:bg-slate-50"
                              )}
                            >
                              <span>{cust.name}</span>
                              <span className={cn(
                                "text-[8.5px] font-black",
                                highContrast ? "text-yellow-400" : "text-slate-400"
                              )}>{cust.contact}</span>
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
                    <label className={cn(
                      "text-[10px] uppercase font-black tracking-wider flex items-center gap-1",
                      highContrast ? "text-yellow-400" : "text-slate-400"
                    )}>
                      Venda / Pedido Relacionado <span className="text-[8px] font-normal lowercase">(opcional)</span>
                    </label>
                    <select 
                      className={cn(
                        "w-full px-4 py-3 border rounded-xl outline-none font-sans text-sm font-semibold transition-all",
                        highContrast
                          ? "bg-zinc-900 border-zinc-700 text-white focus:ring-1 focus:ring-yellow-450 focus:border-yellow-450"
                          : "bg-white border-slate-200 text-slate-800 focus:ring-1 focus:ring-red-800 focus:border-red-800"
                      )}
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
                      <p className={cn(
                        "text-[9px] font-bold uppercase tracking-wider",
                        highContrast ? "text-yellow-400" : "text-amber-600"
                      )}>O cliente selecionado ainda não possui vendas registradas no sistema.</p>
                    )}
                  </div>
                )}

                {/* Categorização de Mantos */}
                <div className="space-y-3">
                  <label className={cn(
                    "text-[10px] uppercase font-black tracking-wider block",
                    highContrast ? "text-yellow-400" : "text-slate-400"
                  )}>Tipo de Manto (Categorização)</label>
                  <div className="flex flex-wrap gap-2">
                    {['Manto I (Home)', 'Manto II (Away)', 'Goleiro', 'Retrô', 'Treino'].map((type) => {
                      const isSelected = mantoType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setMantoType(type)}
                          className={cn(
                            "px-3.5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all duration-200 flex items-center gap-1.5",
                            isSelected
                              ? highContrast
                                ? "bg-yellow-400 text-black border-black font-black"
                                : "bg-red-800 text-white border-red-800 shadow-sm scale-102"
                              : highContrast
                                ? "bg-zinc-900 text-zinc-400 border-zinc-750 hover:bg-zinc-800 hover:text-white"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800"
                          )}
                        >
                          {isSelected && <Check size={12} className="stroke-[3]" />}
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Qualititative Description / Comments */}
                <div className="space-y-2">
                  <label className={cn(
                    "text-[10px] uppercase font-black tracking-wider",
                    highContrast ? "text-yellow-400" : "text-slate-400"
                  )}>Anotações Qualitativas (Tamanho, Caimento, Feedback)</label>
                  <textarea 
                    className={cn(
                      "w-full px-4 py-3 border rounded-xl outline-none transition-all font-sans text-xs font-medium min-h-24",
                      highContrast
                        ? "bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-650 focus:ring-1 focus:ring-yellow-450 focus:border-yellow-450"
                        : "bg-white border-slate-200 text-slate-800 focus:ring-1 focus:ring-red-800 focus:border-red-800"
                    )}
                    placeholder="Ex: Felipe adorou o caimento G da camisa de jogador do Brasil. Achou o tecido excelente e super confortável..."
                    value={photoDescription}
                    onChange={(e) => setPhotoDescription(e.target.value)}
                  />
                </div>

                {/* Form submit buttons */}
                <div className={cn(
                  "border-t -mx-8 -mb-8 p-6 flex justify-end gap-3 mt-8 transition-all duration-200",
                  highContrast 
                    ? "bg-zinc-950 border-zinc-800" 
                    : "bg-slate-50 border-slate-100"
                )}>
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
                    className={cn(
                      "px-6 py-2.5 text-[10px] font-black uppercase transition-all tracking-widest",
                      highContrast ? "text-zinc-400 hover:text-white" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Descartar
                  </button>
                  <button 
                    type="submit"
                    disabled={uploadProgress || !selectedCustomerId}
                    className={cn(
                      "px-10 py-3 text-[10px] font-black uppercase rounded-xl transition-all shadow-lg tracking-widest disabled:opacity-40",
                      highContrast
                        ? "bg-yellow-400 hover:bg-yellow-350 text-black border-2 border-black"
                        : "bg-red-800 hover:bg-slate-950 text-white"
                    )}
                  >
                    {editingPhotoId ? 'Salvar Edição' : 'Salvar no Mural'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Instagram Stories Post Generator Modal (9:16) */}
      <AnimatePresence>
        {isStoriesModalOpen && selectedPhotoForStories && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className={cn(
                "w-full max-w-4xl rounded-[32px] overflow-hidden flex flex-col md:flex-row shadow-2xl border transition-all duration-300 my-8",
                highContrast 
                  ? "bg-black border-white border-4 text-white" 
                  : "bg-slate-900 border-white/10 text-white"
              )}
            >
              {/* Left Column: Interactive Controls */}
              <div className="flex-1 p-6 sm:p-8 space-y-6 overflow-y-auto max-h-[85vh] custom-scrollbar">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "size-9 rounded-xl flex items-center justify-center shadow-lg",
                      highContrast ? "bg-yellow-400 text-black" : "bg-gradient-to-tr from-pink-600 via-red-500 to-yellow-500 text-white"
                    )}>
                      <Instagram size={18} />
                    </div>
                    <div>
                      <h3 className={cn(
                        "text-sm font-black uppercase tracking-widest",
                        highContrast ? "text-yellow-400" : "text-white"
                      )}>Gerador de Stories</h3>
                      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mt-1">Gere posts profissionais em 9:16</p>
                    </div>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="space-y-4 pt-2">
                  {/* Theme Select */}
                  <div className="space-y-2">
                    <label className={cn(
                      "text-[10px] uppercase font-black tracking-wider block",
                      highContrast ? "text-yellow-400" : "text-slate-400"
                    )}>Tema Visual (Paleta de Cores)</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'red', name: 'Vermelho Club', class: 'from-rose-950 via-red-900 to-amber-900' },
                        { id: 'black', name: 'Preto Nobre', class: 'from-zinc-950 via-zinc-900 to-zinc-800' },
                        { id: 'green', name: 'Verde Campo', class: 'from-emerald-950 via-teal-900 to-zinc-900' },
                        { id: 'gold', name: 'Ouro Premium', class: 'from-amber-950 via-yellow-950 to-stone-900' }
                      ].map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setStoriesTheme(t.id as any)}
                          className={cn(
                            "p-2.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1.5",
                            storiesTheme === t.id
                              ? highContrast
                                ? "bg-yellow-400 text-black border-black"
                                : "bg-white/15 text-white border-white/40 shadow-md scale-102"
                              : "bg-white/5 text-slate-400 border-white/5 hover:border-white/10 hover:bg-white/10"
                          )}
                        >
                          <div className={`size-4 rounded-full bg-gradient-to-tr ${t.class} border border-white/20`} />
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Coupon Input */}
                  <div className="space-y-2">
                    <label className={cn(
                      "text-[10px] uppercase font-black tracking-wider block",
                      highContrast ? "text-yellow-400" : "text-slate-400"
                    )}>Cupom de Desconto</label>
                    <input
                      type="text"
                      className={cn(
                        "w-full px-4 py-3 rounded-xl outline-none font-mono font-black text-sm uppercase tracking-widest border transition-all",
                        highContrast
                          ? "bg-zinc-900 border-zinc-700 text-white focus:ring-1 focus:ring-yellow-450"
                          : "bg-white/5 border-white/10 text-white focus:ring-1 focus:ring-red-800 focus:border-red-800"
                      )}
                      placeholder="Ex: CLUB10"
                      value={storiesCoupon}
                      onChange={(e) => setStoriesCoupon(e.target.value)}
                    />
                  </div>

                  {/* Stories Marketing Text */}
                  <div className="space-y-2">
                    <label className={cn(
                      "text-[10px] uppercase font-black tracking-wider block",
                      highContrast ? "text-yellow-400" : "text-slate-400"
                    )}>Texto Publicitário</label>
                    <textarea
                      className={cn(
                        "w-full px-4 py-3 rounded-xl outline-none font-sans text-xs font-semibold min-h-20 transition-all border",
                        highContrast
                          ? "bg-zinc-900 border-zinc-700 text-white focus:ring-1 focus:ring-yellow-450"
                          : "bg-white/5 border-white/10 text-white focus:ring-1 focus:ring-red-800 focus:border-red-800"
                      )}
                      placeholder="Escreva algo motivante ou engraçado sobre a foto..."
                      value={storiesText}
                      onChange={(e) => setStoriesText(e.target.value)}
                    />
                  </div>

                  {/* Toggle Logo */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase font-black tracking-wider block text-white">Exibir Logotipo</span>
                      <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest">Adiciona a marca da loja no topo do Story</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStoriesShowLogo(!storiesShowLogo)}
                      className={cn(
                        "px-3.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                        storiesShowLogo
                          ? "bg-emerald-600 text-white hover:bg-emerald-500"
                          : "bg-zinc-800 text-slate-400 hover:bg-zinc-700"
                      )}
                    >
                      {storiesShowLogo ? 'Sim' : 'Não'}
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-4 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const caption = `${storiesText}\n\n👉 Use o cupom de desconto exclusivo: *${storiesCoupon.toUpperCase()}*\n🛒 Acesse o link da nossa bio para garantir o seu manto sagrado!`;
                      navigator.clipboard.writeText(caption);
                      setIsStoryCopied(true);
                      setTimeout(() => setIsStoryCopied(false), 2000);
                    }}
                    className={cn(
                      "flex-1 py-3.5 rounded-xl text-[10px] uppercase font-black tracking-widest flex items-center justify-center gap-1.5 border transition-all",
                      isStoryCopied
                        ? "bg-emerald-600 border-emerald-500 text-white"
                        : "bg-zinc-850 hover:bg-zinc-800 border-zinc-750 text-white"
                    )}
                  >
                    {isStoryCopied ? (
                      <>
                        <Check size={14} /> Legenda Copiada!
                      </>
                    ) : (
                      <>
                        <Copy size={14} /> Copiar Texto + Cupom
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isDownloadingStory}
                    onClick={handleDownloadStory}
                    className={cn(
                      "flex-1 py-3.5 rounded-xl text-[10px] uppercase font-black tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-lg text-white",
                      isDownloadingStory
                        ? "bg-zinc-700 animate-pulse cursor-not-allowed"
                        : highContrast
                          ? "bg-yellow-400 text-black border-2 border-black font-black hover:bg-yellow-350"
                          : "bg-gradient-to-tr from-pink-600 via-red-500 to-yellow-500 shadow-rose-900/20"
                    )}
                  >
                    {isDownloadingStory ? (
                      <>
                        <div className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Gerando Story...
                      </>
                    ) : (
                      <>
                        <Download size={14} /> Baixar Arte 9:16
                      </>
                    )}
                  </button>
                </div>

                <div className="pt-2 flex justify-start">
                  <button
                    type="button"
                    onClick={() => setIsStoriesModalOpen(false)}
                    className="text-[9px] uppercase tracking-widest font-black text-slate-400 hover:text-white transition-all"
                  >
                    Voltar ao Mural
                  </button>
                </div>
              </div>

              {/* Right Column: Live 9:16 Mock Preview */}
              <div className={cn(
                "w-full md:w-[380px] p-6 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l select-none",
                highContrast ? "bg-zinc-950 border-white/25" : "bg-black/40 border-white/5"
              )}>
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-500 mb-3 block">Pré-visualização do Story (Instagram)</span>
                
                {/* Story Container Frame (9:16 Aspect) */}
                <div
                  className={cn(
                    "aspect-[9/16] w-full max-w-[280px] rounded-[24px] overflow-hidden shadow-2xl relative flex flex-col p-5 text-center border border-white/10 transition-all duration-300",
                    storiesTheme === 'red' && "bg-gradient-to-tr from-rose-950 via-red-900 to-amber-950",
                    storiesTheme === 'black' && "bg-gradient-to-tr from-zinc-950 via-zinc-900 to-zinc-850",
                    storiesTheme === 'green' && "bg-gradient-to-tr from-emerald-950 via-teal-900 to-zinc-950",
                    storiesTheme === 'gold' && "bg-gradient-to-tr from-amber-950 via-yellow-950 to-stone-900"
                  )}
                >
                  {/* Top Branding */}
                  {storiesShowLogo && (
                    <div className="h-10 flex items-center justify-center gap-1 opacity-90">
                      {logoFile ? (
                        <img 
                          src={logoFile} 
                          alt="Logo" 
                          className="h-8 object-contain" 
                          style={{ transform: `scale(${logoScale})` }}
                        />
                      ) : (
                        <span className="text-[10px] font-black tracking-widest text-white flex items-center gap-1">
                          ⚽ CLUB BOLA
                        </span>
                      )}
                    </div>
                  )}

                  {/* Customer Floating Polaroid Card */}
                  <div className="bg-white rounded-2xl p-3 shadow-xl flex flex-col relative mt-2 text-slate-900 border border-white/10">
                    <div className="aspect-square w-full rounded-xl overflow-hidden bg-slate-100 relative">
                      <img
                        src={selectedPhotoForStories.photoUrl}
                        alt="Preview"
                        className="w-full h-full object-cover transition-all animate-fade-in"
                        style={{
                          transform: `scale(${selectedPhotoForStories.scale || 1.0}) translate(${(selectedPhotoForStories.offsetX || 0) / (selectedPhotoForStories.scale || 1.0)}px, ${(selectedPhotoForStories.offsetY || 0) / (selectedPhotoForStories.scale || 1.0)}px)`
                        }}
                      />
                    </div>
                    {/* Name & Tag */}
                    <div className="pt-2.5 pb-1 text-center">
                      <span className="text-[10px] font-black uppercase text-slate-800 block truncate">{selectedPhotoForStories.customerName}</span>
                      <span className="inline-block px-2 py-0.5 mt-1 rounded bg-slate-100 text-slate-500 text-[7px] font-black uppercase tracking-wider">
                        {selectedPhotoForStories.mantoType || 'Manto I (Home)'}
                      </span>
                    </div>
                  </div>

                  {/* Marketing Caption */}
                  <p className="text-[10px] font-bold text-white tracking-wide mt-4 line-clamp-3 leading-relaxed px-1">
                    "{storiesText}"
                  </p>

                  {/* Coupon Box Voucher */}
                  <div className="border border-dashed border-white/20 bg-white/5 rounded-xl py-2 px-3 mt-auto flex flex-col items-center justify-center">
                    <span className="text-[7px] font-black tracking-widest uppercase text-white/70">Cupom de Desconto Exclusivo</span>
                    <span className="text-xs font-mono font-black text-yellow-400 tracking-widest mt-1 uppercase">
                      {storiesCoupon || 'CLUB10'}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
