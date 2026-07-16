import {
  contactMessages, adminUsers, categories, products, productImages,
  variants, customers, addresses, cartSessions, cartItems, orders,
  orderItems, orderStatusHistory, paymentTransactions, coupons,
  shippingZones, shippingRates, storeSettings,
  type ContactMessage, type InsertContactMessage,
  type AdminUser, type InsertAdminUser,
  type Category, type InsertCategory,
  type Product, type InsertProduct,
  type ProductImage, type InsertProductImage,
  type Variant, type InsertVariant,
  type Customer, type InsertCustomer,
  type Address, type InsertAddress,
  type Order, type InsertOrder,
  type Coupon, type InsertCoupon,
  type StoreSettings,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, desc, asc, like, and, or, sql, isNull } from "drizzle-orm";
import pg from "pg";

// Lazy initialization so DATABASE_URL can be loaded from .env before connection
let _pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getPool(): pg.Pool {
  if (!_pool) _pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

export function getDb(): ReturnType<typeof drizzle> {
  if (!_db) _db = drizzle(getPool());
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});

export class DatabaseStorage {
  // ─── Contact ─────────────────────────────────────────────────────────────
  async createContactMessage(message: InsertContactMessage): Promise<ContactMessage> {
    const [result] = await db.insert(contactMessages).values(message).returning();
    return result;
  }

  // ─── Admin Users ──────────────────────────────────────────────────────────
  async getAdminByEmail(email: string): Promise<AdminUser | undefined> {
    const [result] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
    return result;
  }
  async getAdminById(id: number): Promise<AdminUser | undefined> {
    const [result] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    return result;
  }
  async createAdminUser(data: InsertAdminUser): Promise<AdminUser> {
    const [result] = await db.insert(adminUsers).values(data).returning();
    return result;
  }
  async listAdminUsers(): Promise<AdminUser[]> {
    return db.select().from(adminUsers).orderBy(asc(adminUsers.createdAt));
  }
  async updateAdminUser(id: number, data: Partial<InsertAdminUser>): Promise<AdminUser> {
    const [result] = await db.update(adminUsers).set(data).where(eq(adminUsers.id, id)).returning();
    return result;
  }
  async deleteAdminUser(id: number): Promise<void> {
    await db.delete(adminUsers).where(eq(adminUsers.id, id));
  }

  // ─── Store Settings ───────────────────────────────────────────────────────
  async getStoreSettings(): Promise<StoreSettings | undefined> {
    const [result] = await db.select().from(storeSettings).limit(1);
    return result;
  }
  async upsertStoreSettings(data: Partial<StoreSettings>): Promise<StoreSettings> {
    const existing = await this.getStoreSettings();
    if (existing) {
      const [result] = await db.update(storeSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(storeSettings.id, existing.id))
        .returning();
      return result;
    }
    const [result] = await db.insert(storeSettings).values({ ...data } as any).returning();
    return result;
  }

  // ─── Categories ───────────────────────────────────────────────────────────
  async listCategories(activeOnly = false): Promise<Category[]> {
    const q = activeOnly
      ? db.select().from(categories).where(eq(categories.active, true))
      : db.select().from(categories);
    return q.orderBy(asc(categories.sortOrder), asc(categories.name));
  }
  async getCategoryById(id: number): Promise<Category | undefined> {
    const [result] = await db.select().from(categories).where(eq(categories.id, id));
    return result;
  }
  async getCategoryBySlug(slug: string): Promise<Category | undefined> {
    const [result] = await db.select().from(categories).where(eq(categories.slug, slug));
    return result;
  }
  async createCategory(data: InsertCategory): Promise<Category> {
    const [result] = await db.insert(categories).values(data).returning();
    return result;
  }
  async updateCategory(id: number, data: Partial<InsertCategory>): Promise<Category> {
    const [result] = await db.update(categories).set(data).where(eq(categories.id, id)).returning();
    return result;
  }
  async deleteCategory(id: number): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  // ─── Products ─────────────────────────────────────────────────────────────
  async listProducts(opts: {
    categoryId?: number; status?: string; published?: boolean;
    featured?: boolean; search?: string; limit?: number; offset?: number;
  } = {}): Promise<{ products: Product[]; total: number }> {
    const conditions = [];
    if (opts.categoryId) conditions.push(eq(products.categoryId, opts.categoryId));
    if (opts.status) conditions.push(eq(products.status, opts.status));
    if (opts.published !== undefined) conditions.push(eq(products.published, opts.published));
    if (opts.featured !== undefined) conditions.push(eq(products.featured, opts.featured));
    if (opts.search) conditions.push(
      or(
        like(products.title, `%${opts.search}%`),
        like(products.sku, `%${opts.search}%`),
        like(products.brand, `%${opts.search}%`)
      )
    );

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(products).where(where);

    const rows = await db.select().from(products)
      .where(where)
      .orderBy(desc(products.createdAt))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0);

    return { products: rows, total: Number(count) };
  }

  async getProductById(id: number): Promise<Product | undefined> {
    const [result] = await db.select().from(products).where(eq(products.id, id));
    return result;
  }
  async getProductBySlug(slug: string): Promise<Product | undefined> {
    const [result] = await db.select().from(products).where(eq(products.slug, slug));
    return result;
  }
  async createProduct(data: InsertProduct): Promise<Product> {
    const [result] = await db.insert(products).values(data).returning();
    return result;
  }
  async updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product> {
    const [result] = await db.update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, id)).returning();
    return result;
  }
  async deleteProduct(id: number): Promise<void> {
    await db.delete(productImages).where(eq(productImages.productId, id));
    await db.delete(variants).where(eq(variants.productId, id));
    await db.delete(products).where(eq(products.id, id));
  }
  async decrementStock(productId: number, qty: number): Promise<void> {
    await db.update(products)
      .set({ stockQuantity: sql`${products.stockQuantity} - ${qty}` })
      .where(eq(products.id, productId));
  }

  // ─── Product Images ───────────────────────────────────────────────────────
  async getProductImages(productId: number): Promise<ProductImage[]> {
    return db.select().from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(asc(productImages.position));
  }
  async addProductImage(data: InsertProductImage): Promise<ProductImage> {
    const [result] = await db.insert(productImages).values(data).returning();
    return result;
  }
  async deleteProductImage(id: number): Promise<void> {
    await db.delete(productImages).where(eq(productImages.id, id));
  }
  async setMainImage(productId: number, imageId: number): Promise<void> {
    await db.update(productImages).set({ isMain: false }).where(eq(productImages.productId, productId));
    await db.update(productImages).set({ isMain: true }).where(eq(productImages.id, imageId));
  }

  // ─── Variants ─────────────────────────────────────────────────────────────
  async getVariantsByProduct(productId: number): Promise<Variant[]> {
    return db.select().from(variants).where(eq(variants.productId, productId));
  }
  async createVariant(data: InsertVariant): Promise<Variant> {
    const [result] = await db.insert(variants).values(data).returning();
    return result;
  }
  async updateVariant(id: number, data: Partial<InsertVariant>): Promise<Variant> {
    const [result] = await db.update(variants).set(data).where(eq(variants.id, id)).returning();
    return result;
  }
  async deleteVariant(id: number): Promise<void> {
    await db.delete(variants).where(eq(variants.id, id));
  }

  // ─── Cart ─────────────────────────────────────────────────────────────────
  async getOrCreateCart(sessionId: string): Promise<any> {
    let [cart] = await db.select().from(cartSessions).where(eq(cartSessions.sessionId, sessionId));
    if (!cart) {
      [cart] = await db.insert(cartSessions).values({ sessionId }).returning();
    }
    const items = await db.select({
      id: cartItems.id, cartId: cartItems.cartId,
      productId: cartItems.productId, variantId: cartItems.variantId,
      quantity: cartItems.quantity, unitPrice: cartItems.unitPrice,
      productTitle: products.title, productSlug: products.slug,
      mainImage: sql<string>`(SELECT url FROM product_images WHERE product_id = ${cartItems.productId} AND is_main = true LIMIT 1)`,
    }).from(cartItems)
      .leftJoin(products, eq(cartItems.productId, products.id))
      .where(eq(cartItems.cartId, cart.id));
    return { ...cart, items };
  }
  async addToCart(sessionId: string, productId: number, variantId: number | null, quantity: number, unitPrice: string): Promise<void> {
    const cart = await this.getOrCreateCart(sessionId);
    const existing = cart.items.find((i: any) => i.productId === productId && i.variantId === variantId);
    if (existing) {
      await db.update(cartItems)
        .set({ quantity: existing.quantity + quantity })
        .where(eq(cartItems.id, existing.id));
    } else {
      await db.insert(cartItems).values({ cartId: cart.id, productId, variantId, quantity, unitPrice });
    }
    await db.update(cartSessions).set({ updatedAt: new Date() }).where(eq(cartSessions.id, cart.id));
  }
  async updateCartItem(itemId: number, quantity: number): Promise<void> {
    if (quantity <= 0) {
      await db.delete(cartItems).where(eq(cartItems.id, itemId));
    } else {
      await db.update(cartItems).set({ quantity }).where(eq(cartItems.id, itemId));
    }
  }
  async clearCart(sessionId: string): Promise<void> {
    const [cart] = await db.select().from(cartSessions).where(eq(cartSessions.sessionId, sessionId));
    if (cart) {
      await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    }
  }

  // ─── Customers ────────────────────────────────────────────────────────────
  async getCustomerByEmail(email: string): Promise<Customer | undefined> {
    const [result] = await db.select().from(customers).where(eq(customers.email, email));
    return result;
  }
  async getCustomerById(id: number): Promise<Customer | undefined> {
    const [result] = await db.select().from(customers).where(eq(customers.id, id));
    return result;
  }
  async createCustomer(data: InsertCustomer): Promise<Customer> {
    const [result] = await db.insert(customers).values(data).returning();
    return result;
  }
  async listCustomers(search?: string): Promise<Customer[]> {
    if (search) {
      return db.select().from(customers)
        .where(or(like(customers.name, `%${search}%`), like(customers.email, `%${search}%`)))
        .orderBy(desc(customers.createdAt));
    }
    return db.select().from(customers).orderBy(desc(customers.createdAt));
  }

  // ─── Orders ───────────────────────────────────────────────────────────────
  async createOrder(data: InsertOrder): Promise<Order> {
    const [result] = await db.insert(orders).values(data).returning();
    return result;
  }
  async getOrderById(id: number): Promise<Order | undefined> {
    const [result] = await db.select().from(orders).where(eq(orders.id, id));
    return result;
  }
  async getOrderByNumber(orderNumber: string): Promise<Order | undefined> {
    const [result] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
    return result;
  }
  async listOrders(opts: { status?: string; search?: string; limit?: number; offset?: number } = {}): Promise<{ orders: Order[]; total: number }> {
    const conditions = [];
    if (opts.status) conditions.push(eq(orders.status, opts.status));
    if (opts.search) conditions.push(or(
      like(orders.orderNumber, `%${opts.search}%`),
      like(orders.customerEmail, `%${opts.search}%`),
      like(orders.customerName, `%${opts.search}%`)
    ));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(orders).where(where);
    const rows = await db.select().from(orders).where(where)
      .orderBy(desc(orders.createdAt)).limit(opts.limit ?? 50).offset(opts.offset ?? 0);
    return { orders: rows, total: Number(count) };
  }
  async updateOrderStatus(id: number, status: string, note?: string, updatedBy?: string): Promise<Order> {
    const [current] = await db.select().from(orders).where(eq(orders.id, id));
    const [result] = await db.update(orders)
      .set({ status, updatedAt: new Date() }).where(eq(orders.id, id)).returning();
    await db.insert(orderStatusHistory).values({
      orderId: id, fromStatus: current.status, toStatus: status,
      note, createdBy: updatedBy ?? "admin"
    });
    return result;
  }
  async updateOrderTracking(id: number, carrier: string, service: string, trackingCode: string): Promise<Order> {
    const [result] = await db.update(orders)
      .set({ shippingCarrier: carrier, shippingService: service, trackingCode, updatedAt: new Date() })
      .where(eq(orders.id, id)).returning();
    return result;
  }
  async updateOrderPayment(id: number, paymentStatus: string, transactionId?: string): Promise<void> {
    await db.update(orders)
      .set({ paymentStatus, paymentTransactionId: transactionId, updatedAt: new Date() })
      .where(eq(orders.id, id));
  }

  async createOrderItems(items: any[]): Promise<void> {
    await db.insert(orderItems).values(items);
  }
  async getOrderItems(orderId: number): Promise<any[]> {
    return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }
  async getOrderHistory(orderId: number): Promise<any[]> {
    return db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(asc(orderStatusHistory.createdAt));
  }

  // ─── Payment Transactions ─────────────────────────────────────────────────
  async createPaymentTransaction(data: any): Promise<any> {
    const [result] = await db.insert(paymentTransactions).values(data).returning();
    return result;
  }
  async getPaymentByOrderId(orderId: number): Promise<any> {
    const [result] = await db.select().from(paymentTransactions)
      .where(eq(paymentTransactions.orderId, orderId))
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(1);
    return result;
  }
  async updatePaymentStatus(gatewayTransactionId: string, status: string): Promise<any> {
    const [result] = await db.update(paymentTransactions)
      .set({ status, updatedAt: new Date() })
      .where(eq(paymentTransactions.gatewayTransactionId, gatewayTransactionId))
      .returning();
    return result;
  }

  // ─── Coupons ──────────────────────────────────────────────────────────────
  async getCouponByCode(code: string): Promise<Coupon | undefined> {
    const [result] = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase()));
    return result;
  }
  async listCoupons(): Promise<Coupon[]> {
    return db.select().from(coupons).orderBy(desc(coupons.createdAt));
  }
  async createCoupon(data: InsertCoupon): Promise<Coupon> {
    const [result] = await db.insert(coupons).values(data).returning();
    return result;
  }
  async incrementCouponUsage(id: number): Promise<void> {
    await db.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, id));
  }
  /**
   * Claim ATÔMICO de 1 uso: revalida (ativo, janela de datas, limite, mínimo) e
   * incrementa na MESMA instrução SQL. O row-lock serializa concorrentes e o
   * WHERE é reavaliado após o lock (READ COMMITTED) — na corrida do último uso,
   * só 1 vence. Retorna a linha atualizada, ou null se qualquer condição falhou.
   */
  async claimCouponUsage(code: string, subtotal: number): Promise<Coupon | null> {
    const rows = await db
      .update(coupons)
      .set({ usedCount: sql`${coupons.usedCount} + 1` })
      .where(
        and(
          eq(coupons.code, code.toUpperCase()),
          eq(coupons.active, true),
          or(isNull(coupons.maxUses), sql`${coupons.usedCount} < ${coupons.maxUses}`),
          or(isNull(coupons.startsAt), sql`${coupons.startsAt} <= now()`),
          or(isNull(coupons.expiresAt), sql`${coupons.expiresAt} >= now()`),
          or(isNull(coupons.minOrderValue), sql`${coupons.minOrderValue} <= ${subtotal}`)
        )
      )
      .returning();
    return rows[0] ?? null;
  }

  // ─── Shipping ─────────────────────────────────────────────────────────────
  async listShippingZones(): Promise<any[]> {
    return db.select().from(shippingZones).where(eq(shippingZones.active, true));
  }
  async getShippingRates(zoneId: number): Promise<any[]> {
    return db.select().from(shippingRates)
      .where(and(eq(shippingRates.zoneId, zoneId), eq(shippingRates.active, true)));
  }

  // ─── Dashboard Stats ──────────────────────────────────────────────────────
  async getDashboardStats(): Promise<any> {
    const today = new Date(); today.setHours(0,0,0,0);
    const [todayRevenue] = await db.select({
      revenue: sql<number>`COALESCE(SUM(total::numeric), 0)`,
      count: sql<number>`count(*)`
    }).from(orders)
      .where(and(sql`created_at >= ${today}`, eq(orders.paymentStatus, "approved")));

    const [totalRevenue] = await db.select({
      revenue: sql<number>`COALESCE(SUM(total::numeric), 0)`,
      count: sql<number>`count(*)`
    }).from(orders).where(eq(orders.paymentStatus, "approved"));

    const [pendingOrders] = await db.select({ count: sql<number>`count(*)` })
      .from(orders).where(eq(orders.status, "pending_payment"));

    const [totalCustomers] = await db.select({ count: sql<number>`count(*)` }).from(customers);

    const recentOrders = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(10);

    return {
      todayRevenue: Number(todayRevenue.revenue),
      todayOrders: Number(todayRevenue.count),
      totalRevenue: Number(totalRevenue.revenue),
      totalOrders: Number(totalRevenue.count),
      pendingOrders: Number(pendingOrders.count),
      totalCustomers: Number(totalCustomers.count),
      recentOrders,
    };
  }
}

export const storage = new DatabaseStorage();
