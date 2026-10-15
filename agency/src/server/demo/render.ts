import { readFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoPage } from "../../demo-templates/page";
import { buildCss } from "../../demo-templates/styles";
import { sha1 } from "../crypto";
import { FONT_PAIRS, type DemoConfig } from "./schema";

export type ArtifactFile = { path: string; contentType: string; content: Buffer; sha1: string };

export const RUNTIME_DIR = () => process.env.DEMO_RUNTIME_DIR ?? path.join(process.cwd(), "public", "demo-runtime");
export const ALLOWED_SCRIPTS = ["./assets/boot.js", "./assets/runtime.js"];
export const FONT_ORIGINS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"];

/** Security headers for hosts that read a `_headers` file (Netlify). The local preview route sets the same headers. */
export const PREVIEW_HEADERS: Record<string, string> = {
  "Content-Security-Policy": `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'`,
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const file = (p: string, contentType: string, content: Buffer | string): ArtifactFile => {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  return { path: p, contentType, content: buf, sha1: sha1(buf) };
};

/** Renders a validated config into a static site (index.html + assets). Pure data in, files out. */
export async function renderDemoSite(config: DemoConfig, opts: { studioName: string; logo?: { ext: string; mime: string; bytes: Buffer } | null; model?: boolean }): Promise<ArtifactFile[]> {
  const fontsHref = `https://fonts.googleapis.com/css2?${FONT_PAIRS[config.fonts].google}&display=swap`;
  const logoFile = opts.logo ? `logo.${opts.logo.ext}` : null;
  const modelFile = opts.model ? "sneaker.glb" : null;
  const markup = renderToStaticMarkup(createElement(DemoPage, { config, studioName: opts.studioName, fontsHref, logoFile, modelFile }));
  const dir = RUNTIME_DIR();
  const read = (name: string) => readFile(path.join(dir, name));
  const files: ArtifactFile[] = [
    file("index.html", "text/html; charset=utf-8", `<!doctype html>${markup}`),
    file("assets/site.css", "text/css; charset=utf-8", buildCss(config)),
    file("assets/boot.js", "text/javascript; charset=utf-8", await read("boot.js")),
    file("assets/runtime.js", "text/javascript; charset=utf-8", await read("runtime.js")),
    file("robots.txt", "text/plain; charset=utf-8", "User-agent: *\nDisallow: /\n"),
    file("_headers", "text/plain; charset=utf-8", `/*\n${Object.entries(PREVIEW_HEADERS).map(([k, v]) => `  ${k}: ${v}`).join("\n")}\n`),
  ];
  if (config.three !== "none") files.push(file("assets/scene.js", "text/javascript; charset=utf-8", await read("scene.js")));
  if (modelFile) files.push(file(`assets/${modelFile}`, "model/gltf-binary", await read("sneaker.glb")));
  if (opts.logo && logoFile) files.push(file(`assets/${logoFile}`, opts.logo.mime, opts.logo.bytes));
  return files;
}
