import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const checklist = [
  { requirementKey: "GOV_ID", label: "Valid Government ID", status: "Required" },
  { requirementKey: "OWNERSHIP", label: "Proof of Ownership (Title / CCT)", status: "Rejected", remarks: "Blurry scan", id: "r2", filename: "t.pdf" },
];
vi.mock("../src/lib/resource.js", () => ({
  lessorRequirements: {
    mine: vi.fn(() => Promise.resolve(checklist)),
    uploadMine: vi.fn(() => Promise.resolve({})),
    download: vi.fn(() => Promise.resolve(new Blob())),
  },
}));
import MyLessorRequirementsView from "../src/views/MyLessorRequirementsView.vue";
import { lessorRequirements } from "../src/lib/resource.js";

describe("MyLessorRequirementsView", () => {
  beforeEach(() => { lessorRequirements.mine.mockClear(); lessorRequirements.uploadMine.mockClear(); });

  // OnboardingProgress is otherwise only mounted in the wizard and the
  // application-status page, so steps 4 and 5 are never shown to anyone once
  // approved. Being on this page IS step 4 — no transaction-stage lookup needed.
  it("shows the onboarding stepper at the Requirements step", async () => {
    const w = mount(MyLessorRequirementsView);
    await flushPromises();
    const step = w.get('[data-step="requirements"]');
    expect(step.attributes("aria-current")).toBe("step");
  });

  it("renders the checklist with statuses and the rejection remark", async () => {
    const w = mount(MyLessorRequirementsView);
    await flushPromises();
    expect(w.text()).toContain("Valid Government ID");
    expect(w.text()).toContain("Required");
    expect(w.text()).toContain("Blurry scan");
  });
  it("uploads a file for a requirement", async () => {
    const w = mount(MyLessorRequirementsView);
    await flushPromises();
    const input = w.find('input[type="file"]');
    const file = new File(["x"], "id.pdf", { type: "application/pdf" });
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    await flushPromises();
    expect(lessorRequirements.uploadMine).toHaveBeenCalled();
    expect(lessorRequirements.uploadMine.mock.calls[0][0]).toBe("GOV_ID");
  });
});
