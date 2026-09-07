// The documents a leasing transaction holds in a named slot, as opposed to the
// loose supporting attachments (which carry docType = null). Both of these
// change hands outside the system — RBU stores the signed artefact, it does not
// produce it. Shared by the server (validation + gating) and the client (upload
// selector) so the two cannot drift.
export const TRANSACTION_DOCUMENT_TYPES = [
  {
    key: "LETTER_OF_INTENT",
    label: "Letter of Intent",
    stage: "PHOTOSHOOT",
    gate: "advance", // uploading it moves the transaction into Contract Signing
  },
  {
    key: "SIGNED_CONTRACT",
    label: "Signed Lease Contract",
    stage: "CONTRACT_SIGNING",
    gate: "complete", // uploading it closes the stage, and the transaction
  },
];

export const TRANSACTION_DOCUMENT_KEYS = TRANSACTION_DOCUMENT_TYPES.map((t) => t.key);

export const docTypeByKey = (key) =>
  TRANSACTION_DOCUMENT_TYPES.find((t) => t.key === key) || null;

export const labelForDocType = (key) => docTypeByKey(key)?.label || key;
