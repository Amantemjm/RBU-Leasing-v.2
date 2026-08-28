// Single source of truth for the RBU leasing process: the ordered stages, the
// statuses each stage can hold, and helpers to walk the flow. Shared by the
// server (validation + state machine) and the client (tracker UI) so the two
// never drift.

// Ordered list of the 6 process stages. `short` is the tracker label; `initial`
// is the status a stage takes when the transaction first enters it; `done` marks
// the status that means the stage is complete and ready to advance.
export const LEASING_STAGES = [
  {
    key: "INQUIRY", label: "Inquiry", short: "Inquiry",
    statuses: ["New Inquiry", "Under Review", "Qualified", "Not Qualified", "Declined", "Skipped"],
    initial: "New Inquiry", done: "Qualified",
    lesseeAction: "Submit your inquiry — no account needed.",
  },
  {
    key: "SEND_REQUIREMENTS", label: "Send Requirements", short: "Requirements",
    statuses: ["Pending", "Submitted", "Incomplete", "Complete"],
    initial: "Pending", done: "Complete",
    lesseeAction: "Upload the required documents.",
  },
  {
    key: "APPROVAL", label: "Approval", short: "Approval",
    statuses: ["Pending Submission", "Submitted", "Under Review", "For Revision", "Approved", "Rejected"],
    initial: "Pending Submission", done: "Approved",
    lesseeAction: "Await approval of your submission.",
  },
  {
    key: "UNIT_INSPECTION", label: "Unit Inspection", short: "Inspection",
    statuses: ["Pending", "Scheduled", "In Progress", "Passed", "Passed with Remarks", "For Rectification", "Failed", "Rescheduled"],
    initial: "Pending", done: "Passed",
    lesseeAction: "Attend or acknowledge the unit inspection.",
  },
  {
    key: "KEY_TURNOVER", label: "Key Turnover", short: "Turnover",
    statuses: ["Pending", "Scheduled", "Completed", "Rescheduled"],
    initial: "Pending", done: "Completed",
    lesseeAction: "Turn over the unit keys.",
  },
  {
    key: "PHOTOSHOOT", label: "Photoshoot", short: "Photoshoot",
    statuses: ["Pending", "Scheduled", "In Progress", "Completed", "Rescheduled"],
    initial: "Pending", done: "Completed",
    lesseeAction: "The unit photoshoot is scheduled.",
  },
];

// Sequential approval routing chain used in the Approval stage. The transaction
// cannot advance past Approval until every step is Approved.
export const APPROVAL_ROUTING = ["Leasing", "Management", "Authorized Approver", "Final Approval"];
export const APPROVAL_STEP_STATUSES = ["Pending", "Approved", "Rejected", "Returned"];

export const STAGE_KEYS = LEASING_STAGES.map((s) => s.key);
export const FINAL_STATUSES = LEASING_STAGES[LEASING_STAGES.length - 1].statuses;

export function stageIndex(key) {
  return STAGE_KEYS.indexOf(key);
}
export function stageByKey(key) {
  return LEASING_STAGES.find((s) => s.key === key);
}
export function isFinalStage(key) {
  return key === "PHOTOSHOOT";
}
export function nextStageKey(key) {
  const i = stageIndex(key);
  return i >= 0 && i < STAGE_KEYS.length - 1 ? STAGE_KEYS[i + 1] : null;
}
export function prevStageKey(key) {
  const i = stageIndex(key);
  return i > 0 ? STAGE_KEYS[i - 1] : null;
}
// Is `status` valid for `stageKey`?
export function isValidStatus(stageKey, status) {
  const s = stageByKey(stageKey);
  return !!s && s.statuses.includes(status);
}

// --- Scheduling (sub-project H) ---------------------------------------------
// The stages that carry an appointment. `defaultOutcome` is the stage status
// set when the appointment is completed; `outcomeOptions` (inspection) lets the
// officer pick a specific result. Every value is a real status of its stage.
export const SCHEDULABLE_STAGES = {
  UNIT_INSPECTION: { defaultOutcome: "Passed", outcomeOptions: ["Passed", "Passed with Remarks", "For Rectification", "Failed"] },
  KEY_TURNOVER:    { defaultOutcome: "Completed" },
  PHOTOSHOOT:      { defaultOutcome: "Completed" },
};
export const SCHEDULABLE_STAGE_KEYS = Object.keys(SCHEDULABLE_STAGES);
export const APPOINTMENT_STATUSES = ["Scheduled", "Rescheduled", "Completed", "Cancelled", "No-show"];
export function isSchedulableStage(key) {
  return Object.prototype.hasOwnProperty.call(SCHEDULABLE_STAGES, key);
}
