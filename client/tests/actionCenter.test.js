import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/lib/resource.js", () => ({
  pendingAccounts: { list: vi.fn(() => Promise.resolve([])) },
}));

import { useActionCenter } from "../src/stores/actionCenter.js";
import { pendingAccounts } from "../src/lib/resource.js";

const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: `a${i}` }));

describe("actionCenter", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    pendingAccounts.list.mockClear();
    pendingAccounts.list.mockResolvedValue([]);
  });
  afterEach(() => { vi.useRealTimers(); });

  it("starts with nothing outstanding", () => {
    const s = useActionCenter();
    expect(s.accountApprovals).toBe(0);
    expect(s.total).toBe(0);
    expect(s.hasActions).toBe(false);
  });

  it("counts pending account approvals", async () => {
    pendingAccounts.list.mockResolvedValue(rows(3));
    const s = useActionCenter();
    await s.refresh();
    expect(s.accountApprovals).toBe(3);
    expect(s.total).toBe(3);
    expect(s.hasActions).toBe(true);
  });

  // Only staff who can actually act should be polling this endpoint.
  it("does not call the API for a role that cannot approve", async () => {
    const s = useActionCenter();
    await s.refresh("TENANT");
    await s.refresh("UNIT_OWNER");
    await s.refresh("VIEWER");
    expect(pendingAccounts.list).not.toHaveBeenCalled();
    expect(s.total).toBe(0);
  });

  it("polls for an admin and a leasing officer", async () => {
    const s = useActionCenter();
    await s.refresh("ADMIN");
    await s.refresh("LEASING_OFFICER");
    expect(pendingAccounts.list).toHaveBeenCalledTimes(2);
  });

  // A failed poll must not wipe a count the user is looking at, nor throw.
  it("keeps the last known count when a refresh fails", async () => {
    pendingAccounts.list.mockResolvedValue(rows(2));
    const s = useActionCenter();
    await s.refresh("ADMIN");
    expect(s.accountApprovals).toBe(2);

    pendingAccounts.list.mockRejectedValue(new Error("network"));
    await expect(s.refresh("ADMIN")).resolves.toBeUndefined();
    expect(s.accountApprovals).toBe(2);
  });

  it("clears on sign-out so the next user sees nothing stale", async () => {
    pendingAccounts.list.mockResolvedValue(rows(4));
    const s = useActionCenter();
    await s.refresh("ADMIN");
    s.reset();
    expect(s.total).toBe(0);
    expect(s.hasActions).toBe(false);
  });

  it("polls on an interval while started, and stops cleanly", async () => {
    vi.useFakeTimers();
    pendingAccounts.list.mockResolvedValue(rows(1));
    const s = useActionCenter();
    s.start("ADMIN");
    expect(pendingAccounts.list).toHaveBeenCalledTimes(1); // immediate first check
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pendingAccounts.list).toHaveBeenCalledTimes(2);
    s.stop();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(pendingAccounts.list).toHaveBeenCalledTimes(2); // no further polling
  });

  it("does not stack timers if started twice", async () => {
    vi.useFakeTimers();
    const s = useActionCenter();
    s.start("ADMIN");
    s.start("ADMIN");
    pendingAccounts.list.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pendingAccounts.list).toHaveBeenCalledTimes(1);
    s.stop();
  });
});
