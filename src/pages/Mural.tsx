import React, { useState, useEffect, useRef, useContext } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, setDoc, getDoc, orderBy } from 'firebase/firestore';
import { Customer, Sale, CustomerPhoto, Coupon } from '../types';
import { Plus, Search, Trash2, Camera, Upload, Image as ImageIcon, Sparkles, X, Settings, Check, HelpCircle, FileImage, Copy, Lightbulb, TrendingUp, Contrast, Instagram, Share2, Download, Grid, RotateCcw, Tag, Percent, Calendar, Gift } from 'lucide-react';
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
  const [activeSubTab, setActiveSubTab] = useState<'photos' | 'logo' | 'coupons'>('photos');

  // Customer Photos state
  const [photos, setPhotos] = useState<CustomerPhoto[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  // Coupons state
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponType, setCouponType] = useState<'percentage' | 'fixed'>('percentage');
  const [couponValue, setCouponValue] = useState('');
  const [couponMinPurchase, setCouponMinPurchase] = useState('');
  const [couponExpiresAt, setCouponExpiresAt] = useState('');
  const [isSavingCoupon, setIsSavingCoupon] = useState(false);

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
  const [showInCatalog, setShowInCatalog] = useState<boolean>(true);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Stories Generator state
  const [isStoriesModalOpen, setIsStoriesModalOpen] = useState(false);
  const [selectedPhotoForStories, setSelectedPhotoForStories] = useState<CustomerPhoto | null>(null);
  const [storiesText, setStoriesText] = useState('Cliente satisfeito vestindo o manto sagrado! ⚽🔥');
  const [storiesProduct, setStoriesProduct] = useState('');
  const [storiesImpactPhrase, setStoriesImpactPhrase] = useState('Qualidade premium e caimento indiscutível! 🔥');
  const [storiesTheme, setStoriesTheme] = useState<'red' | 'black' | 'green' | 'gold' | 'champions' | 'brasil' | 'cyberpunk'>('red');
  const [storiesShowLogo, setStoriesShowLogo] = useState(true);
  const [storiesFormat, setStoriesFormat] = useState<'story' | 'feed'>('story');
  const [storiesSticker, setStoriesSticker] = useState<'none' | 'vip' | 'original' | 'sagrado' | 'limitada'>('none');
  const [isDownloadingStory, setIsDownloadingStory] = useState(false);
  const [isStoryCopied, setIsStoryCopied] = useState(false);
  const [isDownloadingPhoto, setIsDownloadingPhoto] = useState<{ [id: string]: boolean }>({});

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

    // Read coupons
    const qCoupons = query(collection(db, 'coupons'), orderBy('createdAt', 'desc'));
    const unsubCoupons = onSnapshot(qCoupons, (snapshot) => {
      setCoupons(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Coupon)));
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
      unsubCoupons();
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

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode || !couponValue) return;

    setIsSavingCoupon(true);
    try {
      const codeUpper = couponCode.trim().toUpperCase();
      const valNum = parseFloat(couponValue);
      const minNum = couponMinPurchase ? parseFloat(couponMinPurchase) : 0;

      const newCoupon: Coupon = {
        code: codeUpper,
        type: couponType,
        value: valNum,
        minPurchase: minNum,
        isActive: true,
        expiresAt: couponExpiresAt || undefined,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'coupons'), newCoupon);

      // Reset fields
      setCouponCode('');
      setCouponType('percentage');
      setCouponValue('');
      setCouponMinPurchase('');
      setCouponExpiresAt('');
      setIsCouponModalOpen(false);
    } catch (err) {
      console.error("Erro ao salvar cupom:", err);
      handleFirestoreError(err, OperationType.WRITE, 'coupons');
    } finally {
      setIsSavingCoupon(false);
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    if (!window.confirm("Deseja realmente excluir este cupom de desconto?")) return;
    try {
      await deleteDoc(doc(db, 'coupons', id));
    } catch (err) {
      console.error("Erro ao excluir cupom:", err);
    }
  };

  const handleToggleCouponActive = async (coupon: Coupon) => {
    if (!coupon.id) return;
    try {
      await updateDoc(doc(db, 'coupons', coupon.id), {
        isActive: !coupon.isActive
      });
    } catch (err) {
      console.error("Erro ao alterar status do cupom:", err);
    }
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
          showInCatalog: showInCatalog,
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
          showInCatalog: showInCatalog,
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
      setShowInCatalog(true);
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
      const isFeed = storiesFormat === 'feed';
      canvas.width = 1080;
      canvas.height = isFeed ? 1080 : 1920;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");

      // 1. Background Gradient
      const grad = ctx.createLinearGradient(0, 0, 0, isFeed ? 1080 : 1920);
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
      } else if (storiesTheme === 'gold') {
        grad.addColorStop(0, '#78350f');
        grad.addColorStop(0.5, '#451a03');
        grad.addColorStop(1, '#1c0a00');
      } else if (storiesTheme === 'champions') {
        grad.addColorStop(0, '#050b14');
        grad.addColorStop(0.5, '#0d1b3e');
        grad.addColorStop(1, '#172f69');
      } else if (storiesTheme === 'brasil') {
        grad.addColorStop(0, '#006a3f');
        grad.addColorStop(0.5, '#009639');
        grad.addColorStop(1, '#ffdf00');
      } else if (storiesTheme === 'cyberpunk') {
        grad.addColorStop(0, '#090514');
        grad.addColorStop(0.5, '#1c0e2d');
        grad.addColorStop(1, '#3b0764');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, isFeed ? 1080 : 1920);

      // Custom canvas decorations based on selected theme
      if (storiesTheme === 'champions') {
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        const stars = [
          { x: 100, y: 150 }, { x: 300, y: 80 }, { x: 900, y: 120 }, { x: 800, y: 250 },
          { x: 150, y: 1000 }, { x: 950, y: 900 }, { x: 850, y: 1100 }, { x: 200, y: 1050 }
        ];
        stars.forEach(s => {
          if (isFeed && s.y > 1080) return;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(540, isFeed ? 540 : 960, 380, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(540, isFeed ? 540 : 960, 580, 0, Math.PI * 2);
        ctx.stroke();
      } else if (storiesTheme === 'brasil') {
        ctx.strokeStyle = "rgba(255, 223, 0, 0.12)";
        ctx.lineWidth = 35;
        ctx.beginPath();
        ctx.moveTo(-100, isFeed ? 200 : 300);
        ctx.bezierCurveTo(300, 100, 700, isFeed ? 900 : 1200, 1180, isFeed ? 800 : 1500);
        ctx.stroke();

        ctx.strokeStyle = "rgba(0, 150, 57, 0.15)";
        ctx.lineWidth = 45;
        ctx.beginPath();
        ctx.moveTo(-100, isFeed ? 800 : 1500);
        ctx.bezierCurveTo(400, isFeed ? 500 : 1000, 600, 200, 1180, isFeed ? 300 : 400);
        ctx.stroke();
      } else if (storiesTheme === 'cyberpunk') {
        ctx.strokeStyle = "rgba(244, 63, 94, 0.3)";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(80, 60);
        ctx.lineTo(1000, 60);
        ctx.stroke();

        ctx.strokeStyle = "rgba(217, 70, 239, 0.3)";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(60, 80);
        ctx.lineTo(60, isFeed ? 1000 : 1840);
        ctx.stroke();
      }

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
            const logoW = (isFeed ? 100 : 120) * logoScale;
            const logoH = (isFeed ? 100 : 120) * logoScale;
            const logoX = isFeed ? (800 - logoW / 2) : (540 - logoW / 2);
            const logoY = isFeed ? 90 : 80;
            ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
          } catch (e) {
            console.error("Error drawing logo on canvas", e);
          }
        } else {
          // Draw a standard beautiful logo
          ctx.font = isFeed ? "900 36px Inter, sans-serif" : "900 48px Inter, sans-serif";
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.fillText("⚽ CLUB BOLA", isFeed ? 800 : 540, isFeed ? 130 : 150);
        }
      }

      // 3. Customer Photo (Polaroid Frame styled inside Stories/Feed)
      // Card Container dimensions
      const cardX = isFeed ? 60 : 200;
      const cardY = isFeed ? 80 : 220;
      const cardW = isFeed ? 460 : 680;
      const cardH = isFeed ? 920 : 1200;
      const cardR = isFeed ? 32 : 40;

      // Draw Card shadow and background
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
      ctx.shadowBlur = isFeed ? 30 : 40;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = isFeed ? 10 : 15;
      ctx.fillStyle = "#ffffff";
      drawRoundedRect(cardX, cardY, cardW, cardH, cardR);
      ctx.fill();

      // Reset shadows for content
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Draw Customer Image frame inside the card
      const imgW = isFeed ? 400 : 560;
      const imgH = isFeed ? 711 : 996; // 9:16 aspect ratio (imgW * 16 / 9)
      const imgX = isFeed ? 90 : 260;
      const imgY = isFeed ? 110 : 280;
      const imgR = isFeed ? 20 : 24;

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

        // Center position + custom offset coordinates scaled from the 260px reference editor width
        const multiplier = imgW / 260;
        const drawX = imgX + (imgW - drawW) / 2 + oX * multiplier; 
        const drawY = imgY + (imgH - drawH) / 2 + oY * multiplier;

        ctx.drawImage(custImg, drawX, drawY, drawW, drawH);
        ctx.restore();

        // Draw Selected Sticker/Selo on canvas if not 'none'
        if (storiesSticker && storiesSticker !== 'none') {
          ctx.save();
          // Translate to stamp position: top-right of image
          const stampX = imgX + imgW - (isFeed ? 40 : 60);
          const stampY = imgY + (isFeed ? 30 : 40);
          ctx.translate(stampX, stampY);
          ctx.rotate(-10 * Math.PI / 180); // Slight tilt

          // Draw badge background circle or pill
          ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 4;

          let badgeText = '';
          let badgeBg = '#b91c1c'; // default red
          if (storiesSticker === 'vip') {
            badgeText = '⭐ CLIENTE VIP';
            badgeBg = '#fbbf24'; // amber-400
          } else if (storiesSticker === 'original') {
            badgeText = '✅ 100% ORIGINAL';
            badgeBg = '#15803d'; // green-700
          } else if (storiesSticker === 'sagrado') {
            badgeText = '⚽ MANTO SAGRADO';
            badgeBg = '#dc2626'; // red-600
          } else if (storiesSticker === 'limitada') {
            badgeText = '🔥 ED. LIMITADA';
            badgeBg = '#7c2d12'; // orange-900
          }

          ctx.fillStyle = badgeBg;
          
          // Draw pill shape
          const pillW = isFeed ? 150 : 210;
          const pillH = isFeed ? 34 : 46;
          const pillR = isFeed ? 17 : 23;
          
          ctx.beginPath();
          // Drawing pill rounded rect manually or with roundRect
          ctx.arc(-pillW/2 + pillR, 0, pillR, Math.PI/2, 3*Math.PI/2);
          ctx.lineTo(pillW/2 - pillR, -pillR);
          ctx.arc(pillW/2 - pillR, 0, pillR, 3*Math.PI/2, Math.PI/2);
          ctx.closePath();
          ctx.fill();

          // Stroke border
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = isFeed ? 2.5 : 3.5;
          ctx.stroke();

          // Draw text centered
          ctx.shadowColor = 'transparent';
          ctx.fillStyle = storiesSticker === 'vip' ? '#000000' : '#ffffff';
          ctx.font = isFeed ? "900 12px Inter, sans-serif" : "900 16px Inter, sans-serif";
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeText, 0, 0);

          ctx.restore();
        }
      } catch (e) {
        console.error("Error loading/drawing customer image", e);
        // Fallback placeholder color
        ctx.fillStyle = "#334155";
        drawRoundedRect(imgX, imgY, imgW, imgH, imgR);
        ctx.fill();
      }

      // Draw Customer Name inside Card Bottom area
      ctx.fillStyle = "#1e293b";
      ctx.font = isFeed ? "900 30px Inter, sans-serif" : "900 40px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(selectedPhotoForStories.customerName.toUpperCase(), isFeed ? 290 : 540, isFeed ? 840 : 1335);

      // Draw Manto Type Tag overlay inside the card bottom area
      const typeText = selectedPhotoForStories.mantoType || 'Manto I (Home)';
      ctx.font = isFeed ? "800 16px Inter, sans-serif" : "800 22px Inter, sans-serif";
      const tagTextWidth = ctx.measureText(typeText.toUpperCase()).width;
      const tagW = tagTextWidth + (isFeed ? 30 : 40);
      const tagH = isFeed ? 36 : 46;
      const tagX = (isFeed ? 290 : 540) - tagW / 2;
      const tagY = isFeed ? 870 : 1365;

      ctx.fillStyle = "#f1f5f9";
      drawRoundedRect(tagX, tagY, tagW, tagH, isFeed ? 10 : 12);
      ctx.fill();

      ctx.fillStyle = "#475569";
      ctx.fillText(typeText.toUpperCase(), isFeed ? 290 : 540, tagY + (isFeed ? 24 : 31));

      // 4. Marketing Text underneath Card or on Right side
      ctx.fillStyle = "#ffffff";
      ctx.font = isFeed ? "700 28px Inter, sans-serif" : "700 36px Inter, sans-serif";
      ctx.textAlign = "center";
      
      // Draw wrapped marketing caption text
      const words = storiesText.split(' ');
      let line = '';
      let textY = isFeed ? Math.max(210, 90 + (storiesShowLogo ? 100 * logoScale : 0) + 35) : 1465;
      const maxLineWidth = isFeed ? 420 : 850;
      const lineHeight = isFeed ? 42 : 50;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxLineWidth && n > 0) {
          ctx.fillText(line, isFeed ? 800 : 540, textY);
          line = words[n] + ' ';
          textY += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, isFeed ? 800 : 540, textY);

      // 5. Stylized Product Info & Impact Phrase Capsule
      const boxY = isFeed ? 560 : 1620;
      const boxW = isFeed ? 460 : 820;
      const boxH = isFeed ? 340 : 210;
      const boxX = isFeed ? 560 : (540 - boxW / 2);
      const boxR = isFeed ? 24 : 28;

      // Draw Glassmorphism Background
      ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
      drawRoundedRect(boxX, boxY, boxW, boxH, boxR);
      ctx.fill();

      // Elegant Solid Border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 3;
      drawRoundedRect(boxX, boxY, boxW, boxH, boxR);
      ctx.stroke();

      // Top Small Label: "PRODUTO ADQUIRIDO"
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.font = isFeed ? "900 16px Inter, sans-serif" : "900 20px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PRODUTO ADQUIRIDO", isFeed ? 800 : 540, boxY + (isFeed ? 50 : 45));

      // Middle Product Name: Flamengo Manto I (Home) etc.
      ctx.fillStyle = "#fbbf24"; // Premium Gold
      let prodName = (storiesProduct || "Manto Sagrado").toUpperCase();
      let fontSize = isFeed ? 26 : 34;
      const maxTextW = isFeed ? 410 : 760;
      ctx.font = `800 ${fontSize}px Inter, sans-serif`;
      while (ctx.measureText(prodName).width > maxTextW && fontSize > 12) {
        fontSize -= 1;
        ctx.font = `800 ${fontSize}px Inter, sans-serif`;
      }
      ctx.fillText(prodName, isFeed ? 800 : 540, boxY + (isFeed ? 110 : 102));

      // Elegant horizontal divider line
      ctx.beginPath();
      ctx.moveTo(boxX + (isFeed ? 60 : 120), boxY + (isFeed ? 160 : 132));
      ctx.lineTo(boxX + boxW - (isFeed ? 60 : 120), boxY + (isFeed ? 160 : 132));
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Impactful phrase at the bottom
      ctx.fillStyle = "#ffffff";
      ctx.font = isFeed ? "italic 700 18px Inter, sans-serif" : "italic 700 24px Inter, sans-serif";
      let phrase = storiesImpactPhrase || "Vista o seu manto sagrado!";
      const maxPhraseLen = isFeed ? 32 : 44;
      if (phrase.length > maxPhraseLen) {
        phrase = phrase.slice(0, maxPhraseLen - 3) + "...";
      }
      ctx.fillText(phrase, isFeed ? 800 : 540, boxY + (isFeed ? 230 : 175));

      // 6. Trigger PNG Download
      const dataUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `${isFeed ? 'feed' : 'story'}_${selectedPhotoForStories.customerName.toLowerCase().replace(/\s+/g, '_')}.png`;
      downloadLink.href = dataUrl;
      downloadLink.click();
      
      alert(`${isFeed ? 'Feed (1:1)' : 'Story (9:16)'} gerado e baixado com sucesso em alta definição!`);
    } catch (err) {
      console.error("Error generating Story download", err);
      alert("Houve um erro ao gerar a arte. Tente novamente.");
    } finally {
      setIsDownloadingStory(false);
    }
  };

  const handleDownloadOnlyPhoto = async (item: CustomerPhoto, forceFormat?: 'story' | 'feed') => {
    try {
      setIsDownloadingPhoto(prev => ({ ...prev, [item.id || '']: true }));
      
      const canvas = document.createElement('canvas');
      const format = forceFormat || storiesFormat || 'story';
      const isFeed = format === 'feed';
      const canvasW = 1080;
      const canvasH = isFeed ? 1080 : 1920;
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");

      // Load image
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = item.photoUrl;
      });

      // Object-cover calculations for canvas
      const imgAspect = img.width / img.height;
      const frameAspect = canvasW / canvasH;
      let drawW = canvasW;
      let drawH = canvasH;

      if (imgAspect > frameAspect) {
        drawW = canvasH * imgAspect;
      } else {
        drawH = canvasW / imgAspect;
      }

      const scale = item.scale || 1.0;
      const oX = item.offsetX || 0;
      const oY = item.offsetY || 0;

      // Apply scale
      drawW *= scale;
      drawH *= scale;

      // Center position + offsets scaled from the 260px reference editor width
      const multiplier = canvasW / 260; // 260 is the reference width
      const drawX = (canvasW - drawW) / 2 + oX * multiplier;
      const drawY = (canvasH - drawH) / 2 + oY * multiplier;

      // Draw to canvas
      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      // Trigger download
      const dataUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `manto_${item.customerName.toLowerCase().replace(/\s+/g, '_')}_${isFeed ? '11' : '916'}.png`;
      downloadLink.href = dataUrl;
      downloadLink.click();
    } catch (err) {
      console.error("Error downloading framed photo:", err);
      alert("Erro ao baixar a foto. Tente novamente.");
    } finally {
      setIsDownloadingPhoto(prev => ({ ...prev, [item.id || '']: false }));
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
              { key: 'logo', label: 'Logo e Capa (Favicon)', icon: <Settings size={14} /> },
              { key: 'coupons', label: 'Cupons de Desconto', icon: <Tag size={14} /> }
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
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (item.id) {
                              await updateDoc(doc(db, 'customer_photos', item.id), { 
                                scale: 1.0,
                                offsetX: 0,
                                offsetY: 0
                              });
                            }
                          }}
                          className={cn(
                            "size-5 rounded flex items-center justify-center transition-all",
                            highContrast ? "bg-white text-black hover:bg-yellow-400" : "bg-white/15 text-white hover:bg-white/30"
                          )}
                          type="button"
                          title="Reestabelecer enquadramento perfeito"
                        >
                          <RotateCcw size={10} />
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

                      {/* Status no Catálogo */}
                      <div className="mt-1.5">
                        <span className={cn(
                          "inline-flex items-center gap-1 text-[7.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded border",
                          item.showInCatalog !== false
                            ? highContrast 
                              ? "bg-yellow-450 text-black border-yellow-450" 
                              : "bg-emerald-50 text-emerald-800 border-emerald-150"
                            : highContrast
                              ? "bg-zinc-800 text-zinc-400 border-zinc-700"
                              : "bg-slate-100 text-slate-400 border-slate-200"
                        )}>
                          <span className={cn("size-1 rounded-full animate-pulse", item.showInCatalog !== false ? "bg-emerald-500" : "bg-slate-400")} />
                          {item.showInCatalog !== false ? "Exibido no Catálogo" : "Oculto no Catálogo"}
                        </span>
                      </div>

                      {item.saleItemsSummary && (
                        <p className={cn(
                          "text-[9px] mt-1 break-words font-semibold leading-relaxed",
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
                      "mt-4 pt-3 flex items-center gap-1.5 border-t",
                      highContrast ? "border-zinc-800" : "border-slate-150"
                    )}>
                      <button
                        onClick={() => {
                          setSelectedPhotoForStories(item);
                          setStoriesText(`Manto sagrado do(a) ${item.customerName}! ⚽🔥`);
                          setStoriesProduct(item.saleItemsSummary || item.mantoType || 'Manto Sagrado');
                          setStoriesImpactPhrase('Qualidade premium e caimento indiscutível! 🔥');
                          setStoriesTheme('red');
                          setStoriesShowLogo(true);
                          setStoriesSticker('none');
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
                        onClick={() => handleDownloadOnlyPhoto(item)}
                        disabled={!!isDownloadingPhoto[item.id || '']}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 border",
                          highContrast
                            ? "bg-yellow-400 hover:bg-yellow-300 text-black border-black border-2 font-black"
                            : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm border-emerald-600"
                        )}
                        title="Baixar Foto Enquadrada (Mural)"
                      >
                        {isDownloadingPhoto[item.id || ''] ? (
                          <div className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Download size={11} />
                        )}
                        <span>Baixar</span>
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
                          setShowInCatalog(item.showInCatalog !== false);
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

      {activeSubTab === 'coupons' && (
        <div className="space-y-6">
          {/* Action Header */}
          <div className={cn(
            "flex flex-col sm:flex-row items-center justify-between gap-4 rounded-[24px] p-4 border transition-all duration-200",
            highContrast 
              ? "bg-black border-white border-4 text-white shadow-[4px_4px_0px_rgba(255,255,255,1)]" 
              : "bg-white border-slate-200 shadow-sm"
          )}>
            <div>
              <h2 className={cn(
                "text-xs font-black uppercase tracking-widest flex items-center gap-2",
                highContrast ? "text-yellow-400" : "text-slate-850"
              )}>
                <Gift size={16} className="text-amber-500 animate-pulse" /> Cupons de Desconto Cadastrados ({coupons.length})
              </h2>
              <p className={cn(
                "text-[9px] font-bold uppercase tracking-wider mt-1 block",
                highContrast ? "text-zinc-400" : "text-slate-400"
              )}>Crie códigos promocionais para os seus clientes aplicarem no catálogo público</p>
            </div>

            <button 
              onClick={() => {
                setCouponCode('');
                setCouponType('percentage');
                setCouponValue('');
                setCouponMinPurchase('');
                setCouponExpiresAt('');
                setIsCouponModalOpen(true);
              }}
              className={cn(
                "w-full sm:w-auto px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                highContrast
                  ? "bg-yellow-400 hover:bg-yellow-300 text-black border-black border-2 font-black shadow-[3px_3px_0px_rgba(255,255,255,1)]"
                  : "bg-red-800 hover:bg-slate-950 text-white shadow-md hover:scale-[1.01]"
              )}
            >
              <Plus size={14} /> Criar Novo Cupom
            </button>
          </div>

          {/* Coupons list */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {coupons.length === 0 ? (
              <div className={cn(
                "col-span-full rounded-[32px] p-16 border flex flex-col items-center justify-center text-center transition-all duration-200",
                highContrast 
                  ? "bg-black border-white border-4 text-white" 
                  : "bg-white border-slate-200 shadow-sm"
              )}>
                <div className={cn(
                  "size-16 rounded-3xl flex items-center justify-center mb-4",
                  highContrast ? "bg-zinc-900 text-yellow-400 border border-zinc-850" : "bg-slate-50 text-slate-300 border border-slate-100"
                )}>
                  <Tag size={28} />
                </div>
                <h3 className={cn(
                  "text-sm font-black uppercase tracking-wider mb-2",
                  highContrast ? "text-yellow-400" : "text-slate-700"
                )}>Nenhum cupom ativo</h3>
                <p className={cn(
                  "text-xs max-w-sm mb-6 leading-relaxed",
                  highContrast ? "text-zinc-300 font-bold" : "text-slate-400"
                )}>Crie cupons com desconto em porcentagem (%) ou valor fixo (R$) para incentivar novas compras e impulsionar suas campanhas de marketing.</p>
                <button 
                  onClick={() => setIsCouponModalOpen(true)}
                  className={cn(
                    "px-6 py-3 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all font-sans",
                    highContrast
                      ? "bg-yellow-400 text-black border-black border-2 shadow-[3px_3px_0px_rgba(255,255,255,1)] hover:bg-yellow-300"
                      : "bg-red-800 text-white hover:bg-slate-900"
                  )}
                >
                  Cadastrar Primeiro Cupom
                </button>
              </div>
            ) : (
              coupons.map((coupon) => {
                const isExpired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date(new Date().setHours(0,0,0,0));
                return (
                  <div 
                    key={coupon.id}
                    className={cn(
                      "rounded-[24px] p-5 border flex flex-col justify-between gap-4 transition-all relative overflow-hidden",
                      highContrast 
                        ? coupon.isActive && !isExpired ? "bg-black border-white border-2 text-white" : "bg-zinc-950 border-zinc-800 text-zinc-500"
                        : coupon.isActive && !isExpired
                          ? "bg-white border-slate-200 shadow-sm hover:shadow-md" 
                          : "bg-slate-50/75 border-slate-200 text-slate-400"
                    )}
                  >
                    {/* Visual ticket notch effects */}
                    <div className={cn(
                      "absolute top-1/2 -left-3 size-6 rounded-full border transition-all",
                      highContrast ? "bg-zinc-950 border-white" : "bg-slate-100 border-slate-200"
                    )} style={{ transform: 'translateY(-50%)' }} />
                    <div className={cn(
                      "absolute top-1/2 -right-3 size-6 rounded-full border transition-all",
                      highContrast ? "bg-zinc-950 border-white" : "bg-slate-100 border-slate-200"
                    )} style={{ transform: 'translateY(-50%)' }} />

                    {/* Header: Code & Type badge */}
                    <div className="flex items-start justify-between px-2">
                      <div className="space-y-1">
                        <span className={cn(
                          "text-base font-black tracking-wider uppercase font-mono block",
                          highContrast
                            ? coupon.isActive && !isExpired ? "text-yellow-400" : "text-zinc-600"
                            : coupon.isActive && !isExpired ? "text-red-800" : "text-slate-500"
                        )}>
                          {coupon.code}
                        </span>
                        <span className="text-[8.5px] uppercase font-black tracking-widest block text-slate-450">
                          {coupon.type === 'percentage' ? 'Desconto Percentual' : 'Desconto Fixo'}
                        </span>
                      </div>

                      <span className={cn(
                        "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                        coupon.isActive && !isExpired
                          ? highContrast
                            ? "bg-yellow-400 text-black border-black"
                            : "bg-red-50 text-red-800 border-red-100"
                          : "bg-slate-200 text-slate-500 border-slate-300"
                      )}>
                        {coupon.type === 'percentage' ? `${coupon.value}% OFF` : `R$ ${coupon.value.toFixed(2)} OFF`}
                      </span>
                    </div>

                    {/* Middle details */}
                    <div className="border-t border-dashed border-slate-200/80 pt-3 space-y-2 px-2 text-[9.5px] font-bold">
                      <div className="flex justify-between items-center">
                        <span className="uppercase text-slate-450">Compra Mínima:</span>
                        <span className={cn(
                          "font-mono font-black",
                          highContrast ? "text-white" : "text-slate-800"
                        )}>
                          {coupon.minPurchase && coupon.minPurchase > 0 ? formatCurrency(coupon.minPurchase) : 'Sem mínimo'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="uppercase text-slate-455">Validade:</span>
                        <span className={cn(
                          "font-black flex items-center gap-1",
                          isExpired 
                            ? "text-rose-600 font-extrabold uppercase" 
                            : highContrast ? "text-white" : "text-slate-800"
                        )}>
                          <Calendar size={10} />
                          {coupon.expiresAt 
                            ? new Date(coupon.expiresAt).toLocaleDateString('pt-BR') 
                            : 'Ilimitada'}
                          {isExpired && " (EXPIRADO)"}
                        </span>
                      </div>
                    </div>

                    {/* Footer toggles & Actions */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 px-2 shrink-0">
                      <button
                        onClick={() => handleToggleCouponActive(coupon)}
                        disabled={isExpired}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border flex items-center gap-1",
                          coupon.isActive && !isExpired
                            ? "bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500"
                            : "bg-zinc-850 border-zinc-700 text-slate-400 hover:text-white"
                        )}
                      >
                        {coupon.isActive && !isExpired ? '✓ Ativo' : 'Inativo'}
                      </button>

                      <button
                        onClick={() => coupon.id && handleDeleteCoupon(coupon.id)}
                        className={cn(
                          "p-1.5 rounded-lg border transition-all text-red-500",
                          highContrast 
                            ? "bg-red-950 border-red-900 text-red-200 hover:bg-red-900" 
                            : "border-rose-100 bg-rose-50/40 hover:bg-rose-50 hover:border-rose-200"
                        )}
                        title="Deletar Cupom"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Create Coupon Modal */}
          <AnimatePresence>
            {isCouponModalOpen && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto"
              >
                <motion.div 
                  initial={{ opacity: 0, scale: 0.93, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ type: "spring", damping: 25, stiffness: 350 }}
                  className={cn(
                    "rounded-[32px] max-w-md w-full flex flex-col shadow-2xl overflow-hidden relative max-h-[85vh] transition-all duration-200 border my-auto",
                    highContrast 
                      ? "bg-black border-white border-4 text-white" 
                      : "bg-white border-slate-100"
                  )}
                >
                  {/* Modal Header */}
                  <div className={cn(
                    "p-6 flex items-center justify-between border-b shrink-0 transition-all duration-200",
                    highContrast ? "bg-zinc-950 border-zinc-800 text-white" : "bg-slate-900 border-slate-800 text-white"
                  )}>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "size-10 rounded-2xl flex items-center justify-center",
                        highContrast ? "bg-yellow-400 text-black font-black" : "bg-red-800 text-white shadow-md"
                      )}>
                        <Tag size={18} />
                      </div>
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-white">Criar Cupom de Desconto</h3>
                        <p className="text-[8px] uppercase tracking-wider text-slate-400 font-bold mt-0.5">Novo código promocional ativo</p>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setIsCouponModalOpen(false)}
                      className="p-2 hover:bg-white/10 rounded-xl transition-all text-white"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Modal Body / Form */}
                  <form onSubmit={handleSaveCoupon} className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                    {/* Code Input */}
                    <div className="space-y-2">
                      <label className={cn(
                        "text-[10px] uppercase font-black tracking-wider block",
                        highContrast ? "text-yellow-400" : "text-slate-400"
                      )}>Código do Cupom <span className="text-rose-500">*</span></label>
                      <input 
                        required
                        type="text"
                        className={cn(
                          "w-full px-4 py-3 border rounded-xl outline-none font-mono text-sm font-black uppercase transition-all",
                          highContrast
                            ? "bg-zinc-900 border-zinc-700 text-white focus:ring-1 focus:ring-yellow-450 focus:border-yellow-450"
                            : "bg-white border-slate-200 text-slate-800 focus:ring-1 focus:ring-red-800 focus:border-red-800"
                        )}
                        placeholder="Ex: BOLA10, BLACKFRIDAY"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      />
                    </div>

                    {/* Coupon Type buttons */}
                    <div className="space-y-2">
                      <label className={cn(
                        "text-[10px] uppercase font-black tracking-wider block",
                        highContrast ? "text-yellow-400" : "text-slate-400"
                      )}>Tipo de Desconto <span className="text-rose-500">*</span></label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setCouponType('percentage')}
                          className={cn(
                            "py-2.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                            couponType === 'percentage'
                              ? highContrast
                                ? "bg-yellow-400 text-black border-black font-black"
                                : "bg-red-800 text-white border-red-800 shadow-sm font-black"
                              : highContrast
                                ? "bg-zinc-900 text-zinc-400 border-zinc-850 hover:bg-zinc-800 hover:text-white"
                                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-800"
                          )}
                        >
                          <Percent size={12} />
                          <span>Porcentagem (%)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCouponType('fixed')}
                          className={cn(
                            "py-2.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                            couponType === 'fixed'
                              ? highContrast
                                ? "bg-yellow-400 text-black border-black font-black"
                                : "bg-red-800 text-white border-red-800 shadow-sm font-black"
                              : highContrast
                                ? "bg-zinc-900 text-zinc-400 border-zinc-850 hover:bg-zinc-800 hover:text-white"
                                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-800"
                          )}
                        >
                          <Gift size={12} />
                          <span>Valor Fixo (R$)</span>
                        </button>
                      </div>
                    </div>

                    {/* Value and Minimum purchase */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Discount Value */}
                      <div className="space-y-2">
                        <label className={cn(
                          "text-[10px] uppercase font-black tracking-wider block",
                          highContrast ? "text-yellow-400" : "text-slate-400"
                        )}>Valor do Desconto <span className="text-rose-500">*</span></label>
                        <div className="relative">
                          <input 
                            required
                            type="number"
                            min="0"
                            step="any"
                            className={cn(
                              "w-full px-4 py-3 border rounded-xl outline-none font-sans text-sm font-semibold transition-all",
                              couponType === 'fixed' ? "pl-9" : "pr-9",
                              highContrast
                                ? "bg-zinc-900 border-zinc-700 text-white focus:ring-1 focus:ring-yellow-450 focus:border-yellow-450"
                                : "bg-white border-slate-200 text-slate-800 focus:ring-1 focus:ring-red-800 focus:border-red-800"
                            )}
                            placeholder={couponType === 'percentage' ? "Ex: 10" : "Ex: 15,00"}
                            value={couponValue}
                            onChange={(e) => setCouponValue(e.target.value)}
                          />
                          <div className={cn(
                            "absolute top-1/2 -translate-y-1/2 text-[10px] font-black",
                            couponType === 'percentage' ? "right-4" : "left-4",
                            highContrast ? "text-yellow-400" : "text-slate-400"
                          )}>
                            {couponType === 'percentage' ? '%' : 'R$'}
                          </div>
                        </div>
                      </div>

                      {/* Minimum Purchase */}
                      <div className="space-y-2">
                        <label className={cn(
                          "text-[10px] uppercase font-black tracking-wider block",
                          highContrast ? "text-yellow-400" : "text-slate-400"
                        )}>Compra Mínima <span className="text-[8px] font-normal lowercase">(opcional)</span></label>
                        <div className="relative">
                          <input 
                            type="number"
                            min="0"
                            step="any"
                            className={cn(
                              "w-full pl-9 pr-4 py-3 border rounded-xl outline-none font-sans text-sm font-semibold transition-all",
                              highContrast
                                ? "bg-zinc-900 border-zinc-700 text-white focus:ring-1 focus:ring-yellow-450 focus:border-yellow-450"
                                : "bg-white border-slate-200 text-slate-800 focus:ring-1 focus:ring-red-800 focus:border-red-800"
                            )}
                            placeholder="Ex: 100,00"
                            value={couponMinPurchase}
                            onChange={(e) => setCouponMinPurchase(e.target.value)}
                          />
                          <div className={cn(
                            "absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black",
                            highContrast ? "text-yellow-400" : "text-slate-400"
                          )}>
                            R$
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expiration Date */}
                    <div className="space-y-2">
                      <label className={cn(
                        "text-[10px] uppercase font-black tracking-wider block",
                        highContrast ? "text-yellow-400" : "text-slate-400"
                      )}>Data de Expiração <span className="text-[8px] font-normal lowercase">(opcional)</span></label>
                      <input 
                        type="date"
                        className={cn(
                          "w-full px-4 py-3 border rounded-xl outline-none font-sans text-sm font-semibold transition-all",
                          highContrast
                            ? "bg-zinc-900 border-zinc-700 text-white focus:ring-1 focus:ring-yellow-450 focus:border-yellow-450"
                            : "bg-white border-slate-200 text-slate-800 focus:ring-1 focus:ring-red-800 focus:border-red-800"
                        )}
                        value={couponExpiresAt}
                        onChange={(e) => setCouponExpiresAt(e.target.value)}
                      />
                    </div>

                    {/* Modal Actions */}
                    <div className={cn(
                      "border-t -mx-6 -mb-6 p-6 flex justify-end gap-3 mt-8 transition-all duration-200",
                      highContrast 
                        ? "bg-zinc-950 border-zinc-800" 
                        : "bg-slate-50 border-slate-100"
                    )}>
                      <button 
                        type="button" 
                        onClick={() => setIsCouponModalOpen(false)}
                        className={cn(
                          "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border",
                          highContrast 
                            ? "bg-zinc-900 border-zinc-700 hover:border-white text-white" 
                            : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                        )}
                      >
                        Cancelar
                      </button>

                      <button 
                        type="submit" 
                        disabled={isSavingCoupon}
                        className={cn(
                          "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                          isSavingCoupon
                            ? "bg-slate-400 cursor-not-allowed"
                            : highContrast
                              ? "bg-yellow-400 hover:bg-yellow-300 text-black border-2 border-black font-black shadow-[3px_3px_0px_rgba(255,255,255,1)]"
                              : "bg-red-800 hover:bg-slate-950 text-white shadow-md hover:scale-[1.01]"
                        )}
                      >
                        {isSavingCoupon ? (
                          <>
                            <div className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Salvando...
                          </>
                        ) : (
                          <>
                            <Check size={14} /> Salvar Cupom
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Customer select photo Modal */}
      <AnimatePresence>
        {isPhotoModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.93, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className={cn(
                "rounded-[32px] max-w-lg w-full flex flex-col shadow-2xl overflow-hidden relative max-h-[85vh] transition-all duration-200 border my-auto",
                highContrast 
                  ? "bg-black border-white border-4 text-white" 
                  : "bg-white border-slate-100"
              )}
            >
              <div className={cn(
                "p-6 flex items-center justify-between border-b shrink-0 transition-all duration-200",
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

              <form onSubmit={handleAddPhotoSubmit} className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 custom-scrollbar">
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

                      {/* Zoom & Reset Controls inside Modal */}
                      <div className="flex items-center justify-center gap-2 w-full max-w-[260px] mx-auto">
                        <div className={cn(
                          "flex items-center justify-center gap-2 p-2 rounded-xl border w-44",
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

                        <button
                          type="button"
                          onClick={() => {
                            setPhotoScale(1.0);
                            setPhotoOffsetX(0);
                            setPhotoOffsetY(0);
                          }}
                          className={cn(
                            "size-11 rounded-xl border transition-all flex items-center justify-center shadow-sm shrink-0",
                            highContrast
                              ? "bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-850"
                              : "bg-white hover:bg-slate-100 border-slate-200 text-slate-700"
                          )}
                          title="Reestabelecer Enquadramento Perfeito"
                        >
                          <RotateCcw size={14} />
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

                {/* Exibir no Catálogo Público como Depoimento */}
                <div className={cn(
                  "p-4 rounded-2xl border transition-all flex items-start gap-3.5 cursor-pointer select-none",
                  showInCatalog 
                    ? highContrast 
                      ? "bg-zinc-900 border-yellow-400" 
                      : "bg-emerald-50/50 border-emerald-200" 
                    : highContrast 
                      ? "bg-zinc-950 border-zinc-800" 
                      : "bg-slate-50/50 border-slate-200"
                )} onClick={() => setShowInCatalog(!showInCatalog)}>
                  <input 
                    type="checkbox"
                    checked={showInCatalog}
                    onChange={(e) => setShowInCatalog(e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "size-4 mt-0.5 cursor-pointer accent-emerald-600 transition-all focus:ring-0",
                      highContrast ? "accent-yellow-400" : ""
                    )}
                  />
                  <div className="space-y-1">
                    <span className="flex items-center gap-1.5">
                      <span className={cn(
                        "text-[10px] uppercase font-black tracking-wider",
                        highContrast 
                          ? showInCatalog ? "text-yellow-400" : "text-zinc-400"
                          : showInCatalog ? "text-emerald-800" : "text-slate-600"
                      )}>Exibir no Catálogo Público</span>
                      {showInCatalog && (
                        <span className="bg-emerald-100 text-emerald-800 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                          ⭐ DEPOIMENTO ATIVO
                        </span>
                      )}
                    </span>
                    <p className={cn(
                      "text-[9px] font-medium leading-relaxed",
                      highContrast ? "text-zinc-400" : "text-slate-500"
                    )}>
                      Mostrar esta foto com a legenda no mural de depoimentos e galeria de 'Clientes Satisfeitos' para gerar prova social aos novos compradores.
                    </p>
                  </div>
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instagram Stories Post Generator Modal (9:16) */}
      <AnimatePresence>
        {isStoriesModalOpen && selectedPhotoForStories && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className={cn(
                "w-full max-w-4xl rounded-[32px] overflow-hidden flex flex-col md:flex-row shadow-2xl border transition-all duration-300 my-8",
                highContrast 
                  ? "bg-black border-white border-4 text-white" 
                  : "bg-slate-900 border-white/10 text-white"
              )}
            >
              {/* Left Column: Interactive Controls */}
              <div className="flex-1 p-6 sm:p-8 space-y-6 overflow-y-auto max-h-[70vh] md:max-h-[80vh] custom-scrollbar">
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
                      )}>Gerador de Mídias</h3>
                      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mt-1">Gere posts em formato de Story (9:16) ou Feed (1:1)</p>
                    </div>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="space-y-4 pt-2">
                  {/* Format Select (Story vs Feed) */}
                  <div className="space-y-2">
                    <label className={cn(
                      "text-[10px] uppercase font-black tracking-wider block",
                      highContrast ? "text-yellow-400" : "text-slate-400"
                    )}>Formato da Arte</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setStoriesFormat('story')}
                        className={cn(
                          "py-2.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                          storiesFormat === 'story'
                            ? highContrast
                              ? "bg-yellow-400 text-black border-black font-black"
                              : "bg-white/15 text-white border-white/40 shadow-md scale-102"
                            : "bg-white/5 text-slate-400 border-white/5 hover:border-white/10 hover:bg-white/10"
                        )}
                      >
                        <Instagram size={12} />
                        <span>Story / WhatsApp (9:16)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStoriesFormat('feed')}
                        className={cn(
                          "py-2.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                          storiesFormat === 'feed'
                            ? highContrast
                              ? "bg-yellow-400 text-black border-black font-black"
                              : "bg-white/15 text-white border-white/40 shadow-md scale-102"
                            : "bg-white/5 text-slate-400 border-white/5 hover:border-white/10 hover:bg-white/10"
                        )}
                      >
                        <Grid size={12} />
                        <span>Feed de Posts (1:1)</span>
                      </button>
                    </div>
                  </div>

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
                        { id: 'gold', name: 'Ouro Premium', class: 'from-amber-950 via-yellow-950 to-stone-900' },
                        { id: 'champions', name: '★ Champions ★', class: 'from-blue-950 via-slate-900 to-indigo-950' },
                        { id: 'brasil', name: '⚽ Copa Brasil', class: 'from-emerald-700 via-green-600 to-yellow-500' },
                        { id: 'cyberpunk', name: '⚡ Neon Cyber', class: 'from-violet-950 via-fuchsia-950 to-zinc-950' }
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

                  {/* Sticker / Selo Select */}
                  <div className="space-y-2">
                    <label className={cn(
                      "text-[10px] uppercase font-black tracking-wider block",
                      highContrast ? "text-yellow-400" : "text-slate-400"
                    )}>Selo de Qualidade / Adesivo (Aesthetic Stamp)</label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        { id: 'none', name: 'Sem Selo', emoji: '❌' },
                        { id: 'vip', name: 'Cliente VIP', emoji: '⭐' },
                        { id: 'original', name: '100% Original', emoji: '✅' },
                        { id: 'sagrado', name: 'Manto Sagrado', emoji: '⚽' },
                        { id: 'limitada', name: 'Ed. Limitada', emoji: '🔥' }
                      ].map(st => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setStoriesSticker(st.id as any)}
                          className={cn(
                            "p-2 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-1",
                            storiesSticker === st.id
                              ? highContrast
                                ? "bg-yellow-400 text-black border-black"
                                : "bg-white/15 text-white border-white/40 shadow-md scale-102"
                              : "bg-white/5 text-slate-400 border-white/5 hover:border-white/10 hover:bg-white/10"
                          )}
                        >
                          <span className="text-base">{st.emoji}</span>
                          <span className="text-[7.5px] leading-tight text-center font-black">{st.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Product Input */}
                  <div className="space-y-2">
                    <label className={cn(
                      "text-[10px] uppercase font-black tracking-wider block",
                      highContrast ? "text-yellow-400" : "text-slate-400"
                    )}>Produto Adquirido</label>
                    <input
                      type="text"
                      className={cn(
                        "w-full px-4 py-3 rounded-xl outline-none font-sans font-bold text-xs border transition-all",
                        highContrast
                          ? "bg-zinc-900 border-zinc-700 text-white focus:ring-1 focus:ring-yellow-450"
                          : "bg-white/5 border-white/10 text-white focus:ring-1 focus:ring-red-800 focus:border-red-800"
                      )}
                      placeholder="Ex: Flamengo Manto I 2026/27"
                      value={storiesProduct}
                      onChange={(e) => setStoriesProduct(e.target.value)}
                    />
                  </div>

                  {/* Impact Phrase Input */}
                  <div className="space-y-2">
                    <label className={cn(
                      "text-[10px] uppercase font-black tracking-wider block",
                      highContrast ? "text-yellow-400" : "text-slate-400"
                    )}>Frase de Impacto</label>
                    <input
                      type="text"
                      className={cn(
                        "w-full px-4 py-3 rounded-xl outline-none font-sans font-bold text-xs border transition-all",
                        highContrast
                          ? "bg-zinc-900 border-zinc-700 text-white focus:ring-1 focus:ring-yellow-450"
                          : "bg-white/5 border-white/10 text-white focus:ring-1 focus:ring-red-800 focus:border-red-800"
                      )}
                      placeholder="Ex: Qualidade premium e caimento indiscutível! 🔥"
                      value={storiesImpactPhrase}
                      onChange={(e) => setStoriesImpactPhrase(e.target.value)}
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

                    {/* Caption Presets (Soccer marketing templates) */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider block">Sugestões de Legenda (Copywriting)</span>
                      <div className="flex gap-2 overflow-x-auto pb-1.5 no-scrollbar scroll-smooth">
                        {[
                          { label: "🔥 Armadura", text: "Olha o estilo do(a) {name} vestindo a nova armadura! Qualidade premium impecável! ⚽🔥" },
                          { label: "❤️ Tradição", text: "Tradição e amor pelo manto! Obrigado(a) {name} por vestir a nossa armadura oficial! 🏟️✨" },
                          { label: "⭐ Craque", text: "Quem tem estilo e entende de futebol veste o nosso Manto! Valeu pela confiança, {name}! 👏👕" },
                          { label: "⚡ Jogo", text: "Pronto(a) para apoiar o time na vitória! Garanta a sua armadura oficial no link da bio! 🏆👕" }
                        ].map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              const name = selectedPhotoForStories.customerName || 'Cliente';
                              setStoriesText(preset.text.replace('{name}', name));
                            }}
                            className={cn(
                              "px-2.5 py-1.5 rounded-lg border text-[8px] font-black uppercase tracking-wider transition-all whitespace-nowrap shrink-0",
                              highContrast
                                ? "bg-zinc-900 border-zinc-700 hover:border-yellow-400 text-white"
                                : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 text-slate-300 hover:text-white"
                            )}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
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
                      const caption = `${storiesText}\n\n👉 Produto: *${storiesProduct}*\n✨ ${storiesImpactPhrase}\n🛒 Acesse o link da bio para garantir o seu!`;
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
                        <Copy size={14} /> Copiar Texto + Produto
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
                        <div className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {storiesFormat === 'feed' ? 'Gerando Feed...' : 'Gerando Story...'}
                      </>
                    ) : (
                      <>
                        <Download size={14} /> {storiesFormat === 'feed' ? 'Baixar Feed (1:1)' : 'Baixar Story (9:16)'}
                      </>
                    )}
                  </button>
                </div>

                {/* Download only the photo option */}
                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    disabled={isDownloadingPhoto[selectedPhotoForStories.id || '']}
                    onClick={() => handleDownloadOnlyPhoto(selectedPhotoForStories)}
                    className={cn(
                      "w-full py-3 rounded-xl text-[10px] uppercase font-black tracking-widest flex items-center justify-center gap-1.5 transition-all border",
                      highContrast
                        ? "bg-zinc-900 border-white hover:bg-zinc-800 text-white"
                        : "bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/25 text-emerald-400"
                    )}
                  >
                    {isDownloadingPhoto[selectedPhotoForStories.id || ''] ? (
                      <>
                        <div className="size-3.5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" /> Baixando Foto...
                      </>
                    ) : (
                      <>
                        <Camera size={14} /> Baixar Apenas Foto {storiesFormat === 'feed' ? '1:1 (Feed)' : '9:16 (WhatsApp/Insta)'}
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

              {/* Right Column: Live Mock Preview */}
              <div className={cn(
                "w-full md:w-[380px] p-6 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l select-none",
                highContrast ? "bg-zinc-950 border-white/25" : "bg-black/40 border-white/5"
              )}>
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-500 mb-3 block">
                  {storiesFormat === 'feed' ? 'Pré-visualização do Feed (1:1)' : 'Pré-visualização do Story (Instagram)'}
                </span>
                
                {/* Container Frame */}
                <div
                  className={cn(
                    "w-full max-w-[280px] rounded-[24px] overflow-hidden shadow-2xl relative flex text-center border border-white/10 transition-all duration-300",
                    storiesFormat === 'feed' ? "aspect-square p-3.5 flex-row gap-2" : "aspect-[9/16] p-5 flex-col",
                    storiesTheme === 'red' && "bg-gradient-to-tr from-rose-950 via-red-900 to-amber-950",
                    storiesTheme === 'black' && "bg-gradient-to-tr from-zinc-950 via-zinc-900 to-zinc-850",
                    storiesTheme === 'green' && "bg-gradient-to-tr from-emerald-950 via-teal-900 to-zinc-950",
                    storiesTheme === 'gold' && "bg-gradient-to-tr from-amber-950 via-yellow-950 to-stone-900",
                    storiesTheme === 'champions' && "bg-gradient-to-tr from-[#050B14] via-[#0D1B3E] to-[#172F69] border-[#22459c]/30 shadow-[#0D1B3E]/30",
                    storiesTheme === 'brasil' && "bg-gradient-to-tr from-[#006A3F] via-[#009639] to-[#FFDF00]",
                    storiesTheme === 'cyberpunk' && "bg-gradient-to-tr from-[#090514] via-[#1C0E2D] to-[#3B0764] border-fuchsia-500/30 shadow-[0_0_15px_rgba(217,70,239,0.15)]"
                  )}
                >
                  {/* Visual Children Overlays for Premium Themes */}
                  {storiesTheme === 'champions' && (
                    <div className="absolute inset-0 opacity-20 pointer-events-none overflow-hidden bg-[radial-gradient(circle_at_center,_#2563eb_0%,_transparent_100%)]">
                      <div className="absolute top-4 left-6 text-[8px] text-white">★</div>
                      <div className="absolute top-12 right-8 text-[6px] text-white">★</div>
                      <div className="absolute bottom-20 left-10 text-[6px] text-white">★</div>
                      <div className="absolute bottom-10 right-12 text-[8px] text-white">★</div>
                      <div className="absolute inset-0 border border-white/5 rounded-[24px]" />
                    </div>
                  )}
                  {storiesTheme === 'brasil' && (
                    <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
                      <div className="absolute -top-10 -left-10 w-24 h-24 rounded-full bg-yellow-400 blur-xl" />
                      <div className="absolute -bottom-10 -right-10 w-32 h-32 rounded-full bg-emerald-500 blur-2xl" />
                    </div>
                  )}
                  {storiesTheme === 'cyberpunk' && (
                    <div className="absolute inset-0 opacity-15 pointer-events-none overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-[2px] bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
                      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-fuchsia-500 shadow-[0_0_8px_#d946ef]" />
                    </div>
                  )}

                  {storiesFormat === 'feed' ? (
                    <>
                      {/* Left: Polaroid card */}
                      <div className="w-[50%] h-full bg-white rounded-xl p-2 text-slate-900 border border-white/10 shadow-xl flex flex-col justify-between shrink-0 relative">
                        {storiesSticker && storiesSticker !== 'none' && (
                          <div className={cn(
                            "absolute top-2 right-2 z-10 shadow-md px-1 py-0.5 rounded-full border text-[4.5px] font-black uppercase tracking-wider text-center rotate-[-10deg]",
                            storiesSticker === 'vip' && "bg-amber-400 text-black border-amber-300",
                            storiesSticker === 'original' && "bg-green-700 text-white border-green-600",
                            storiesSticker === 'sagrado' && "bg-red-600 text-white border-red-500",
                            storiesSticker === 'limitada' && "bg-orange-900 text-white border-orange-800"
                          )}>
                            {storiesSticker === 'vip' ? '⭐ CLIENTE VIP' : 
                             storiesSticker === 'original' ? '✅ ORIGINAL' : 
                             storiesSticker === 'sagrado' ? '⚽ MANTO' : '🔥 LIMITADO'}
                          </div>
                        )}
                        <div className="aspect-[9/16] w-full rounded-lg overflow-hidden bg-slate-100 relative">
                          <img
                            src={selectedPhotoForStories.photoUrl}
                            alt="Preview"
                            className="w-full h-full object-cover transition-all animate-fade-in"
                            style={{
                              transform: `scale(${selectedPhotoForStories.scale || 1.0}) translate(${((selectedPhotoForStories.offsetX || 0) * (192.8 / 260)) / (selectedPhotoForStories.scale || 1.0)}px, ${((selectedPhotoForStories.offsetY || 0) * (192.8 / 260)) / (selectedPhotoForStories.scale || 1.0)}px)`
                            }}
                          />
                        </div>
                        {/* Name & Tag */}
                        <div className="pt-1.5 pb-0.5 text-center shrink-0">
                          <span className="text-[8px] font-black uppercase text-slate-800 block truncate leading-tight">{selectedPhotoForStories.customerName}</span>
                          <span className="inline-block px-1 mt-0.5 rounded bg-slate-100 text-slate-500 text-[5.5px] font-black uppercase tracking-wider">
                            {selectedPhotoForStories.mantoType || 'Manto I (Home)'}
                          </span>
                        </div>
                      </div>

                      {/* Right: Info column */}
                      <div className="flex-1 h-full flex flex-col justify-between py-1">
                        {/* Right Top Logo */}
                        {storiesShowLogo && (
                          <div 
                            className="flex items-center justify-center gap-1 opacity-90 shrink-0"
                            style={{ height: `${32 * Math.max(0.5, logoScale * 0.8)}px` }}
                          >
                            {logoFile ? (
                              <img 
                                src={logoFile} 
                                alt="Logo" 
                                className="object-contain" 
                                style={{ height: `${24 * Math.max(0.5, logoScale * 0.8)}px` }}
                              />
                            ) : (
                              <span className="text-[8px] font-black tracking-widest text-white">
                                ⚽ CLUB BOLA
                              </span>
                            )}
                          </div>
                        )}

                        {/* Caption text */}
                        <p className="text-[7.5px] font-bold text-white tracking-wide line-clamp-3 text-center px-0.5 my-auto">
                          "{storiesText}"
                        </p>

                        {/* Product Badge & Impact Capsule */}
                        <div className="border border-white/10 bg-white/5 rounded-lg p-1.5 flex flex-col items-center justify-center gap-0.5 shrink-0 w-full">
                          <span className="text-[5px] font-black tracking-widest uppercase text-white/50 leading-none">Produto Adquirido</span>
                          <span className={cn(
                            "font-bold text-yellow-400 tracking-wide uppercase break-words text-center leading-tight w-full",
                            (storiesProduct || 'Manto Sagrado').length > 40 ? "text-[4.5px]" : (storiesProduct || 'Manto Sagrado').length > 30 ? "text-[5.5px]" : (storiesProduct || 'Manto Sagrado').length > 20 ? "text-[6.5px]" : "text-[7.5px]"
                          )}>
                            {storiesProduct || 'Manto Sagrado'}
                          </span>
                          <div className="w-[60px] h-[0.5px] bg-white/10 my-0.5" />
                          <span className="text-[6.5px] font-medium text-white/90 italic tracking-wide text-center leading-tight w-full break-words max-h-[3.6em] overflow-hidden">
                            {storiesImpactPhrase || 'Vista o seu manto sagrado!'}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Top Branding */}
                      {storiesShowLogo && (
                        <div 
                          className="flex items-center justify-center gap-1 opacity-90 shrink-0"
                          style={{ height: `${40 * Math.max(0.5, logoScale)}px` }}
                        >
                          {logoFile ? (
                            <img 
                              src={logoFile} 
                              alt="Logo" 
                              className="object-contain" 
                              style={{ height: `${32 * Math.max(0.5, logoScale)}px` }}
                            />
                          ) : (
                            <span className="text-[10px] font-black tracking-widest text-white flex items-center gap-1">
                              ⚽ CLUB BOLA
                            </span>
                          )}
                        </div>
                      )}

                      {/* Customer Floating Polaroid Card */}
                      <div className="bg-white rounded-2xl p-2 mx-auto w-[76%] mt-1 text-slate-900 border border-white/10 shadow-xl flex flex-col relative shrink-0">
                        {storiesSticker && storiesSticker !== 'none' && (
                          <div className={cn(
                            "absolute top-3 right-3 z-10 shadow-md px-1.5 py-0.5 rounded-full border text-[6px] font-black uppercase tracking-wider text-center rotate-[-10deg]",
                            storiesSticker === 'vip' && "bg-amber-400 text-black border-amber-300",
                            storiesSticker === 'original' && "bg-green-700 text-white border-green-600",
                            storiesSticker === 'sagrado' && "bg-red-600 text-white border-red-500",
                            storiesSticker === 'limitada' && "bg-orange-900 text-white border-orange-800"
                          )}>
                            {storiesSticker === 'vip' ? '⭐ CLIENTE VIP' : 
                             storiesSticker === 'original' ? '✅ ORIGINAL' : 
                             storiesSticker === 'sagrado' ? '⚽ MANTO SAGRADO' : '🔥 LIMITADO'}
                          </div>
                        )}
                        <div className="aspect-[9/16] w-full rounded-xl overflow-hidden bg-slate-100 relative">
                          <img
                            src={selectedPhotoForStories.photoUrl}
                            alt="Preview"
                            className="w-full h-full object-cover transition-all animate-fade-in"
                            style={{
                              transform: `scale(${selectedPhotoForStories.scale || 1.0}) translate(${((selectedPhotoForStories.offsetX || 0) * (192.8 / 260)) / (selectedPhotoForStories.scale || 1.0)}px, ${((selectedPhotoForStories.offsetY || 0) * (192.8 / 260)) / (selectedPhotoForStories.scale || 1.0)}px)`
                            }}
                          />
                        </div>
                        {/* Name & Tag */}
                        <div className="pt-2 pb-0.5 text-center">
                          <span className="text-[9px] font-black uppercase text-slate-800 block truncate leading-tight">{selectedPhotoForStories.customerName}</span>
                          <span className="inline-block px-1.5 py-0.5 mt-0.5 rounded bg-slate-100 text-slate-500 text-[6.5px] font-black uppercase tracking-wider">
                            {selectedPhotoForStories.mantoType || 'Manto I (Home)'}
                          </span>
                        </div>
                      </div>

                      {/* Marketing Caption */}
                      <p className="text-[9.5px] font-bold text-white tracking-wide mt-3 line-clamp-2 leading-relaxed px-1 shrink-0">
                        "{storiesText}"
                      </p>

                      {/* Product Badge & Impact Capsule */}
                      <div className="border border-white/10 bg-white/5 rounded-xl py-2 px-2.5 mt-auto flex flex-col items-center justify-center gap-0.5 shrink-0 w-full">
                        <span className="text-[6px] font-black tracking-widest uppercase text-white/50">Produto Adquirido</span>
                        <span className={cn(
                          "font-bold text-yellow-400 tracking-wide uppercase break-words text-center leading-tight w-full",
                          (storiesProduct || 'Manto Sagrado').length > 40 ? "text-[6px]" : (storiesProduct || 'Manto Sagrado').length > 30 ? "text-[7px]" : (storiesProduct || 'Manto Sagrado').length > 20 ? "text-[8px]" : "text-[9px]"
                        )}>
                          {storiesProduct || 'Manto Sagrado'}
                        </span>
                        <div className="w-[120px] h-[0.5px] bg-white/10 my-0.5" />
                        <span className="text-[7.5px] font-medium text-white/90 italic tracking-wide text-center leading-tight w-full break-words max-h-[3.6em] overflow-hidden">
                          {storiesImpactPhrase || 'Vista o seu manto sagrado!'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
