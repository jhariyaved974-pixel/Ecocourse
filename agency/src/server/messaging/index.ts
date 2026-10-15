import { getEnv } from "../env";
import { SimulatedProvider } from "./simulated";
import type { MessagingProvider } from "./types";
import { WhatsAppCloudProvider } from "./whatsapp";

let provider: MessagingProvider | undefined;

export function getMessagingProvider(): MessagingProvider {
  if (provider) return provider;
  const env = getEnv();
  provider =
    env.MESSAGING_PROVIDER === "whatsapp"
      ? new WhatsAppCloudProvider({ accessToken: env.WHATSAPP_ACCESS_TOKEN!, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID!, apiVersion: env.WHATSAPP_GRAPH_API_VERSION })
      : new SimulatedProvider();
  return provider;
}

export function setMessagingProviderForTests(p: MessagingProvider | undefined) {
  provider = p;
}
