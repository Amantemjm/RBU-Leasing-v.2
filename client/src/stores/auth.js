import { defineStore } from "pinia";

const STAFF = ["ADMIN", "LEASING_OFFICER", "VIEWER"];
const KEY = "rbu-auth"; // persisted session so a page refresh keeps you signed in

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
    // Anything other than APPROVED is a restricted session: the server refuses
    // every route but the application-status ones, and the router keeps the
    // user on the page that explains why.
    isApproved: (s) => (s.user?.status ?? "APPROVED") === "APPROVED",
  },
  actions: {
    setSession({ token, user }) {
      this.token = token;
      this.user = user;
      try { localStorage.setItem(KEY, JSON.stringify({ token, user })); } catch { /* ignore */ }
    },
    // Restore a previously-saved session on app boot (called from main.js).
    hydrate() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return;
        const s = JSON.parse(raw);
        this.token = s.token || null;
        this.user = s.user || null;
      } catch { /* ignore malformed storage */ }
    },
    logout() {
      this.token = null;
      this.user = null;
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    },
  },
});
