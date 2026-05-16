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
  Truck
} from 'lucide-react';
import { auth } from './lib/firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
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

type Page = 'dashboard' | 'pdv' | 'products' | 'customers' | 'finance' | 'compensations' | 'shipments';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
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

  if (loading) return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 text-slate-900 gap-4">
      <div className="size-16 border-2 border-slate-200 border-t-red-800 rounded-full animate-spin" />
      <p className="text-[10px] font-bold uppercase tracking-[0.4em] animate-pulse">Intelligence Suite</p>
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
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center shadow-2xl border bg-red-800 border-red-700">
              <LayoutDashboard size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 font-display">
                ERP CLUB DA <span className="text-red-800 uppercase">BOLA</span>
              </h1>
              <p className="mt-2 font-bold uppercase tracking-widest text-[9px] text-slate-400">
                Analytical Management Portfolio
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
    { id: 'finance', label: 'Financeiro & Auditoria', icon: DollarSign },
  ];

  return (
    <div className="flex h-screen font-sans overflow-hidden relative bg-slate-50 text-slate-900">
      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[80] md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Modern Sidebar - Responsive */}
      <AnimatePresence mode="wait">
        {(isSidebarOpen || isMobileMenuOpen) && (
          <motion.aside 
            initial={isMobileMenuOpen ? { x: -300 } : false}
            animate={{ 
              width: isMobileMenuOpen ? 280 : (isSidebarOpen ? 260 : 80),
              x: 0,
              position: isMobileMenuOpen ? 'fixed' : 'relative',
            }}
            exit={isMobileMenuOpen ? { x: -300 } : undefined}
            className={cn(
              "flex flex-col shrink-0 shadow-2xl z-[90] transition-all duration-300 h-full border-r bg-slate-900 border-slate-800",
              !isMobileMenuOpen && "hidden md:flex",
              isMobileMenuOpen && "fixed top-0 left-0"
            )}
          >
            <div className="p-6 flex items-center justify-between border-b border-slate-800/50">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center p-1 bg-gradient-to-br from-red-800 to-red-950 border border-white/10 shadow-lg group-hover:scale-110 transition-transform">
                  <LayoutDashboard size={18} className="text-white" />
                </div>
                {(isSidebarOpen || isMobileMenuOpen) && (
                  <h1 className="text-white font-bold tracking-tight leading-none text-sm font-display">
                    ERP CLUB DA <span className="text-amber-500 uppercase font-display">BOLA</span>
                  </h1>
                )}
              </motion.div>
              
              {isMobileMenuOpen && (
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-slate-400 hover:text-white bg-white/5 rounded-xl transition-colors md:hidden"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <nav className="flex-1 mt-8 px-4 space-y-1.5 overflow-y-auto custom-scrollbar">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActivePage(item.id as Page);
                    if (isMobileMenuOpen) setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all text-sm font-bold group",
                    activePage === item.id 
                      ? 'bg-red-800 text-white shadow-lg shadow-red-900/20 border border-white/10' 
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                  )}
                >
                  <item.icon size={20} className={cn(activePage === item.id ? 'text-white' : 'text-slate-500 group-hover:text-amber-500 transition-colors')} />
                  {(isSidebarOpen || isMobileMenuOpen) && <span className="tracking-tight">{item.label}</span>}
                  {(isSidebarOpen || isMobileMenuOpen) && activePage === item.id && (
                    <motion.div layoutId="activeIndicator" className="ml-auto w-1.5 h-1.5 bg-white rounded-full shadow-glow" />
                  )}
                </button>
              ))}
            </nav>

            <div className="p-4 mt-auto border-t border-slate-800/50 space-y-4">
              {(isSidebarOpen || isMobileMenuOpen) && (
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
                {(isSidebarOpen || isMobileMenuOpen) && <span>Sair do Sistema</span>}
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
         <header className="h-16 md:h-20 border-b flex items-center justify-between px-4 md:px-10 shrink-0 z-50 bg-white border-slate-100">
          <div className="flex items-center gap-4">
             {/* Hamburger Menu - 3 Bars */}
             <button 
               onClick={() => setIsMobileMenuOpen(true)}
               className="p-2.5 rounded-xl transition-all md:hidden border shadow-sm text-slate-600 bg-slate-50 border-slate-100 hover:bg-slate-100"
             >
               <Menu size={20} />
             </button>

             {/* Sidebar Toggle - Desktop */}
             <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="hidden md:flex p-2.5 rounded-xl transition-all border text-slate-400 bg-slate-50 border-slate-100 hover:text-slate-900"
              >
                <Menu size={20} />
              </button>

             <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 group cursor-pointer">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center p-1 shadow-lg transition-transform bg-slate-900 shadow-slate-200">
                    <LayoutDashboard size={16} className="text-white" />
                  </div>
                  <div className="flex flex-col -space-y-0.5">
                    <span className="text-xs font-black uppercase tracking-tight text-slate-900 font-sans">
                      ERP CLUB DA <span className="text-red-800 uppercase">BOLA</span>
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase hidden sm:block tracking-widest leading-tight">
                      Intelligence & Logistics
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
                <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Master Admin</p>
              </div>
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl overflow-hidden p-0.5 shadow-xl bg-white border border-slate-100">
                <img className="rounded-[14px] w-full h-full object-cover" src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=6366f1&color=fff`} alt="User" />
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 md:p-6 pb-24 md:pb-6">
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
              {activePage === 'shipments' && <Shipments />}
              {activePage === 'finance' && <Finance />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom Navigation - Only small devices, strictly essential only or remove */}
        {/* I'll remove the redundant bottom nav as the sidebar is now the primary navigation as requested */}
      </main>
    </div>
  );
}
