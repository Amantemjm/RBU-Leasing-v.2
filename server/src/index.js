import "./env.js";
import { createApp } from "./app.js";

const app = createApp();
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`RBU Leasing on :${port} (${process.env.NODE_ENV || "development"})`));
