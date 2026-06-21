export interface Variation {
  id: string;
  size: string;
  color: string;
  stock: number;
}

export interface Product {
  id?: string;
  name: string;
  category: string;
  gender?: 'Masculino' | 'Feminino' | 'Ambos';
  costPrice: number;
  sellingPrice: number;
  margin: number;
  markup: number;
  variations: Variation[];
  totalStock: number;
  minStock: number;
  isDropshipping?: boolean;
  updatedAt: any;
}

export interface Customer {
  id?: string;
  name: string;
  contact: string;
  totalDebt: number;
  balance?: number;
  updatedAt: any;
}

export interface SaleItem {
  productId: string;
  variationId: string;
  name: string;
  productName?: string;
  variationName: string;
  quantity: number;
  price: number;
  isDropshipping?: boolean;
  gender?: 'Masculino' | 'Feminino' | 'Ambos';
  isCustomized?: boolean;
  customName?: string;
  customNumber?: string;
  isCancelled?: boolean;
}

export interface Sale {
  id?: string;
  customerId?: string;
  customerName?: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  downPayment?: number;
  paymentMethod: 'Dinheiro' | 'Cartão' | 'Pix' | 'Fiado';
  status: 'Concluída' | 'Pendente' | 'Pré-venda' | 'Cancelada';
  createdAt: any;
  history?: any[];
  debtAmount?: number;
  isAdjustment?: boolean;
}

export interface ShipmentItem {
  id: string;
  saleId?: string;
  variationId?: string;
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  supplierCost?: number;
  isDropshipping?: boolean;
  gender?: 'Masculino' | 'Feminino' | 'Ambos';
  status?: 'Pendente' | 'Recebido' | 'Entregue';
  isCustomized?: boolean;
  customName?: string;
  customNumber?: string;
}

export interface ShipmentStatusHistory {
  status: Shipment['status'];
  updatedAt: any;
  notes?: string;
}

export interface Shipment {
  id?: string;
  trackingCode: string;
  status: 'Processando' | 'Postado' | 'Em Trânsito' | 'Chegou no Brasil' | 'Fiscalização' | 'Em trânsito para o destino final' | 'Recebido' | 'Entregue';
  items: ShipmentItem[];
  hasTax: boolean;
  taxAmount: number;
  taxPaid: boolean;
  supplierName?: string;
  history?: ShipmentStatusHistory[];
  notes?: string;
  createdAt: any;
  updatedAt: any;
  correiosHistory?: any[];
  lastSyncedAt?: any;
  stockProcessed?: boolean;
}

export interface Transaction {
  id?: string;
  customerId: string;
  amount: number;
  type: 'payment' | 'debt';
  paymentMethod?: 'Dinheiro' | 'Cartão' | 'Pix' | 'Fiado' | 'Saldo';
  saleId?: string;
  createdAt: any;
}

export interface Expense {
  id?: string;
  description: string;
  amount: number;
  category: 'Marketing/Ads' | 'Plataforma/Sistemas' | 'Embalagens' | 'Aluguel/Estrutura' | 'Logística Extra' | 'Outros';
  createdAt: any;
  updatedAt: any;
}

export interface CustomerPhoto {
  id?: string;
  customerId: string;
  customerName: string;
  saleId?: string | null;
  saleDate?: string | null;
  saleItemsSummary?: string | null;
  photoUrl: string;
  description: string;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  createdAt: any;
}

function crc16(str: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    crc ^= (charCode << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function generatePixPayload(amount: number): string {
  const key = "91993249580";
  const name = "BRENER GOMES";
  const city = "BELEM";
  const txid = "CLUBBOLA";

  const formatField = (id: string, value: string) => {
    const len = value.length.toString().padStart(2, '0');
    return `${id}${len}${value}`;
  };

  const gui = formatField("00", "br.gov.bcb.pix");
  const keyField = formatField("01", key);
  const merchantInfo = formatField("26", `${gui}${keyField}`);

  const payloadFormat = formatField("00", "01");
  const initiationMethod = formatField("01", "12");
  const categoryCode = formatField("52", "0000");
  const currencyCode = formatField("53", "986");
  const amountField = formatField("54", amount.toFixed(2));
  const countryCode = formatField("58", "BR");
  const nameField = formatField("59", name);
  const cityField = formatField("60", city);
  
  const txidField = formatField("05", txid);
  const additionalData = formatField("62", txidField);

  const rawPayload = `${payloadFormat}${initiationMethod}${merchantInfo}${categoryCode}${currencyCode}${amountField}${countryCode}${nameField}${cityField}${additionalData}6304`;
  const crc = crc16(rawPayload);
  return `${rawPayload}${crc}`;
}

export const getCustomerLoyaltyTier = (totalPurchased: number) => {
  if (totalPurchased >= 4000) {
    return {
      id: 'black',
      name: 'Black VIP 💎',
      badgeClass: 'bg-slate-950 text-amber-400 border border-amber-500/50 shadow-lg shadow-amber-500/10 font-black',
      iconColor: 'text-amber-400',
      cashback: 0.07,
      nextTierMessage: 'Nível Máximo! Você é uma lenda do Club da Bola. 🔥',
      colorName: 'text-amber-400'
    };
  }
  if (totalPurchased >= 1500) {
    return {
      id: 'ouro',
      name: 'Ouro ⭐',
      badgeClass: 'bg-amber-500/10 text-amber-600 border border-amber-500/30 font-extrabold shadow-sm',
      iconColor: 'text-amber-500',
      cashback: 0.05,
      nextTierMessage: `Falta R$ ${(4000 - totalPurchased).toFixed(2).replace('.', ',')} em compras para atingir o nível Black VIP 💎`,
      colorName: 'text-amber-600'
    };
  }
  if (totalPurchased >= 500) {
    return {
      id: 'prata',
      name: 'Prata 🥈',
      badgeClass: 'bg-indigo-50 text-indigo-600 border border-indigo-200 font-bold',
      iconColor: 'text-indigo-400',
      cashback: 0.03,
      nextTierMessage: `Falta R$ ${(1500 - totalPurchased).toFixed(2).replace('.', ',')} em compras para atingir o nível Ouro ⭐`,
      colorName: 'text-indigo-500'
    };
  }
  return {
    id: 'bronze',
    name: 'Bronze 🥉',
    badgeClass: 'bg-amber-800/10 text-amber-800 border border-amber-800/20 font-bold',
    iconColor: 'text-amber-700',
    cashback: 0.02,
    nextTierMessage: `Falta R$ ${(500 - totalPurchased).toFixed(2).replace('.', ',')} em compras para atingir o nível Prata 🥈`,
    colorName: 'text-amber-800'
  };
};

