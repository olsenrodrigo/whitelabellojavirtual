import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { ChevronRight, Check, CreditCard, Smartphone, FileText } from "lucide-react";
import StoreNavbar from "@/components/store/StoreNavbar";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Step = 1 | 2 | 3 | 4;

interface Address {
  recipient: string; cep: string; logradouro: string; numero: string;
  complemento: string; bairro: string; cidade: string; estado: string;
}

const ESTADOS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

export default function CheckoutPage() {
  const [step, setStep] = useState<Step>(1);
  const [, navigate] = useLocation();
  const { cart, sessionId, total, itemCount } = useCart();
  const { toast } = useToast();
  const [storeInfo, setStoreInfo] = useState<any>({});
  const [loading, setLoading] = useState(false);

  // Form state
  const [identity, setIdentity] = useState({ name: "", email: "", phone: "", cpf: "" });
  const [address, setAddress] = useState<Address>({ recipient: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "SP" });
  const [loadingCep, setLoadingCep] = useState(false);
  const [shipping, setShipping] = useState({ carrier: "Correios", service: "PAC", amount: 0 });
  const [shipOptions, setShipOptions] = useState<any[] | null>(null);
  const [shipLoading, setShipLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "boleto" | "credit_card">("pix");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponLoading, setCouponLoading] = useState(false);

  useEffect(() => {
    fetch("/api/store/settings").then(r => r.json()).then(setStoreInfo).catch(() => {});
  }, []);

  useEffect(() => {
    if (!cart || cart.items.length === 0) navigate("/loja/carrinho");
  }, [cart]);

  const primaryColor = storeInfo.primaryColor || "#5B8C9B";

  const lookupCep = async (cep: string) => {
    const cleaned = cep.replace(/\D/g, "");
    if (cleaned.length !== 8) return;
    setLoadingCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
      const d = await r.json();
      if (!d.erro) {
        setAddress(a => ({
          ...a, cep: cleaned,
          logradouro: d.logradouro, bairro: d.bairro,
          cidade: d.localidade, estado: d.uf,
        }));
      }
    } finally { setLoadingCep(false); }
  };

  const loadShipping = async () => {
    const cleaned = address.cep.replace(/\D/g, "");
    if (cleaned.length !== 8 || !cart?.items?.length) return;
    setShipLoading(true);
    setShipOptions(null);
    try {
      const r = await fetch("/api/shipping/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zipTo: cleaned,
          subtotal: total,
          items: cart.items.map((i: any) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        }),
      });
      const d = await r.json();
      if (r.ok && Array.isArray(d.options)) {
        setShipOptions(d.options);
        const o = d.options[0];
        if (o) setShipping({ carrier: o.base || "SmartEnvios", service: o.service, amount: o.free ? 0 : o.finalValue });
      } else {
        setShipOptions([]);
        toast({ title: "Não foi possível calcular o frete", description: d.error, variant: "destructive" });
      }
    } catch {
      setShipOptions([]);
    } finally {
      setShipLoading(false);
    }
  };

  const applyCoupon = async () => {
    if (!couponCode) return;
    setCouponLoading(true);
    try {
      const r = await fetch("/api/store/coupon/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode, orderValue: total }),
      });
      const d = await r.json();
      if (r.ok) {
        setCouponDiscount(d.discount);
        toast({ title: "Cupom aplicado!", description: `Desconto: R$ ${d.discount.toFixed(2)}` });
      } else {
        toast({ title: "Cupom inválido", description: d.message, variant: "destructive" });
      }
    } finally { setCouponLoading(false); }
  };

  const handlePlaceOrder = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: identity.name, customerEmail: identity.email,
          customerPhone: identity.phone.replace(/\D/g, ""),
          customerCpf: identity.cpf.replace(/\D/g, ""),
          shippingRecipient: address.recipient || identity.name,
          shippingCep: address.cep, shippingLogradouro: address.logradouro,
          shippingNumero: address.numero, shippingComplemento: address.complemento,
          shippingBairro: address.bairro, shippingCidade: address.cidade, shippingEstado: address.estado,
          shippingCarrier: shipping.carrier, shippingService: shipping.service,
          shippingAmount: shipping.amount,
          paymentMethod, couponCode: couponCode || undefined,
          sessionId,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "Erro ao finalizar pedido");
      navigate(`/loja/pedido/${d.orderNumber}`);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const orderTotal = total - couponDiscount + shipping.amount;
  const pixTotal = orderTotal * 0.95;

  const steps = [
    { n: 1, label: "Identificação" },
    { n: 2, label: "Endereço" },
    { n: 3, label: "Envio" },
    { n: 4, label: "Pagamento" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <StoreNavbar storeName={storeInfo.storeName} primaryColor={primaryColor} />
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Progress */}
        <div className="flex items-center justify-center mb-8 gap-1">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step > s.n ? "text-white" : step === s.n ? "text-white" : "bg-gray-100 text-gray-400"}`}
                  style={step >= s.n ? { background: primaryColor } : {}}>
                  {step > s.n ? <Check size={14} /> : s.n}
                </div>
                <span className={`text-xs mt-1 hidden sm:block ${step >= s.n ? "text-gray-800 font-medium" : "text-gray-400"}`}>{s.label}</span>
              </div>
              {i < steps.length - 1 && <div className={`h-0.5 w-8 mx-1 mb-4 sm:mb-0 transition-colors`} style={{ background: step > s.n ? primaryColor : "#e5e7eb" }} />}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm p-6">

              {/* Step 1: Identity */}
              {step === 1 && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">Suas informações</h2>
                  <div className="space-y-4">
                    <div>
                      <Label>Nome completo *</Label>
                      <Input value={identity.name} onChange={e => setIdentity(i => ({...i, name: e.target.value}))} placeholder="João da Silva" className="mt-1" />
                    </div>
                    <div>
                      <Label>E-mail *</Label>
                      <Input type="email" value={identity.email} onChange={e => setIdentity(i => ({...i, email: e.target.value}))} placeholder="joao@email.com" className="mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Telefone / WhatsApp *</Label>
                        <Input value={identity.phone} onChange={e => setIdentity(i => ({...i, phone: e.target.value}))} placeholder="(11) 99999-0000" className="mt-1" />
                      </div>
                      <div>
                        <Label>CPF *</Label>
                        <Input value={identity.cpf} onChange={e => setIdentity(i => ({...i, cpf: e.target.value}))} placeholder="000.000.000-00" className="mt-1" />
                      </div>
                    </div>
                    <Button
                      className="w-full py-3 text-white"
                      style={{ background: primaryColor }}
                      onClick={() => {
                        if (!identity.name || !identity.email || !identity.phone || !identity.cpf) {
                          toast({ title: "Preencha todos os campos", variant: "destructive" }); return;
                        }
                        setStep(2);
                      }}
                    >
                      Continuar <ChevronRight size={16} className="ml-1" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 2: Address */}
              {step === 2 && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">Endereço de entrega</h2>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>CEP *</Label>
                        <Input
                          value={address.cep}
                          onChange={e => { setAddress(a => ({...a, cep: e.target.value})); }}
                          onBlur={e => lookupCep(e.target.value)}
                          placeholder="00000-000"
                          className="mt-1"
                          maxLength={9}
                        />
                        {loadingCep && <p className="text-xs text-gray-400 mt-1">Buscando CEP...</p>}
                      </div>
                    </div>
                    <div>
                      <Label>Logradouro *</Label>
                      <Input value={address.logradouro} onChange={e => setAddress(a => ({...a, logradouro: e.target.value}))} className="mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Número *</Label>
                        <Input value={address.numero} onChange={e => setAddress(a => ({...a, numero: e.target.value}))} className="mt-1" />
                      </div>
                      <div>
                        <Label>Complemento</Label>
                        <Input value={address.complemento} onChange={e => setAddress(a => ({...a, complemento: e.target.value}))} placeholder="Apto, sala..." className="mt-1" />
                      </div>
                    </div>
                    <div>
                      <Label>Bairro *</Label>
                      <Input value={address.bairro} onChange={e => setAddress(a => ({...a, bairro: e.target.value}))} className="mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Cidade *</Label>
                        <Input value={address.cidade} onChange={e => setAddress(a => ({...a, cidade: e.target.value}))} className="mt-1" />
                      </div>
                      <div>
                        <Label>Estado *</Label>
                        <select value={address.estado} onChange={e => setAddress(a => ({...a, estado: e.target.value}))}
                          className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {ESTADOS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Voltar</Button>
                      <Button
                        className="flex-1 py-3 text-white"
                        style={{ background: primaryColor }}
                        onClick={() => {
                          if (!address.cep || !address.logradouro || !address.numero) {
                            toast({ title: "Preencha o endereço completo", variant: "destructive" }); return;
                          }
                          setStep(3);
                          loadShipping();
                        }}
                      >
                        Continuar <ChevronRight size={16} className="ml-1" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Shipping */}
              {step === 3 && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">Forma de envio</h2>
                  <div className="space-y-3">
                    {shipLoading && (
                      <p className="text-sm text-gray-400">Calculando frete...</p>
                    )}
                    {shipOptions && shipOptions.length === 0 && !shipLoading && (
                      <p className="text-sm text-gray-400">Nenhuma opção de frete para este CEP.</p>
                    )}
                    {(shipOptions || []).map(opt => {
                      const selected = shipping.service === opt.service;
                      const price = opt.free ? 0 : opt.finalValue;
                      return (
                        <label key={opt.id + opt.service} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selected ? "border-2" : "border-gray-200 hover:border-gray-300"}`}
                          style={selected ? { borderColor: primaryColor, background: `${primaryColor}10` } : {}}>
                          <input type="radio" name="shipping"
                            checked={selected}
                            onChange={() => setShipping({ carrier: opt.base || "SmartEnvios", service: opt.service, amount: price })}
                            className="accent-blue-600"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-800">{opt.service}</p>
                            <p className="text-xs text-gray-400">{opt.days} dias úteis</p>
                          </div>
                          <span className="font-semibold text-gray-800">
                            {opt.free ? "Grátis" : `R$ ${price.toFixed(2).replace(".", ",")}`}
                          </span>
                        </label>
                      );
                    })}
                    <div className="flex gap-3 pt-2">
                      <Button variant="outline" onClick={() => setStep(2)} className="flex-1">Voltar</Button>
                      <Button className="flex-1 py-3 text-white" style={{ background: primaryColor }} onClick={() => setStep(4)}>
                        Continuar <ChevronRight size={16} className="ml-1" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Payment */}
              {step === 4 && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">Forma de pagamento</h2>
                  <div className="space-y-3 mb-4">
                    {[
                      { method: "pix" as const, icon: <Smartphone size={18} />, label: "PIX", desc: `R$ ${pixTotal.toFixed(2).replace(".", ",")} — 5% de desconto`, badge: "Aprovação instantânea" },
                      { method: "boleto" as const, icon: <FileText size={18} />, label: "Boleto Bancário", desc: `R$ ${orderTotal.toFixed(2).replace(".", ",")} — vence em 3 dias`, badge: null },
                      { method: "credit_card" as const, icon: <CreditCard size={18} />, label: "Cartão de Crédito", desc: `Até 12x`, badge: null },
                    ].map(opt => (
                      <label key={opt.method} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${paymentMethod === opt.method ? "border-2" : "border-gray-200 hover:border-gray-300"}`}
                        style={paymentMethod === opt.method ? { borderColor: primaryColor, background: `${primaryColor}10` } : {}}>
                        <input type="radio" name="payment" value={opt.method} checked={paymentMethod === opt.method}
                          onChange={() => setPaymentMethod(opt.method)} className="accent-blue-600" />
                        <span className="text-gray-500">{opt.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                            {opt.badge && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{opt.badge}</span>}
                          </div>
                          <p className="text-xs text-gray-400">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Coupon */}
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-700 mb-2">Cupom de desconto</p>
                    <div className="flex gap-2">
                      <Input value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} placeholder="CUPOM10" className="flex-1" />
                      <Button variant="outline" onClick={applyCoupon} disabled={couponLoading}>Aplicar</Button>
                    </div>
                    {couponDiscount > 0 && <p className="text-sm text-green-600 mt-1">✓ Desconto de R$ {couponDiscount.toFixed(2)} aplicado!</p>}
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setStep(3)} className="flex-1">Voltar</Button>
                    <Button
                      className="flex-1 py-3 text-white font-semibold"
                      style={{ background: primaryColor }}
                      onClick={handlePlaceOrder}
                      disabled={loading}
                    >
                      {loading ? "Processando..." : `Finalizar — R$ ${(paymentMethod === "pix" ? pixTotal : orderTotal).toFixed(2).replace(".", ",")}`}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Order summary */}
          <div className="bg-white rounded-xl shadow-sm p-5 h-fit sticky top-20">
            <h3 className="font-semibold text-gray-800 mb-3 text-sm">Resumo</h3>
            <div className="space-y-2 text-sm">
              {cart?.items.map(item => (
                <div key={item.id} className="flex gap-2">
                  <div className="w-10 h-10 bg-gray-100 rounded flex-shrink-0 overflow-hidden">
                    {item.mainImage && <img src={item.mainImage} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 text-xs">
                    <p className="line-clamp-1 text-gray-700">{item.productTitle}</p>
                    <p className="text-gray-400">× {item.quantity}</p>
                  </div>
                  <p className="text-xs font-medium">R$ {(Number(item.unitPrice) * item.quantity).toFixed(2).replace(".", ",")}</p>
                </div>
              ))}
              <div className="border-t pt-2 space-y-1">
                <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>R$ {total.toFixed(2).replace(".", ",")}</span></div>
                {couponDiscount > 0 && <div className="flex justify-between text-green-600"><span>Desconto</span><span>- R$ {couponDiscount.toFixed(2).replace(".", ",")}</span></div>}
                <div className="flex justify-between text-gray-500"><span>Frete</span><span>{shipping.amount > 0 ? `R$ ${shipping.amount.toFixed(2).replace(".", ",")}` : "-"}</span></div>
                {paymentMethod === "pix" && <div className="flex justify-between text-green-600 text-xs"><span>Desconto PIX (5%)</span><span>- R$ {(orderTotal * 0.05).toFixed(2).replace(".", ",")}</span></div>}
              </div>
              <div className="flex justify-between font-bold text-base border-t pt-2" style={{ color: primaryColor }}>
                <span>Total</span>
                <span>R$ {(paymentMethod === "pix" ? pixTotal : orderTotal).toFixed(2).replace(".", ",")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
