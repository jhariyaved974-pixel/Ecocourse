// Browser entry for the textile renders: exposes window.runTextileJob, which
// draws one image and returns it as a PNG data URL (see scripts/render/run.mjs).

import { canvas, ctx2d } from './cloth';
import { blouseBack, blouseDetail, blouseFront, sariDetail, sariDrape, sariFold, type BlouseSubject, type SariSubject } from './scenes';
import { renderSiteScene, type SiteJob } from './site';

export type TextileJob =
  | { kind: 'sari'; view: 'fold' | 'drape' | 'detail'; subject: SariSubject; width: number; height: number }
  | { kind: 'blouse'; view: 'front' | 'back' | 'detail'; subject: BlouseSubject; width: number; height: number }
  | ({ kind: 'site' } & SiteJob);

declare global {
  interface Window {
    runTextileJob: (job: TextileJob) => string;
    textilesReady: boolean;
  }
}

window.runTextileJob = (job) => {
  const cv = canvas(job.width, job.height);
  const c = ctx2d(cv);
  if (job.kind === 'sari') {
    ({ fold: sariFold, drape: sariDrape, detail: sariDetail })[job.view](c, job.width, job.height, job.subject);
  } else if (job.kind === 'blouse') {
    ({ front: blouseFront, back: blouseBack, detail: blouseDetail })[job.view](c, job.width, job.height, job.subject);
  } else {
    renderSiteScene(c, job);
  }
  return cv.toDataURL('image/png');
};
window.textilesReady = true;
