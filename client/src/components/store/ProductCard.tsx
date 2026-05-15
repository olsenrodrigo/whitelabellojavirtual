import { Link } from "wouter";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/hooks/use-toast";

interface ProductCardProps {
  product: {
    id: number;
    title: string;
    slug: string;
    price: string;
    compareAtPrice?: string | null;
    mainImage?: string | null;
    stockQuantity: number;
    status: string;
  };
  primaryColor?: string;
}

export default function ProductCard({ product, primaryColor = "#5B8C9B" }: ProductCardProps) {
  const { addToCart, loading } = useCart();
  const { toast } = useToast();

  const inStock = product.stockQuantity > 0 || product.status === "active";
  const hasDiscount = product.compareAtPrice && Number(product.compareAtPrice) > Number(product.price);
  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.price) / Number(product.compareAtPrice!)) * 100)
    : 0;

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await addToCart(product.id, null, 1);
    toast({ title: "Adicionado ao carrinho!", description: product.title });
  };

  return (
    <Link href={`/loja/produto/${product.slug}`}>
      <a className="group block bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 ease-out no-underline">
        {/* Image */}
        <div className="relative overflow-hidden bg-gray-50 aspect-square">
          {product.mainImage ? (
            <img
              src={product.mainImage}
              alt={product.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
          )}
          {hasDiscount && (
            <span className="absolute top-2 left-2 text-white text-xs font-bold px-2 py-1 rounded"
              style={{ background: "#dc2626" }}>
              -{discountPct}%
            </span>
          )}
          {!inStock && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
              <span className="bg-gray-800 text-white text-xs px-3 py-1 rounded-full">Esgotado</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <h3 className="text-sm font-medium text-gray-800 line-clamp-2 mb-2 leading-snug min-h-[2.5rem]">
            {product.title}
          </h3>

          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-base font-bold" style={{ color: primaryColor }}>
              R$ {Number(product.price).toFixed(2).replace(".", ",")}
            </span>
            {hasDiscount && (
              <span className="text-xs text-gray-400 line-through">
                R$ {Number(product.compareAtPrice).toFixed(2).replace(".", ",")}
              </span>
            )}
          </div>

          <button
            onClick={handleAddToCart}
            disabled={!inStock || loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-lg text-white text-sm font-medium transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: inStock ? primaryColor : "#9ca3af" }}
          >
            <ShoppingCart size={15} />
            {inStock ? "Adicionar" : "Esgotado"}
          </button>
        </div>
      </a>
    </Link>
  );
}
