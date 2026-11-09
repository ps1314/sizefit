// Cookie-free usage counting via GoatCounter. Only event names are sent (e.g. "format/aftership",
// "rows/50-500") — never file names, CSV contents or anything typed by the user.
// With CONFIG.goatcounterCode empty, nothing is loaded and track() does nothing.

import { CONFIG } from './config.js';

const code = (CONFIG.goatcounterCode || '').trim();
export const trackingEnabled = /^[a-z0-9-]+$/i.test(code);
const queue = [];

if (trackingEnabled) {
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  s.onload = () => { while (queue.length) send(queue.shift()); };
  document.head.appendChild(s);
}

function send(name) {
  window.goatcounter.count({ path: name, title: name, event: true });
}

export function track(name) {
  if (!trackingEnabled) return;
  if (window.goatcounter?.count) send(name);
  else queue.push(name);
}

export const rowBucket = n => (n < 50 ? '<50' : n <= 500 ? '50-500' : '500+');
