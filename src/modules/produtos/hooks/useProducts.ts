"use client";

import { useMemo, useState } from "react";
import { mockProducts } from "../mockProducts";

export function useProducts() {
  const [search, setSearch] = useState("");

  const products = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return mockProducts;
    }

    return mockProducts.filter((product) =>
      [
        product.code,
        product.description,
        product.type,
        product.active ? "Ativo" : "Inativo",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [search]);

  return {
    products,
    search,
    setSearch,
  };
}
