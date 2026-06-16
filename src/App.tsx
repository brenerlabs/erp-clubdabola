import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  DollarSign, 
  LogOut, 
  ChevronRight, 
  Menu, 
  X, 
  Plus, 
  RefreshCcw, 
  Send, 
  Truck, 
  Camera,
  BarChart3
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { seedInitialData } from './lib/seedService';
import { cn } from './lib/utils';
import Dashboard from './pages/Dashboard';
import PDV from './pages/PDV';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Finance from './pages/Finance';
import Compensations from './pages/Compensations';
import Shipments from './pages/Shipments';
import Mural from './pages/Mural';
import Reports from './pages/Reports';
import PublicReceipt from './pages/PublicReceipt';

type Page = 'dashboard' | 'pdv' | 'products' | 'customers' | 'finance' | 'compensations' | 'shipments' | 'mural' | 'reports';


interface SidebarContextType {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
}

export const SidebarContext = React.createContext<SidebarContextType>({
  isSidebarOpen: true,
  setIsSidebarOpen: () => {},
});

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [logoScale, setLogoScale] = useState<number>(1.0);

  // Check URL suffix for public receipt landing page bypass
  const queryParams = new URLSearchParams(window.location.search);
  const receiptId = queryParams.get('receipt') || queryParams.get('comprovante');

  // Sync Global Settings & Logo
  useEffect(() => {
    const cachedLogo = localStorage.getItem('erp-custom-logo');
    if (cachedLogo) {
      setLogoUrl(cachedLogo);
      const faviconLink = document.querySelector("link[rel*='icon']");
      if (faviconLink) {
        faviconLink.setAttribute('href', cachedLogo);
      }
    }

    const cachedScale = localStorage.getItem('erp-custom-logo-scale');
    if (cachedScale) {
      setLogoScale(parseFloat(cachedScale) || 1.0);
    }

    const settingsRef = doc(db, 'settings', 'appearance');
    const unsubscribeLogo = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const url = docSnap.data().logoUrl || '';
        const scale = docSnap.data().logoScale ?? 1.0;
        setLogoUrl(url);
        setLogoScale(scale);
        
        localStorage.setItem('erp-custom-logo-scale', scale.toString());
        if (url) {
          localStorage.setItem('erp-custom-logo', url);
          const faviconLink = document.querySelector("link[rel*='icon']");
          if (faviconLink) {
            faviconLink.setAttribute('href', url);
          }
        } else {
          localStorage.removeItem('erp-custom-logo');
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/appearance');
    });

    const handleLogoUpdated = (e: any) => {
      setLogoUrl(e.detail?.logoUrl || '');
      setLogoScale(e.detail?.logoScale ?? 1.0);
    };
    window.addEventListener('logo-updated', handleLogoUpdated);

    return () => {
      unsubscribeLogo();
      window.removeEventListener('logo-updated', handleLogoUpdated);
    };
  }, []);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.page) {
        setActivePage(customEvent.detail.page);
      }
    };
    window.addEventListener('navigate-app', handleNavigate);
    return () => {
      window.removeEventListener('navigate-app', handleNavigate);
    };
  }, []);

  const login = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // Force account selection to avoid automatic login with wrong account
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Erro no Login:", err);
      if (err.code === 'auth/popup-blocked') {
        alert("O seu navegador bloqueou a janela de login. Por favor, permita pop-ups para este site.");
      } else if (err.code === 'auth/unauthorized-domain') {
        alert("Este domínio não está autorizado no Console do Firebase. Adicione '" + window.location.hostname + "' aos domínios autorizados no Firebase.");
      } else {
        alert("Erro ao entrar com Google: " + err.message);
      }
    }
  };

  const handleSeed = async () => {
    if (confirm("Deseja importar os dados iniciais? Isso pode duplicar se já existirem.")) {
      try {
        await seedInitialData();
        alert("Importação concluída!");
        window.location.reload();
      } catch (err) {
        console.error("Erro na importação:", err);
        alert("Erro ao importar dados. Verifique o console para mais detalhes.");
      }
    }
  };

  if (receiptId) {
    return <PublicReceipt receiptId={receiptId} />;
  }

  if (loading) return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 text-slate-900 gap-4">
      <div className="size-16 border-2 border-slate-200 border-t-red-800 rounded-full animate-spin" />
      <p className="text-[10px] font-bold uppercase tracking-[0.4em] animate-pulse">Suíte de Inteligência</p>
    </div>
  );

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-12 rounded-[48px] shadow-2xl max-w-md w-full text-center border relative overflow-hidden group bg-white border-slate-100"
        >
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-red-900 via-amber-600 to-red-900" />
          
          <div className="flex flex-col items-center justify-center gap-4 mb-10">
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center shadow-2xl border bg-white border-slate-200 overflow-hidden relative">
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt="Logo" 
                  className="w-full h-full object-cover rounded-3xl transition-transform duration-300" 
                  style={{ transform: `scale(${logoScale})` }}
                  referrerPolicy="no-referrer" 
                />
              ) : (
                <div className="w-full h-full bg-red-800 flex items-center justify-center rounded-3xl">
                  <LayoutDashboard size={32} className="text-white" />
                </div>
              )}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 font-display">
                ERP CLUB DA <span className="text-red-800 uppercase">BOLA</span>
              </h1>
              <p className="mt-2 font-bold uppercase tracking-widest text-[9px] text-slate-400">
                Portfólio de Gestão Analítica
              </p>
            </div>
          </div>
          
          <button 
            onClick={login}
            className="w-full py-5 px-8 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-4 group/btn font-bold uppercase tracking-widest text-xs bg-slate-900 text-white hover:bg-slate-800"
          >
            <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
            Autenticação Digital
          </button>
        </motion.div>
      </div>
    );
  }

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'pdv', label: 'Venda (PDV)', icon: ShoppingCart },
    { id: 'products', label: 'Estoque', icon: Package },
    { id: 'customers', label: 'Clientes', icon: Users },
    { id: 'shipments', label: 'Encomendas', icon: Truck },
    { id: 'compensations', label: 'Compensações', icon: RefreshCcw },
    { id: 'reports', label: 'Relatórios & Rastreio', icon: BarChart3 },
    { id: 'finance', label: 'Financeiro & Auditoria', icon: DollarSign },
    { id: 'mural', label: 'Mural & Logo', icon: Camera },
  ];

  return (
    <SidebarContext.Provider value={{ isSidebarOpen, setIsSidebarOpen }}>
      <div className="flex h-screen font-sans overflow-hidden relative bg-gradient-to-tr from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] text-slate-900">
        
        {/* Subtle Elegant Ambient Background Gradient Glows */}
        <div className="absolute top-[-150px] left-[-150px] w-[500px] h-[500px] bg-red-800/10 rounded-full blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-100px] right-[50px] w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[160px] pointer-events-none" />
      
      {/* Modern Sidebar - Strictly for Desktop (hidden on mobile) */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside 
            initial={{ width: 0, opacity: 0 }}
            animate={{ 
              width: 260,
              opacity: 1,
            }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="hidden md:flex flex-col shrink-0 shadow-2xl z-[90] h-full border-r bg-slate-900 border-slate-800 relative"
          >
            <div className="p-6 flex items-center justify-between border-b border-slate-800/50">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-slate-850 shadow-lg group-hover:scale-110 transition-transform overflow-hidden relative">
                  {logoUrl ? (
                    <img 
                      src={logoUrl} 
                      alt="Logo ERP" 
                      className="w-full h-full object-cover rounded-lg transition-transform duration-300" 
                      style={{ transform: `scale(${logoScale})` }}
                      referrerPolicy="no-referrer" 
                    />
                  ) : (
                    <LayoutDashboard size={18} className="text-slate-900" />
                  )}
                </div>

                {isSidebarOpen && (
                  <h1 className="text-white font-bold tracking-tight leading-none text-sm font-display">
                    ERP CLUB DA <span className="text-amber-500 uppercase font-display">BOLA</span>
                  </h1>
                )}
              </motion.div>
            </div>

            <nav className="flex-1 mt-8 px-4 space-y-1.5 overflow-y-auto custom-scrollbar">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActivePage(item.id as Page);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all text-sm font-bold group",
                    activePage === item.id 
                      ? 'bg-red-800 text-white shadow-lg shadow-red-900/20 border border-white/10' 
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                  )}
                >
                  <item.icon size={20} className={cn(activePage === item.id ? 'text-white' : 'text-slate-500 group-hover:text-amber-500 transition-colors')} />
                  {isSidebarOpen && <span className="tracking-tight">{item.label}</span>}
                  {isSidebarOpen && activePage === item.id && (
                    <motion.div layoutId="activeIndicator" className="ml-auto w-1.5 h-1.5 bg-white rounded-full shadow-glow" />
                  )}
                </button>
              ))}
            </nav>

            <div className="p-4 mt-auto border-t border-slate-800/50 space-y-4">
              {isSidebarOpen && (
                <div className="bg-amber-500/5 p-4 rounded-2xl border border-amber-500/10">
                  <p className="text-[10px] uppercase font-black text-amber-500 mb-1 tracking-widest">Base de Dados</p>
                  <button 
                    onClick={handleSeed}
                    className="mt-2 w-full text-[10px] bg-slate-800 text-white py-2 px-3 rounded-xl font-black uppercase hover:bg-red-800 transition-all border border-slate-700 font-sans"
                  >
                    Importar Excel
                  </button>
                </div>
              )}
              <button 
                onClick={() => signOut(auth)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-rose-500/10 hover:text-rose-400 transition-all text-slate-500 text-sm font-bold group"
              >
                <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
                {isSidebarOpen && <span>Sair do Sistema</span>}
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
         <header className="h-16 md:h-20 border-b flex items-center justify-between px-4 md:px-10 shrink-0 z-50 bg-white border-slate-100">
          <div className="flex items-center gap-4">
             {/* Sidebar Toggle - Only on Desktop, no Hamburger Menu trigger on mobile */}
             <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="hidden md:flex p-2.5 rounded-xl transition-all border text-slate-400 bg-slate-50 border-slate-100 hover:text-slate-900"
              >
                <Menu size={20} />
              </button>

             <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setActivePage('dashboard')}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-transform bg-transparent shadow-slate-200/30 overflow-hidden border border-slate-200/80 relative">
                    {logoUrl ? (
                      <img 
                        src={logoUrl} 
                        alt="Logo" 
                        className="w-full h-full object-cover rounded-lg transition-transform duration-300" 
                        style={{ transform: `scale(${logoScale})` }}
                        referrerPolicy="no-referrer" 
                      />
                    ) : (
                      <LayoutDashboard size={16} className="text-amber-600" />
                    )}
                  </div>
                  <div className="flex flex-col -space-y-0.5">
                    <span className="text-xs font-black uppercase tracking-tight text-slate-900 font-sans">
                      ERP CLUB DA <span className="text-red-800 uppercase">BOLA</span>
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase hidden sm:block tracking-widest leading-tight">
                      Inteligência e Logística
                    </span>
                  </div>
                </div>
             </div>

          </div>
          <div className="flex items-center gap-3 md:gap-6">
            <button className="hidden md:flex items-center gap-2 bg-slate-900 text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-black transition-all">
              <Send size={14} />
              Protocolo Ativo
            </button>
            <div className="flex items-center gap-3 md:border-l md:pl-6 border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-black uppercase tracking-tight text-slate-900">
                  {user.displayName || user.email.split('@')[0]}
                </p>
                <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Administrador Master</p>
              </div>
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl overflow-hidden p-0.5 shadow-xl bg-white border border-slate-100">
                <img className="rounded-[14px] w-full h-full object-cover" src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=6366f1&color=fff`} alt="User" />
              </div>
            </div>
          </div>
        </header>

        <div className={cn(
          "flex-1 p-3 md:p-6 pb-24 md:pb-6",
          activePage === 'pdv' ? "overflow-y-auto md:overflow-hidden" : "overflow-y-auto"
        )}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activePage === 'dashboard' && <Dashboard />}
              {activePage === 'pdv' && <PDV />}
              {activePage === 'products' && <Products />}
              {activePage === 'customers' && <Customers />}
              {activePage === 'compensations' && <Compensations />}
              {activePage === 'reports' && <Reports />}
              {activePage === 'shipments' && <Shipments />}
              {activePage === 'finance' && <Finance />}
              {activePage === 'mural' && <Mural />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom Navigation for Native Mobile Feel */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-900 border-t border-slate-800/50 z-50 flex items-center select-none shadow-xl">
          <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth px-4 h-full items-center">
            {menuItems.map((item) => {
              const IsActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActivePage(item.id as Page);
                  }}
                  className={cn(
                    "flex items-center gap-2 h-10 px-4 rounded-xl transition-all whitespace-nowrap text-[10px] font-bold uppercase tracking-wider shrink-0 duration-200",
                    IsActive 
                      ? "bg-red-800 text-white shadow-md shadow-red-900/10" 
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <item.icon size={14} className={IsActive ? 'text-white' : 'text-slate-500'} />
                  <span>{item.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </main>
    </div>
    </SidebarContext.Provider>
  );
}
