import { describe, it, expect } from "vitest";
import {
  LEASING_STAGES, STAGE_KEYS, stageIndex, nextStageKey, prevStageKey,
  SCHEDULABLE_STAGES, isSchedulableStage, APPOINTMENT_STATUSES, stageByKey,
} from "../../shared/leasingStages.js";

describe("UNIT_VIEWING stage registry", () => {
  it("sits between INQUIRY and SEND_REQUIREMENTS", () => {
    expect(STAGE_KEYS).toHaveLength(7);
    expect(stageIndex("UNIT_VIEWING")).toBe(1);
    expect(nextStageKey("INQUIRY")).toBe("UNIT_VIEWING");
    expect(nextStageKey("UNIT_VIEWING")).toBe("SEND_REQUIREMENTS");
    expect(prevStageKey("SEND_REQUIREMENTS")).toBe("UNIT_VIEWING");
  });

  it("is schedulable with the viewing outcomes and the Interested done-status", () => {
    expect(isSchedulableStage("UNIT_VIEWING")).toBe(true);
    expect(SCHEDULABLE_STAGES.UNIT_VIEWING.outcomeOptions).toEqual(["Interested", "Not Interested", "No-show"]);
    expect(stageByKey("UNIT_VIEWING").done).toBe("Interested");
    expect(stageByKey("UNIT_VIEWING").statuses).toEqual(
      expect.arrayContaining(["Pending", "Proposed", "Confirmed", "Interested", "Not Interested", "No-show", "Skipped"]),
    );
  });

  it("adds Proposed and Confirmed appointment statuses", () => {
    expect(APPOINTMENT_STATUSES).toEqual(expect.arrayContaining(["Proposed", "Confirmed"]));
  });
});
