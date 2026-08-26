import { defineStore } from "pinia";
import { pendingAccounts } from "../lib/resource.js";

// Outstanding work that needs a staff decision, surfaced in the top bar and on
// the sidebar so it is noticed without visiting the page. Today that is only
// portal account approvals; `total` is a sum so further action types can be
// added here without touching the components that display it.
const POLL_MS = 60_000;

// Roles that can actually act on these items. Anyone else must not poll the
// endpoint at all — it would 403 on every tick.
const CAN_ACT = ["ADMIN", "LEASING_OFFICER"];

export const useActionCenter = defineStore("actionCenter", {
  state: () => ({ accountApprovals: 0, checkedAt: null, _timer: null }),
  getters: {
    total: (s) => s.accountApprovals,
    hasActions() { return this.total > 0; },
  },
  actions: {
    async refresh(role) {
      // `role` is optional so a component can force a refresh after acting;
      // when supplied it gates the call.
      if (role !== undefined && !CAN_ACT.includes(role)) return;
      try {
        const rows = await pendingAccounts.list();
        this.accountApprovals = Array.isArray(rows) ? rows.length : 0;
        this.checkedAt = new Date().toISOString();
      } catch {
        // A dropped poll should never blank a count that is on screen, and must
        // never surface as an unhandled rejection.
      }
    },

    start(role) {
      if (!CAN_ACT.includes(role)) return;
      this.stop(); // never stack intervals across re-mounts
      this.refresh(role);
      this._timer = setInterval(() => this.refresh(role), POLL_MS);
    },

    stop() {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
    },

    reset() {
      this.stop();
      this.accountApprovals = 0;
      this.checkedAt = null;
    },
  },
});
