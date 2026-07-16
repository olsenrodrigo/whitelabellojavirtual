import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { ShoppingCart, ChevronLeft, ZoomIn, Truck, Shield, RotateCcw } from "lucide-react";
import StoreNavbar from "@/components/store/StoreNavbar";
import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/hooks/use-toast";
import { trackViewItem, trackAddToCart, useAnalyticsReady } from "@/lib/analytics";
import ReviewsSection from "@/components/store/ReviewsSection";

interface ProductImage { id: number; url: string; altText?: string; isMain: boolean; position: number; }
interface Variant { id: number; sku?: string; price: string; compareAtPrice?: string; stockQuantity: number; option1?: string; option2?: string; option3?: string; imageUrl?: string; active: boolean; }
interface Product {
  id: number; title: string; slug: string; description?: string; vendor?: string; brand?: string;
  price: string; compareAtPrice?: string; stockQuantity: number; status: string;
  weightG?: number; sku?: string; tags?: string;
  images: ProductImage[]; variants: Variant[];
}

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [storeInfo, setStoreInfo] = useState<any>({});
  const { addToCart, loading: cartLoading } = useCart();
  const { toast } = useToast();
  const analyticsOn = useAnalyticsReady();

  useEffect(() => {
    fetch("/api/store/settings").then(r => r.json()).then(setStoreInfo).catch(() => {});
    fetch(`/api/store/products/${slug}`)
      .then(r => r.json())
      .then(data => { setProduct(data); if (data.variants?.[0]) setSelectedVariant(data.variants[0]); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  // Analytics: view_item ao abrir a página (reemite se o consentimento chegar depois)
  useEffect(() => {
    if (product && analyticsOn) {
      trackViewItem({ slug: product.slug, name: product.title, price: Number(product.price) });
    }
  }, [product, analyticsOn]);

  const primaryColor = storeInfo.primaryColor || "#5B8C9B";

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-2" style={{ borderColor: primaryColor, borderTopColor: "transparent" }} /></div>;
  if (!product) return <div className="min-h-screen flex items-center justify-center text-gray-500">Produto não encontrado</div>;

  const mainImages = product.images.sort((a, b) => a.position - b.position);
  const currentImg = mainImages[selectedImage];
  const effectivePrice = selectedVariant?.price || product.price;
  const effectiveCompare = selectedVariant?.compareAtPrice || product.compareAtPrice;
  const effectiveStock = selectedVariant?.stockQuantity ?? product.stockQuantity;
  const inStock = effectiveStock > 0;
  const hasDiscount = effectiveCompare && Number(effectiveCompare) > Number(effectivePrice);

  const uniqueOptions = {
    option1: Array.from(new Set(product.variants.map(v => v.option1).filter(Boolean))),
    option2: Array.from(new Set(product.variants.map(v => v.option2).filter(Boolean))),
  };
  const hasVariants = product.variants.length > 0;

  const handleAddToCart = async () => {
    await addToCart(product.id, selectedVariant?.id || null, quantity);
    trackAddToCart({ slug: product.slug, name: product.title, price: Number(effectivePrice), quantity });
    toast({ title: "Adicionado ao carrinho!", description: `${product.title} × ${quantity}` });
  };

  const installments = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const v = n <= 3 ? Number(effectivePrice) / n : Number(effectivePrice) * 0.0199 / (1 - Math.pow(1.0199, -n));
    return { n, v, hasFee: n > 3, total: v * n };
  });
  const bestInstallment = installments[installments.length - 1];

  return (
    <div className="min-h-screen bg-gray-50">
      <StoreNavbar storeName={storeInfo.storeName} primaryColor={primaryColor} />
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link href="/loja"><a className="hover:text-gray-700 no-underline">Loja</a></Link>
          <span>/</span>
          <span className="text-gray-800">{product.title}</span>
        </div>

        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {/* Gallery */}
            <div className="p-6">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 mb-3 group">
                {currentImg ? (
                  <img src={currentImg.url} alt={currentImg.altText || product.title}
                    className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-200">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                  </div>
                )}
              </div>
              {mainImages.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {mainImages.map((img, i) => (
                    <button key={img.id} onClick={() => setSelectedImage(i)}
                      className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${i === selectedImage ? "border-blue-500" : "border-transparent"}`}
                      style={i === selectedImage ? { borderColor: primaryColor } : {}}>
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="p-6 flex flex-col">
              {product.brand && <p className="text-sm text-gray-400 mb-1">{product.brand}</p>}
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{product.title}</h1>
              {product.sku && <p className="text-xs text-gray-400 mb-3">REF: {product.sku}</p>}

              {/* Price */}
              <div className="mb-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold" style={{ color: primaryColor }}>
                    R$ {Number(effectivePrice).toFixed(2).replace(".", ",")}
                  </span>
                  {hasDiscount && (
                    <span className="text-gray-400 line-through text-lg">
                      R$ {Number(effectiveCompare).toFixed(2).replace(".", ",")}
                    </span>
                  )}
                </div>
                {Number(effectivePrice) > 12 && (
                  <p className="text-sm text-gray-500 mt-1">
                    ou {bestInstallment.n}x de R$ {bestInstallment.v.toFixed(2).replace(".", ",")}
                    {bestInstallment.hasFee ? " com juros" : " sem juros"}
                  </p>
                )}
                <p className="text-xs text-green-600 mt-1">
                  R$ {(Number(effectivePrice) * 0.95).toFixed(2).replace(".", ",")} no PIX (5% off)
                </p>
              </div>

              {/* Variants */}
              {hasVariants && uniqueOptions.option1.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Opção</p>
                  <div className="flex flex-wrap gap-2">
                    {product.variants.filter(v => v.active).map(v => (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVariant(v)}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${selectedVariant?.id === v.id ? "text-white border-transparent" : "text-gray-700 border-gray-200 hover:border-gray-400"}`}
                        style={selectedVariant?.id === v.id ? { background: primaryColor, borderColor: primaryColor } : {}}
                      >
                        {[v.option1, v.option2, v.option3].filter(Boolean).join(" / ")}
                        {v.stockQuantity <= 0 && <span className="ml-1 text-xs">(esgotado)</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Stock */}
              <div className="mb-4">
                {inStock ? (
                  <span className="text-sm text-green-600 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    {effectiveStock <= 5 ? `Apenas ${effectiveStock} em estoque!` : "Em estoque"}
                  </span>
                ) : (
                  <span className="text-sm text-red-500 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Esgotado
                  </span>
                )}
              </div>

              {/* Quantity + Add */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center border rounded-lg overflow-hidden">
                  <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="px-3 py-2 text-gray-600 hover:bg-gray-50 text-lg">−</button>
                  <span className="px-4 py-2 text-center w-12">{quantity}</span>
                  <button onClick={() => setQuantity(q => Math.min(effectiveStock, q + 1))} className="px-3 py-2 text-gray-600 hover:bg-gray-50 text-lg">+</button>
                </div>
                <Button
                  onClick={handleAddToCart}
                  disabled={!inStock || cartLoading}
                  className="flex-1 gap-2 py-3"
                  style={{ background: primaryColor, borderColor: primaryColor }}
                >
                  <ShoppingCart size={16} />
                  Adicionar ao carrinho
                </Button>
              </div>

              {/* Trust badges */}
              <div className="grid grid-cols-3 gap-2 pt-4 border-t">
                {[
                  { icon: <Truck size={16} />, text: "Envio rápido" },
                  { icon: <Shield size={16} />, text: "Compra segura" },
                  { icon: <RotateCcw size={16} />, text: "Troca fácil" },
                ].map(b => (
                  <div key={b.text} className="flex flex-col items-center gap-1 text-center">
                    <span className="text-gray-400">{b.icon}</span>
                    <span className="text-xs text-gray-500">{b.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          {product.description && (
            <div className="px-6 pb-6 border-t mt-2">
              <h2 className="text-lg font-semibold text-gray-800 my-4">Descrição</h2>
              <div className="prose prose-sm max-w-none text-gray-600"
                dangerouslySetInnerHTML={{ __html: product.description }} />
            </div>
          )}

          {/* Avaliações */}
          <div className="px-6 pb-8">
            <ReviewsSection slug={product.slug} primaryColor={primaryColor} />
          </div>
        </div>

        {/* SEO: AggregateRating só com avaliações reais */}
        {Number((product as any).ratingCount) > 0 && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Product",
                name: product.title,
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: (product as any).ratingAvg,
                  reviewCount: (product as any).ratingCount,
                },
              }),
            }}
          />
        )}
      </div>
    </div>
  );
}
