import type { Product } from "./types";

export const mockProducts: Product[] = [
  {
    code: "PN-000145",
    description: "Eixo usinado sob encomenda",
    customer: "Embraer",
    type: "Manufactured",
    unit: "pc",
    active: true,
    notes: "Mock record for frontend validation.",
    quantity: 0,
  },
  {
    code: "PN-000212",
    description: "Dispositivo de montagem",
    customer: "Pilkington",
    type: "Assembly",
    unit: "pc",
    active: true,
    notes: "Mock record for frontend validation.",
    quantity: 0,
  },
  {
    code: "PN-000318",
    description: "Base soldada",
    customer: "Nexus.IA",
    type: "Fabricated",
    unit: "pc",
    active: false,
    notes: "Mock record for frontend validation.",
    quantity: 0,
  },
];
