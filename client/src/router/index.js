import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth.js";
import LoginView from "../views/LoginView.vue";
import DashboardView from "../views/DashboardView.vue";

const routes = [
  { path: "/login", component: LoginView },
  { path: "/", component: DashboardView, meta: { requiresAuth: true } },
];

const router = createRouter({ history: createWebHistory(), routes });
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) return "/login";
});
export default router;
