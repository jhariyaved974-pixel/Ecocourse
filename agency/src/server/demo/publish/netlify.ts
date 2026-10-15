import type { ArtifactFile } from "../render";
import type { PreviewPublisher, PublishResult } from "./index";

/**
 * Netlify publisher using the file-digest deploy API: each demo becomes its own (draft) deploy of one
 * preview site, so every lead gets a unique URL without creating a new site per lead.
 * https://docs.netlify.com/api/get-started/#file-digest-method
 * STATUS: implemented, not yet tested against a real Netlify account (requires NETLIFY_AUTH_TOKEN + NETLIFY_SITE_ID).
 */
export class NetlifyPublisher implements PreviewPublisher {
  readonly name = "netlify" as const;
  constructor(
    private token: string,
    private siteId: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async api(path: string, init: RequestInit) {
    const res = await this.fetchImpl(`https://api.netlify.com/api/v1${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Netlify API ${init.method ?? "GET"} ${path} failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json() as Promise<Record<string, unknown>>;
  }

  async publish({ slug, files }: { slug: string; files: ArtifactFile[] }): Promise<PublishResult> {
    const digest = Object.fromEntries(files.map((f) => [`/${f.path}`, f.sha1]));
    const deploy = await this.api(`/sites/${this.siteId}/deploys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: digest, draft: true, title: `demo ${slug}` }),
    });
    const id = String(deploy.id);
    const required = new Set((deploy.required as string[] | undefined) ?? []);
    for (const f of files) {
      if (!required.has(f.sha1)) continue;
      await this.api(`/deploys/${id}/files/${f.path.split("/").map(encodeURIComponent).join("/")}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array(f.content),
      });
    }
    for (let i = 0; i < 30; i++) {
      const d = await this.api(`/deploys/${id}`, { method: "GET" });
      if (d.state === "ready") return { url: String(d.deploy_ssl_url ?? d.ssl_url), providerDeployId: id };
      if (d.state === "error") throw new Error(`Netlify deploy ${id} failed: ${String(d.error_message ?? "unknown error")}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`Netlify deploy ${id} did not become ready in time`);
  }
}
