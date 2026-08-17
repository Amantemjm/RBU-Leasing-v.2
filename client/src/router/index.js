import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import AppLayout from "../components/AppLayout.vue";
import InquiryStartView from "../views/InquiryStartView.vue";
import InquiryView from "../views/InquiryView.vue";
import LoginView from "../views/LoginView.vue";
import DashboardView from "../views/DashboardView.vue";
import ExecutiveDashboardView from "../views/ExecutiveDashboardView.vue";
import InquiriesView from "../views/InquiriesView.vue";
import OwnersView from "../views/OwnersView.vue";
import OwnerFormView from "../views/OwnerFormView.vue";
import TenantsView from "../views/TenantsView.vue";
import TenantFormView from "../views/TenantFormView.vue";
import UnitsView from "../views/UnitsView.vue";
import UnitFormView from "../views/UnitFormView.vue";
import LeasesView from "../views/LeasesView.vue";
import LeaseFormView from "../views/LeaseFormView.vue";
import MyUnitsView from "../views/MyUnitsView.vue";
import RegisterUnitView from "../views/RegisterUnitView.vue";
import OwnerLeasesView from "../views/OwnerLeasesView.vue";
import MyProfileView from "../views/MyProfileView.vue";
import TenantLeaseView from "../views/TenantLeaseView.vue";
import ApprovalsView from "../views/ApprovalsView.vue";
import LessorInfoSheetsView from "../views/LessorInfoSheetsView.vue";
import LesseeInfoSheetsView from "../views/LesseeInfoSheetsView.vue";
import OwnerInfoSheetView from "../views/OwnerInfoSheetView.vue";
import TenantInfoSheetView from "../views/TenantInfoSheetView.vue";
import RequirementsView from "../views/RequirementsView.vue";
import UsersView from "../views/UsersView.vue";
import AuditView from "../views/AuditView.vue";

const STAFF = ["ADMIN", "LEASING_OFFICER", "VIEWER"];
const WRITE = ["ADMIN", "LEASING_OFFICER"];
const ADMIN = ["ADMIN"];

const routes = [
  { path: "/", component: InquiryStartView }, // public landing: "I am a…" user-type selection
  { path: "/inquiry", component: InquiryView }, // Quick Inquiry form (user type via ?as=)
  { path: "/login", component: LoginView },
  {
    path: "/app",
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      // Staff
      { path: "", component: DashboardView, meta: { roles: STAFF } },
      { path: "executive", component: ExecutiveDashboardView, meta: { roles: WRITE } },
      { path: "inquiries", component: InquiriesView, meta: { roles: STAFF } },
      { path: "owners", component: OwnersView, meta: { roles: STAFF } },
      { path: "owners/new", component: OwnerFormView, meta: { roles: ADMIN } },
      { path: "owners/:id", component: OwnerFormView, meta: { roles: ADMIN } },
      { path: "tenants", component: TenantsView, meta: { roles: STAFF } },
      { path: "tenants/new", component: TenantFormView, meta: { roles: ADMIN } },
      { path: "tenants/:id", component: TenantFormView, meta: { roles: ADMIN } },
      { path: "units", component: UnitsView, meta: { roles: STAFF } },
      { path: "units/new", component: UnitFormView, meta: { roles: ADMIN } },
      { path: "units/:id", component: UnitFormView, meta: { roles: ADMIN } },
      { path: "leases", component: LeasesView, meta: { roles: STAFF } },
      { path: "leases/new", component: LeaseFormView, meta: { roles: ADMIN } },
      { path: "leases/:id", component: LeaseFormView, meta: { roles: ADMIN } },
      { path: "approvals", component: ApprovalsView, meta: { roles: WRITE } },
      { path: "lessor-sheets", component: LessorInfoSheetsView, meta: { roles: WRITE } },
      { path: "lessee-sheets", component: LesseeInfoSheetsView, meta: { roles: WRITE } },
      // Unit Owner (Lessor)
      { path: "my-units", component: MyUnitsView, meta: { roles: ["UNIT_OWNER"] } },
      { path: "register-unit", component: RegisterUnitView, meta: { roles: ["UNIT_OWNER"] } },
      { path: "my-leases", component: OwnerLeasesView, meta: { roles: ["UNIT_OWNER"] } },
      { path: "info-sheet", component: OwnerInfoSheetView, meta: { roles: ["UNIT_OWNER"] } },
      // Tenant (Lessee)
      { path: "my-lease", component: TenantLeaseView, meta: { roles: ["TENANT"] } },
      { path: "info-sheet-tenant", component: TenantInfoSheetView, meta: { roles: ["TENANT"] } },
      // Shared
      { path: "requirements", component: RequirementsView, meta: { roles: ["TENANT", "ADMIN", "LEASING_OFFICER"] } },
      { path: "my-profile", component: MyProfileView, meta: { roles: ["UNIT_OWNER", "TENANT"] } },
      // Super Admin
      { path: "users", component: UsersView, meta: { roles: ["ADMIN"] } },
      { path: "audit", component: AuditView, meta: { roles: ["ADMIN"] } },
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
