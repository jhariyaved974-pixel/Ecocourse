import { randomToken } from "../crypto";
import type { MessagingProvider, SendResult, TemplateSend } from "./types";

/**
 * Local simulator: records outbound messages in the database only (status SIMULATED).
 * Nothing is sent to any phone. Customer replies are typed into the dashboard simulator.
 */
export class SimulatedProvider implements MessagingProvider {
  readonly name = "simulated" as const;
  /** Tests can force failures to exercise retry and error handling. */
  static failNext: { retryable: boolean; code: string } | null = null;

  async sendText(): Promise<SendResult> {
    return this.result();
  }

  async sendTemplate(_to: string, _t: TemplateSend): Promise<SendResult> {
    return this.result();
  }

  private result(): SendResult {
    const f = SimulatedProvider.failNext;
    if (f) {
      SimulatedProvider.failNext = null;
      return { ok: false, retryable: f.retryable, code: f.code, message: "Simulated failure" };
    }
    return { ok: true, providerMessageId: `sim_${randomToken(12)}`, simulated: true };
  }
}
