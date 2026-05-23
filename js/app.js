(function () {
  'use strict';

  /* ===== DOM REFS ===== */
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

  /* ===== API PROVIDERS ===== */
  const PROVIDERS = [
    {
      id: 'ip.sb',
      label: 'ip.sb',
      lookupUrl: (ip) => `https://api.ip.sb/geoip/${ip}`,
      selfUrl: 'https://api.ip.sb/geoip',
      normalize: (d) => ({
        ip: d.ip || '',
        country: d.country || '',
        countryCode: d.country_code || '',
        continent: decodeContinent(d.continent_code) || d.continent_code || '',
        latitude: d.latitude,
        longitude: d.longitude,
        timezone: d.timezone || '',
        offset: d.offset != null ? d.offset : null,
        asn: d.asn ? `AS${d.asn}` : '',
        asnOrg: d.asn_organization || '',
        org: d.organization || '',
        isp: d.isp || '',
        hostname: '',
        city: '',
        region: '',
        postal: '',
        version: '',
        currency: '',
        language: '',
        anycast: null,
      }),
    },
    {
      id: 'ipinfo.io',
      label: 'ipinfo.io',
      lookupUrl: (ip) => `https://ipinfo.io/${ip}/json`,
      selfUrl: 'https://ipinfo.io/json',
      normalize: (d) => {
        let lat = null, lon = null;
        if (d.loc) { const p = d.loc.split(','); lat = parseFloat(p[0]); lon = parseFloat(p[1]); }
        let asn = '', asnOrg = '';
        if (d.org) { const m = d.org.match(/^AS(\d+)\s+(.+)/); if (m) { asn = `AS${m[1]}`; asnOrg = m[2]; } else asnOrg = d.org; }
        return {
          ip: d.ip || '',
          hostname: d.hostname || '',
          city: d.city || '',
          region: d.region || '',
          country: '',
          countryCode: d.country || '',
          continent: '',
          latitude: lat,
          longitude: lon,
          postal: d.postal || '',
          timezone: d.timezone || '',
          offset: null,
          isp: '',
          org: asnOrg,
          asn,
          asnOrg,
          version: '',
          currency: '',
          language: '',
          anycast: d.anycast != null ? d.anycast : null,
        };
      },
    },
    {
      id: 'geoiplookup.io',
      label: 'geoiplookup.io',
      lookupUrl: (ip) => `https://json.geoiplookup.io/${ip}`,
      selfUrl: null,
      normalize: (d) => ({
        ip: d.ip || '',
        hostname: d.hostname || '',
        country: d.country_name || '',
        countryCode: d.country_code || '',
        continent: decodeContinent(d.continent_code) || d.continent_code || '',
        region: d.region || '',
        city: d.city || '',
        postal: d.postal_code || '',
        latitude: d.latitude != null ? parseFloat(d.latitude) : null,
        longitude: d.longitude != null ? parseFloat(d.longitude) : null,
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
      }),
    },
  ];

  function decodeContinent(code) {
    const map = { AF: 'Africa', AN: 'Antarctica', AS: 'Asia', EU: 'Europe', NA: 'North America', OC: 'Oceania', SA: 'South America' };
    return map[code] || '';
  }

  /* ===== UTILITY ===== */
  function isValidIP(str) {
    if (!str || !str.trim()) return false;
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4.test(str.trim())) return str.trim().split('.').every(n => +n >= 0 && +n <= 255);
    const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    return ipv6.test(str.trim());
  }

  function detectIPVersion(ip) {
    return ip.includes(':') ? 'IPv6' : 'IPv4';
  }

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

  /* ===== UI HELPERS ===== */
  function showStatus(msg) { statusMsg.textContent = msg; statusSection.classList.add('visible'); resultsSection.classList.remove('visible'); errorSection.classList.remove('visible'); }
  function hideStatus() { statusSection.classList.remove('visible'); }
  function showError(title, msg) { errorTitle.textContent = title; errorMsg.textContent = msg; errorSection.classList.add('visible'); resultsSection.classList.remove('visible'); statusSection.classList.remove('visible'); }
  function setLoading(l) { spinner.style.display = l ? 'block' : 'none'; lookupBtn.disabled = l; lookupBtn.style.opacity = l ? '0.6' : ''; }

  function showToast(msg) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div'); t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    requestAnimationFrame(() => { t.classList.add('visible'); });
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.classList.remove('visible'), 2500);
  }

  /* ===== FETCH WITH TIMEOUT ===== */
  async function fetchWithTimeout(url, ms = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
      return r;
    } finally { clearTimeout(id); }
  }

  /* ===== CORE LOOKUP ===== */
  async function lookupIP(ip) {
    const errors = [];
    for (const p of PROVIDERS) {
      try {
        const url = p.lookupUrl(ip);
        const res = await fetchWithTimeout(url);
        if (!res.ok) { errors.push(`${p.label}: HTTP ${res.status}`); continue; }
        const json = await res.json();
        if (!json || (json.status === 'error') || (json.success === false)) { errors.push(`${p.label}: invalid response`); continue; }
        return { data: p.normalize(json), source: p.id, sourceLabel: p.label };
      } catch (e) {
        errors.push(`${p.label}: ${e.message || 'error'}`);
        continue;
      }
    }
    throw new Error('All IP lookup services failed.\n' + errors.join('\n'));
  }

  async function detectOwnIP() {
    const endpoints = [
      async () => {
        const r = await fetchWithTimeout('https://api.ipify.org?format=json');
        if (!r.ok) throw new Error('ipify HTTP ' + r.status);
        const j = await r.json();
        return j.ip;
      },
      async () => {
        const r = await fetchWithTimeout('https://api.ip.sb/geoip');
        if (!r.ok) throw new Error('ip.sb self HTTP ' + r.status);
        const j = await r.json();
        return j.ip;
      },
    ];
    for (const fn of endpoints) {
      try { return await fn(); } catch { continue; }
    }
    throw new Error('Could not detect your IP address');
  }

  /* ===== RENDER RESULTS ===== */
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

    resultsSection.classList.add('visible');
    statusSection.classList.remove('visible');
    errorSection.classList.remove('visible');

    updateMap(d.latitude, d.longitude, d.ip || ip, d.city || d.region || '');
  }

  /* ===== MAP ===== */
  function updateMap(lat, lon, ip, location) {
    const mapContainer = $('mapContainer');
    if (lat == null || lon == null) { mapContainer.style.display = 'none'; return; }
    mapContainer.style.display = 'block';

    if (!map) {
      map = L.map('map', { zoomControl: true, attributionControl: false }).setView([lat, lon], 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
      }).addTo(map);
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

  /* ===== MAIN ACTIONS ===== */
  async function performLookup(ip) {
    ip = ip.trim();
    if (!isValidIP(ip)) {
      showError('Invalid IP Address', `"${ip}" doesn't look like a valid IPv4 or IPv6 address. Please check and try again.`);
      return;
    }

    showStatus(`Looking up <strong>${ip}</strong>...`);
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

  /* ===== EVENT LISTENERS ===== */
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
    } else {
      fallbackCopy(ip);
    }
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

  /* ===== AUTO LOAD ===== */
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(performMyIP, 500);
  });

})();
