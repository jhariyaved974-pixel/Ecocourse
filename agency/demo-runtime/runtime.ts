import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

declare global {
  interface Window {
    __demoRuntime?: boolean;
  }
}

window.__demoRuntime = true;
const root = document.documentElement;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

function splitWords(el: HTMLElement) {
  // Splits text nodes only (content is plain text from the template).
  const words = (el.textContent ?? "").split(/\s+/).filter(Boolean);
  el.textContent = "";
  words.forEach((w, i) => {
    const span = document.createElement("span");
    span.className = "w";
    span.textContent = w;
    el.appendChild(span);
    if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
  });
  return el.querySelectorAll<HTMLElement>(".w");
}

function initMotion() {
  gsap.registerPlugin(ScrollTrigger);
  const title = document.querySelector<HTMLElement>("[data-split]");
  const words = title ? splitWords(title) : [];
  const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
  tl.from(".site-header", { y: -30, opacity: 0, duration: 0.9 })
    .from(words, { yPercent: 110, rotateX: -40, opacity: 0, duration: 1.2, stagger: 0.06 }, "-=0.5")
    .to("[data-hero-item]", { opacity: 1, duration: 0.01 }, "<")
    .from("[data-hero-item]", { y: 24, opacity: 0, duration: 1, stagger: 0.12 }, "-=0.9")
    .from(".float-card", { y: 60, opacity: 0, scale: 0.9, duration: 1.4, stagger: 0.12 }, "-=1");

  ScrollTrigger.batch("[data-reveal]", {
    start: "top 88%",
    once: true,
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1, ease: "power3.out", stagger: 0.08 }),
  });

  // Scroll parallax for layered depth.
  gsap.utils.toArray<HTMLElement>("[data-depth]").forEach((el) => {
    const depth = Number(el.dataset.depth ?? 0.2);
    gsap.to(el, { yPercent: -40 * depth, ease: "none", scrollTrigger: { trigger: el.closest("section") ?? el, start: "top bottom", end: "bottom top", scrub: true } });
  });

  if (finePointer) {
    // Pointer parallax in the hero.
    const hero = document.querySelector<HTMLElement>(".hero");
    const layers = gsap.utils.toArray<HTMLElement>(".hero [data-depth]");
    hero?.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      layers.forEach((l) => {
        const d = Number(l.dataset.depth ?? 0.2);
        gsap.to(l, { x: x * 60 * d, y: y * 40 * d, duration: 1.2, ease: "power3.out", overwrite: "auto" });
      });
    });
    // 3D tilt on cards.
    document.querySelectorAll<HTMLElement>(".tilt").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        gsap.to(card, { rotateY: x * 10, rotateX: -y * 10, transformPerspective: 900, duration: 0.5, ease: "power2.out" });
      });
      card.addEventListener("pointerleave", () => gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.8, ease: "elastic.out(1, 0.5)" }));
    });
  }
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

function init3d() {
  const stage = document.querySelector<HTMLElement>(".stage3d");
  if (!stage?.dataset.scene) return;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  const data = JSON.parse(stage.dataset.scene) as { mode: string };
  if (reduced || data.mode === "none" || nav.connection?.saveData || (nav.deviceMemory ?? 4) < 2 || !webglAvailable()) return;
  const io = new IntersectionObserver(
    async (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      try {
        const sceneUrl = new URL("./scene.js", import.meta.url).href;
        const mod = (await import(/* @vite-ignore */ sceneUrl)) as { mount: (el: HTMLElement, data: unknown, onReady: () => void, onFail: () => void) => void };
        mod.mount(
          stage,
          data,
          () => stage.closest(".hero")?.classList.add("is-3d-ready"),
          () => stage.closest(".hero")?.classList.remove("is-3d-ready"),
        );
      } catch {
        /* the CSS 3D fallback stays visible */
      }
    },
    { rootMargin: "200px" },
  );
  io.observe(stage);
}

function initForms() {
  document.querySelectorAll<HTMLFormElement>("[data-demo-form]").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      form.querySelector(".form-note")?.classList.add("is-active");
    });
  });
  document.querySelectorAll<HTMLAnchorElement>(".nav-mobile a").forEach((a) =>
    a.addEventListener("click", () => a.closest("details")?.removeAttribute("open")),
  );
}

initForms();
if (!reduced) initMotion();
else root.classList.remove("motion-ok");
init3d();
