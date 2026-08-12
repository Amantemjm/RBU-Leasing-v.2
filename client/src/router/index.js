import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import AppLayout from "../components/AppLayout.vue";
import InquiryView from "../views/InquiryView.vue";
import LoginView from "../views/LoginView.vue";
import DashboardView from "../views/DashboardView.vue";
import SummaryView from "../views/SummaryView.vue";
import ReportsView from "../views/ReportsView.vue";
import InquiriesView from "../views/InquiriesView.vue";
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
import MyUnitsView from "../views/MyUnitsView.vue";
import RegisterUnitView from "../views/RegisterUnitView.vue";
import ApprovalsView from "../views/ApprovalsView.vue";
import RequirementsView from "../views/RequirementsView.vue";
import AdminView from "../views/AdminView.vue";
import UsersView from "../views/UsersView.vue";

const routes = [
  { path: "/", component: InquiryView }, // public landing (Inquiry form)
  { path: "/login", component: LoginView },
  {
    path: "/app",
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      { path: "", component: DashboardView },
      { path: "summary", component: SummaryView },
      { path: "reports", component: ReportsView },
      { path: "inquiries", component: InquiriesView, meta: { roles: ["ADMIN", "LEASING_OFFICER", "VIEWER"] } },
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
      { path: "my-units", component: MyUnitsView, meta: { roles: ["UNIT_OWNER"] } },
      { path: "register-unit", component: RegisterUnitView, meta: { roles: ["UNIT_OWNER"] } },
      { path: "approvals", component: ApprovalsView, meta: { roles: ["ADMIN", "LEASING_OFFICER"] } },
      { path: "requirements", component: RequirementsView, meta: { roles: ["TENANT", "ADMIN", "LEASING_OFFICER"] } },
      { path: "admin", component: AdminView, meta: { roles: ["ADMIN", "LEASING_OFFICER"] } },
      { path: "users", component: UsersView, meta: { roles: ["ADMIN"] } },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) return "/login";
  if (!auth.isAuthenticated) return;
  const appHome = auth.isOwner ? "/app/my-units" : auth.isTenant ? "/app/requirements" : "/app";
  if (to.path === "/") return appHome; // authenticated visitors skip the public landing
  if (to.path === "/app" && appHome !== "/app") return appHome; // owners/tenants -> their portal
  if (to.meta.roles && !to.meta.roles.includes(auth.role)) return appHome;
});
export default router;
