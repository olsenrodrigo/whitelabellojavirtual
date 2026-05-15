import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Filter, X, Star, ChevronLeft, ChevronRight } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import StoreNavbar from "@/components/store/StoreNavbar";
import ProductCard from "@/components/store/ProductCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Product {
  id: number; title: string; slug: string; price: string;
  compareAtPrice?: string | null; mainImage?: string | null;
  stockQuantity: number; status: string; categoryId?: number | null;
}
interface Category { id: number; name: string; slug: string; }
interface StoreInfo { storeName?: string; primaryColor?: string; storeDescription?: string; logoUrl?: string | null; }

const SORT_OPTIONS = [
  { value: "newest", label: "Mais recentes" },
  { value: "price_asc", label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
  { value: "name_asc", label: "A-Z" },
];

// ---------------------------------------------------------------------------
// Featured Carousel
// ---------------------------------------------------------------------------
function FeaturedCarousel({ primaryColor }: { primaryColor: string }) {
  const [featured, setFeatured] = useState<Product[]>([]);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start" });

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    fetch("/api/store/products?featured=true&limit=8")
      .then(r => r.json())
      .then(d => setFeatured(d.products || []))
      .catch(() => {});
  }, []);

  if (featured.length === 0) return null;

  return (
    <div className="mb-10">
      {/* Section title */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Star size={20} style={{ color: primaryColor }} fill={primaryColor} />
          <h2 className="text-xl font-bold text-gray-800">Destaques</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={scrollPrev}
            className="p-1.5 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
            aria-label="Anterior"
          >
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <button
            onClick={scrollNext}
            className="p-1.5 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
            aria-label="Próximo"
          >
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>
      </div>

      {/* Carousel */}
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-4">
          {featured.map(item => (
            <div key={item.id} className="flex-none w-48 sm:w-56">
              <ProductCard product={item} primaryColor={primaryColor} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StorePage
// ---------------------------------------------------------------------------
export default function StorePage() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [storeInfo, setStoreInfo] = useState<StoreInfo>({});
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string>(urlParams.get("category") || "");
  const [searchQ, setSearchQ] = useState(urlParams.get("search") || "");
  const [sort, setSort] = useState("newest");
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    fetch("/api/store/settings").then(r => r.json()).then(setStoreInfo).catch(() => {});
    fetch("/api/store/categories").then(r => r.json()).then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    loadProducts();
  }, [page, selectedCategory, searchQ, sort]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "24" });
      if (selectedCategory) params.set("category", selectedCategory);
      if (searchQ) params.set("search", searchQ);
      const res = await fetch(`/api/store/products?${params}`);
      const data = await res.json();
      let prods = data.products || [];
      // Client-side sort
      if (sort === "price_asc") prods.sort((a: Product, b: Product) => Number(a.price) - Number(b.price));
      else if (sort === "price_desc") prods.sort((a: Product, b: Product) => Number(b.price) - Number(a.price));
      else if (sort === "name_asc") prods.sort((a: Product, b: Product) => a.title.localeCompare(b.title));
      setProducts(prods);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } finally {
      setLoading(false);
    }
  };

  const primaryColor = storeInfo.primaryColor || "#5B8C9B";

  return (
    <div className="min-h-screen bg-gray-50">
      <StoreNavbar onSearch={q => { setSearchQ(q); setPage(1); }} storeName={storeInfo.storeName} primaryColor={primaryColor} logoUrl={storeInfo.logoUrl ?? undefined} />

      <div className="container mx-auto px-4 py-6 max-w-7xl">

        {/* Featured carousel — above everything else */}
        <FeaturedCarousel primaryColor={primaryColor} />

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">{storeInfo.storeName || "Loja Virtual"}</h1>
          {storeInfo.storeDescription && <p className="text-gray-500 mt-1">{storeInfo.storeDescription}</p>}
          {searchQ && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-gray-500 text-sm">Buscando: <b>"{searchQ}"</b></span>
              <button onClick={() => setSearchQ("")} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
            </div>
          )}
        </div>

        <div className="flex gap-6">
          {/* Sidebar filters */}
          <aside className={`${filterOpen ? "block" : "hidden"} md:block w-full md:w-48 flex-shrink-0`}>
            <div className="bg-white rounded-xl border p-4 sticky top-20">
              <h3 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">Categorias</h3>
              <ul className="space-y-1">
                <li>
                  <button
                    onClick={() => { setSelectedCategory(""); setPage(1); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!selectedCategory ? "text-white font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                    style={!selectedCategory ? { background: primaryColor } : {}}
                  >
                    Todos
                  </button>
                </li>
                {categories.map(cat => (
                  <li key={cat.id}>
                    <button
                      onClick={() => { setSelectedCategory(String(cat.id)); setPage(1); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedCategory === String(cat.id) ? "text-white font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                      style={selectedCategory === String(cat.id) ? { background: primaryColor } : {}}
                    >
                      {cat.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Main */}
          <div className="flex-1 min-w-0">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilterOpen(!filterOpen)}
                  className="md:hidden flex items-center gap-1 text-sm text-gray-600 border px-3 py-2 rounded-lg"
                >
                  <Filter size={14} /> Filtros
                </button>
                <span className="text-sm text-gray-500">{total} produto{total !== 1 ? "s" : ""}</span>
              </div>
              <Select value={sort} onValueChange={v => { setSort(v); setPage(1); }}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-xl border animate-pulse">
                    <div className="aspect-square bg-gray-100 rounded-t-xl" />
                    <div className="p-3 space-y-2">
                      <div className="h-4 bg-gray-100 rounded w-3/4" />
                      <div className="h-5 bg-gray-100 rounded w-1/2" />
                      <div className="h-9 bg-gray-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <p className="text-lg mb-2">Nenhum produto encontrado</p>
                <button onClick={() => { setSearchQ(""); setSelectedCategory(""); }} className="text-sm underline">Limpar filtros</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {products.map(p => <ProductCard key={p.id} product={p} primaryColor={primaryColor} />)}
              </div>
            )}

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex justify-center gap-2 mt-8">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                <span className="flex items-center px-4 text-sm text-gray-600">Página {page} de {pages}</span>
                <Button variant="outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-16 py-8 border-t text-center text-gray-400 text-sm">
        <p>© {new Date().getFullYear()} {storeInfo.storeName || "Loja Virtual"}</p>
      </footer>
    </div>
  );
}
