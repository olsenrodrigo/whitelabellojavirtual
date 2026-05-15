import { Link, useLocation } from "wouter";
import { Trash2, Plus, Minus, ShoppingBag, ArrowLeft } from "lucide-react";
import StoreNavbar from "@/components/store/StoreNavbar";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

export default function CartPage() {
  const { cart, updateItem, clearCart, total, itemCount } = useCart();
  const [, navigate] = useLocation();
  const [storeInfo, setStoreInfo] = useState<any>({});

  useEffect(() => {
    fetch("/api/store/settings").then(r => r.json()).then(setStoreInfo).catch(() => {});
  }, []);

  const primaryColor = storeInfo.primaryColor || "#5B8C9B";

  if (!cart || cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <StoreNavbar storeName={storeInfo.storeName} primaryColor={primaryColor} />
        <div className="container mx-auto px-4 py-20 text-center">
          <ShoppingBag size={64} className="mx-auto text-gray-300 mb-4" />
          <h2 className="text-xl font-semibold text-gray-600 mb-2">Seu carrinho está vazio</h2>
          <p className="text-gray-400 mb-6">Adicione produtos para continuar comprando</p>
          <Link href="/loja"><Button style={{ background: primaryColor }}>Ver produtos</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <StoreNavbar storeName={storeInfo.storeName} primaryColor={primaryColor} />
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/loja"><a className="text-gray-500 hover:text-gray-700 no-underline flex items-center gap-1 text-sm"><ArrowLeft size={16} /> Continuar comprando</a></Link>
          <h1 className="text-xl font-bold text-gray-800">Carrinho ({itemCount} {itemCount === 1 ? "item" : "itens"})</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items */}
          <div className="lg:col-span-2 space-y-3">
            {cart.items.map(item => (
              <div key={item.id} className="bg-white rounded-xl p-4 flex gap-3 shadow-sm">
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                  {item.mainImage ? (
                    <img src={item.mainImage} alt={item.productTitle} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-100" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/loja/produto/${item.productSlug}`}>
                    <a className="font-medium text-gray-800 text-sm line-clamp-2 hover:underline no-underline">{item.productTitle}</a>
                  </Link>
                  <p className="text-sm font-bold mt-1" style={{ color: primaryColor }}>
                    R$ {Number(item.unitPrice).toFixed(2).replace(".", ",")}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex items-center border rounded-lg overflow-hidden">
                      <button onClick={() => updateItem(item.id, item.quantity - 1)} className="px-2 py-1 text-gray-500 hover:bg-gray-50">
                        <Minus size={12} />
                      </button>
                      <span className="px-3 text-sm">{item.quantity}</span>
                      <button onClick={() => updateItem(item.id, item.quantity + 1)} className="px-2 py-1 text-gray-500 hover:bg-gray-50">
                        <Plus size={12} />
                      </button>
                    </div>
                    <button onClick={() => updateItem(item.id, 0)} className="text-red-400 hover:text-red-600 p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-800">
                    R$ {(Number(item.unitPrice) * item.quantity).toFixed(2).replace(".", ",")}
                  </p>
                </div>
              </div>
            ))}

            <button onClick={() => clearCart()} className="text-sm text-red-400 hover:text-red-600 flex items-center gap-1 mt-2">
              <Trash2 size={14} /> Limpar carrinho
            </button>
          </div>

          {/* Summary */}
          <div className="bg-white rounded-xl p-5 shadow-sm h-fit sticky top-20">
            <h3 className="font-semibold text-gray-800 mb-4">Resumo do Pedido</h3>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal ({itemCount} {itemCount === 1 ? "item" : "itens"})</span>
                <span>R$ {total.toFixed(2).replace(".", ",")}</span>
              </div>
              <div className="flex justify-between text-gray-400 text-xs">
                <span>Frete</span>
                <span>Calculado no checkout</span>
              </div>
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-3 mb-4">
              <span>Total</span>
              <span style={{ color: primaryColor }}>R$ {total.toFixed(2).replace(".", ",")}</span>
            </div>
            <Button
              className="w-full py-3 text-white font-semibold"
              style={{ background: primaryColor }}
              onClick={() => navigate("/loja/checkout")}
            >
              Ir para o checkout
            </Button>
            <p className="text-xs text-gray-400 text-center mt-3 flex items-center justify-center gap-1">
              🔒 Pagamento 100% seguro
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
