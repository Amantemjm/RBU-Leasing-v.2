import { describe, it, expect } from "vitest";
import {
  TRANSACTION_DOCUMENT_TYPES, TRANSACTION_DOCUMENT_KEYS, docTypeByKey, labelForDocType,
} from "../../shared/transactionDocuments.js";

// The two documents the Contract Signing flow turns on. Both change hands
// outside the system; RBU only holds them.
describe("Transaction document types", () => {
  it("has exactly the two typed slots, in flow order", () => {
    expect(TRANSACTION_DOCUMENT_KEYS).toEqual(["LETTER_OF_INTENT", "SIGNED_CONTRACT"]);
  });

  it("names the stage each document belongs to", () => {
    expect(docTypeByKey("LETTER_OF_INTENT").stage).toBe("PHOTOSHOOT");
    expect(docTypeByKey("SIGNED_CONTRACT").stage).toBe("CONTRACT_SIGNING");
  });

  it("says what each document gates", () => {
    expect(docTypeByKey("LETTER_OF_INTENT").gate).toBe("advance");
    expect(docTypeByKey("SIGNED_CONTRACT").gate).toBe("complete");
  });

  it("gives every type a human label", () => {
    expect(labelForDocType("LETTER_OF_INTENT")).toBe("Letter of Intent");
    expect(labelForDocType("SIGNED_CONTRACT")).toBe("Signed Lease Contract");
    expect(TRANSACTION_DOCUMENT_TYPES.every((t) => t.label && t.key)).toBe(true);
  });

  it("returns null for an unknown key and echoes it back as a label", () => {
    expect(docTypeByKey("NOPE")).toBe(null);
    expect(labelForDocType("NOPE")).toBe("NOPE");
  });
});
