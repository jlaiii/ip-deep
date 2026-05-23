# IPortal — Deep IP Lookup

A fast, user-friendly IP intelligence tool that reveals deep information about any IP address. Built as a GitHub Pages site — no backend required.

**Live demo:** [`https://jlaiii.github.io/ip-deep/`](https://jlaiii.github.io/ip-deep/)

## Features

- **Deep IP Info** — Country, region, city, postal code, continent, latitude/longitude, timezone, ISP, organization, ASN, hostname, IP version, anycast status
- **Interactive Map** — Pinpoints the IP location on an OpenStreetMap map
- **Auto-detect** — Automatically looks up your own IP on page load
- **Smart Fallback** — Tries multiple APIs in order: ip.sb → ipinfo.io → geoiplookup.io
- **Copy to Clipboard** — One-click copy of any IP address
- **Fully Client-Side** — No server, no database, no API keys to configure
- **Responsive Dark UI** — Modern glassmorphism design, works great on mobile

## APIs Used

| Service | HTTPS | Key Required | Tier |
|---------|-------|-------------|------|
| [ipinfo.io](https://ipinfo.io) | ✅ | No (free tier) | Primary |
| [ipapi.is](https://ipapi.is) | ✅ | No | Fallback |
| [ip.sb](https://ip.sb) | ✅ | No | Fallback |
| [ipify.org](https://ipify.org) | ✅ | No | IP detection |

All APIs are queried **in parallel** for speed. Data is **merged** across all successful responses so you get the most complete result. If one API is unreachable or rate-limited, results from the others fill the gaps automatically.

## Local Development

```bash
# Clone or download the repo
cd ip-deep

# Serve locally (any static file server works)
npx serve .
# or
python -m http.server 8000
```

Open `http://localhost:8000` in your browser.

## Deployment to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Under "Branch", select `main` and `/ (root)` folder
4. Click Save
5. Your site is live at `https://<username>.github.io/ip-deep/`

## Project Structure

```
ip-deep/
├── index.html      # Main HTML page
├── css/
│   └── style.css   # All styling (dark theme, responsive)
├── js/
│   └── app.js      # App logic, API calls, map rendering
└── README.md       # This file
```

## License

MIT
