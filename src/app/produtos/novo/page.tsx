import { ProductForm } from "@/modules/produtos/components/ProductForm";
import { ProductNavigation } from "@/modules/produtos/components/ProductNavigation";

export default function NewProductPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <ProductNavigation />

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              New Product
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Frontend-only product registration using mocked data.
            </p>
          </div>
        </header>

        <ProductForm mode="new" />
      </div>
    </main>
  );
}
