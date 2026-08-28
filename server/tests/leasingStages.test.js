import { describe, it, expect } from "vitest";
import {
  LEASING_STAGES, STAGE_KEYS, stageByKey, isFinalStage, nextStageKey,
} from "../../shared/leasingStages.js";
import {
  SCHEDULABLE_STAGES, SCHEDULABLE_STAGE_KEYS, APPOINTMENT_STATUSES, isSchedulableStage,
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

describe("schedulable stages", () => {
  it("exposes the three schedulable stages with valid outcomes", () => {
    expect(SCHEDULABLE_STAGE_KEYS).toEqual(["UNIT_INSPECTION", "KEY_TURNOVER", "PHOTOSHOOT"]);
    for (const key of SCHEDULABLE_STAGE_KEYS) {
      const stage = LEASING_STAGES.find((s) => s.key === key);
      const cfg = SCHEDULABLE_STAGES[key];
      expect(stage.statuses).toContain(cfg.defaultOutcome);
      for (const o of cfg.outcomeOptions || []) expect(stage.statuses).toContain(o);
    }
    expect(isSchedulableStage("UNIT_INSPECTION")).toBe(true);
    expect(isSchedulableStage("INQUIRY")).toBe(false);
  });
  it("appointment statuses are the standard lifecycle", () => {
    expect(APPOINTMENT_STATUSES).toEqual(["Scheduled", "Rescheduled", "Completed", "Cancelled", "No-show"]);
  });
});
