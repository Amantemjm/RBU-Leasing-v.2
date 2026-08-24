// Single source of truth for the RBU leasing process: the ordered stages, the
// statuses each stage can hold, and helpers to walk the flow. Shared by the
// server (validation + state machine) and the client (tracker UI) so the two
// never drift.

// Ordered list of the 10 process stages. `short` is the tracker label; `initial`
// is the status a stage takes when the transaction first enters it; `done` marks
// the status that means the stage is complete and ready to advance.
export const LEASING_STAGES = [
  {
    key: "INQUIRY", label: "Inquiry", short: "Inquiry",
    statuses: ["New Inquiry", "Under Review", "Need More Information", "Qualified", "Not Qualified", "Declined"],
    initial: "New Inquiry", done: "Qualified",
    lesseeAction: "Submit your inquiry and leasing requirements.",
  },
  {
    key: "ACCEPT_INQUIRY", label: "Accept Inquiry", short: "Accept",
    statuses: ["Pending", "Accepted", "Reassigned", "Declined"],
    initial: "Pending", done: "Accepted",
    lesseeAction: "Your inquiry is being reviewed by the leasing team.",
  },
  {
    key: "UNIT_REGISTRATION", label: "Unit Registration", short: "Register Unit",
    statuses: ["Pending", "Unit Registered"],
    initial: "Pending", done: "Unit Registered",
    lesseeAction: "The leasing team is registering your selected unit.",
  },
  {
    key: "APPROVAL", label: "Approval", short: "Approval",
    statuses: ["Pending Submission", "Submitted", "Under Review", "For Revision", "Approved", "Rejected"],
    initial: "Pending Submission", done: "Approved",
    lesseeAction: "Submit the required documents and await approval.",
  },
  {
    key: "UNIT_SHOOT", label: "Unit Shoot", short: "Unit Shoot",
    statuses: ["Pending", "Scheduled", "In Progress", "Completed", "Rescheduled"],
    initial: "Pending", done: "Completed",
    lesseeAction: "View the scheduled unit shoot.",
  },
  {
    key: "ACCOMPLISHMENT_FORM", label: "Accomplishment Form", short: "Accomplishment",
    statuses: ["For Completion", "Submitted", "Under Review", "Accepted", "Returned"],
    initial: "For Completion", done: "Accepted",
    lesseeAction: "Complete and submit the accomplishment form.",
  },
  {
    key: "LETTER_OF_INTENT", label: "Letter of Intent", short: "LOI",
    statuses: ["Draft", "For Lessee Review", "Submitted", "For Lessor Review", "Accepted", "Returned"],
    initial: "Draft", done: "Accepted",
    lesseeAction: "Review and sign the Letter of Intent.",
  },
  {
    key: "UNIT_INSPECTION", label: "Unit Inspection", short: "Inspection",
    statuses: ["Pending", "Scheduled", "In Progress", "Passed", "Passed with Remarks", "For Rectification", "Failed", "Rescheduled"],
    initial: "Pending", done: "Passed",
    lesseeAction: "Attend or acknowledge the unit inspection.",
  },
  {
    key: "CONTRACT_SIGNING", label: "Contract Signing", short: "Signing",
    statuses: ["Contract Preparation", "For Review", "For Lessee Signing", "For Lessor Signing", "Fully Executed"],
    initial: "Contract Preparation", done: "Fully Executed",
    lesseeAction: "Review and sign the lease contract.",
  },
  {
    key: "FINAL_STATUS", label: "Status", short: "Status",
    statuses: ["Active", "Completed", "Pending", "For Revision", "Cancelled", "Rejected", "Expired"],
    initial: "Active", done: "Completed",
    lesseeAction: "View your final leasing status.",
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
  return key === "FINAL_STATUS";
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
