import type { Product } from "./types";

export const mockProducts: Product[] = [
  {
    code: "COD-000145",
    description: "Eixo usinado sob encomenda",
    customer: "Embraer",
    type: "Produto Acabado",
    unit: "un",
    active: true,
    notes: "Registro mockado para validacao visual.",
    quantity: 0,
  },
  {
    code: "COD-000212",
    description: "Dispositivo de montagem",
    customer: "Pilkington",
    type: "Semiacabado",
    unit: "un",
    active: true,
    notes: "Registro mockado para validacao visual.",
    quantity: 2,
  },
  {
    code: "COD-000318",
    description: "Base soldada",
    customer: "Nexus.IA",
    type: "Produto Acabado",
    unit: "un",
    active: false,
    notes: "Registro mockado para validacao visual.",
    quantity: 12,
  },
];
