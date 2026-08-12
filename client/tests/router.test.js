import { describe, it, expect } from "vitest";
import router from "../src/router/index.js";
import InquiryView from "../src/views/InquiryView.vue";

describe("router", () => {
  it("serves the Inquiry page at both / and /inquiry", () => {
    expect(router.resolve("/").matched[0].components.default).toBe(InquiryView);
    expect(router.resolve("/inquiry").matched[0].components.default).toBe(InquiryView);
  });
});
