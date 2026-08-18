import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router/index.js";
import { useAuthStore } from "./stores/auth.js";
import "./styles/app.css";

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
useAuthStore(pinia).hydrate(); // restore a saved session before the first route resolves
app.use(router);
app.mount("#app");
