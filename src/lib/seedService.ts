import { collection, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { Product, Customer, Variation } from '../types';
import { calculateMargin, calculateMarkup } from './utils';

export const seedInitialData = async () => {
  const batch = writeBatch(db);

  const customers = [
    { name: "Brener Silva", contact: "91993249580" },
    { name: "Caçula", contact: "91982871481" },
    { name: "Clodomar Quintino", contact: "91998170042" },
    { name: "Evandro Fiho", contact: "91992942876" },
    { name: "Gabriel Naor", contact: "98981531180" },
    { name: "Geovane Silva", contact: "31992034111" },
    { name: "Josiel Sousa", contact: "98983292625" },
    { name: "Karol Nascimento", contact: "98982197585" },
    { name: "Mário Liberato", contact: "98983540009" },
    { name: "Maycon Santos", contact: "91993631757" },
    { name: "Rhyane Garcês", contact: "98981450009" },
    { name: "Thiago Alves", contact: "91988029204" },
  ];

  customers.forEach((c) => {
    const ref = doc(collection(db, 'customers'));
    batch.set(ref, {
      ...c,
      totalDebt: 0,
      updatedAt: serverTimestamp()
    });
  });

  const productData = [
    { category: "Eletrônico", name: "Cabo Linghtning", cost: 30, sell: 75, sizes: [] },
    { category: "Eletrônico", name: "Cabo Tipo-C", cost: 30, sell: 75, sizes: [] },
    { category: "Camisa", name: "Camisa Feminina Brasil I 2026", cost: 70, sell: 169, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Camisa Feminina Brasil II 2026", cost: 70, sell: 169, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Camisa Feminina Vasco Goleiro 2026", cost: 70, sell: 169, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Camisa Feminina Vasco III 2026", cost: 70, sell: 169, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Camisa Masculina Brasil I 2026 - Jogador", cost: 90, sell: 189, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Camisa Masculina Brasil I 2026 - Torcedor", cost: 70, sell: 169, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Camisa Masculina Brasil II 2026 - Jogador", cost: 90, sell: 189, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Camisa Masculina Brasil II 2026 - Torcedor", cost: 70, sell: 169, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Camisa Masculina Cruzeiro I 2026 - Jogador", cost: 90, sell: 189, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Camisa Masculina Cruzeiro I 2026 - Torcedor", cost: 70, sell: 169, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Camisa Masculina Flamento I 2026 - Jogador", cost: 90, sell: 189, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Camisa Masculina Flamento I 2026 - Torcedor", cost: 70, sell: 169, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Camisa Masculina Vasco I 2026 - Jogador", cost: 90, sell: 189, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Camisa Masculina Vasco I 2026 - Torcedor", cost: 70, sell: 169, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Camisa Masculina Vasco II 2026 - Jogador", cost: 90, sell: 189, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Camisa Masculina Vasco II 2026 - Torcedor", cost: 70, sell: 169, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Conj. Infantil Brasil I 2026", cost: 70, sell: 189, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Camisa", name: "Conj. Infantil Brasil II 2026", cost: 70, sell: 189, sizes: ["P", "M", "G", "GG", "XG", "2XL", "3XL"] },
    { category: "Eletrônico", name: "Fonte Tipo C + USB (Branco)", cost: 45, sell: 85, sizes: [] },
    { category: "Eletrônico", name: "Fonte Tipo C + USB (Preto)", cost: 45, sell: 85, sizes: [] },
  ];

  productData.forEach((p) => {
    const ref = doc(collection(db, 'products'));
    const variations: Variation[] = p.sizes.map((size) => ({
      id: Math.random().toString(36).substr(2, 9),
      size,
      color: "Padrão",
      stock: 5
    }));

    batch.set(ref, {
      name: p.name,
      category: p.category,
      costPrice: p.cost,
      sellingPrice: p.sell,
      margin: calculateMargin(p.cost, p.sell),
      markup: calculateMarkup(p.cost, p.sell),
      variations: variations,
      totalStock: variations.reduce((acc, v) => acc + v.stock, 0) || 10,
      minStock: 2,
      updatedAt: serverTimestamp()
    });
  });

  await batch.commit();
  console.log("Seed concluído com sucesso!");
};
