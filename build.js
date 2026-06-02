#!/usr/bin/env node
/* Regenerates derived artifacts from the events[] array in index.html:
   - events.ics            (calendar subscription feed; upcoming events only)
   - sitemap.xml           (SEO)
   - static JSON-LD        (injected between <!--JSONLD:START--> ... :END-->)
   - no-JS event list      (injected between <!--SEOLIST:START--> ... :END-->)
   Run after editing events; commit the results. */
const fs = require('fs');
const FILE = 'index.html';
const SITE = 'https://events.alexandrudan.com';

let html = fs.readFileSync(FILE, 'utf8');
const m = html.match(/const events=(\[[\s\S]*?\n\]);/);
if (!m) { console.error('events array not found'); process.exit(1); }
const events = eval('(' + m[1] + ')');

const today = new Date(); today.setHours(0, 0, 0, 0);
const up = events
  .filter(e => new Date(e.end + 'T00:00:00') >= today)
  .sort((a, b) => a.start.localeCompare(b.start));

const pad = n => String(n).padStart(2, '0');
const ymd = s => s.replace(/-/g, '');
const plusDay = s => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + 1); return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); };
const escICS = s => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
const now = new Date();
const stamp = '' + now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';

/* events.ics */
const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Romania Tech Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
  'X-WR-CALNAME:Romania Tech Events', 'X-WR-CALDESC:Upcoming technology events in Romania', 'REFRESH-INTERVAL;VALUE=DURATION:P1D', 'X-PUBLISHED-TTL:P1D'];
up.forEach(e => ics.push('BEGIN:VEVENT',
  'UID:' + (e.short || e.name).replace(/\W+/g, '-').toLowerCase() + '-' + ymd(e.start) + '@events.alexandrudan.com',
  'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ymd(e.start), 'DTEND;VALUE=DATE:' + plusDay(e.end),
  'SUMMARY:' + escICS(e.name), 'LOCATION:' + escICS((e.venue ? e.venue + ', ' : '') + e.city + ', Romania'),
  'DESCRIPTION:' + escICS(e.desc + ' ' + e.url), 'URL:' + e.url, 'END:VEVENT'));
ics.push('END:VCALENDAR');
fs.writeFileSync('events.ics', ics.join('\r\n') + '\r\n');

/* sitemap.xml */
const iso = new Date().toISOString().slice(0, 10);
fs.writeFileSync('sitemap.xml',
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  '  <url><loc>' + SITE + '/</loc><lastmod>' + iso + '</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n</urlset>\n');

/* static JSON-LD */
const graph = [{ '@type': 'WebSite', name: 'Romania Tech Events', url: SITE + '/', inLanguage: 'en' }];
up.forEach(e => graph.push({
  '@type': 'Event', name: e.name, startDate: e.start, endDate: e.end,
  eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  location: { '@type': 'Place', name: e.venue || e.city, address: { '@type': 'PostalAddress', addressLocality: e.city, addressCountry: 'RO' } },
  description: e.desc, url: e.url
}));
const jsonld = '<script type="application/ld+json">' + JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }) + '<\/script>';
html = html.replace(/<!--JSONLD:START-->[\s\S]*?<!--JSONLD:END-->/, '<!--JSONLD:START-->' + jsonld + '<!--JSONLD:END-->');

/* no-JS event list */
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const escH = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtDate = e => {
  const [y, mo, d] = e.start.split('-').map(Number), [, emo, ed] = e.end.split('-').map(Number);
  if (e.start === e.end) return MON[mo - 1] + ' ' + d + ', ' + y;
  if (mo === emo) return MON[mo - 1] + ' ' + d + '–' + ed + ', ' + y;
  return MON[mo - 1] + ' ' + d + ' – ' + MON[emo - 1] + ' ' + ed + ', ' + y;
};
const lis = up.map(e => '<li>' + escH(e.name) + ' — ' + escH(fmtDate(e)) + ', ' + escH(e.city) + ' (' + escH(e.type) + '). ' + escH(e.desc) + ' <a href="' + escH(e.url) + '">' + escH(e.url) + '</a></li>').join('');
const seolist = '<noscript><h2>Upcoming tech events in Romania</h2><ul>' + lis + '</ul></noscript>';
html = html.replace(/<!--SEOLIST:START-->[\s\S]*?<!--SEOLIST:END-->/, '<!--SEOLIST:START-->' + seolist + '<!--SEOLIST:END-->');

fs.writeFileSync(FILE, html);
console.log('build ok: ' + up.length + ' upcoming events → events.ics, sitemap.xml, JSON-LD, no-JS list');
