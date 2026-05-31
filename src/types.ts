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
  updatedAt: any;
}

export interface SaleItem {
  productId: string;
  variationId: string;
  name: string;
  variationName: string;
  quantity: number;
  price: number;
  isDropshipping?: boolean;
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
  status: 'Concluída' | 'Pendente' | 'Pré-venda';
  createdAt: any;
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
  isDropshipping?: boolean;
}

export interface ShipmentStatusHistory {
  status: Shipment['status'];
  updatedAt: any;
  notes?: string;
}

export interface Shipment {
  id?: string;
  trackingCode: string;
  status: 'Processando' | 'Postado' | 'Em Trânsito' | 'Fiscalização' | 'Recebido' | 'Entregue';
  items: ShipmentItem[];
  hasTax: boolean;
  taxAmount: number;
  taxPaid: boolean;
  supplierName?: string;
  history?: ShipmentStatusHistory[];
  notes?: string;
  createdAt: any;
  updatedAt: any;
}

export interface Transaction {
  id?: string;
  customerId: string;
  amount: number;
  type: 'payment' | 'debt';
  paymentMethod?: 'Dinheiro' | 'Cartão' | 'Pix' | 'Fiado';
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
  createdAt: any;
}

