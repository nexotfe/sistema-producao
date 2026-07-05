"use client";

import { ProductsHeader } from "@/modules/produtos/components/ProductsHeader";
import { ProductsTable } from "@/modules/produtos/components/ProductsTable";
import { useProducts } from "@/modules/produtos/hooks/useProducts";

export default function ProductsPage() {
  const { products, search, setSearch } = useProducts();

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <ProductsHeader search={search} setSearch={setSearch} />

        <ProductsTable products={products} search={search} />
      </div>
    </main>
  );
}
