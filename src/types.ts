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
  costPrice: number;
  sellingPrice: number;
  margin: number;
  markup: number;
  variations: Variation[];
  totalStock: number;
  minStock: number;
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
}

export interface Sale {
  id?: string;
  customerId?: string;
  customerName?: string;
  items: SaleItem[];
  total: number;
  downPayment?: number;
  paymentMethod: 'Dinheiro' | 'Cartão' | 'Pix' | 'Fiado';
  status: 'Concluída' | 'Pendente';
  createdAt: any;
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
