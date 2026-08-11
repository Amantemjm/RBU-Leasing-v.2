import { defineStore } from "pinia";

const STAFF = ["ADMIN", "LEASING_OFFICER", "VIEWER"];

export const useAuthStore = defineStore("auth", {
  state: () => ({ token: null, user: null }),
  getters: {
    isAuthenticated: (s) => !!s.token,
    role: (s) => s.user?.role,
    unitOwnerId: (s) => s.user?.unitOwnerId ?? null,
    tenantId: (s) => s.user?.tenantId ?? null,
    isStaff: (s) => STAFF.includes(s.user?.role),
    isOwner: (s) => s.user?.role === "UNIT_OWNER",
    isTenant: (s) => s.user?.role === "TENANT",
    canWrite: (s) => ["ADMIN", "LEASING_OFFICER"].includes(s.user?.role),
  },
  actions: {
    setSession({ token, user }) { this.token = token; this.user = user; },
    logout() { this.token = null; this.user = null; },
  },
});
