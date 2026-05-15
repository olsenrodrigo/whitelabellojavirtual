import { Switch, Route } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import StorePage from "@/pages/store/StorePage";
import ProductDetailPage from "@/pages/store/ProductDetailPage";
import CartPage from "@/pages/store/CartPage";
import CheckoutPage from "@/pages/store/CheckoutPage";
import OrderConfirmationPage from "@/pages/store/OrderConfirmationPage";
import AdminLoginPage from "@/pages/admin/LoginPage";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminProducts from "@/pages/admin/Products";
import AdminProductForm from "@/pages/admin/ProductForm";
import AdminOrders from "@/pages/admin/Orders";
import AdminOrderDetail from "@/pages/admin/OrderDetail";
import AdminCustomers from "@/pages/admin/Customers";
import AdminImport from "@/pages/admin/Import";
import AdminSettings from "@/pages/admin/Settings";
import AdminCoupons from "@/pages/admin/Coupons";
import AdminCategories from "@/pages/admin/Categories";
import AdminFeaturedProducts from "@/pages/admin/FeaturedProducts";
import AdminUsers from "@/pages/admin/Users";
import AdminReports from "@/pages/admin/Reports";
import AdminChangePassword from "@/pages/admin/ChangePasswordPage";
import { CartProvider } from "@/context/CartContext";
import { AdminAuthProvider } from "@/context/AdminAuthContext";

function Router() {
  return (
    <Switch>
      {/* i18n language routes */}
      <Route path="/en" component={Home} />
      <Route path="/es" component={Home} />

      {/* Main site */}
      <Route path="/" component={Home} />

      {/* Virtual Store */}
      <Route path="/loja" component={StorePage} />
      <Route path="/loja/produto/:slug" component={ProductDetailPage} />
      <Route path="/loja/carrinho" component={CartPage} />
      <Route path="/loja/checkout" component={CheckoutPage} />
      <Route path="/loja/pedido/:orderNumber" component={OrderConfirmationPage} />

      {/* Admin */}
      <Route path="/admin/login" component={AdminLoginPage} />
      <Route path="/admin/trocar-senha" component={AdminChangePassword} />
      <Route path="/admin" component={() => <AdminLayout><AdminDashboard /></AdminLayout>} />
      <Route path="/admin/produtos" component={() => <AdminLayout><AdminProducts /></AdminLayout>} />
      <Route path="/admin/produtos/novo" component={() => <AdminLayout><AdminProductForm /></AdminLayout>} />
      <Route path="/admin/produtos/:id" component={() => <AdminLayout><AdminProductForm /></AdminLayout>} />
      <Route path="/admin/pedidos" component={() => <AdminLayout><AdminOrders /></AdminLayout>} />
      <Route path="/admin/pedidos/:id" component={() => <AdminLayout><AdminOrderDetail /></AdminLayout>} />
      <Route path="/admin/clientes" component={() => <AdminLayout><AdminCustomers /></AdminLayout>} />
      <Route path="/admin/importar" component={() => <AdminLayout><AdminImport /></AdminLayout>} />
      <Route path="/admin/cupons" component={() => <AdminLayout><AdminCoupons /></AdminLayout>} />
      <Route path="/admin/categorias" component={() => <AdminLayout><AdminCategories /></AdminLayout>} />
      <Route path="/admin/destaques" component={() => <AdminLayout><AdminFeaturedProducts /></AdminLayout>} />
      <Route path="/admin/configuracoes" component={() => <AdminLayout><AdminSettings /></AdminLayout>} />
      <Route path="/admin/usuarios" component={() => <AdminLayout><AdminUsers /></AdminLayout>} />
      <Route path="/admin/relatorios" component={() => <AdminLayout><AdminReports /></AdminLayout>} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    fetch("/api/store/settings")
      .then(r => r.json())
      .then((s: any) => {
        if (s.faviconUrl) {
          let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
          if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
          }
          link.href = s.faviconUrl;
        }
        if (s.storeName) {
          document.title = s.storeName;
        }
      })
      .catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AdminAuthProvider>
          <CartProvider>
            <Router />
            <Toaster />
          </CartProvider>
        </AdminAuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
