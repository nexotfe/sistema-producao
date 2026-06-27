import { ProductForm } from "@/modules/produtos/components/ProductForm";
import { ProductNavigation } from "@/modules/produtos/components/ProductNavigation";
import { mockProducts } from "@/modules/produtos/mockProducts";
import type { ProductFormValues } from "@/modules/produtos/types";

type Props = {
  params: Promise<{
    pn: string;
  }>;
};

export default async function EditProductPage({ params }: Props) {
  const { pn } = await params;
  const product = mockProducts.find((item) => item.code === pn);

  const initialValues: ProductFormValues = product
    ? {
        code: product.code,
        description: product.description,
        customer: product.customer,
        type: product.type,
        unit: product.unit,
        active: product.active,
        notes: product.notes,
        quantity: 0,
      }
    : {
        code: pn,
        description: "",
        customer: "",
        type: "",
        unit: "pc",
        active: true,
        notes: "",
        quantity: 0,
      };

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <ProductNavigation />

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Edit Product
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Frontend-only product editing using mocked data.
            </p>
          </div>
        </header>

        <ProductForm mode="edit" initialValues={initialValues} />
      </div>
    </main>
  );
}
