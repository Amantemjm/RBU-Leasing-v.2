import axios from "axios";
import { useAuthStore } from "../stores/auth.js";

export const api = axios.create({ baseURL: "/api" });
api.interceptors.request.use((config) => {
  const auth = useAuthStore();
  if (auth.token) config.headers.Authorization = `Bearer ${auth.token}`;
  return config;
});

// If a saved session has expired, the API returns 401 — clear it and send the
// user to sign in (only when we actually had a session, so a failed login on
// the public pages is left for the login form to handle).
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const auth = useAuthStore();
      if (auth.isAuthenticated) {
        auth.logout();
        if (window.location.pathname.startsWith("/app")) window.location.assign("/login");
      }
    }
    return Promise.reject(err);
  },
);
