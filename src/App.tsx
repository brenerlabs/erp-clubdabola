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
  Send
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

type Page = 'dashboard' | 'pdv' | 'products' | 'customers' | 'finance' | 'compensations';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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

  if (loading) return <div className="h-screen w-screen flex items-center justify-center bg-gray-50 text-gray-400">Carregando...</div>;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-100"
        >
          <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-200 overflow-hidden">
            <img src="https://i.ibb.co/v3Y0V6N/logo-club-da-bola.jpg" alt="Club da Bola" className="w-full h-full object-contain p-2" onError={(e) => e.currentTarget.src='https://ui-avatars.com/api/?name=CB&background=f59e0b&color=0f172a'} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2 italic">ERP CLUB DA <span className="text-amber-500">BOLA</span></h1>
          <p className="text-gray-500 mb-8 font-medium">Gestão Inteligente para o seu Negócio</p>
          <button 
            onClick={login}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            Entrar com Google
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
    { id: 'compensations', label: 'Compensações', icon: RefreshCcw },
    { id: 'finance', label: 'Financeiro', icon: DollarSign },
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden relative">
      {/* Sidebar Navigation */}
      <AnimatePresence>
        {(isSidebarOpen || window.innerWidth > 768) && (
          <motion.aside 
            initial={window.innerWidth <= 768 ? { x: -300 } : false}
            animate={{ 
              width: isSidebarOpen ? 260 : 80,
              x: 0,
              position: window.innerWidth <= 768 ? 'absolute' : 'relative'
            }}
            exit={window.innerWidth <= 768 ? { x: -300 } : undefined}
            className={cn(
              "bg-slate-900 flex flex-col shrink-0 shadow-2xl z-[60] transition-all duration-300 h-full",
              window.innerWidth <= 768 && "absolute top-0 left-0"
            )}
          >
            <div className="p-6 flex items-center justify-between">
              {(isSidebarOpen || window.innerWidth <= 768) && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2"
                >
                  <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center p-1 bg-white/10">
                    <img 
                      src="https://i.ibb.co/v3Y0V6N/logo-club-da-bola.jpg" 
                      alt="Logo" 
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                      onError={(e) => { 
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          const fallback = document.createElement('div');
                          fallback.className = "w-full h-full bg-amber-500 rounded flex items-center justify-center text-[10px] font-black italic text-slate-900";
                          fallback.innerText = "CB";
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  </div>
                  <h1 className="text-white font-black tracking-tighter leading-none text-xs italic">
                    ERP CLUB DA <span className="text-amber-500">BOLA</span>
                  </h1>
                </motion.div>
              )}
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white rounded-lg transition-colors md:block"
              >
                {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>

            <nav className="flex-1 mt-6 px-4 space-y-1 overflow-y-auto custom-scrollbar">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActivePage(item.id as Page);
                    if (window.innerWidth <= 768) setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-md transition-all text-sm font-medium ${
                    activePage === item.id 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/20' 
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <item.icon size={18} className={activePage === item.id ? 'text-white' : 'text-slate-400'} />
                  {(isSidebarOpen || window.innerWidth <= 768) && <span>{item.label}</span>}
                  {(isSidebarOpen || window.innerWidth <= 768) && activePage === item.id && <ChevronRight size={14} className="ml-auto opacity-50" />}
                </button>
              ))}
            </nav>

            <div className="p-4 mt-auto border-t border-slate-800 space-y-4">
              {isSidebarOpen && (
                <div className="bg-indigo-500/10 p-3 rounded-lg border border-indigo-500/20 hidden md:block">
                  <p className="text-[10px] uppercase font-bold text-indigo-400 mb-1">Carga inicial</p>
                  <p className="text-[10px] text-white opacity-80 leading-tight">Importe dados da planilha categorizada.</p>
                  <button 
                    onClick={handleSeed}
                    className="mt-2 w-full text-[10px] bg-indigo-600 text-white py-1.5 px-2 rounded font-bold uppercase hover:bg-indigo-500 transition-colors"
                  >
                    Importar Firestore
                  </button>
                </div>
              )}
              <button 
                onClick={() => signOut(auth)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-rose-500/10 hover:text-rose-400 transition-all text-slate-400 text-sm font-medium"
              >
                <LogOut size={18} />
                {(isSidebarOpen || window.innerWidth <= 768) && <span>Encerrar Sessão</span>}
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
         <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0">
          <div className="flex items-center gap-3">
             <button 
                onClick={() => setIsSidebarOpen(true)}
                className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <Menu size={20} />
              </button>
             <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-slate-50 border border-slate-100 p-1 hidden sm:flex">
               <img 
                src="https://i.ibb.co/v3Y0V6N/logo-club-da-bola.jpg" 
                alt="Logo" 
                className="w-full h-full object-contain" 
                referrerPolicy="no-referrer"
                onError={(e) => { 
                  e.currentTarget.style.display = 'none';
                  const parent = e.currentTarget.parentElement;
                  if (parent) {
                    const fallback = document.createElement('div');
                    fallback.className = "w-full h-full bg-amber-500 rounded flex items-center justify-center text-[10px] font-black italic text-slate-900";
                    fallback.innerText = "CB";
                    parent.appendChild(fallback);
                  }
                }}
               />
             </div>
            <span className="text-slate-900 text-sm font-black italic uppercase tracking-tighter">ERP CLUB DA <span className="text-amber-500">BOLA</span></span>
            <span className="text-slate-300 hidden sm:block">/</span>
            <span className="text-slate-800 font-semibold text-sm capitalize hidden sm:block">
              {menuItems.find(m => m.id === activePage)?.label}
            </span>
          </div>
          <div className="flex items-center gap-3 md:gap-6">
            <button className="hidden md:flex items-center gap-2 bg-emerald-500 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-sm shadow-emerald-200 hover:bg-emerald-600 transition-colors">
              <Send size={14} />
              WhatsApp Ativo
            </button>
            <div className="flex items-center gap-3 md:border-l md:pl-6 border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-900">{user.displayName || user.email.split('@')[0]}</p>
                <p className="text-[10px] text-slate-500 uppercase font-medium">Administrador</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border border-slate-100 p-0.5 shadow-sm">
                <img className="rounded-full" src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=6366f1&color=fff`} alt="User" />
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
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
              {activePage === 'finance' && <Finance />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
