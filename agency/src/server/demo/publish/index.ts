import { getEnv } from "../../env";
import type { ArtifactFile } from "../render";
import { NetlifyPublisher } from "./netlify";

export type PublishResult = { url: string; providerDeployId: string | null };

export interface PreviewPublisher {
  readonly name: "local" | "netlify";
  publish(input: { slug: string; files: ArtifactFile[] }): Promise<PublishResult>;
}

/** Local publisher: artifacts already live in the database and are served by this app at /p/<slug>/. */
export class LocalPublisher implements PreviewPublisher {
  readonly name = "local" as const;
  constructor(private appUrl: string) {}
  async publish({ slug }: { slug: string }) {
    return { url: `${this.appUrl.replace(/\/$/, "")}/p/${slug}/`, providerDeployId: null };
  }
}

let publisher: PreviewPublisher | undefined;
export function getPublisher(): PreviewPublisher {
  if (publisher) return publisher;
  const env = getEnv();
  publisher = env.PREVIEW_PUBLISHER === "netlify" ? new NetlifyPublisher(env.NETLIFY_AUTH_TOKEN!, env.NETLIFY_SITE_ID!) : new LocalPublisher(env.APP_URL);
  return publisher;
}
export function setPublisherForTests(p: PreviewPublisher | undefined) {
  publisher = p;
}
