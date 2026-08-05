import { defineStore } from "pinia";

export const useAuthStore = defineStore("auth", {
  state: () => ({ token: null, user: null }),
  getters: { isAuthenticated: (s) => !!s.token, role: (s) => s.user?.role },
  actions: {
    setSession({ token, user }) { this.token = token; this.user = user; },
    logout() { this.token = null; this.user = null; },
  },
});
