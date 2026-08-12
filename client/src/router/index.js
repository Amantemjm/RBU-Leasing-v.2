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
import OwnerLeasesView from "../views/OwnerLeasesView.vue";
import OwnerIncomeView from "../views/OwnerIncomeView.vue";
import MyProfileView from "../views/MyProfileView.vue";
import TenantLeaseView from "../views/TenantLeaseView.vue";
import TenantPaymentsView from "../views/TenantPaymentsView.vue";
import ApprovalsView from "../views/ApprovalsView.vue";
import RequirementsView from "../views/RequirementsView.vue";
import AdminView from "../views/AdminView.vue";
import UsersView from "../views/UsersView.vue";

const STAFF = ["ADMIN", "LEASING_OFFICER", "VIEWER"];
const WRITE = ["ADMIN", "LEASING_OFFICER"];

const routes = [
  { path: "/", component: InquiryView, alias: "/inquiry" }, // public landing (Inquiry form)
  { path: "/login", component: LoginView },
  {
    path: "/app",
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      // Staff
      { path: "", component: DashboardView, meta: { roles: STAFF } },
      { path: "summary", component: SummaryView, meta: { roles: STAFF } },
      { path: "reports", component: ReportsView, meta: { roles: STAFF } },
      { path: "inquiries", component: InquiriesView, meta: { roles: STAFF } },
      { path: "owners", component: OwnersView, meta: { roles: STAFF } },
      { path: "owners/new", component: OwnerFormView, meta: { roles: WRITE } },
      { path: "owners/:id", component: OwnerFormView, meta: { roles: WRITE } },
      { path: "tenants", component: TenantsView, meta: { roles: STAFF } },
      { path: "tenants/new", component: TenantFormView, meta: { roles: WRITE } },
      { path: "tenants/:id", component: TenantFormView, meta: { roles: WRITE } },
      { path: "units", component: UnitsView, meta: { roles: STAFF } },
      { path: "units/new", component: UnitFormView, meta: { roles: WRITE } },
      { path: "units/:id", component: UnitFormView, meta: { roles: WRITE } },
      { path: "leases", component: LeasesView, meta: { roles: STAFF } },
      { path: "leases/new", component: LeaseFormView, meta: { roles: WRITE } },
      { path: "leases/:id", component: LeaseFormView, meta: { roles: WRITE } },
      { path: "payments", component: PaymentsView, meta: { roles: STAFF } },
      { path: "payments/new", component: PaymentFormView, meta: { roles: WRITE } },
      { path: "payments/:id", component: PaymentFormView, meta: { roles: WRITE } },
      { path: "approvals", component: ApprovalsView, meta: { roles: WRITE } },
      // Unit Owner (Lessor)
      { path: "my-units", component: MyUnitsView, meta: { roles: ["UNIT_OWNER"] } },
      { path: "register-unit", component: RegisterUnitView, meta: { roles: ["UNIT_OWNER"] } },
      { path: "my-leases", component: OwnerLeasesView, meta: { roles: ["UNIT_OWNER"] } },
      { path: "my-income", component: OwnerIncomeView, meta: { roles: ["UNIT_OWNER"] } },
      // Tenant (Lessee)
      { path: "my-lease", component: TenantLeaseView, meta: { roles: ["TENANT"] } },
      { path: "my-payments", component: TenantPaymentsView, meta: { roles: ["TENANT"] } },
      // Shared
      { path: "requirements", component: RequirementsView, meta: { roles: ["TENANT", "ADMIN", "LEASING_OFFICER"] } },
      { path: "my-profile", component: MyProfileView, meta: { roles: ["UNIT_OWNER", "TENANT"] } },
      { path: "admin", component: AdminView, meta: { roles: ["ADMIN"] } },
      { path: "users", component: UsersView, meta: { roles: ["ADMIN"] } },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) return "/login";
  if (!auth.isAuthenticated) return;
  const appHome = auth.isOwner ? "/app/my-units" : auth.isTenant ? "/app/my-lease" : "/app";
  // "/" is always the public Inquiry landing — even for signed-in users.
  if (to.path === "/app" && appHome !== "/app") return appHome; // owners/tenants -> their portal
  if (to.meta.roles && !to.meta.roles.includes(auth.role)) return appHome;
});
export default router;
