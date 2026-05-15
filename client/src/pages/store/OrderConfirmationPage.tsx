import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { CheckCircle, Package, Clock, Copy, ExternalLink } from "lucide-react";
import StoreNavbar from "@/components/store/StoreNavbar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: "Aguardando pagamento", color: "#f59e0b" },
  confirmed: { label: "Confirmado", color: "#10b981" },
  processing: { label: "Em preparo", color: "#3b82f6" },
  shipped: { label: "Enviado", color: "#8b5cf6" },
  delivered: { label: "Entregue", color: "#10b981" },
  cancelled: { label: "Cancelado", color: "#ef4444" },
};

export default function OrderConfirmationPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [storeInfo, setStoreInfo] = useState<any>({});
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/store/settings").then(r => r.json()).then(setStoreInfo).catch(() => {});
    fetch(`/api/orders/${orderNumber}`).then(r => r.json()).then(setOrder).finally(() => setLoading(false));
  }, [orderNumber]);

  const primaryColor = storeInfo.primaryColor || "#5B8C9B";
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copiado!` });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-2" style={{ borderColor: primaryColor, borderTopColor: "transparent" }} /></div>;
  if (!order) return <div className="min-h-screen flex items-center justify-center text-gray-500">Pedido não encontrado</div>;

  const statusInfo = STATUS_LABELS[order.status] || { label: order.status, color: "#6b7280" };

  return (
    <div className="min-h-screen bg-gray-50">
      <StoreNavbar storeName={storeInfo.storeName} primaryColor={primaryColor} />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <CheckCircle size={56} className="mx-auto mb-3" style={{ color: primaryColor }} />
          <h1 className="text-2xl font-bold text-gray-900">Pedido realizado!</h1>
          <p className="text-gray-500 mt-1">Obrigado, {order.customerName.split(" ")[0]}!</p>
          <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-white rounded-full border shadow-sm">
            <Package size={16} className="text-gray-400" />
            <span className="font-mono font-semibold text-gray-800">#{orderNumber}</span>
            <button onClick={() => copyToClipboard(orderNumber, "Número do pedido")} className="text-gray-400 hover:text-gray-600">
              <Copy size={14} />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {/* Status */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Status do pedido</p>
                <p className="font-semibold text-lg" style={{ color: statusInfo.color }}>{statusInfo.label}</p>
              </div>
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: `${statusInfo.color}20` }}>
                <div className="w-3 h-3 rounded-full" style={{ background: statusInfo.color }} />
              </div>
            </div>
          </div>

          {/* PIX */}
          {order.payment?.pixQrCode && (
            <div className="bg-blue-50 rounded-xl p-5 text-center">
              <h3 className="font-semibold text-blue-900 mb-1">Pague com PIX</h3>
              <p className="text-sm text-blue-700 mb-3">Escaneie o QR code ou copie o código PIX</p>
              {order.payment.pixQrCodeBase64 && (
                <img src={`data:image/png;base64,${order.payment.pixQrCodeBase64}`} alt="QR Code PIX"
                  className="mx-auto w-44 h-44 mb-3" />
              )}
              <div className="bg-white rounded-lg p-3 text-xs text-gray-600 break-all font-mono mb-3">
                {order.payment.pixQrCode}
              </div>
              <Button variant="outline" onClick={() => copyToClipboard(order.payment.pixQrCode, "Código PIX")} className="gap-2">
                <Copy size={14} /> Copiar código PIX
              </Button>
              <p className="text-xs text-red-500 mt-2 flex items-center justify-center gap-1">
                <Clock size={12} /> PIX expira em 30 minutos
              </p>
            </div>
          )}

          {/* Boleto */}
          {order.payment?.boletoUrl && (
            <div className="bg-yellow-50 rounded-xl p-5 text-center">
              <h3 className="font-semibold text-yellow-900 mb-2">Boleto Bancário</h3>
              {order.payment.boletoBarcode && (
                <div className="bg-white rounded p-2 font-mono text-xs mb-3 break-all">{order.payment.boletoBarcode}</div>
              )}
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => copyToClipboard(order.payment.boletoBarcode, "Código de barras")} className="gap-2">
                  <Copy size={14} /> Copiar código
                </Button>
                <Button asChild><a href={order.payment.boletoUrl} target="_blank" rel="noopener" className="gap-2 flex items-center">
                  <ExternalLink size={14} /> Visualizar boleto
                </a></Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">Vencimento: 3 dias úteis</p>
            </div>
          )}

          {/* Items */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Itens do pedido</h3>
            <div className="space-y-3">
              {order.items?.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3">
                  {item.imageUrl && <img src={item.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover bg-gray-50" />}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{item.productTitle}</p>
                    <p className="text-xs text-gray-400">× {item.quantity}</p>
                  </div>
                  <p className="text-sm font-semibold">R$ {Number(item.totalPrice).toFixed(2).replace(".", ",")}</p>
                </div>
              ))}
            </div>
            <div className="border-t mt-3 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>R$ {Number(order.subtotal).toFixed(2).replace(".", ",")}</span></div>
              {Number(order.discountAmount) > 0 && <div className="flex justify-between text-green-600"><span>Desconto</span><span>- R$ {Number(order.discountAmount).toFixed(2).replace(".", ",")}</span></div>}
              <div className="flex justify-between text-gray-500"><span>Frete</span><span>{Number(order.shippingAmount) > 0 ? `R$ ${Number(order.shippingAmount).toFixed(2).replace(".", ",")}` : "Grátis"}</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-2" style={{ color: primaryColor }}>
                <span>Total</span><span>R$ {Number(order.total).toFixed(2).replace(".", ",")}</span>
              </div>
            </div>
          </div>

          {/* Delivery address */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h3 className="font-semibold text-gray-800 mb-2">Endereço de entrega</h3>
            <p className="text-sm text-gray-600">
              {order.shippingLogradouro}, {order.shippingNumero}
              {order.shippingComplemento && `, ${order.shippingComplemento}`}<br />
              {order.shippingBairro} — {order.shippingCidade}/{order.shippingEstado}<br />
              CEP: {order.shippingCep}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Link href="/loja">
              <Button variant="outline" className="flex-1">Continuar comprando</Button>
            </Link>
          </div>

          <p className="text-center text-sm text-gray-400">
            Uma confirmação foi enviada para <b>{order.customerEmail}</b>
          </p>
        </div>
      </div>
    </div>
  );
}
