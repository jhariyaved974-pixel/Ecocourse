import { describe, expect, it } from "vitest";
import { isQualified, mergeLeadDetails, parseLeadDetails } from "@/server/ai/schemas";
import { normalizePhone, redactSensitive } from "@/server/crm/leads";
import { briefConfirmationMessage, buildBrief } from "@/server/sales/engine";

describe("lead details", () => {
  it("merges without overwriting known values with blanks", () => {
    const merged = mergeLeadDetails({ businessName: "Green Leaf" }, { businessName: null, industry: "Café", pages: [] });
    expect(merged).toEqual({ businessName: "Green Leaf", industry: "Café" });
  });
  it("drops invalid stored values", () => {
    expect(parseLeadDetails({ email: "not-an-email", businessName: "X", bogus: 1 })).toEqual({ businessName: "X" });
  });
  it("qualifies with name + industry/services + goal", () => {
    expect(isQualified({ businessName: "X", industry: "Café" })).toBe(false);
    expect(isQualified({ businessName: "X", services: "cakes", goal: "more orders" })).toBe(true);
  });
});

describe("phones and redaction", () => {
  it("normalises to E.164", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("919876543210")).toBe("+919876543210");
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
    expect(normalizePhone("12")).toBeNull();
  });
  it("redacts card-like numbers", () => {
    expect(redactSensitive("card 4111 1111 1111 1111 ok")).toBe("card [redacted number] ok");
  });
});

describe("brief", () => {
  it("summarises only known facts and asks for confirmation + consent", () => {
    const msg = briefConfirmationMessage({ businessName: "Green Leaf", industry: "Café", goal: "More orders" }, "en");
    expect(msg).toContain("Green Leaf");
    expect(msg).toContain("Reply YES");
    expect(msg).toContain("STOP");
    expect(msg).not.toContain("Location");
  });
  it("builds a schema-valid brief with server-owned fields", () => {
    const brief = buildBrief(
      { id: "lead_1", consentStatus: "OPTED_IN" },
      { businessName: "Green Leaf", industry: "Café" },
      { industry: "x", description: "A café", targetAudience: "Locals", brandColors: ["#123456", "red"], colorNotes: "", style: "", pages: [], features: [], suppliedAssets: [], animations: [], language: "en", budgetRange: null, timeline: null, missingInformation: ["Logo"] },
      "en",
    );
    expect(brief.leadId).toBe("lead_1");
    expect(brief.businessName).toBe("Green Leaf");
    expect(brief.brand.colors).toEqual(["#123456"]);
    expect(brief.consent).toEqual({ status: "OPTED_IN", followUpsAllowed: true });
    expect(brief.pages.length).toBeGreaterThan(0);
  });
});
