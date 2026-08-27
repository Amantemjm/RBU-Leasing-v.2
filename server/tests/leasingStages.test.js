import { describe, it, expect } from "vitest";
import {
  LEASING_STAGES, STAGE_KEYS, stageByKey, isFinalStage, nextStageKey,
} from "../../shared/leasingStages.js";

describe("Leasing stage engine (lessor flow)", () => {
  it("has the six lessor stages in order", () => {
    expect(STAGE_KEYS).toEqual([
      "INQUIRY", "SEND_REQUIREMENTS", "APPROVAL",
      "UNIT_INSPECTION", "KEY_TURNOVER", "PHOTOSHOOT",
    ]);
  });

  it("marks Photoshoot as the terminal stage", () => {
    expect(isFinalStage("PHOTOSHOOT")).toBe(true);
    expect(isFinalStage("APPROVAL")).toBe(false);
    expect(nextStageKey("PHOTOSHOOT")).toBe(null);
  });

  it("exposes the done status used to advance each stage", () => {
    expect(stageByKey("INQUIRY").done).toBe("Qualified");
    expect(stageByKey("SEND_REQUIREMENTS").done).toBe("Complete");
    expect(stageByKey("APPROVAL").done).toBe("Approved");
    expect(stageByKey("UNIT_INSPECTION").done).toBe("Passed");
    expect(stageByKey("KEY_TURNOVER").done).toBe("Completed");
    expect(stageByKey("PHOTOSHOOT").done).toBe("Completed");
  });

  it("allows Inquiry to be marked Skipped", () => {
    expect(stageByKey("INQUIRY").statuses).toContain("Skipped");
  });
});
