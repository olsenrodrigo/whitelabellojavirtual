import express from "express";
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import * as XLSX from "xlsx";
import { storage } from "./storage";
import { insertContactMessageSchema, checkoutSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { sendContactEmail } from "./email";
import { hashPassword, comparePassword, signToken, requireAdmin, requireRole, checkRateLimit, recordFailedAttempt, resetAttempts, storeOtp, verifyOtp, signOtpToken, verifyOtpToken } from "./auth";
import { createPayment, getPaymentStatus, generateOrderNumber } from "./payment";
import { asaasGateway } from "./gateway/asaas";
import { loadConfig as loadAsaasConfig, isValidWebhookToken, parseWebhookEvent } from "./asaas";
import { sendOrderConfirmationEmail, sendShippingEmail } from "./notify";
import { registerShippingRoutes, createLabelForOrder } from "./smartenvios-integration";

/** Gateway de pagamento ativo (env PAYMENT_GATEWAY; default mercadopago). */
function activePaymentGateway(): string {
  return (process.env.PAYMENT_GATEWAY || "mercadopago").toLowerCase();
}

// ─── Multer config ───────────────────────────────────────────────────────────
const uploadsDir = path.join(process.cwd(), "uploads");
const productsDir = path.join(uploadsDir, "products");
[uploadsDir, productsDir, path.join(uploadsDir, "imports")].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, productsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

const csvStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(uploadsDir, "imports")),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const uploadCsv = multer({ storage: csvStorage, limits: { fileSize: 50 * 1024 * 1024 } });

// ─── Helpers ──────────────────────────────────────────────────────────────────
function slugify(text: string): string {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

function getSmtpConfig() {
  return {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  };
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Seed: cria um admin padrão no primeiro boot (se ainda não existir nenhum).
  // Personalize com ADMIN_EMAIL / ADMIN_PASSWORD no .env.
  (async () => {
    try {
      const admins = await storage.listAdminUsers();
      if (admins.length === 0) {
        const email = process.env.ADMIN_EMAIL || "admin@puraflora.com.br";
        const password = process.env.ADMIN_PASSWORD || "PuraFlora@2026";
        await storage.createAdminUser({
          name: "Administrador",
          email,
          passwordHash: hashPassword(password),
          role: "admin",
          active: true,
          mustChangePassword: false,
        });
        console.log(`[seed] admin padrão criado: ${email}`);
      }
    } catch (e) {
      console.warn("[seed] admin não criado (banco pode não estar pronto):", (e as Error).message);
    }
  })();

  // Serve uploaded files
  app.use("/uploads", (req, res, next) => {
    res.setHeader("Cache-Control", "public, max-age=86400");
    next();
  }, express.static(uploadsDir));

  // ──────────────────────────────────────────────────────────────────────────
  // PUBLIC ROUTES
  // ──────────────────────────────────────────────────────────────────────────

  // Contact form (original)
  app.post("/api/contact", async (req, res) => {
    const result = insertContactMessageSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ message: fromError(result.error).toString() });
    }
    const message = await storage.createContactMessage(result.data);
    try { await sendContactEmail(result.data); } catch (err) { console.error(err); }
    return res.status(201).json({ success: true, id: message.id });
  });

  // Store settings (public)
  app.get("/api/store/settings", async (_req, res) => {
    const s = await storage.getStoreSettings();
    // never expose secrets to public
    if (s) {
      const { mercadoPagoToken, smtpPass, whatsappToken, ...safe } = s as any;
      return res.json(safe);
    }
    return res.json({ storeName: "Loja Virtual", primaryColor: "#5B8C9B" });
  });

  // Categories (public)
  app.get("/api/store/categories", async (_req, res) => {
    const cats = await storage.listCategories(true);
    return res.json(cats);
  });

  // Featured products (public)
  app.get("/api/store/featured", async (_req, res) => {
    const { products: prods } = await storage.listProducts({ status: "active", published: true, featured: true, limit: 8, offset: 0 });
    const enriched = await Promise.all(prods.map(async p => {
      const imgs = await storage.getProductImages(p.id);
      return { ...p, mainImage: imgs.find(i => i.isMain)?.url || imgs[0]?.url || null };
    }));
    return res.json(enriched);
  });

  // Products (public)
  app.get("/api/store/products", async (req, res) => {
    const { category, search, limit = "24", page = "1", featured } = req.query as any;
    const lim = Math.min(Number(limit), 100);
    const off = (Number(page) - 1) * lim;
    const { products: prods, total } = await storage.listProducts({
      categoryId: category ? Number(category) : undefined,
      status: "active", published: true,
      featured: featured === "true" ? true : undefined,
      search: search || undefined, limit: lim, offset: off,
    });
    // attach main image
    const enriched = await Promise.all(prods.map(async p => {
      const imgs = await storage.getProductImages(p.id);
      return { ...p, mainImage: imgs.find(i => i.isMain)?.url || imgs[0]?.url || null };
    }));
    return res.json({ products: enriched, total, page: Number(page), pages: Math.ceil(total / lim) });
  });

  app.get("/api/store/products/:slug", async (req, res) => {
    const product = await storage.getProductBySlug(req.params.slug);
    if (!product) return res.status(404).json({ message: "Produto não encontrado" });
    const [images, variantList] = await Promise.all([
      storage.getProductImages(product.id),
      storage.getVariantsByProduct(product.id),
    ]);
    return res.json({ ...product, images, variants: variantList });
  });

  // Cart
  app.get("/api/cart/:sessionId", async (req, res) => {
    const cart = await storage.getOrCreateCart(req.params.sessionId);
    return res.json(cart);
  });

  app.post("/api/cart/:sessionId/add", async (req, res) => {
    const { productId, variantId, quantity } = req.body;
    const product = await storage.getProductById(Number(productId));
    if (!product) return res.status(404).json({ message: "Produto não encontrado" });
    const price = variantId
      ? (await storage.getVariantsByProduct(product.id)).find(v => v.id === variantId)?.price || product.price
      : product.price;
    await storage.addToCart(req.params.sessionId, Number(productId), variantId || null, Number(quantity) || 1, String(price));
    const cart = await storage.getOrCreateCart(req.params.sessionId);
    return res.json(cart);
  });

  app.put("/api/cart/item/:itemId", async (req, res) => {
    await storage.updateCartItem(Number(req.params.itemId), Number(req.body.quantity));
    return res.json({ success: true });
  });

  app.delete("/api/cart/:sessionId", async (req, res) => {
    await storage.clearCart(req.params.sessionId);
    return res.json({ success: true });
  });

  // Coupon validation
  app.post("/api/store/coupon/validate", async (req, res) => {
    const { code, orderValue } = req.body;
    const coupon = await storage.getCouponByCode(code);
    if (!coupon || !coupon.active) return res.status(404).json({ message: "Cupom inválido" });
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date())
      return res.status(400).json({ message: "Cupom expirado" });
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses)
      return res.status(400).json({ message: "Cupom esgotado" });
    if (coupon.minOrderValue && Number(orderValue) < Number(coupon.minOrderValue))
      return res.status(400).json({ message: `Pedido mínimo: R$ ${Number(coupon.minOrderValue).toFixed(2)}` });

    let discount = 0;
    if (coupon.type === "percentage") discount = Number(orderValue) * Number(coupon.value) / 100;
    else if (coupon.type === "fixed") discount = Number(coupon.value);
    return res.json({ valid: true, discount: Math.min(discount, Number(orderValue)), coupon });
  });

  // Checkout
  app.post("/api/checkout", async (req, res) => {
    const result = checkoutSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ message: fromError(result.error).toString() });
    }
    const data = result.data;

    // Get cart
    const cart = await storage.getOrCreateCart(data.sessionId);
    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({ message: "Carrinho vazio" });
    }

    // Calculate totals
    let subtotal = cart.items.reduce((sum: number, i: any) =>
      sum + Number(i.unitPrice) * i.quantity, 0);
    let discountAmount = 0;

    if (data.couponCode) {
      const coupon = await storage.getCouponByCode(data.couponCode);
      if (coupon && coupon.active) {
        if (coupon.type === "percentage") discountAmount = subtotal * Number(coupon.value) / 100;
        else if (coupon.type === "fixed") discountAmount = Number(coupon.value);
        await storage.incrementCouponUsage(coupon.id);
      }
    }

    const shippingAmount = data.shippingAmount || 0;
    const total = subtotal - discountAmount + shippingAmount;

    // Create order
    const orderNumber = generateOrderNumber();
    const order = await storage.createOrder({
      orderNumber,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      customerCpf: data.customerCpf,
      shippingRecipient: data.shippingRecipient,
      shippingCep: data.shippingCep,
      shippingLogradouro: data.shippingLogradouro,
      shippingNumero: data.shippingNumero,
      shippingComplemento: data.shippingComplemento,
      shippingBairro: data.shippingBairro,
      shippingCidade: data.shippingCidade,
      shippingEstado: data.shippingEstado,
      subtotal: String(subtotal),
      discountAmount: String(discountAmount),
      shippingAmount: String(shippingAmount),
      total: String(total),
      paymentMethod: data.paymentMethod,
      couponCode: data.couponCode,
      shippingCarrier: data.shippingCarrier,
      shippingService: data.shippingService,
      status: "pending_payment",
      paymentStatus: "pending",
    });

    // Create order items + decrement stock
    const orderItemsData = cart.items.map((i: any) => ({
      orderId: order.id,
      productId: i.productId,
      variantId: i.variantId,
      productTitle: i.productTitle,
      quantity: i.quantity,
      unitPrice: String(i.unitPrice),
      totalPrice: String(Number(i.unitPrice) * i.quantity),
      imageUrl: i.mainImage,
    }));
    await storage.createOrderItems(orderItemsData);

    // Decrement stock
    for (const item of cart.items) {
      await storage.decrementStock(item.productId, item.quantity);
    }

    // Process payment — gateway ativo por env PAYMENT_GATEWAY (default mercadopago).
    const settings = await storage.getStoreSettings();
    const gatewayId = activePaymentGateway();

    let paymentResult: any = { success: true };
    if (gatewayId === "asaas") {
      paymentResult = await asaasGateway.createPayment({
        amount: total,
        orderId: order.id,
        orderNumber,
        customerEmail: data.customerEmail,
        customerName: data.customerName,
        customerCpf: data.customerCpf,
        method: data.paymentMethod as any,
        description: `Pedido ${orderNumber}`,
        customerPhone: data.customerPhone,
        customerCep: data.shippingCep,
        customerAddressNumber: data.shippingNumero,
        installments: data.cardInstallments,
      }, {});
    } else {
      const mpToken = settings?.mercadoPagoToken || process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (mpToken) {
        paymentResult = await createPayment({
          amount: total,
          orderId: order.id,
          orderNumber,
          customerEmail: data.customerEmail,
          customerName: data.customerName,
          customerCpf: data.customerCpf,
          method: data.paymentMethod as any,
          description: `Pedido ${orderNumber}`,
          cardToken: data.cardToken,
          installments: data.cardInstallments,
        }, mpToken);
      }
    }

    if (!paymentResult.success) {
      console.error(`[checkout] falha no pagamento (${gatewayId}):`, paymentResult.error);
    }

    if (paymentResult.success && paymentResult.transactionId) {
      await storage.createPaymentTransaction({
        orderId: order.id,
        gateway: gatewayId,
        gatewayTransactionId: paymentResult.transactionId,
        method: data.paymentMethod,
        status: paymentResult.status || "pending",
        amount: String(total),
        currency: "BRL",
        pixQrCode: paymentResult.pixQrCode,
        pixQrCodeBase64: paymentResult.pixQrCodeBase64,
        pixExpiration: paymentResult.pixExpiration,
        boletoUrl: paymentResult.boletoUrl,
        boletoBarcode: paymentResult.boletoBarcode,
      });

      if (data.paymentMethod === "credit_card" && paymentResult.status === "approved") {
        await storage.updateOrderStatus(order.id, "confirmed", "Pagamento aprovado automaticamente");
        await storage.updateOrderPayment(order.id, "approved", paymentResult.transactionId);
      }
    }

    // Clear cart
    await storage.clearCart(data.sessionId);

    // Send confirmation email
    const smtp = getSmtpConfig();
    if (smtp.user && smtp.pass) {
      sendOrderConfirmationEmail({
        orderNumber,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        items: orderItemsData.map((i: any) => ({
          title: i.productTitle, quantity: i.quantity, unitPrice: Number(i.unitPrice)
        })),
        subtotal, discountAmount, shippingAmount, total,
        paymentMethod: data.paymentMethod,
        pixQrCode: paymentResult.pixQrCodeBase64,
        boletoUrl: paymentResult.boletoUrl,
        boletoBarcode: paymentResult.boletoBarcode,
        storeName: settings?.storeName,
        storeEmail: settings?.contactEmail ?? undefined,
      }, smtp).catch(err => console.error("Email error:", err));
    }

    return res.status(201).json({
      success: true,
      orderNumber,
      orderId: order.id,
      total,
      paymentMethod: data.paymentMethod,
      pixQrCode: paymentResult.pixQrCode,
      pixQrCodeBase64: paymentResult.pixQrCodeBase64,
      boletoUrl: paymentResult.boletoUrl,
      boletoBarcode: paymentResult.boletoBarcode,
    });
  });

  // Rotas de frete/etiqueta (SmartEnvios)
  registerShippingRoutes(app);

  // Payment webhook (MercadoPago)
  app.post("/api/webhooks/mercadopago", async (req, res) => {
    const { action, data: wData } = req.body;
    if (action === "payment.updated" && wData?.id) {
      const settings = await storage.getStoreSettings();
      const mpToken = settings?.mercadoPagoToken || process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (mpToken) {
        const status = await getPaymentStatus(String(wData.id), mpToken);
        const tx = await storage.updatePaymentStatus(String(wData.id), status);
        if (tx && status === "approved") {
          const order = await storage.getOrderById(tx.orderId);
          if (order && order.paymentStatus !== "approved") {
            await storage.updateOrderStatus(tx.orderId, "confirmed", "Pagamento confirmado via webhook");
            await storage.updateOrderPayment(tx.orderId, "approved", String(wData.id));
            // Gera a etiqueta automaticamente (não bloqueia o webhook em caso de erro).
            if (process.env.SMARTENVIOS_AUTO_LABEL === "1" && !order.trackingCode) {
              createLabelForOrder(tx.orderId).catch((e) =>
                console.error("[smartenvios] falha ao gerar etiqueta no webhook:", e?.message)
              );
            }
          }
        }
      }
    }
    return res.status(200).json({ received: true });
  });

  // Payment webhook (Asaas)
  app.post("/api/webhooks/asaas", async (req, res) => {
    const cfg = loadAsaasConfig(process.env);
    const token = req.headers["asaas-access-token"];
    if (!isValidWebhookToken(cfg, typeof token === "string" ? token : undefined)) {
      return res.status(401).json({ error: "Token inválido" });
    }
    const event = parseWebhookEvent(req.body);
    // Responde rápido: a fila do Asaas interrompe após falhas consecutivas.
    res.status(200).json({ received: true });
    const paymentId = event?.payment?.id;
    if (!paymentId) return;
    try {
      const status = await asaasGateway.getPaymentStatus(paymentId, {});
      const tx = await storage.updatePaymentStatus(paymentId, status);
      if (tx && status === "approved") {
        const order = await storage.getOrderById(tx.orderId);
        if (order && order.paymentStatus !== "approved") {
          await storage.updateOrderStatus(tx.orderId, "confirmed", "Pagamento confirmado via webhook (Asaas)");
          await storage.updateOrderPayment(tx.orderId, "approved", paymentId);
          if (process.env.SMARTENVIOS_AUTO_LABEL === "1" && !order.trackingCode) {
            createLabelForOrder(tx.orderId).catch((e) =>
              console.error("[smartenvios] falha ao gerar etiqueta no webhook (Asaas):", e?.message)
            );
          }
        }
      }
    } catch (e: any) {
      console.error("[asaas webhook] erro ao processar:", e?.message);
    }
  });

  // Order status (customer)
  app.get("/api/orders/:orderNumber", async (req, res) => {
    const order = await storage.getOrderByNumber(req.params.orderNumber);
    if (!order) return res.status(404).json({ message: "Pedido não encontrado" });
    const [items, history, payment] = await Promise.all([
      storage.getOrderItems(order.id),
      storage.getOrderHistory(order.id),
      storage.getPaymentByOrderId(order.id),
    ]);
    return res.json({ ...order, items, history, payment });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ADMIN ROUTES (require auth)
  // ──────────────────────────────────────────────────────────────────────────

  // Admin login
  app.post("/api/admin/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Dados incompletos" });

    const identifier = `login:${email.toLowerCase()}`;
    const rateCheck = checkRateLimit(identifier);
    if (rateCheck.blocked) {
      return res.status(429).json({
        message: `Muitas tentativas. Tente novamente em ${rateCheck.minutesLeft} minuto(s).`
      });
    }

    const admin = await storage.getAdminByEmail(email);
    if (!admin || !admin.active || !comparePassword(password, admin.passwordHash)) {
      recordFailedAttempt(identifier);
      return res.status(401).json({ message: "Credenciais inválidas" });
    }
    resetAttempts(identifier);

    // Check if SMTP is configured for MFA
    const settings = await storage.getStoreSettings();
    const smtpConfigured = !!(settings?.smtpHost && settings?.smtpUser && settings?.smtpPass);

    if (smtpConfigured) {
      // Send OTP
      const code = storeOtp(admin.email);
      const otpToken = signOtpToken(admin.email);

      const smtp = {
        host: settings?.smtpHost || process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(settings?.smtpPort || process.env.SMTP_PORT) || 587,
        user: settings?.smtpUser || process.env.SMTP_USER || "",
        pass: settings?.smtpPass || process.env.SMTP_PASS || "",
      };

      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({
          host: smtp.host, port: smtp.port, secure: false,
          auth: { user: smtp.user, pass: smtp.pass },
        });
        await transporter.sendMail({
          from: `"${settings?.storeName || "Admin"}" <${smtp.user}>`,
          to: admin.email,
          subject: "Código de verificação — Painel Admin",
          html: `
            <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px">
              <h2 style="color:#1f2937">Código de verificação</h2>
              <p style="color:#6b7280">Olá, ${admin.name}. Use o código abaixo para acessar o painel:</p>
              <div style="background:#f3f4f6;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
                <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1f2937">${code}</span>
              </div>
              <p style="color:#9ca3af;font-size:13px">Válido por 5 minutos. Não compartilhe este código.</p>
            </div>`,
        });
      } catch (err) {
        console.error("Falha ao enviar OTP:", err);
        // Fall through — send token without MFA if email fails
        const token = signToken({ id: admin.id, email: admin.email, role: admin.role });
        return res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role, mustChangePassword: admin.mustChangePassword } });
      }

      return res.json({ requireOtp: true, otpToken, adminName: admin.name });
    }

    // No SMTP — login directly
    const token = signToken({ id: admin.id, email: admin.email, role: admin.role });
    return res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role, mustChangePassword: admin.mustChangePassword } });
  });

  // Verify OTP (MFA second factor)
  app.post("/api/admin/verify-otp", async (req, res) => {
    const { otpToken, code } = req.body;
    if (!otpToken || !code) return res.status(400).json({ message: "Dados incompletos" });

    const payload = verifyOtpToken(otpToken);
    if (!payload) return res.status(401).json({ message: "Sessão expirada. Faça login novamente." });

    if (!verifyOtp(payload.email, code.trim())) {
      return res.status(401).json({ message: "Código inválido ou expirado." });
    }

    const admin = await storage.getAdminByEmail(payload.email);
    if (!admin || !admin.active) return res.status(401).json({ message: "Usuário inativo" });

    const token = signToken({ id: admin.id, email: admin.email, role: admin.role });
    return res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role, mustChangePassword: admin.mustChangePassword } });
  });

  // Change password (requires auth — used for mustChangePassword flow AND voluntary change)
  app.post("/api/admin/change-password", requireAdmin, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "Dados incompletos" });
    if (newPassword.length < 8) return res.status(400).json({ message: "Senha deve ter pelo menos 8 caracteres" });

    const adminPayload = (req as any).admin;
    const admin = await storage.getAdminById(adminPayload.id);
    if (!admin) return res.status(404).json({ message: "Usuário não encontrado" });

    if (!comparePassword(currentPassword, admin.passwordHash)) {
      return res.status(401).json({ message: "Senha atual incorreta" });
    }

    await storage.updateAdminUser(admin.id, {
      passwordHash: hashPassword(newPassword),
      mustChangePassword: false,
    });

    const token = signToken({ id: admin.id, email: admin.email, role: admin.role });
    return res.json({ success: true, token, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role, mustChangePassword: false } });
  });

  // Admin setup (first run — create default admin)
  app.post("/api/admin/setup", async (req, res) => {
    const existing = await storage.listAdminUsers();
    if (existing.length > 0) return res.status(403).json({ message: "Sistema já configurado. Acesse com suas credenciais." });

    // Optional: require SETUP_SECRET env var if set
    const setupSecret = process.env.SETUP_SECRET;
    if (setupSecret && req.body.setupSecret !== setupSecret) {
      return res.status(403).json({ message: "Chave de setup inválida" });
    }

    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "Dados incompletos" });
    if (password.length < 8) return res.status(400).json({ message: "Senha deve ter pelo menos 8 caracteres" });

    const admin = await storage.createAdminUser({
      name, email, passwordHash: hashPassword(password), role: "admin", active: true, mustChangePassword: false,
    });
    const token = signToken({ id: admin.id, email: admin.email, role: admin.role });
    return res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
  });

  // ─ Admin Users CRUD ────────────────────────────────────────────────────────
  // List users (admin only)
  app.get("/api/admin/users", requireRole("admin"), async (_req, res) => {
    const users = await storage.listAdminUsers();
    return res.json(users.map(u => ({ ...u, passwordHash: undefined })));
  });

  // Create user (admin only)
  app.post("/api/admin/users", requireRole("admin"), async (req, res) => {
    const { name, email, role } = req.body;
    let { password } = req.body;

    if (!name || !email || !role) return res.status(400).json({ message: "Dados incompletos" });
    const allowedRoles = ["admin", "financeiro", "operacao"];
    if (!allowedRoles.includes(role)) return res.status(400).json({ message: "Role inválida" });
    const existing = await storage.getAdminByEmail(email);
    if (existing) return res.status(409).json({ message: "E-mail já cadastrado" });

    let tempPassword: string | undefined;
    if (!password) {
      // Auto-generate secure temp password
      const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
      tempPassword = Array.from({length: 12}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      password = tempPassword;
    }

    const user = await storage.createAdminUser({
      name, email, passwordHash: hashPassword(password), role, active: true, mustChangePassword: true,
    });

    // Try to send welcome email
    const settings = await storage.getStoreSettings();
    const smtpUser = settings?.smtpUser || process.env.SMTP_USER;
    const smtpPass = settings?.smtpPass || process.env.SMTP_PASS;
    if (smtpUser && smtpPass) {
      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({
          host: settings?.smtpHost || process.env.SMTP_HOST || "smtp.gmail.com",
          port: Number(settings?.smtpPort || process.env.SMTP_PORT) || 587,
          secure: false, auth: { user: smtpUser, pass: smtpPass },
        });
        await transporter.sendMail({
          from: `"${settings?.storeName || "Admin"}" <${smtpUser}>`,
          to: email,
          subject: `Seu acesso ao painel — ${settings?.storeName || "Loja Virtual"}`,
          html: `
            <div style="font-family:sans-serif;max-width:440px;margin:0 auto;padding:24px">
              <h2>Bem-vindo(a), ${name}!</h2>
              <p>Seu acesso ao painel administrativo foi criado.</p>
              <p><strong>E-mail:</strong> ${email}</p>
              <p><strong>Senha temporária:</strong> <code style="background:#f3f4f6;padding:4px 8px;border-radius:4px">${password}</code></p>
              <p style="color:#dc2626;font-size:13px">⚠️ Você será solicitado a trocar a senha no primeiro acesso.</p>
            </div>`,
        });
      } catch (err) { console.error("Falha ao enviar e-mail de boas-vindas:", err); }
    }

    return res.status(201).json({
      ...user,
      passwordHash: undefined,
      tempPassword, // Only present if auto-generated — show ONCE in admin UI
    });
  });

  // Update user (admin only)
  app.put("/api/admin/users/:id", requireRole("admin"), async (req, res) => {
    const { name, email, role, active, password } = req.body;
    const updates: any = { name, email, role, active };
    if (password) updates.passwordHash = hashPassword(password);
    const user = await storage.updateAdminUser(Number(req.params.id), updates);
    return res.json({ ...user, passwordHash: undefined });
  });

  // Delete user (admin only)
  app.delete("/api/admin/users/:id", requireRole("admin"), async (req, res) => {
    const adminPayload = (req as any).admin;
    if (adminPayload.id === Number(req.params.id)) return res.status(400).json({ message: "Não pode excluir o próprio usuário" });
    await storage.deleteAdminUser(Number(req.params.id));
    return res.json({ success: true });
  });

  // Dashboard
  app.get("/api/admin/dashboard", requireAdmin, async (_req, res) => {
    const stats = await storage.getDashboardStats();
    return res.json(stats);
  });

  // Store settings
  app.get("/api/admin/settings", requireAdmin, async (_req, res) => {
    const s = await storage.getStoreSettings();
    return res.json(s || {});
  });
  app.put("/api/admin/settings", requireAdmin, async (req, res) => {
    const s = await storage.upsertStoreSettings(req.body);
    return res.json(s);
  });

  // Logo upload
  app.post("/api/admin/settings/logo", requireAdmin, upload.single("logo"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Nenhum arquivo enviado" });
    const logoUrl = `/uploads/products/${req.file.filename}`;
    const s = await storage.upsertStoreSettings({ logoUrl });
    return res.json({ logoUrl: s.logoUrl });
  });

  // Favicon upload
  app.post("/api/admin/settings/favicon", requireAdmin, upload.single("favicon"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Nenhum arquivo enviado" });
    const faviconUrl = `/uploads/products/${req.file.filename}`;
    const s = await storage.upsertStoreSettings({ faviconUrl });
    return res.json({ faviconUrl: s.faviconUrl });
  });

  // ─ Categories admin ───────────────────────────────────────────────────────
  app.get("/api/admin/categories", requireAdmin, async (_req, res) => {
    const cats = await storage.listCategories(false);
    return res.json(cats);
  });
  app.post("/api/admin/categories", requireAdmin, async (req, res) => {
    const { name, description, parentId } = req.body;
    if (!name) return res.status(400).json({ message: "Nome obrigatório" });
    const slug = slugify(name);
    const cat = await storage.createCategory({ name, slug, description, parentId: parentId || null, active: true });
    return res.status(201).json(cat);
  });
  app.put("/api/admin/categories/:id", requireAdmin, async (req, res) => {
    const cat = await storage.updateCategory(Number(req.params.id), req.body);
    return res.json(cat);
  });
  app.delete("/api/admin/categories/:id", requireAdmin, async (req, res) => {
    await storage.deleteCategory(Number(req.params.id));
    return res.json({ success: true });
  });

  // ─ Featured Products admin ────────────────────────────────────────────────
  app.get("/api/admin/featured-products", requireAdmin, async (_req, res) => {
    const { products: prods } = await storage.listProducts({ limit: 100, offset: 0 });
    const enriched = await Promise.all(prods.map(async p => {
      const imgs = await storage.getProductImages(p.id);
      return { id: p.id, title: p.title, price: p.price, featured: p.featured || false, mainImage: imgs.find(i => i.isMain)?.url || imgs[0]?.url || null };
    }));
    return res.json(enriched);
  });

  app.put("/api/admin/products/:id/featured", requireAdmin, async (req, res) => {
    const prod = await storage.updateProduct(Number(req.params.id), { featured: req.body.featured });
    return res.json(prod);
  });

  // ─ Products admin ─────────────────────────────────────────────────────────
  app.get("/api/admin/products", requireAdmin, async (req, res) => {
    const { search, category, status, page = "1", limit = "20" } = req.query as any;
    const result = await storage.listProducts({
      search, categoryId: category ? Number(category) : undefined,
      status: status || undefined,
      limit: Number(limit), offset: (Number(page) - 1) * Number(limit),
    });
    return res.json(result);
  });
  app.get("/api/admin/products/:id", requireAdmin, async (req, res) => {
    const product = await storage.getProductById(Number(req.params.id));
    if (!product) return res.status(404).json({ message: "Produto não encontrado" });
    const [images, variantList] = await Promise.all([
      storage.getProductImages(product.id),
      storage.getVariantsByProduct(product.id),
    ]);
    return res.json({ ...product, images, variants: variantList });
  });
  app.post("/api/admin/products", requireAdmin, async (req, res) => {
    const { variants: variantsData, ...productData } = req.body;
    const slug = productData.slug || slugify(productData.title);
    const product = await storage.createProduct({ ...productData, slug });
    if (variantsData?.length) {
      for (const v of variantsData) {
        await storage.createVariant({ ...v, productId: product.id });
      }
    }
    return res.status(201).json(product);
  });
  app.put("/api/admin/products/:id", requireAdmin, async (req, res) => {
    const { variants: variantsData, images: _images, ...productData } = req.body;
    const product = await storage.updateProduct(Number(req.params.id), productData);
    return res.json(product);
  });
  app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
    await storage.deleteProduct(Number(req.params.id));
    return res.json({ success: true });
  });

  // Product images
  app.post("/api/admin/products/:id/images", requireAdmin, upload.array("images", 10), async (req, res) => {
    const productId = Number(req.params.id);
    const files = req.files as Express.Multer.File[];
    const existingImages = await storage.getProductImages(productId);
    const savedImages = [];
    for (let i = 0; i < files.length; i++) {
      const img = await storage.addProductImage({
        productId,
        url: `/uploads/products/${files[i].filename}`,
        altText: req.body[`alt_${i}`] || "",
        position: existingImages.length + i,
        isMain: existingImages.length === 0 && i === 0,
      });
      savedImages.push(img);
    }
    return res.status(201).json(savedImages);
  });
  app.delete("/api/admin/products/images/:imageId", requireAdmin, async (req, res) => {
    await storage.deleteProductImage(Number(req.params.imageId));
    return res.json({ success: true });
  });
  app.put("/api/admin/products/:id/images/:imageId/main", requireAdmin, async (req, res) => {
    await storage.setMainImage(Number(req.params.id), Number(req.params.imageId));
    return res.json({ success: true });
  });

  // Variants
  app.post("/api/admin/products/:id/variants", requireAdmin, async (req, res) => {
    const variant = await storage.createVariant({ ...req.body, productId: Number(req.params.id) });
    return res.status(201).json(variant);
  });
  app.put("/api/admin/variants/:id", requireAdmin, async (req, res) => {
    const variant = await storage.updateVariant(Number(req.params.id), req.body);
    return res.json(variant);
  });
  app.delete("/api/admin/variants/:id", requireAdmin, async (req, res) => {
    await storage.deleteVariant(Number(req.params.id));
    return res.json({ success: true });
  });

  // ─ CSV/XLSX Import ────────────────────────────────────────────────────────
  app.post("/api/admin/products/import", requireAdmin, uploadCsv.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Arquivo não enviado" });
    try {
      const wb = XLSX.readFile(req.file.path);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const results = { created: 0, updated: 0, errors: [] as string[] };
      const productMap = new Map<string, any>();

      for (const row of rows) {
        const handle = String(row["Handle"] || row["handle"] || "").trim();
        const title = String(row["Title"] || row["Título"] || row["titulo"] || "").trim();
        if (!handle && !title) continue;

        const key = handle || slugify(title);
        const price = String(row["Price"] || row["Preço"] || row["preco"] || "0").replace(",", ".");
        const stock = parseInt(String(row["Inventory Quantity"] || row["Estoque"] || "0")) || 0;

        if (!productMap.has(key)) {
          const productTitle = title || key;
          const productData = {
            title: productTitle,
            slug: key,
            description: String(row["Description (HTML)"] || row["Descrição"] || ""),
            vendor: String(row["Vendor"] || row["Fornecedor"] || ""),
            brand: String(row["Brand"] || row["Marca"] || ""),
            type: String(row["Type"] || row["Tipo"] || ""),
            tags: String(row["Tags"] || ""),
            sku: String(row["SKU"] || ""),
            barcode: String(row["Barcode"] || row["Código de Barras"] || ""),
            price,
            compareAtPrice: String(row["Compare At Price"] || row["Preço De"] || "") || null,
            costPerItem: String(row["Cost Per Item"] || row["Custo"] || "") || null,
            weightG: parseInt(String(row["Weight (g)"] || row["Peso (g)"] || "0")) || null,
            stockQuantity: stock,
            status: String(row["Status"] || "active"),
            published: String(row["Published"] || "true").toLowerCase() !== "false",
            seoTitle: String(row["SEO Title"] || row["Meta Título"] || "") || null,
            seoDescription: String(row["SEO Description"] || row["Meta Descrição"] || "") || null,
          };

          try {
            const existing = await storage.getProductBySlug(key);
            if (existing) {
              await storage.updateProduct(existing.id, productData);
              productMap.set(key, existing);
              results.updated++;
            } else {
              const created = await storage.createProduct(productData);
              productMap.set(key, created);
              results.created++;
            }
          } catch (e: any) {
            results.errors.push(`Linha "${productTitle}": ${e.message}`);
            continue;
          }
        }

        // Add variant if option columns present
        const opt1Val = String(row["Option1 Value"] || row["Variante 1 Valor"] || "").trim();
        const opt2Val = String(row["Option2 Value"] || row["Variante 2 Valor"] || "").trim();
        const variantSku = String(row["SKU"] || "").trim();

        if (opt1Val) {
          const product = productMap.get(key);
          if (product) {
            await storage.createVariant({
              productId: product.id, sku: variantSku || null, price,
              option1: opt1Val || null, option2: opt2Val || null,
              stockQuantity: stock, active: true,
            });
          }
        }

        // Add image if URL provided
        const imgUrl = String(row["Image 1 URL"] || row["Imagem 1 URL"] || "").trim();
        if (imgUrl) {
          const product = productMap.get(key);
          if (product) {
            const existingImgs = await storage.getProductImages(product.id);
            if (!existingImgs.some(i => i.url === imgUrl)) {
              await storage.addProductImage({
                productId: product.id, url: imgUrl,
                altText: String(row["Image 1 Alt"] || ""),
                position: existingImgs.length,
                isMain: existingImgs.length === 0,
              });
            }
          }
        }
      }

      // Cleanup temp file
      fs.unlink(req.file.path, () => {});
      return res.json({ success: true, ...results });
    } catch (e: any) {
      return res.status(500).json({ message: `Erro ao processar arquivo: ${e.message}` });
    }
  });

  // Download CSV template
  app.get("/api/admin/products/import/template", requireAdmin, (_req, res) => {
    const headers = [
      "Handle", "Title", "Description (HTML)", "Vendor", "Brand", "Type", "Tags",
      "Status", "Published", "SKU", "Barcode", "Price", "Compare At Price",
      "Cost Per Item", "Weight (g)", "Height (cm)", "Width (cm)", "Depth (cm)",
      "Inventory Quantity", "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value",
      "Image 1 URL", "Image 1 Alt", "Image 2 URL", "SEO Title", "SEO Description",
    ];
    const example = [
      "camiseta-azul", "Camiseta Azul", "<p>Camiseta 100% algodão</p>", "Minha Marca",
      "Minha Marca", "Camisetas", "camiseta,moda,azul", "active", "true",
      "CAM-AZL-M", "7891234567890", "79.90", "99.90", "25.00", "300", "70", "50", "1",
      "10", "Tamanho", "M", "", "", "https://exemplo.com/foto.jpg", "Camiseta Azul M",
      "", "Camiseta Azul | Loja", "Compre camiseta azul...",
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws["!cols"] = headers.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, "Produtos");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=template_produtos.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buf);
  });

  // ─ Orders admin ───────────────────────────────────────────────────────────
  app.get("/api/admin/orders", requireAdmin, async (req, res) => {
    const { status, search, page = "1", limit = "20" } = req.query as any;
    const result = await storage.listOrders({
      status: status || undefined, search: search || undefined,
      limit: Number(limit), offset: (Number(page) - 1) * Number(limit),
    });
    return res.json(result);
  });
  app.get("/api/admin/orders/:id", requireAdmin, async (req, res) => {
    const order = await storage.getOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ message: "Pedido não encontrado" });
    const [items, history, payment] = await Promise.all([
      storage.getOrderItems(order.id),
      storage.getOrderHistory(order.id),
      storage.getPaymentByOrderId(order.id),
    ]);
    return res.json({ ...order, items, history, payment });
  });
  app.put("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
    const { status, note } = req.body;
    const admin = (req as any).admin;
    const order = await storage.updateOrderStatus(Number(req.params.id), status, note, admin?.email);
    return res.json(order);
  });
  app.put("/api/admin/orders/:id/tracking", requireAdmin, async (req, res) => {
    const { carrier, service, trackingCode } = req.body;
    const order = await storage.updateOrderTracking(Number(req.params.id), carrier, service, trackingCode);
    // Send shipping email
    const settings = await storage.getStoreSettings();
    const smtp = getSmtpConfig();
    if (smtp.user && smtp.pass) {
      sendShippingEmail({
        orderNumber: order.orderNumber, customerName: order.customerName,
        customerEmail: order.customerEmail, trackingCode, carrier,
        storeName: settings?.storeName,
      }, smtp).catch(console.error);
    }
    return res.json(order);
  });

  // ─ Customers admin ────────────────────────────────────────────────────────
  app.get("/api/admin/customers", requireAdmin, async (req, res) => {
    const { search } = req.query as any;
    const list = await storage.listCustomers(search || undefined);
    return res.json(list);
  });

  // ─ Coupons admin ──────────────────────────────────────────────────────────
  app.get("/api/admin/coupons", requireAdmin, async (_req, res) => {
    return res.json(await storage.listCoupons());
  });
  app.post("/api/admin/coupons", requireAdmin, async (req, res) => {
    const coupon = await storage.createCoupon({
      ...req.body,
      code: String(req.body.code).toUpperCase(),
    });
    return res.status(201).json(coupon);
  });

  // ─ Financial Reports ─────────────────────────────────────────────────────────
  app.get("/api/admin/reports", requireAdmin, async (req, res) => {
    const { period = "month" } = req.query as any;
    const now = new Date();
    let startDate: Date;
    if (period === "today") startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (period === "week") { startDate = new Date(now); startDate.setDate(now.getDate() - 7); }
    else if (period === "month") startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (period === "year") startDate = new Date(now.getFullYear(), 0, 1);
    else startDate = new Date(now.getFullYear(), now.getMonth(), 1);

    const { orders: allOrders } = await storage.listOrders({ limit: 1000, offset: 0 });
    const filtered = allOrders.filter((o: any) =>
      o.status !== "cancelled" && new Date(o.createdAt) >= startDate
    );

    const totalRevenue = filtered.reduce((s: number, o: any) => s + Number(o.total), 0);
    const ordersCount = filtered.length;
    const avgTicket = ordersCount > 0 ? totalRevenue / ordersCount : 0;

    // Daily revenue (last 30 days)
    const last30Start = new Date(); last30Start.setDate(last30Start.getDate() - 29);
    const last30Orders = allOrders.filter((o: any) => o.status !== "cancelled" && new Date(o.createdAt) >= last30Start);
    const dailyMap: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(); d.setDate(d.getDate() - (29 - i));
      dailyMap[d.toISOString().slice(0, 10)] = 0;
    }
    last30Orders.forEach((o: any) => {
      const key = new Date(o.createdAt).toISOString().slice(0, 10);
      if (key in dailyMap) dailyMap[key] = (dailyMap[key] || 0) + Number(o.total);
    });
    const dailyRevenue = Object.entries(dailyMap).map(([date, revenue]) => ({ date, revenue }));

    const paymentBreakdown: Record<string, number> = {};
    filtered.forEach((o: any) => {
      paymentBreakdown[o.paymentMethod] = (paymentBreakdown[o.paymentMethod] || 0) + 1;
    });

    return res.json({
      period, totalRevenue, ordersCount, avgTicket, dailyRevenue, paymentBreakdown,
      recentOrders: filtered.slice(0, 10).map((o: any) => ({
        orderNumber: o.orderNumber, customerName: o.customerName,
        total: o.total, status: o.status, createdAt: o.createdAt
      }))
    });
  });

  return httpServer;
}
