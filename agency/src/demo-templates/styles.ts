import { mix } from "../server/demo/color";
import { FONT_PAIRS, type DemoConfig } from "../server/demo/schema";

/** Builds the per-demo stylesheet: theme variables from the validated palette + fixed template CSS. */
export function buildCss(config: DemoConfig): string {
  const p = config.palette;
  const f = FONT_PAIRS[config.fonts];
  const vars = `:root{--bg:${p.bg};--surface:${p.surface};--text:${p.text};--muted:${p.muted};--primary:${p.primary};--on-primary:${p.onPrimary};--accent:${p.accent};--line:${mix(p.text, p.bg, 0.86)};--soft:${mix(p.primary, p.bg, 0.88)};--font-display:"${f.display}",Georgia,serif;--font-body:"${f.body}",system-ui,-apple-system,"Segoe UI",sans-serif;}`;
  return [vars, BASE, FAMILY[config.family]].join("\n");
}

const BASE = /* css */ `
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-body);font-size:17px;line-height:1.6;overflow-x:hidden;-webkit-font-smoothing:antialiased}
img,svg{display:block;max-width:100%}
a{color:inherit}
h1,h2,h3{font-family:var(--font-display);line-height:1.08;margin:0;letter-spacing:-.01em}
p{margin:0}
ul,ol{margin:0;padding:0;list-style:none}
.wrap{width:min(1180px,100% - 32px);margin-inline:auto}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.skip{position:absolute;left:-999px;top:8px;z-index:100;background:var(--primary);color:var(--on-primary);padding:8px 14px;border-radius:8px}
.skip:focus{left:16px}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:6px}

.demo-ribbon{position:sticky;top:0;z-index:60;display:flex;gap:12px;align-items:center;justify-content:center;padding:7px 16px;background:#111;color:#fff;font:600 12.5px/1.3 system-ui,sans-serif;letter-spacing:.01em;text-align:center}
.demo-pill{display:inline-flex;align-items:center;gap:6px;background:#ffd43b;color:#111;padding:3px 10px;border-radius:99px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;white-space:nowrap}
.demo-ribbon-text{opacity:.85}
@media (max-width:640px){.demo-ribbon-text{display:none}}

.site-header{position:sticky;top:30px;z-index:50;backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);background:color-mix(in srgb,var(--bg) 78%,transparent);border-bottom:1px solid var(--line)}
.header-inner{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:68px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:700}
.brand-mark{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--primary);color:var(--on-primary);font:700 15px/1 var(--font-body);letter-spacing:.04em}
.brand-logo{width:40px;height:40px;object-fit:contain;border-radius:10px}
.brand-name{font-family:var(--font-display);font-size:20px}
.nav-desktop{display:flex;align-items:center;gap:26px;font-size:15px}
.nav-desktop a:not(.btn){text-decoration:none;color:var(--muted);transition:color .2s}
.nav-desktop a:not(.btn):hover{color:var(--text)}
.nav-mobile{display:none;position:relative}
.nav-mobile summary{list-style:none;cursor:pointer;padding:9px 14px;border:1px solid var(--line);border-radius:10px;font-weight:600;font-size:14px}
.nav-mobile summary::-webkit-details-marker{display:none}
.nav-mobile nav{position:absolute;right:0;top:calc(100% + 8px);display:grid;gap:4px;min-width:200px;padding:10px;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.18)}
.nav-mobile nav a{padding:10px 12px;border-radius:8px;text-decoration:none}
.nav-mobile nav a:hover{background:var(--soft)}
@media (max-width:860px){.nav-desktop{display:none}.nav-mobile{display:block}}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:12px 22px;border-radius:var(--btn-radius,999px);border:1px solid transparent;font:600 16px/1 var(--font-body);text-decoration:none;cursor:pointer;transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s,background .25s}
.btn:hover{transform:translateY(-2px)}
.btn-sm{min-height:40px;padding:9px 16px;font-size:14px}
.btn-primary{background:var(--primary);color:var(--on-primary);box-shadow:0 10px 30px -10px color-mix(in srgb,var(--primary) 70%,transparent)}
.btn-ghost{background:transparent;color:var(--text);border-color:var(--line)}

.eyebrow{font:600 13px/1.2 var(--font-body);letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:14px}
.section{padding:clamp(72px,10vw,128px) 0;position:relative}
.section-head{max-width:720px;margin-bottom:48px}
.section-title{font-size:clamp(32px,4.6vw,54px)}
.section-intro{color:var(--muted);margin-top:16px;font-size:18px}
.lead{font-size:clamp(18px,1.6vw,21px);color:var(--muted)}

.hero{position:relative;overflow:hidden;padding:clamp(56px,9vw,120px) 0 clamp(64px,9vw,110px);isolation:isolate}
.hero-inner{position:relative;display:grid;gap:48px;align-items:center}
.hero--split .hero-inner{grid-template-columns:1.05fr .95fr}
.hero--centered .hero-inner,.hero--full-bleed .hero-inner{grid-template-columns:1fr;text-align:center}
.hero--centered .hero-copy,.hero--full-bleed .hero-copy{max-width:880px;margin-inline:auto;position:relative;z-index:2}
.hero--centered .hero-ctas,.hero--full-bleed .hero-ctas{justify-content:center}
.hero--centered .hero-visual,.hero--full-bleed .hero-visual{position:absolute;inset:-10% -5%;z-index:0;opacity:.9}
.hero--full-bleed{min-height:min(92vh,880px);display:grid;align-items:center}
.hero-title{font-size:clamp(44px,7.4vw,104px);font-weight:700;margin-bottom:22px;text-wrap:balance}
.hero-title .w{display:inline-block;will-change:transform}
.hero-sub{font-size:clamp(18px,1.8vw,22px);color:var(--muted);max-width:620px;text-wrap:pretty}
.hero--centered .hero-sub,.hero--full-bleed .hero-sub{margin-inline:auto}
.hero-ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}
.hero-bg{position:absolute;inset:0;z-index:-1;pointer-events:none}
.blob{position:absolute;border-radius:50%;filter:blur(70px);opacity:.55}
.blob-a{width:520px;height:520px;background:var(--primary);top:-160px;right:-120px}
.blob-b{width:420px;height:420px;background:var(--accent);bottom:-180px;left:-120px;opacity:.35}
.grain{position:absolute;inset:0;opacity:.06;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}

.hero-visual{position:relative;min-height:420px;perspective:1200px}
.stage3d{position:absolute;inset:0}
.stage3d canvas{width:100%!important;height:100%!important;display:block}
.fallback3d{position:absolute;inset:0;transform-style:preserve-3d;transition:opacity .8s}
.is-3d-ready .fallback3d{opacity:0}
.float-card{position:absolute;display:flex;align-items:center;gap:12px;padding:18px 20px;border-radius:20px;background:color-mix(in srgb,var(--surface) 82%,transparent);border:1px solid var(--line);box-shadow:0 30px 60px -20px rgba(0,0,0,.35);backdrop-filter:blur(10px);font-weight:600;animation:float 7s ease-in-out infinite}
.fc-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:var(--primary);color:var(--on-primary)}
.fc-0{top:12%;left:8%;transform:rotateY(-14deg) rotateX(6deg) translateZ(60px)}
.fc-1{top:44%;right:4%;transform:rotateY(12deg) rotateX(-4deg) translateZ(120px);animation-delay:-2s}
.fc-2{bottom:8%;left:22%;transform:rotateY(-6deg) rotateX(8deg) translateZ(30px);animation-delay:-4s}
.hero--centered .fallback3d,.hero--full-bleed .fallback3d{opacity:.35}
@keyframes float{50%{translate:0 -14px}}

.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:22px}
.card{position:relative;display:flex;flex-direction:column;border-radius:var(--radius,20px);background:var(--surface);border:1px solid var(--line);overflow:hidden;transform-style:preserve-3d;transition:transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s}
.card:hover{box-shadow:0 30px 60px -30px rgba(0,0,0,.4)}
.card-art{position:relative;display:grid;place-items:center;aspect-ratio:16/10;background:radial-gradient(120% 90% at 20% 10%,color-mix(in srgb,var(--primary) 55%,transparent),transparent 60%),radial-gradient(90% 90% at 90% 90%,color-mix(in srgb,var(--accent) 45%,transparent),transparent 60%),var(--soft);color:var(--text)}
.card-art svg{width:56px;height:56px;opacity:.9;transform:translateZ(40px)}
.card-index{position:absolute;top:14px;left:16px;font:600 13px/1 var(--font-body);opacity:.65}
.card-body{padding:20px 22px 24px;display:grid;gap:8px}
.card-tags{display:flex;gap:6px;flex-wrap:wrap}
.tag{font:600 11px/1 var(--font-body);letter-spacing:.06em;text-transform:uppercase;padding:6px 9px;border-radius:99px;background:var(--soft);color:var(--text)}
.tag-sample{background:transparent;border:1px dashed var(--muted);color:var(--muted)}
.card-title{font-size:22px}
.card-text{color:var(--muted);font-size:16px}

.about-grid{display:grid;grid-template-columns:.9fr 1.1fr;gap:clamp(24px,6vw,96px);align-items:start}
.highlight-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:22px}
.highlight{padding:28px;border-radius:var(--radius,20px);border:1px solid var(--line);background:color-mix(in srgb,var(--surface) 60%,transparent)}
.highlight h3{font-size:22px;margin:16px 0 8px}
.highlight p{color:var(--muted)}
.highlight-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:var(--primary);color:var(--on-primary)}

.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:22px;counter-reset:s}
.step{display:grid;grid-template-columns:auto 1fr;gap:16px;padding:24px;border-top:2px solid var(--primary)}
.step h3{font-size:21px;margin-bottom:6px}
.step p{color:var(--muted)}
.step-num{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;border:1px solid var(--line);font:700 17px/1 var(--font-body);color:var(--primary)}

.gallery-grid{display:grid;grid-template-columns:repeat(6,1fr);grid-auto-rows:150px;gap:16px}
.tile{position:relative;margin:0;border-radius:var(--radius,20px);overflow:hidden;background:linear-gradient(135deg,color-mix(in srgb,var(--primary) 70%,var(--bg)),color-mix(in srgb,var(--accent) 60%,var(--bg)));display:grid;place-items:center;color:var(--on-primary)}
.tile-art{opacity:.55}
.tile figcaption{position:absolute;left:14px;bottom:12px;font:600 12px/1 var(--font-body);letter-spacing:.08em;text-transform:uppercase;opacity:.85}
.tile-0{grid-column:span 3;grid-row:span 2}.tile-1{grid-column:span 3}.tile-2{grid-column:span 2}.tile-3{grid-column:span 1}.tile-4{grid-column:span 6;grid-row:span 1}
@media (max-width:720px){.gallery-grid{grid-template-columns:repeat(2,1fr);grid-auto-rows:140px}.tile-0,.tile-1,.tile-2,.tile-3,.tile-4{grid-column:span 1;grid-row:span 1}.tile-0{grid-column:span 2}}

.faq-grid{display:grid;grid-template-columns:.8fr 1.2fr;gap:clamp(24px,6vw,80px)}
.faq-list{display:grid;gap:12px}
.faq-item{border:1px solid var(--line);border-radius:16px;padding:4px 20px;background:var(--surface)}
.faq-item summary{cursor:pointer;padding:16px 0;font-weight:600;list-style:none;display:flex;justify-content:space-between;gap:12px}
.faq-item summary::after{content:"+";font-size:22px;line-height:1;color:var(--primary)}
.faq-item[open] summary::after{content:"–"}
.faq-item p{padding:0 0 18px;color:var(--muted)}

.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(24px,6vw,80px);align-items:start}
.demo-form{display:grid;gap:14px;padding:28px;border-radius:var(--radius,22px);background:var(--surface);border:1px solid var(--line);box-shadow:0 30px 70px -40px rgba(0,0,0,.45)}
.demo-form label{display:grid;gap:6px;font-weight:600;font-size:14px}
.demo-form input,.demo-form textarea{font:inherit;font-weight:400;font-size:16px;color:var(--text);background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:12px 14px;min-height:48px}
.form-note{font-size:13px;color:var(--muted)}
.form-note.is-active{color:var(--accent);font-weight:600}

.site-footer{padding:48px 0 64px;border-top:1px solid var(--line)}
.footer-inner{display:grid;grid-template-columns:1fr 1.4fr;gap:28px;align-items:start}
.footer-small{font-size:14px;color:var(--muted);margin-top:6px}

@media (max-width:900px){
  .hero--split .hero-inner,.about-grid,.faq-grid,.contact-grid,.footer-inner{grid-template-columns:1fr}
  .hero-visual{min-height:320px}
  .hero--split .hero-visual{order:-1;min-height:300px}
}
@media (max-width:520px){body{font-size:16px}.hero-ctas .btn{flex:1 1 100%}}

.motion-ok [data-reveal]{opacity:0;transform:translateY(28px)}
.motion-ok [data-hero-item]{opacity:0}
.marquee{overflow:hidden;border-block:1px solid var(--line);margin-top:56px;padding:18px 0}
.marquee-track{display:flex;gap:48px;width:max-content;animation:marquee 32s linear infinite;font:500 clamp(22px,3vw,36px)/1 var(--font-display);color:var(--muted)}
.marquee-track span{display:inline-flex;align-items:center;gap:24px;white-space:nowrap}
@keyframes marquee{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.motion-ok [data-reveal],.motion-ok [data-hero-item]{opacity:1;transform:none}}
`;

const FAMILY: Record<DemoConfig["family"], string> = {
  editorial: /* css */ `
.family-editorial{--radius:4px;--btn-radius:2px}
.family-editorial .hero-title{font-weight:600;font-style:italic;letter-spacing:-.025em}
.family-editorial .hero--full-bleed::before{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(80% 70% at 50% 30%,color-mix(in srgb,var(--primary) 26%,transparent),transparent 70%),linear-gradient(180deg,transparent 40%,var(--bg) 100%)}
.family-editorial .section-title{font-weight:600}
.family-editorial .card{border-radius:4px;border-width:0 0 1px;background:transparent}
.family-editorial .card-art{aspect-ratio:4/5;border-radius:4px}
.family-editorial .card-title{font-size:26px;font-style:italic}
.family-editorial .highlight{border-width:1px 0 0;border-radius:0;background:transparent;padding:24px 0}
.family-editorial .eyebrow{color:var(--primary)}
.family-editorial .blob{opacity:.25}
`,
  showcase: /* css */ `
.family-showcase{--radius:24px}
.family-showcase .hero-title{background:linear-gradient(100deg,var(--text) 30%,color-mix(in srgb,var(--accent) 70%,var(--text)) 70%);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:800;letter-spacing:-.035em}
.family-showcase .blob{opacity:.6;animation:drift 18s ease-in-out infinite alternate}
.family-showcase .blob-b{animation-duration:23s}
@keyframes drift{to{transform:translate(-60px,40px) scale(1.15)}}
.family-showcase .card{background:linear-gradient(160deg,color-mix(in srgb,var(--surface) 92%,var(--primary)),var(--surface));box-shadow:inset 0 1px 0 color-mix(in srgb,var(--text) 10%,transparent)}
.family-showcase .card-art{background:radial-gradient(60% 60% at 50% 45%,color-mix(in srgb,var(--primary) 60%,transparent),transparent 70%),radial-gradient(50% 50% at 80% 80%,color-mix(in srgb,var(--accent) 50%,transparent),transparent 70%),color-mix(in srgb,var(--bg) 70%,var(--surface))}
.family-showcase .btn-primary{background:linear-gradient(120deg,var(--primary),color-mix(in srgb,var(--primary) 55%,var(--accent)))}
.family-showcase .highlight{background:color-mix(in srgb,var(--surface) 70%,transparent);backdrop-filter:blur(8px)}
.family-showcase .step{border:1px solid var(--line);border-radius:20px;background:var(--surface)}
`,
  corporate: /* css */ `
.family-corporate{--radius:16px;--btn-radius:12px}
.family-corporate .hero::before{content:"";position:absolute;inset:0;z-index:-1;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:56px 56px;mask-image:radial-gradient(70% 60% at 50% 30%,#000 30%,transparent 80%)}
.family-corporate .blob{opacity:.18}
.family-corporate .hero-title{font-weight:600;letter-spacing:-.03em}
.family-corporate .card{box-shadow:0 1px 2px rgba(15,23,42,.06)}
.family-corporate .card-art{aspect-ratio:auto;padding:26px 22px 0;place-items:start;background:none;color:var(--primary)}
.family-corporate .card-art svg{width:40px;height:40px}
.family-corporate .card-index{position:static;margin-bottom:12px}
.family-corporate .steps{grid-template-columns:1fr;max-width:820px;gap:0;border-left:2px solid var(--line);margin-left:20px}
.family-corporate .step{border-top:0;padding:18px 0 18px 32px;position:relative}
.family-corporate .step-num{position:absolute;left:-23px;top:18px;background:var(--bg)}
`,
  earthy: /* css */ `
.family-earthy{--radius:30px}
.family-earthy body,.family-earthy{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.65' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0.3 0 0 0 0 0.25 0 0 0 0 0.15 0 0 0 .07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23p)'/%3E%3C/svg%3E")}
.family-earthy .hero-title{font-weight:600}
.family-earthy .blob{border-radius:42% 58% 63% 37%/41% 44% 56% 59%;opacity:.3}
.family-earthy .card{border-radius:30px 30px 30px 6px}
.family-earthy .card-art{background:linear-gradient(160deg,color-mix(in srgb,var(--primary) 30%,var(--surface)),color-mix(in srgb,var(--accent) 25%,var(--surface)))}
.family-earthy .section.highlights,.family-earthy .section.faq{background:color-mix(in srgb,var(--primary) 7%,transparent)}
.family-earthy .section.highlights::before{content:"";position:absolute;left:0;right:0;top:-1px;height:40px;background:var(--bg);clip-path:ellipse(60% 100% at 50% 0)}
.family-earthy .highlight{border:0;background:var(--surface);border-radius:28px}
.family-earthy .tile{border-radius:40px 8px 40px 8px}
`,
};
