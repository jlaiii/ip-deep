(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ipInput = $('ipInput');
  const lookupBtn = $('lookupBtn');
  const myIpBtn = $('myIpBtn');
  const statusSection = $('statusSection');
  const statusMsg = $('statusMsg');
  const spinner = $('spinner');
  const resultsSection = $('resultsSection');
  const errorSection = $('errorSection');
  const errorTitle = $('errorTitle');
  const errorMsg = $('errorMsg');
  const retryBtn = $('retryBtn');
  const sourceName = $('sourceName');
  const copyBtn = $('copyBtn');

  const resultFields = {
    ip: $('resultIp'),
    country: $('rCountry'),
    region: $('rRegion'),
    city: $('rCity'),
    postal: $('rPostal'),
    continent: $('rContinent'),
    isp: $('rIsp'),
    org: $('rOrg'),
    asn: $('rAsn'),
    asnOrg: $('rAsnOrg'),
    hostname: $('rHostname'),
    timezone: $('rTimezone'),
    offset: $('rOffset'),
    localTime: $('rLocalTime'),
    lat: $('rLat'),
    lon: $('rLon'),
    version: $('rVersion'),
    countryCode: $('rCountryCode'),
    currency: $('rCurrency'),
    language: $('rLanguage'),
    anycast: $('rAnycast'),
    anycastRow: $('rAnycastRow'),
  };

  let map = null;
  let mapMarker = null;
  let currentResult = null;
  let pendingIp = null;

  const COUNTRY_MAP = {
    'US': 'United States', 'GB': 'United Kingdom', 'AU': 'Australia', 'DE': 'Germany',
    'FR': 'France', 'JP': 'Japan', 'CA': 'Canada', 'BR': 'Brazil', 'IN': 'India',
    'NL': 'Netherlands', 'FI': 'Finland', 'IT': 'Italy', 'ES': 'Spain', 'SE': 'Sweden',
    'NO': 'Norway', 'DK': 'Denmark', 'PL': 'Poland', 'RU': 'Russia', 'CN': 'China',
    'KR': 'South Korea', 'SG': 'Singapore', 'HK': 'Hong Kong', 'TW': 'Taiwan',
    'ZA': 'South Africa', 'MX': 'Mexico', 'AR': 'Argentina', 'CL': 'Chile',
    'CO': 'Colombia', 'NZ': 'New Zealand', 'IE': 'Ireland', 'CH': 'Switzerland',
    'AT': 'Austria', 'BE': 'Belgium', 'PT': 'Portugal', 'GR': 'Greece',
    'CZ': 'Czech Republic', 'HU': 'Hungary', 'RO': 'Romania', 'UA': 'Ukraine',
    'IL': 'Israel', 'AE': 'United Arab Emirates', 'SA': 'Saudi Arabia',
    'TR': 'Turkey', 'TH': 'Thailand', 'VN': 'Vietnam', 'ID': 'Indonesia',
    'MY': 'Malaysia', 'PH': 'Philippines', 'EG': 'Egypt', 'NG': 'Nigeria',
    'KE': 'Kenya', 'IR': 'Iran', 'PK': 'Pakistan', 'BD': 'Bangladesh',
  };

  const CONTINENT_MAP = {
    AF: 'Africa', AN: 'Antarctica', AS: 'Asia', EU: 'Europe',
    NA: 'North America', OC: 'Oceania', SA: 'South America',
  };

  const PROVIDERS = [
    {
      id: 'ipinfo.io',
      label: 'ipinfo.io',
      lookupUrl: (ip) => `https://ipinfo.io/${ip}/json`,
      weight: 1,
      normalize: (d) => {
        let lat = null, lon = null;
        if (d.loc) { const p = d.loc.split(','); lat = parseFloat(p[0]); lon = parseFloat(p[1]); }
        let asn = '', asnOrg = '';
        if (d.org) {
          const m = d.org.match(/^AS(\d+)\s+(.+)/);
          if (m) { asn = `AS${m[1]}`; asnOrg = m[2]; } else { asnOrg = d.org; }
        }
        const cc = d.country || '';
        return {
          ip: d.ip || '',
          hostname: d.hostname || '',
          city: d.city || '',
          region: d.region || '',
          country: COUNTRY_MAP[cc] || '',
          countryCode: cc,
          continent: '',
          latitude: lat, longitude: lon,
          postal: d.postal || '',
          timezone: d.timezone || '',
          offset: null,
          isp: '',
          org: asnOrg, asn, asnOrg,
          version: '',
          currency: '', language: '',
          anycast: d.anycast != null ? d.anycast : null,
        };
      },
    },
    {
      id: 'geoiplookup.io',
      label: 'geoiplookup.io',
      lookupUrl: (ip) => `https://json.geoiplookup.io/${ip}`,
      weight: 2,
      normalize: (d) => {
        const cc = d.country_code || '';
        const cname = d.country_name || COUNTRY_MAP[cc] || '';
        return {
          ip: d.ip || '',
          hostname: d.hostname || '',
          country: cname,
          countryCode: cc,
          continent: CONTINENT_MAP[d.continent_code] || d.continent_code || '',
          region: d.region || '',
          city: d.city || '',
          postal: d.postal_code || '',
          latitude: d.latitude != null ? +d.latitude : null,
          longitude: d.longitude != null ? +d.longitude : null,
          timezone: d.timezone_name || '',
          offset: null,
          isp: d.isp || '',
          org: d.org || '',
          asn: d.asn_number ? `AS${d.asn_number}` : (d.asn || ''),
          asnOrg: d.asn_org || '',
          version: '',
          currency: d.currency_code ? `${d.currency_code} - ${d.currency_name}` : '',
          language: d.language_name || '',
          anycast: null,
        };
      },
    },
    {
      id: 'ip.sb',
      label: 'ip.sb',
      lookupUrl: (ip) => `https://api.ip.sb/geoip/${ip}`,
      weight: 3,
      normalize: (d) => ({
        ip: d.ip || '',
        hostname: '',
        country: d.country || '',
        countryCode: d.country_code || '',
        continent: CONTINENT_MAP[d.continent_code] || d.continent_code || '',
        region: '',
        city: '',
        postal: '',
        latitude: d.latitude, longitude: d.longitude,
        timezone: d.timezone || '',
        offset: d.offset != null ? d.offset : null,
        isp: d.isp || '',
        org: d.organization || '',
        asn: d.asn ? `AS${d.asn}` : '',
        asnOrg: d.asn_organization || '',
        version: '',
        currency: '', language: '',
        anycast: null,
      }),
    },
  ];

  function isValidIP(str) {
    if (!str || !str.trim()) return false;
    const s = str.trim();
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4.test(s)) return s.split('.').every(n => +n >= 0 && +n <= 255);
    const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    return ipv6.test(s);
  }

  function detectIPVersion(ip) { return ip && ip.includes(':') ? 'IPv6' : 'IPv4'; }

  function formatOffset(sec) {
    if (sec == null) return '';
    const hrs = Math.abs(sec) / 3600;
    const sign = sec >= 0 ? '+' : '-';
    const h = Math.floor(hrs);
    const m = Math.round((hrs - h) * 60);
    return `UTC${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function formatLocalTime(tz) {
    if (!tz) return '';
    try {
      const opt = { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, day: '2-digit', month: 'short', year: 'numeric' };
      return new Intl.DateTimeFormat('en-US', opt).format(new Date());
    } catch { return ''; }
  }

  function showStatus(msg) { statusMsg.innerHTML = msg; statusSection.classList.add('visible'); resultsSection.classList.remove('visible'); errorSection.classList.remove('visible'); }
  function showError(title, msg) { errorTitle.textContent = title; errorMsg.textContent = msg; errorSection.classList.add('visible'); resultsSection.classList.remove('visible'); statusSection.classList.remove('visible'); }
  function setLoading(l) { spinner.style.display = l ? 'block' : 'none'; lookupBtn.disabled = l; lookupBtn.style.opacity = l ? '0.6' : ''; }

  function showToast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add('visible'));
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.classList.remove('visible'), 2500);
  }

  async function fetchWithTimeout(url, ms = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
    } finally { clearTimeout(id); }
  }

  function mergeData(base, extra) {
    const r = { ...base };
    for (const k of Object.keys(r)) {
      if (k === 'anycast') continue;
      if (!r[k] && extra[k]) { r[k] = extra[k]; }
    }
    if (r.countryCode && !r.country) { r.country = COUNTRY_MAP[r.countryCode] || ''; }
    if (r.countryCode && !r.continent) { r.continent = guessContinent(r.countryCode); }
    return r;
  }

  function guessContinent(cc) {
    const map = {
      US: 'North America', CA: 'North America', MX: 'North America',
      GB: 'Europe', DE: 'Europe', FR: 'Europe', IT: 'Europe', ES: 'Europe',
      NL: 'Europe', BE: 'Europe', CH: 'Europe', AT: 'Europe', SE: 'Europe',
      NO: 'Europe', DK: 'Europe', FI: 'Europe', PL: 'Europe', RU: 'Europe',
      UA: 'Europe', IE: 'Europe', PT: 'Europe', GR: 'Europe', CZ: 'Europe',
      HU: 'Europe', RO: 'Europe', TR: 'Europe',
      AU: 'Oceania', NZ: 'Oceania',
      JP: 'Asia', CN: 'Asia', KR: 'Asia', IN: 'Asia', SG: 'Asia',
      HK: 'Asia', TW: 'Asia', IL: 'Asia', AE: 'Asia', SA: 'Asia',
      TH: 'Asia', VN: 'Asia', ID: 'Asia', MY: 'Asia', PH: 'Asia',
      BR: 'South America', AR: 'South America', CL: 'South America', CO: 'South America',
      ZA: 'Africa', NG: 'Africa', KE: 'Africa', EG: 'Africa',
    };
    return map[cc] || '';
  }

  async function lookupIP(ip) {
    const attempts = [];
    let mergedData = null;
    let primarySource = '';
    let primaryLabel = '';

    const promises = PROVIDERS.map(async (p) => {
      const attempt = { id: p.id, label: p.label, status: 'pending', latency: null, reason: '' };
      const start = performance.now();
      try {
        const url = p.lookupUrl(ip);
        const res = await fetchWithTimeout(url);
        attempt.latency = Math.round(performance.now() - start);
        if (!res.ok) {
          attempt.status = 'failed';
          attempt.reason = `HTTP ${res.status}`;
          return attempt;
        }
        const json = await res.json();
        if (!json || json.status === 'error' || json.success === false) {
          attempt.status = 'failed';
          attempt.reason = 'bad response';
          return attempt;
        }
        const data = p.normalize(json);
        attempt.status = 'used';
        attempt._data = data;

        if (!mergedData) {
          mergedData = { ...data };
          primarySource = p.id;
          primaryLabel = p.label;
        } else {
          mergedData = mergeData(mergedData, data);
        }
        return attempt;
      } catch (e) {
        attempt.latency = Math.round(performance.now() - start);
        attempt.status = 'failed';
        attempt.reason = e.name === 'AbortError' ? 'timeout' : (e.message || 'error');
        return attempt;
      }
    });

    const settled = await Promise.allSettled(promises);
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value) {
        attempts.push({ id: s.value.id, label: s.value.label, status: s.value.status, latency: s.value.latency, reason: s.value.reason });
      }
    }

    if (!mergedData) {
      throw new Error('All IP lookup services failed.\n' + attempts.map(a => `${a.label}: ${a.reason}`).join('\n'));
    }

    return { data: mergedData, source: primarySource, sourceLabel: primaryLabel, attempts };
  }

  async function detectOwnIP() {
    const endpoints = [
      async () => { const r = await fetchWithTimeout('https://api.ipify.org?format=json'); if (!r.ok) throw new Error('ipify HTTP ' + r.status); return (await r.json()).ip; },
      async () => { const r = await fetchWithTimeout('https://api.ip.sb/geoip'); if (!r.ok) throw new Error('ip.sb self HTTP ' + r.status); return (await r.json()).ip; },
      async () => { const r = await fetchWithTimeout('https://ipinfo.io/json'); if (!r.ok) throw new Error('ipinfo HTTP ' + r.status); return (await r.json()).ip; },
    ];
    for (const fn of endpoints) { try { return await fn(); } catch { continue; } }
    throw new Error('Could not detect your IP address');
  }

  function renderSources(attempts, usedId) {
    const container = $('sourcesBody');
    const summary = $('sourcesSummary');
    const failed = attempts.filter(a => a.status === 'failed');
    const used = attempts.find(a => a.status === 'used');
    let html = '<div class="sources-chain">';

    attempts.forEach((a, i) => {
      let icon, cls, desc;
      if (a.status === 'used') {
        icon = 'fa-check-circle'; cls = 'source-used';
        desc = a.id === usedId ? 'Served this lookup' : 'Available (backup data)';
      } else if (a.status === 'failed') {
        icon = 'fa-times-circle'; cls = 'source-failed';
        desc = a.reason ? `Failed: ${a.reason}` : 'Unavailable';
      } else {
        icon = 'fa-circle'; cls = 'source-pending';
        desc = 'Available (fallback)';
      }
      const lat = a.latency != null
        ? `<span class="source-latency">${a.latency}ms</span>`
        : '<span class="source-latency source-latency-na">—</span>';
      html += `
        <div class="source-item ${cls}">
          <div class="source-status-icon"><i class="fas ${icon}"></i></div>
          <div class="source-info">
            <span class="source-name">${a.label}</span>
            <span class="source-desc">${desc}</span>
          </div>
          ${lat}
        </div>`;
      if (i < attempts.length - 1) {
        html += '<div class="source-arrow"><i class="fas fa-arrow-down"></i></div>';
      }
    });

    html += '</div>';

    const allFailed = attempts.filter(a => a.status === 'failed');
    const allUsed = attempts.filter(a => a.status === 'used');

    if (allFailed.length === 0) {
      summary.innerHTML = `<i class="fas fa-check-circle"></i> All sources operational. Primary: <strong>${used ? used.label : ''}</strong>`;
      summary.className = 'sources-summary sources-summary-ok';
    } else if (allUsed.length > 0) {
      const failList = allFailed.map(f => f.label).join(', ');
      const usedName = used ? used.label : '';
      summary.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${failList} unavailable. Using <strong>${usedName}</strong>${allUsed.length > 1 ? ' (with backup data from ' + allUsed.filter(u => u.id !== usedId).map(u => u.label).join(', ') + ')' : ''}.`;
      summary.className = 'sources-summary sources-summary-warn';
    } else {
      summary.innerHTML = `<i class="fas fa-exclamation-triangle"></i> All sources unavailable.`;
      summary.className = 'sources-summary sources-summary-warn';
    }

    container.innerHTML = html;
  }

  function renderResults(result, ip) {
    currentResult = result;
    const d = result.data;

    resultFields.ip.textContent = d.ip || ip;
    resultFields.country.textContent = d.country || '--';
    resultFields.region.textContent = d.region || '--';
    resultFields.city.textContent = d.city || '--';
    resultFields.postal.textContent = d.postal || '--';
    resultFields.continent.textContent = d.continent || '--';
    resultFields.isp.textContent = d.isp || '--';
    resultFields.org.textContent = d.org || '--';
    resultFields.asn.textContent = d.asn || '--';
    resultFields.asnOrg.textContent = d.asnOrg || '--';
    resultFields.hostname.textContent = d.hostname || '--';
    resultFields.timezone.textContent = d.timezone || '--';
    resultFields.offset.textContent = formatOffset(d.offset) || '--';
    resultFields.localTime.textContent = formatLocalTime(d.timezone) || '--';
    resultFields.lat.textContent = d.latitude != null ? d.latitude.toFixed(4) : '--';
    resultFields.lon.textContent = d.longitude != null ? d.longitude.toFixed(4) : '--';
    resultFields.version.textContent = detectIPVersion(d.ip || ip);
    resultFields.countryCode.textContent = d.countryCode || '--';
    resultFields.currency.textContent = d.currency || '--';
    resultFields.language.textContent = d.language || '--';

    if (d.anycast != null) {
      resultFields.anycastRow.style.display = 'flex';
      resultFields.anycast.textContent = d.anycast ? 'Yes' : 'No';
    } else {
      resultFields.anycastRow.style.display = 'none';
    }

    sourceName.textContent = result.sourceLabel;

    if (result.attempts) renderSources(result.attempts, result.source);

    resultsSection.classList.add('visible');
    statusSection.classList.remove('visible');
    errorSection.classList.remove('visible');

    updateMap(d.latitude, d.longitude, d.ip || ip, [d.city, d.region].filter(Boolean).join(', '));
  }

  function updateMap(lat, lon, ip, location) {
    const mapContainer = $('mapContainer');
    if (lat == null || lon == null) { mapContainer.style.display = 'none'; return; }
    mapContainer.style.display = 'block';

    if (!map) {
      map = L.map('map', { zoomControl: true, attributionControl: false }).setView([lat, lon], 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    } else {
      map.setView([lat, lon], 10);
    }

    if (mapMarker) map.removeLayer(mapMarker);
    mapMarker = L.marker([lat, lon])
      .addTo(map)
      .bindPopup(`<b>${ip}</b>${location ? '<br>' + location : ''}`)
      .openPopup();

    setTimeout(() => map.invalidateSize(), 300);
  }

  async function performLookup(ip) {
    ip = ip.trim();
    if (!isValidIP(ip)) {
      showError('Invalid IP Address', `"${ip}" doesn't look like a valid IPv4 or IPv6 address.`);
      return;
    }

    showStatus(`Looking up <strong>${escapeHtml(ip)}</strong>...`);
    setLoading(true);
    pendingIp = ip;

    try {
      const result = await lookupIP(ip);
      renderResults(result, ip);
      showToast(`Found via ${result.sourceLabel}`);
    } catch (e) {
      showError('Lookup Failed', 'All IP lookup services are currently unavailable or rate-limited. Please try again later.');
      console.error('All providers failed:', e.message);
    } finally {
      setLoading(false);
    }
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  async function performMyIP() {
    showStatus('Detecting your IP address...');
    setLoading(true);
    try {
      const ip = await detectOwnIP();
      ipInput.value = ip;
      await performLookup(ip);
    } catch (e) {
      showError('Detection Failed', 'Could not automatically detect your IP address. Please type it manually.');
    } finally {
      setLoading(false);
    }
  }

  lookupBtn.addEventListener('click', () => {
    const val = ipInput.value.trim();
    if (!val) { showToast('Please enter an IP address'); ipInput.focus(); return; }
    performLookup(val);
  });

  myIpBtn.addEventListener('click', performMyIP);

  ipInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') lookupBtn.click();
  });

  retryBtn.addEventListener('click', () => {
    if (pendingIp) performLookup(pendingIp);
    else performMyIP();
  });

  copyBtn.addEventListener('click', () => {
    const ip = resultFields.ip.textContent;
    if (!ip || ip === '--') return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(ip).then(() => showToast('Copied to clipboard')).catch(() => fallbackCopy(ip));
    } else { fallbackCopy(ip); }
  });

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showToast('Copied to clipboard'); } catch { showToast('Could not copy'); }
    document.body.removeChild(ta);
  }

  document.querySelectorAll('.hint-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      ipInput.value = btn.dataset.ip;
      performLookup(btn.dataset.ip);
    });
  });

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(performMyIP, 500);
  });

})();
