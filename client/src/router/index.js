import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import AppLayout from "../components/AppLayout.vue";
import LoginView from "../views/LoginView.vue";
import DashboardView from "../views/DashboardView.vue";
import SummaryView from "../views/SummaryView.vue";
import OwnersView from "../views/OwnersView.vue";
import OwnerFormView from "../views/OwnerFormView.vue";
import TenantsView from "../views/TenantsView.vue";
import TenantFormView from "../views/TenantFormView.vue";
import UnitsView from "../views/UnitsView.vue";
import UnitFormView from "../views/UnitFormView.vue";
import LeasesView from "../views/LeasesView.vue";
import LeaseFormView from "../views/LeaseFormView.vue";
import PaymentsView from "../views/PaymentsView.vue";
import PaymentFormView from "../views/PaymentFormView.vue";

const routes = [
  { path: "/login", component: LoginView },
  {
    path: "/",
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      { path: "", component: DashboardView },
      { path: "summary", component: SummaryView },
      { path: "owners", component: OwnersView },
      { path: "owners/new", component: OwnerFormView },
      { path: "owners/:id", component: OwnerFormView },
      { path: "tenants", component: TenantsView },
      { path: "tenants/new", component: TenantFormView },
      { path: "tenants/:id", component: TenantFormView },
      { path: "units", component: UnitsView },
      { path: "units/new", component: UnitFormView },
      { path: "units/:id", component: UnitFormView },
      { path: "leases", component: LeasesView },
      { path: "leases/new", component: LeaseFormView },
      { path: "leases/:id", component: LeaseFormView },
      { path: "payments", component: PaymentsView },
      { path: "payments/new", component: PaymentFormView },
      { path: "payments/:id", component: PaymentFormView },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) return "/login";
});
export default router;
