import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const ownersFixture = [{ id: "o1", name: "Capitol Heights" }];
const checklist = [{ requirementKey: "GOV_ID", label: "Valid Government ID", status: "Submitted", id: "r1", filename: "id.pdf" }];
vi.mock("../src/lib/resource.js", () => ({
  owners: { list: vi.fn(() => Promise.resolve(ownersFixture)) },
  lessorRequirements: {
    forOwner: vi.fn(() => Promise.resolve(checklist)),
    review: vi.fn(() => Promise.resolve({})),
    uploadFor: vi.fn(() => Promise.resolve({})),
    download: vi.fn(() => Promise.resolve(new Blob())),
  },
}));
import LessorRequirementsView from "../src/views/LessorRequirementsView.vue";
import { owners, lessorRequirements } from "../src/lib/resource.js";

describe("LessorRequirementsView (staff)", () => {
  beforeEach(() => { owners.list.mockClear(); lessorRequirements.forOwner.mockClear(); lessorRequirements.review.mockClear(); });
  it("loads a lessor's checklist and reviews an item", async () => {
    const w = mount(LessorRequirementsView);
    await flushPromises();
    await w.find("select.owner-picker").setValue("o1");
    await flushPromises();
    expect(lessorRequirements.forOwner).toHaveBeenCalledWith("o1");
    expect(w.text()).toContain("Valid Government ID");
    // choose Approved and confirm
    await w.find("select.status-select").setValue("Approved");
    await w.find("button.review-btn").trigger("click");
    await flushPromises();
    expect(lessorRequirements.review).toHaveBeenCalled();
    expect(lessorRequirements.review.mock.calls[0][1].status).toBe("Approved");
  });
});
