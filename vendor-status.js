/* ======================================================================
   TDX Client Portal — Vendor Status Strip (batches 1 + 2)
   ======================================================================
   Renders live vendor status on the Outages page by fetching public
   Statuspage v2 APIs directly from the visitor's browser. No server, no
   credentials.

   BUILT IN TWO LAYERS ON PURPOSE:

     1. fetch/normalize  - turns each vendor response into the shape
                           defined in Snapshot-Schema.md
     2. render           - reads ONLY that shape and knows nothing about
                           Statuspage

   At stage 3 the first layer is replaced by a single fetch of a snapshot
   published by the hosted app, and the render layer is untouched. Do not
   let Statuspage-specific fields leak past normalize().

   Module HTML must include:
     <div class="its-vendor-status">...placeholder...</div>

   Adding a vendor is a SERVICES entry, not code. Batches 1 and 2 are both
   in. Cloudflare was expected to need new code because it uses
   components.json rather than summary.json; it did not, because the filter
   branch never reads a top-level status. Batch 3 (M365 via Graph, Uptime
   Kuma probes, TDX ticket volume) needs the stage 3 server.

   TDX renders desktop modules via AJAX after DOMContentLoaded, so we
   poll for the mount point, same as the other portal scripts.

   Sanitizer notes: no id attributes, no <style> blocks, no SVG. All
   styling is inline, all hooks are its- prefixed class names.

   Diagnostic logs are prefixed [TDX Portal: vendor-status].
   ====================================================================== */

(function () {
  'use strict';

  var LOG = '[TDX Portal: vendor-status]';
  var TIMEOUT_MS = 5000;
  var POLL_MS = 250;
  var POLL_TIMEOUT_MS = 30000;

  /* ---------------------------------------------------------------
     CONFIG — ordered by how likely someone is to be looking for it.
     Hand-ordered for now; a TDX ticket-count report by service is the
     intended data source later. Order here is the display order; the
     list never reorders itself at runtime.
     --------------------------------------------------------------- */
  var SERVICES = [
    // BATCH 2. The only source that is not a plain summary.json, yet it needed
    // no new code: components.json has no top-level "status" key, and the
    // filter branch never reads one. Config-driven paid off here.
    //
    // summary.json, not components.json: it carries the SAME 479 components
    // plus the unresolved incidents, which is what gives a filtered service its
    // explanatory detail. The top-level indicator is irrelevant here because the
    // filter branch never reads it, so Cloudflare-wide noise (R2, Workers) cannot
    // reach the VPN row.
    //
    // The ?group=zero-trust in Cloudflare's own URL is a UI filter, not an API
    // grouping; every one of these sits under "Cloudflare Sites and Services".
    // Scoped to the three that decide whether a client can actually connect.
    // Gateway, Access and Tunnel may also belong here depending on how campus
    // Cloudflare One is configured. That is a question for whoever set it up
    // (network, not EAS). Adding them speculatively would reintroduce exactly
    // the over-sensitivity this filter exists to prevent.
    { id: 'vpn', name: 'VPN (Cloudflare WARP)', group: 'Network & WiFi',
      origin: 'Cloudflare Zero Trust',
      url: 'https://www.cloudflarestatus.com/api/v2/summary.json',
      link: 'https://www.cloudflarestatus.com/services?group=zero-trust',
      components: ['WARP', 'Cloudflare One Client', 'Zero Trust'] },

    { id: 'zoom',        name: 'Zoom',        group: 'Email & Collaboration',
      origin: 'Zoom',
      // status.zoom.us 302s to www.zoomstatus.com WITHOUT a CORS header. Browsers
      // CORS-check each redirect hop before following, so the short URL fails
      // permanently in a browser even though curl -L works. Use the final URL.
      url: 'https://www.zoomstatus.com/api/v2/summary.json',
      link: 'https://www.zoomstatus.com' },

    { id: 'handshake',   name: 'Handshake',   group: 'Student Services',
      origin: 'Handshake',
      url: 'https://status.joinhandshake.com/api/v2/summary.json',
      link: 'https://status.joinhandshake.com' },

    { id: 'parchment',   name: 'Parchment (Transcripts)', group: 'Student Services',
      origin: 'Parchment',
      url: 'https://status.parchment.com/api/v2/summary.json',
      link: 'https://status.parchment.com' },

    { id: 'teamdynamix', name: 'Service Portal', group: 'Websites & Portals',
      origin: 'TeamDynamix',
      url: 'https://status.teamdynamix.com/api/v2/summary.json',
      link: 'https://status.teamdynamix.com' },

    // NOT "Banner". Cobleskill's Banner runs at ITEC (cobban280/281), not on
    // Ellucian Cloud, so "Ellucian Banner SaaS" on this feed is a different
    // deployment entirely and would read green while our Banner was down.
    // ITEC publishes no status feed at all, so Banner cannot be covered here.
    // It needs a stage 3 probe. What IS ours on this feed is Ethos, which is
    // integration plumbing rather than something a student uses directly.
    { id: 'ellucian-ethos', name: 'Ellucian Integrations (Ethos)',
      group: 'Infrastructure', origin: 'Ellucian',
      url: 'https://status.elluciancloud.com/api/v2/summary.json',
      link: 'https://status.elluciancloud.com',
      components: ['Ethos Data Access - U.S.', 'Ethos Data Connect - U.S.',
                   'Ethos Extend', 'Ethos Identity Federation Services - US/Canada',
                   'Ethos Integration - U.S.', 'Ethos User Provisioning - US/Canada'] },

    // Uncomment once Cobleskill is live on Experience (see the Experience Prep
    // project). Filtered to the U.S. region; the other three regions are not ours.
    // { id: 'ellucian-experience', name: 'Ellucian Experience',
    //   group: 'Academic Systems', origin: 'Ellucian',
    //   url: 'https://status.elluciancloud.com/api/v2/summary.json',
    //   link: 'https://status.elluciancloud.com',
    //   components: ['Ellucian Experience (U.S.)'] },

    { id: 'forticloud',  name: 'Network Security Management', group: 'Infrastructure',
      origin: 'FortiCloud',
      url: 'https://status.forticloud.com/api/v2/summary.json',
      link: 'https://status.forticloud.com' },

    { id: 'genetec',     name: 'Security Camera Platform', group: 'Infrastructure',
      origin: 'Genetec',
      url: 'https://status.genetec.com/api/v2/summary.json',
      link: 'https://status.genetec.com' }
  ];

  /* ---------------------------------------------------------------
     LINK-OUTS — services we deliberately do NOT claim to monitor.

     Microsoft 365 is the reason this project exists, and it is also the one
     thing stage 2 structurally cannot cover: there is no public JSON, only
     Graph serviceAnnouncement behind an Entra app registration, which is
     stage 3. Showing it as a status row would be a lie; omitting it entirely
     leaves the most-asked-about service unmentioned. So it gets a row that is
     visibly not a monitored one, with somewhere to go.

     Brightspace belongs here too if wanted; its endpoint was never found. One
     more entry, no code change.
     --------------------------------------------------------------- */
  var LINK_OUTS = [
    { name: 'Microsoft 365',
      linkText: 'Check Microsoft',
      link: 'https://status.cloud.microsoft/' }
  ];

  /* ---------------------------------------------------------------
     STATUS MODEL — mirrors Snapshot-Schema.md.
     `unknown` deliberately outranks `outage`: a source we cannot reach
     is not healthy, and "we cannot tell you" must never hide behind
     something we do know.
     Colours verified >= 4.5:1 on white (WCAG AA).
     Glyphs are distinct shapes, not just colours, and are aria-hidden
     because the text label carries the meaning (WCAG 1.4.1).
     --------------------------------------------------------------- */
  var STATUS = {
    operational:    { rank: 0, label: 'Operational',        color: '#6A7431', glyph: '●' },
    maintenance:    { rank: 1, label: 'Maintenance',        color: '#4A5A70', glyph: '◐' },
    degraded:       { rank: 2, label: 'Degraded',           color: '#8A5A00', glyph: '▲' },
    partial_outage: { rank: 3, label: 'Partial outage',     color: '#A34400', glyph: '▲' },
    outage:         { rank: 4, label: 'Outage',             color: '#B02418', glyph: '■' },
    unknown:        { rank: 5, label: 'Status unavailable', color: '#595959', glyph: '○' }
  };

  var STATUSPAGE_MAP = {
    operational: 'operational',
    under_maintenance: 'maintenance',
    degraded_performance: 'degraded',
    partial_outage: 'partial_outage',
    major_outage: 'outage'
  };

  /* =================================================================
     LAYER 1 — FETCH AND NORMALIZE
     Everything Statuspage-specific lives here and nowhere else.
     ================================================================= */

  function fetchWithTimeout(url) {
    // AbortController isn't guaranteed in every browser TDX supports, so
    // race the fetch against a timer rather than relying on it.
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) { settled = true; reject(new Error('timeout')); }
      }, TIMEOUT_MS);

      fetch(url, { credentials: 'omit', mode: 'cors' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (json) {
          if (!settled) { settled = true; clearTimeout(timer); resolve(json); }
        })
        .catch(function (err) {
          if (!settled) { settled = true; clearTimeout(timer); reject(err); }
        });
    });
  }

  var INDICATOR_MAP = {
    none: 'operational', maintenance: 'maintenance', minor: 'degraded',
    major: 'partial_outage', critical: 'outage'
  };

  /** Statuspage summary.json -> one service object in snapshot shape.

      Two modes, chosen per service by config:

      - No `components` filter: use the vendor's own top-level indicator.
        This is the DEFAULT and it matters. Zoom publishes 334 components
        and Banner 92, most of which are products Cobleskill does not run.
        Taking the worst component across all of them would show
        "Zoom: Degraded" because Zoom Contact Center hiccuped in another
        region. The vendor's rollup is less precise but it is not wrong.

      - With a `components` filter: take the worst status among just the
        named components. Precise, and the right choice where we know
        exactly which parts we depend on. Names must match the vendor's
        exactly; a name that never matches is logged so config drift is
        visible rather than silently narrowing the check. */
  function normalizeStatuspage(svc, json) {
    var raw = json && json.status && json.status.indicator;
    var desc = json && json.status && json.status.description;
    var status = 'unknown';
    var usedFilter = !!(svc.components && svc.components.length);
    var filterDetail = null;

    if (usedFilter) {
      var wanted = {};
      svc.components.forEach(function (n) { wanted[n.toLowerCase()] = false; });

      var all = (json && json.components) || [];
      var worst = null;
      for (var i = 0; i < all.length; i++) {
        var key = String(all[i].name || '').toLowerCase();
        if (!(key in wanted)) continue;
        wanted[key] = true;
        // An unrecognized component status must NOT be skipped. Skipping lets
        // the remaining operational components win, so the strip renders green
        // for something we could not actually read. Fail it to unknown, which
        // outranks everything.
        var mapped = STATUSPAGE_MAP[all[i].status] || 'unknown';
        if (worst === null || rankOf(mapped) > rankOf(worst)) worst = mapped;
      }

      // A configured component that is absent from the feed must fail the whole
      // service to unknown, not merely warn. Otherwise a vendor renaming a
      // component WHILE IT IS IN OUTAGE lets the remaining operational ones
      // carry the service to green, which is the exact failure the
      // "never invent green" rule exists to prevent. Losing visibility into one
      // component means we cannot vouch for any of it.
      var missing = Object.keys(wanted).filter(function (n) { return !wanted[n]; });
      if (missing.length) {
        console.warn(LOG, svc.id, 'configured component(s) not found, failing to unknown:',
                     missing.join(', '));
        worst = 'unknown';
      }

      if (worst !== null) status = worst;

      // A filtered service cannot use the page-wide description (it would pair
      // a component-scoped status with text about something else), but leaving
      // it blank means the row says "Degraded" and explains nothing. Instead,
      // take the unresolved incident that actually touches one of OUR
      // components. summary.json carries these; components.json does not.
      if (status !== 'operational' && status !== 'unknown') {
        var incidents = (json && json.incidents) || [];
        for (var n = 0; n < incidents.length; n++) {
          var affected = incidents[n].components || [];
          for (var m = 0; m < affected.length; m++) {
            if (String(affected[m].name || '').toLowerCase() in wanted) {
              filterDetail = String(incidents[n].name || '') || null;
              break;
            }
          }
          if (filterDetail) break;
        }
      }
    } else {
      status = INDICATOR_MAP[raw] || 'unknown';
    }
    // Anything unrecognized stays 'unknown' rather than being passed
    // through, so a vendor adding a status cannot inject an unhandled
    // value into the display.

    return {
      id: svc.id,
      name: svc.name,
      group: svc.group,
      status: status,
      // Only use the vendor's page-wide description when the status came from
      // that same page-wide indicator. In components mode it would pair a
      // component-scoped status with text about something unrelated.
      // Only when the status came from the same page-wide indicator AND that
      // indicator was recognized. 'unknown' means we could not read the feed, so
      // pairing it with the vendor's own prose would be asserting something we
      // do not know.
      detail: usedFilter
        ? filterDetail
        : ((desc && status !== 'operational' && status !== 'unknown') ? String(desc) : null),
      last_checked: new Date().toISOString(),
      link: svc.link,
      signals: [{ source: 'vendor', origin: svc.origin, status: status,
                  observed_at: new Date().toISOString() }]
    };
  }

  function unreachable(svc, reason) {
    console.warn(LOG, svc.id, 'unreachable:', reason);
    return {
      id: svc.id,
      name: svc.name,
      group: svc.group,
      status: 'unknown',
      // Deliberately no reason text on a public page.
      detail: null,
      last_checked: new Date().toISOString(),
      link: svc.link,
      signals: [{ source: 'vendor', origin: svc.origin, status: 'unknown',
                  observed_at: new Date().toISOString() }]
    };
  }

  /* =================================================================
     LAYER 2 — RENDER
     Knows only the snapshot shape. No Statuspage anything below here.
     ================================================================= */

  var FONT = 'Arial, Helvetica, sans-serif';
  var SCHEMA_VERSION = 1;
  var STALE_MINUTES = 15;

  function el(tag, style, text) {
    var n = document.createElement(tag);
    if (style) n.setAttribute('style', style);
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  /* Schema rule 2: stale data must announce itself rather than being shown as
     current. Cannot trigger today (layer 1 stamps "now"), but the render layer
     is meant to survive unchanged into stage 3, where a dead generator would
     otherwise display all day as fresh. */
  function formatStamp(iso) {
    var d = new Date(iso);
    // new Date('garbage') does not throw, it returns Invalid Date, so a
    // try/catch here would be dead code. NaN comparisons are all false, which
    // means an unparseable timestamp would silently render as fresh. Guard
    // explicitly and fail toward "we cannot vouch for this".
    if (!d || isNaN(d.getTime())) {
      return { text: 'Last update time is unknown.', stale: true };
    }
    var ageMin = (Date.now() - d.getTime()) / 60000;
    var when = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    // A timestamp in the future is as untrustworthy as a stale one; clock skew
    // or a broken generator, either way do not present it as current.
    if (ageMin > STALE_MINUTES || ageMin < -STALE_MINUTES) {
      return { text: 'Last updated ' + when + '. This may not reflect current conditions.',
               stale: true };
    }
    return { text: 'Last checked ' + when + '.', stale: false };
  }

  /* status === null means "still checking". */
  function paintRow(parts, status, detail) {
    var meta = (status === null)
      ? { label: 'Checking…', color: '#595959', glyph: '◌' }
      : (STATUS[status] || STATUS.unknown);
    parts.glyph.setAttribute('style', 'display: table-cell; width: 24px; vertical-align: top; ' +
      'color: ' + meta.color + '; font-size: 15px; line-height: 1.5;');
    parts.glyph.textContent = meta.glyph;
    parts.statusCell.setAttribute('style', 'display: table-cell; vertical-align: top; ' +
      'text-align: right; white-space: nowrap; font-size: 15px; font-weight: bold; ' +
      'color: ' + meta.color + '; line-height: 1.5;');
    parts.statusCell.textContent = meta.label;

    // The vendor's own sentence explaining a degradation is the most useful
    // thing on the row when there is one. It was previously carried in the
    // snapshot and then dropped.
    if (parts.detail) {
      if (detail) {
        parts.detail.setAttribute('style', 'display: block; font-size: 13px; ' +
          'color: #595959; line-height: 1.5; margin-top: 2px;');
        parts.detail.textContent = detail;
      } else {
        parts.detail.setAttribute('style', 'display: none;');
        parts.detail.textContent = '';
      }
    }
  }

  function buildRow(svc) {
    var row = el('div', 'display: table; width: 100%; padding: 10px 0; ' +
      'border-bottom: 1px solid #ededed; font-family: ' + FONT + ';');
    // Caller strips the border on the final row so it does not sit directly on
    // the card's own edge.
    row.setAttribute('data-its-row', '1');

    var glyph = el('span', '', '');
    glyph.setAttribute('aria-hidden', 'true');
    row.appendChild(glyph);

    var nameCell = el('span', 'display: table-cell; vertical-align: top; font-size: 15px; ' +
      'color: #333333; line-height: 1.5; padding-right: 12px;');
    if (svc.link) {
      var a = el('a', 'color: #333333; text-decoration: none;', svc.name);
      a.setAttribute('href', svc.link);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      a.setAttribute('title', 'Vendor status page for ' + svc.name + ' (opens in a new tab)');
      nameCell.appendChild(a);
    } else {
      nameCell.textContent = svc.name;
    }
    var detailLine = el('span', 'display: none;', '');
    nameCell.appendChild(detailLine);
    row.appendChild(nameCell);

    var statusCell = el('span', '', '');
    row.appendChild(statusCell);

    var parts = { node: row, glyph: glyph, statusCell: statusCell, detail: detailLine };
    paintRow(parts, null);
    return parts;
  }

  var BAND_PALETTE = {
    problem: 'background-color: #FBF3E8; border-left: 4px solid #A34400;',
    unknown: 'background-color: #F2F2F2; border-left: 4px solid #595959;',
    ok:      'background-color: #F2F5EC; border-left: 4px solid #6A7431;'
  };

  function buildLinkRow(item) {
    var row = el('div', 'display: table; width: 100%; padding: 10px 0; ' +
      'border-bottom: 1px solid #ededed; font-family: ' + FONT + ';');

    var glyph = el('span', 'display: table-cell; width: 24px; vertical-align: top; ' +
      'color: #595959; font-size: 15px; line-height: 1.5;', '↗');
    glyph.setAttribute('aria-hidden', 'true');
    row.appendChild(glyph);

    var nameCell = el('span', 'display: table-cell; vertical-align: top; font-size: 15px; ' +
      'color: #333333; line-height: 1.5; padding-right: 12px;', item.name);
    row.appendChild(nameCell);

    var linkCell = el('span', 'display: table-cell; vertical-align: top; text-align: right; ' +
      'white-space: nowrap; font-size: 15px; line-height: 1.5;');
    var a = el('a', 'color: #C24A22; text-decoration: underline;', item.linkText);
    a.setAttribute('href', item.link);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    a.setAttribute('title', item.name + ' service status (opens in a new tab)');
    linkCell.appendChild(a);
    row.appendChild(linkCell);
    return row;
  }

  function band() {
    var b = el('div', '');
    b.setAttribute('role', 'status');
    return b;
  }

  // Visually hidden but still read aloud. Inline because TDX strips <style>,
  // so there is no .sr-only class available.
  var SR_ONLY = 'position: absolute; width: 1px; height: 1px; padding: 0; ' +
    'margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;';

  /* Mutates the existing band rather than replacing the node. A role="status"
     live region that is inserted together with its content is frequently not
     announced; the region has to already exist in the DOM when its text
     changes. Replacing the node would mean a screen reader user hears
     "Checking vendor status" and never hears the result.

     `visible` controls only whether it is SEEN. The text is always set, so the
     live region always announces. With eight rows on screen at once, a visible
     banner restating "VPN is degraded" is noise: the row two inches below
     already says so, in the same words. The exception is the unreachable case,
     where the rows say "Status unavailable" and only this line explains that we
     could not check rather than that everything is down. */
  function setBand(node, kind, text, visible) {
    node.setAttribute('style', visible
      ? ('font-family: ' + FONT + '; font-size: 15px; line-height: 1.6; ' +
         'margin: 0 0 16px; padding: 12px 14px; border-radius: 4px; ' +
         'color: #333333; ' + BAND_PALETTE[kind])
      : SR_ONLY);
    node.textContent = text;
  }

  /* `unknown` is NOT a vendor problem. It means we could not reach the vendor,
     which is our failure to report rather than their outage. Conflating them
     would accuse all seven of an incident whenever a visitor's network blocks
     the requests. */
  function summarize(services) {
    if (!services.length) {
      return { kind: 'unknown', visible: true, text: 'No services are configured for monitoring.' };
    }

    var problems = [], unreached = [], maint = [];
    services.forEach(function (s) {
      if (s.status === 'unknown') unreached.push(s);
      // Planned work is not a problem. The schema ranks maintenance below
      // degraded precisely so a routine Zoom or TDX maintenance window does not
      // paint the page orange and announce an incident.
      else if (s.status === 'maintenance') maint.push(s);
      else if (s.status !== 'operational') problems.push(s);
    });

    if (problems.length) {
      var names = problems.map(function (s) {
        return s.name + ' (' + (STATUS[s.status] || STATUS.unknown).label.toLowerCase() + ')';
      }).join(', ');
      var extra = unreached.length
        ? ' ' + unreached.length + ' other service' + (unreached.length === 1 ? '' : 's') +
          ' could not be checked.'
        : '';
      // Not shown: each affected row already carries its own status label.
      return { kind: 'problem', visible: false,
               text: 'Vendors currently reporting issues: ' + names + '.' + extra };
    }
    if (unreached.length === services.length) {
      // Shown: the rows say "Status unavailable" and nothing else explains that
      // this is our failure to check rather than a campus-wide outage.
      return { kind: 'unknown', visible: true,
               text: 'Vendor status could not be retrieved right now. This ' +
        'does not mean these services are down. See the outages listed below.' };
    }

    var maintNote = maint.length
      ? ' ' + maint.map(function (s) { return s.name; }).join(', ') +
        (maint.length === 1 ? ' is' : ' are') + ' in planned maintenance.'
      : '';

    if (unreached.length) {
      return { kind: 'unknown', visible: true,
               text: 'All reachable vendors are reporting normal service. ' +
        unreached.length + ' could not be checked.' + maintNote };
    }
    if (maint.length) {
      return { kind: 'ok', visible: false,
               text: 'All monitored vendors are reporting normal service.' + maintNote };
    }
    return { kind: 'ok', visible: false,
             text: 'All monitored vendors are reporting normal service.' };
  }

  function rankOf(status) {
    // Guarded everywhere, not just in the render helpers. An unexpected status
    // string here used to throw inside a Promise chain with no catch, which
    // left the band stuck on "Checking vendor status" forever.
    return (STATUS[status] || STATUS.unknown).rank;
  }

  function finishSnapshot(services) {
    var worst = 'operational';
    services.forEach(function (s) {
      if (rankOf(s.status) > rankOf(worst)) worst = STATUS[s.status] ? s.status : 'unknown';
    });
    return {
      schema_version: SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      overall: worst,
      notice: null,
      services: services
    };
  }

  function render(mount) {
    while (mount.firstChild) mount.removeChild(mount.firstChild);

    // render() clears the mount, so the accessible name must come from here
    // rather than from placeholder markup in the module.
    var region = el('div', 'margin-bottom: 24px;');
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', 'Vendor-reported service status');

    region.appendChild(el('h2', 'font-family: ' + FONT + '; font-size: 20px; ' +
      'color: #333333; margin: 0 0 8px; font-weight: bold;', 'Vendor-Reported Status'));

    // Paired with the "ITS Reported Outages and Maintenance" blurb in the module.
    // Without both, a reader has no way to tell why there are two lists or why
    // one might be empty while the other is not.
    region.appendChild(el('p', 'font-family: ' + FONT + '; font-size: 15px; ' +
      'color: #444444; margin: 0 0 12px; line-height: 1.6; max-width: 780px;',
      'Live status published by the companies that run these services, checked ' +
      'automatically each time this page loads. It reflects what each vendor ' +
      'reports about its own systems and does not cover every campus service.'));

    // Card matches the embedded report's treatment in Outages-Page.html so the
    // two read as sections of one page. Green top border rather than the report's
    // orange, so they are siblings and not mistaken for the same list.
    var card = el('div', 'border: 1px solid #e0e0e0; border-top: 3px solid #6A7431; ' +
      'border-radius: 4px; padding: 16px 16px 12px; background-color: #ffffff;');
    region.appendChild(card);

    var bandNode = band();
    setBand(bandNode, 'unknown', 'Checking vendor status…', false);
    card.appendChild(bandNode);

    var listSlot = el('div', '');
    card.appendChild(listSlot);

    if (LINK_OUTS.length) {
      card.appendChild(el('p', 'font-family: ' + FONT + '; font-size: 13px; ' +
        'color: #595959; margin: 16px 0 0; line-height: 1.5; font-weight: bold;',
        'Not checked automatically'));
      LINK_OUTS.forEach(function (item) { card.appendChild(buildLinkRow(item)); });
    }

    var stampSlot = el('p', 'font-family: ' + FONT + '; font-size: 13px; ' +
      'color: #595959; margin: 12px 0 0; line-height: 1.5;');
    card.appendChild(stampSlot);
    mount.appendChild(region);

    // Dedupe ONCE and drive both the rows and the fetches from the same list.
    // Guarding only row creation left the duplicate still fetching, repainting
    // the first entry's row (last to settle wins) and double-counting in the
    // band summary. The config header invites edits, so a copy-paste id is a
    // realistic mistake.
    var seen = {};
    var active = [];
    SERVICES.forEach(function (svc) {
      if (seen[svc.id]) {
        console.error(LOG, 'duplicate service id in SERVICES, skipping:', svc.id);
        return;
      }
      seen[svc.id] = true;
      active.push(svc);
    });

    // Skeleton first, then patch each row as its own fetch settles. Nothing
    // waits on the slowest vendor and the layout never shifts.
    var rows = {};
    active.forEach(function (svc, i) {
      rows[svc.id] = buildRow(svc);
      if (i === active.length - 1 && !LINK_OUTS.length) {
        rows[svc.id].node.setAttribute('style',
          rows[svc.id].node.getAttribute('style').replace('border-bottom: 1px solid #ededed; ', ''));
      }
      listSlot.appendChild(rows[svc.id].node);
    });

    var jobs = active.map(function (svc) {
      return fetchWithTimeout(svc.url)
        .then(function (json) { return normalizeStatuspage(svc, json); })
        .catch(function (err) { return unreachable(svc, err.message); })
        .then(function (result) {
          if (rows[svc.id]) paintRow(rows[svc.id], result.status, result.detail);
          return result;
        });
    });

    Promise.all(jobs).then(function (services) {
      var snapshot = finishSnapshot(services);

      // Schema rule 5: refuse a version we do not understand rather than
      // guessing. Only reachable once stage 3 produces the snapshot.
      if (snapshot.schema_version !== SCHEMA_VERSION) {
        console.error(LOG, 'unsupported schema_version:', snapshot.schema_version);
        while (mount.firstChild) mount.removeChild(mount.firstChild);
        mount.appendChild(el('p', 'font-family: ' + FONT + '; font-size: 15px; ' +
          'color: #595959; margin: 0; line-height: 1.6;',
          'Vendor status is unavailable right now. See the outages listed below.'));
        return;
      }

      var summary = summarize(snapshot.services);
      setBand(bandNode, summary.kind, summary.text, summary.visible);

      if (snapshot.notice) {
        region.insertBefore(el('p', 'font-family: ' + FONT + '; font-size: 15px; ' +
          'color: #333333; margin: 0 0 12px; line-height: 1.6; font-weight: bold;',
          snapshot.notice), card);
      }

      var stamp = formatStamp(snapshot.generated_at);
      stampSlot.textContent = stamp.text;
      if (stamp.stale) {
        stampSlot.setAttribute('style', stampSlot.getAttribute('style') +
          ' color: #A34400; font-weight: bold;');
      }

      console.log(LOG, 'overall:', snapshot.overall);
    }).catch(function (err) {
      // Without this, anything thrown above became an unhandled rejection and
      // the band sat on "Checking vendor status" indefinitely, which reads as
      // a hung page rather than a failed one.
      console.error(LOG, 'render failed:', err);
      setBand(bandNode, 'unknown', 'Vendor status could not be retrieved right now. ' +
        'This does not mean these services are down. See the outages listed below.', true);
      stampSlot.textContent = '';
    });
  }

  /* =================================================================
     MOUNT
     ================================================================= */

  function start(mount) {
    console.log(LOG, 'mount found, fetching', SERVICES.length, 'vendor feeds');
    render(mount);
  }

  function tryMount() {
    var mount = document.querySelector('.its-vendor-status');
    if (mount) { start(mount); return true; }
    return false;
  }

  console.log(LOG, 'script loaded');

  if (!window.fetch || !window.Promise) {
    console.warn(LOG, 'fetch/Promise unavailable; leaving placeholder in place');
    return;
  }

  if (tryMount()) return;

  console.log(LOG, 'mount not present yet; polling every ' + POLL_MS + 'ms');
  var started = Date.now();
  var poll = setInterval(function () {
    if (tryMount()) {
      clearInterval(poll);
    } else if (Date.now() - started > POLL_TIMEOUT_MS) {
      console.warn(LOG, 'poll timeout; .its-vendor-status never appeared');
      clearInterval(poll);
    }
  }, POLL_MS);
})();
