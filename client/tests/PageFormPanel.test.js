import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("../src/lib/resource.js", () => ({
  myPageForm: { get: vi.fn(), save: vi.fn() },
  estates: { list: vi.fn(() => Promise.resolve([])) },
}));

import PageFormPanel from "../src/components/PageFormPanel.vue";
import { myPageForm } from "../src/lib/resource.js";

describe("PageFormPanel (role-page custom fields)", () => {
  beforeEach(() => { myPageForm.get.mockReset(); myPageForm.save.mockReset(); });

  it("renders nothing when the page has no configured fields", async () => {
    myPageForm.get.mockResolvedValue({ pageKey: "profile", title: null, fields: [], data: null });
    const w = mount(PageFormPanel, { props: { pageKey: "profile" } });
    await flushPromises();
    expect(w.find(".pfp").exists()).toBe(false);
  });

  it("renders configured fields and saves the user's answers", async () => {
    myPageForm.get.mockResolvedValue({
      pageKey: "profile", title: "About you",
      fields: [{ key: "nickname", label: "Nickname", type: "text", options: [] }], data: null,
    });
    myPageForm.save.mockResolvedValue({ data: { nickname: "Tin" } });

    const w = mount(PageFormPanel, { props: { pageKey: "profile" } });
    await flushPromises();
    expect(w.find(".pfp").exists()).toBe(true);
    expect(w.text()).toContain("Nickname");

    await w.find("input").setValue("Tin");
    await w.find(".primary").trigger("click");
    await flushPromises();
    expect(myPageForm.save).toHaveBeenCalledWith("profile", { nickname: "Tin" });
    expect(w.text()).toContain("Saved");
  });
});
