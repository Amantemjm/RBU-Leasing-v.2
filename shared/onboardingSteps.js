// The lessor's path from the landing card to a verified unit. Steps 4 and 5
// mirror the SEND_REQUIREMENTS and APPROVAL stages of the leasing transaction
// that unit approval opens — this list is for display; it is not a second
// state machine.
export const ONBOARDING_STEPS = [
  { key: "unit",         label: "Your unit" },
  { key: "account",      label: "Your account" },
  { key: "review",       label: "Application review" },
  { key: "requirements", label: "Requirements" },
  { key: "verification", label: "Verification" },
];

export const ONBOARDING_STEP_KEYS = ONBOARDING_STEPS.map((s) => s.key);
