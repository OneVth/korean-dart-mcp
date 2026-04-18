# Korean DART MCP

**83 OpenDART APIs packed into 15 MCP tools.** Disclosure search, financial statements, shareholder structure, XBRL, **analyst frames (insider signals, governance risk scoring, Buffett-grade quality checklists)**, and **HWP/PDF attachment-to-markdown conversion** — all usable directly from any AI assistant.

[![npm version](https://img.shields.io/npm/v/korean-dart-mcp.svg)](https://www.npmjs.com/package/korean-dart-mcp)
[![MCP 1.27](https://img.shields.io/badge/MCP-1.27-blue)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> MCP server + CLI wrapping [OpenDART](https://opendart.fss.or.kr/) (Financial Supervisory Service's public disclosure platform — Korea's equivalent of the SEC's EDGAR). Works with Claude Desktop, Cursor, Windsurf, Claude Code, and any MCP-compatible client.

Sister project: [korean-law-mcp](https://github.com/chrisryugj/korean-law-mcp) (Korean statute database, 41 APIs → 15 tools).

한국어 문서 → [README.md](README.md)

---

## Why this exists

Korea has ~3,000 listed companies whose filings, financials, ownership data, and XBRL flow through [DART](https://dart.fss.or.kr) (Data Analysis, Retrieval and Transfer System). Two mature Python wrappers — [OpenDartReader](https://github.com/FinanceData/OpenDartReader) (438⭐) and [dart-fss](https://github.com/josw123/dart-fss) (364⭐) — already map the 83 raw endpoints for pandas users.

This project targets a **different layer**:

- **For pandas users** — OpenDartReader / dart-fss. Analysts wrangle DataFrames directly.
- **For LLM-native users** — this project. Raw tables get refined into **the angles an expert actually uses** (Buffett checklists, insider trade cluster signals, governance risk scores, capital-event timelines, markdown full-text) so an AI agent can build a narrative on first pass.

They complement each other. Want DataFrames? Use the Python wrappers. Want agent-ready frames? Use this MCP.

---

## v0.9 — What's new

- **`get_xbrl format="markdown_full"`** — full presentation/calculation linkbase parsing: every account with hierarchy + calculation-linkbase validation. BS 50+ / IS 15+ / CF 10+ rows vs v0.8's 50-tag whitelist. Handles industry-specific taxonomies (financial holdings `DX` prefix, insurance) automatically. 6MB XBRL → ~30-60KB markdown.
- **`search_disclosures` auto-split** — no `corp_code` + range >90 days auto-chunks into 90-day windows (works around OpenDART's "3-month limit for market-wide queries"). Cap: 40 chunks (~10 years).
- **`summary_text` field** on `insider_signal` and `disclosure_anomaly` — one-line Korean summaries for quick context before raw tables.
- **Security hardening** (v0.9.1) — ZIP slip / ZIP bomb guards via shared helper, HTTPS viewer scraping, chunk cap, presentation-recursion depth guard, XBRL parse-warning exposure.

Full history → [CHANGELOG.md](CHANGELOG.md)

---

## v0.7.0 — LLM-native analyst layer

Four killer use cases the Python wrappers don't cover out-of-the-box:

### 1. Insider trade cluster signals — Buffett's "is management buying with their own money?"

```
"Analyze Samsung Electronics insider buy/sell clusters over the last 2 years"
```

→ `insider_signal` returns:

- 103 buy reports (103 distinct executives)
- 4 sell reports (4 distinct executives)
- Signal: **`strong_buy_cluster`** (buy/sell ratio 25:1)
- Quarterly clusters: 2024Q1 `buy_cluster` (n=42, net +3.8M shares) → 2024Q2 `buy_cluster` (n=31, net +2.1M shares) ...

### 2. Multi-year quality checklist + peer comparison

```
"Compare Samsung / SK Hynix / LG Electronics on 5-year quality metrics"
```

→ `buffett_quality_snapshot(corps=[...])`:

| Company | Avg ROE | D/E | Revenue CAGR | Net Income CAGR | Checklist |
|---|---:|---:|---:|---:|---:|
| SK Hynix | 12.86% | 45.95% | 22.6% | 45.37% | **3/4** |
| Samsung | 10.39% | **29.94%** | 4.51% | 3.17% | 1/4 |
| LG Electronics | 5.37% | 140.33% | 4.81% | -3.63% | 0/4 |

- ROE ranking: **SK Hynix > Samsung > LG Electronics**
- Debt stability ranking: **Samsung > SK Hynix > LG Electronics**
- ROE consistency (stddev): LG (2.09) > Samsung (3.91) > SK Hynix (18.44)

### 3. Accounting & governance risk score

```
"Kakao last 3 years — accounting / governance risk score"
```

→ `disclosure_anomaly`:

- Aggregates amendment filing ratio, auditor turnover, non-clean audit opinions, and capital-stress-event frequency into a **0-100 score**
- `verdict: clean / watch / warning / red_flag`
- Evidence structured per flag

### 4. HWP / PDF attachments → markdown for direct LLM reading

```
"Summarize the 'Risk Factors' section from Samsung's 2023 annual report PDF"
```

→ `get_attachments(mode="extract")`:

- Scrapes DART viewer HTML for attachment list (no official API — DART's viewer-side only)
- [kordoc](https://github.com/chrisryugj/kordoc) engine: HWP / HWPX / PDF / DOCX / XLSX → markdown
- Samsung 2.2MB annual report PDF → **921,998 chars of markdown in ~3.7s**

DART's proprietary XML format is also parsed into markdown (`download_document(format="markdown")`) preserving headings and tables.

---

## Installation

### Step 0: Get a free API key (1 minute)

All methods require an **OpenDART auth key**.

1. Sign up at [OpenDART registration](https://opendart.fss.or.kr/uss/umt/cmm/EgovMberInsertView.do)
2. After login, [request an auth key](https://opendart.fss.or.kr/mng/apiUsageStatusView.do) — a 40-character key arrives by email instantly
3. Place it in `DART_API_KEY` in your config below. Free tier: 20,000 requests/day.

---

### Method 0: Claude Code plugin (one-liner)

[Claude Code](https://docs.claude.com/en/docs/claude-code) users can install via marketplace:

```
/plugin marketplace add chrisryugj/korean-dart-mcp
/plugin install korean-dart
```

Prompts for the OpenDART key once. 15 DART tools are live after that.

---

### Method 1: Claude Desktop / Cursor / Windsurf (recommended)

**Prerequisite**: [Node.js 20+](https://nodejs.org).

**Config file location:**

| App | Windows | Mac |
|---|---|---|
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Cursor | project `.cursor/mcp.json` | project `.cursor/mcp.json` |
| Windsurf | project `.windsurf/mcp.json` | project `.windsurf/mcp.json` |
| Claude Code | `~/.claude.json` or project `.mcp.json` | `~/.claude.json` or project `.mcp.json` |

**Config content** (replace `YOUR_API_KEY`):

```json
{
  "mcpServers": {
    "korean-dart": {
      "command": "npx",
      "args": ["-y", "korean-dart-mcp"],
      "env": {
        "DART_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

Restart the app. The 15 DART tools are now live.

> If you already have other MCP servers configured, just add the `"korean-dart": { ... }` entry inside `"mcpServers"`.

---

### Method 2: Global npm install

```bash
npm install -g korean-dart-mcp
```

Config:

```json
{
  "mcpServers": {
    "korean-dart": {
      "command": "korean-dart-mcp",
      "env": {
        "DART_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

On first run, the server downloads OpenDART's **full company dump (~116,000 entries)** and indexes it in `~/.korean-dart-mcp/corp_code.sqlite` via SQLite FTS (~5s, refreshed every 24h). From then on, any of **company name / 6-digit ticker / 8-digit corp_code** resolves automatically.

---

### API key delivery

| Method | Usage | When |
|---|---|---|
| Env var | `DART_API_KEY=...` | MCP client configs |
| `.env` file | project root `.env` | local development |

---

## Example prompts

**Basic lookups**
```
"Samsung latest quarter — revenue, operating income, YoY change"
"All listed firms that filed treasury stock purchase decisions in the last 30 days"
"Naver 2023 executive compensation — names earning over 500M KRW"
```

**Analyst frames**
```
"Samsung insider buy/sell cluster analysis, last 2 years"         → insider_signal
"Kakao 3-year accounting/governance risk (amendments/auditor/opinion)"  → disclosure_anomaly
"Naver 10-year Buffett-style quality checklist"                   → buffett_quality_snapshot
"Samsung / SK Hynix / LG 5-year quality comparison with rankings" → buffett_quality_snapshot(corps=[...])
"LG Energy Solution capital events timeline since 2021"           → get_corporate_event(mode="timeline")
```

**Primary sources**
```
"Summarize 'Risk Factors' from Samsung's 2023 annual report PDF"  → get_attachments(mode="extract")
"Samsung treasury stock decision — original XML as markdown"      → download_document(format="markdown")
"Samsung 2023 annual financials as markdown tables (BS/IS/CF)"    → get_xbrl(format="markdown")
```

**Batch queries**
```
"All treasury stock purchase decisions, last 7 days"              → search_disclosures(preset="treasury_buy")
"Convertible / exchangeable bond issuance filings, last 30 days"  → search_disclosures(preset="cb_issue", days=30)
```

---

## Tool catalog (15 tools)

### Basic query (7)
| Tool | Purpose |
|---|---|
| `resolve_corp_code` | Company name → corp_code (SQLite FTS over ~116k entries) |
| `search_disclosures` | Disclosure search. `page` / `preset` (22 auto-filtered) / `all_pages` **3 modes** + parallel fetch + **auto-split** for >90-day ranges (v0.9) |
| `get_company` | Company profile (industry / CEO / founding date) |
| `get_financials` | Financials. `scope: summary` (key accounts, single/multi-corp) / `full` (complete BS/IS/CF, single corp) |
| `download_document` | Disclosure full text → `format: markdown` (DART XML parser) / `raw` / `text` |
| `get_xbrl` | `format: raw` (hardened ZIP extraction) / `markdown` (50-tag whitelist) / **`markdown_full`** (taxonomy-driven full statements + calc validation, v0.9) |
| `get_periodic_report` | Annual report **29 sections enum** (dividends / largest shareholder / auditor / compensation / fund usage ...) |

### Composite wrappers (4)
| Tool | Purpose |
|---|---|
| `get_shareholders` | 4 governance sections (largest / changes / minority / total shares) in parallel |
| `get_executive_compensation` | 6 compensation sections (total / ≥500M KRW individuals / top-5 / unregistered / approved limit / by type) |
| `get_major_holdings` | 5%-rule holdings (majorstock) + executive/major-holder own stakes (elestock) |
| `get_corporate_event` | Material event report **36 events enum** + `mode: single` / `timeline` |

### Analyst frames (3 · killers)
| Tool | Purpose |
|---|---|
| `insider_signal` | Executive trades aggregated into buy/sell **cluster signals** (`strong_buy_cluster` etc.) |
| `disclosure_anomaly` | Amendments / auditor turnover / non-clean opinions / capital stress → **0-100 score + verdict** |
| `buffett_quality_snapshot` | N-year ROE / debt / CAGR + **Buffett 4-item checklist**. `corps` array (1=time series, 2+=comparison + rankings) |

### Primary-source analysis (1)
| Tool | Purpose |
|---|---|
| `get_attachments` | Attachment HWP / HWPX / PDF / DOCX / XLSX → markdown ([kordoc](https://github.com/chrisryugj/kordoc)) + recursive ZIP parsing |

---

## Key features

- **83 APIs → 15 tools** — OpenDART's full surface (disclosures / financials / holdings / material events / periodic reports / XBRL) compressed via enums. LLM context: 8–10k → 6–8k tokens.
- **Automatic company resolution** — "Samsung Electronics" / "005930" / "00126380" all work (SQLite FTS preload, 24h TTL).
- **Analyst frames on top of raw tables** — signal / score / checklist layers so an AI agent can narrate immediately.
- **HWP/PDF to markdown** — [kordoc](https://github.com/chrisryugj/kordoc) engine. Full report body becomes LLM-readable (2.2MB PDF → 3.7s).
- **DART XML parser** — DART's proprietary `dart4.xsd` markup → markdown, preserving headings and tables.
- **XBRL markdown mode** (v0.8.0) — 6MB XBRL → 8KB markdown BS/IS/CF tables with 3-year columns. 99% size reduction.
- **Parallel page fetch** — `search_disclosures` batch mode 30-50s → 17s (2-3×). Configurable concurrency 1-10.
- **22 presets** — treasury stock / CB / BW / mergers / 5%-rule / amendments / insolvency / litigation — common combinations as enums.
- **OpenDartReader / dart-fss compatible mappings** — proven Python-wrapper endpoint mappings adopted directly.

---

## Background for non-Korean readers

- **DART** (Data Analysis, Retrieval and Transfer) is the Financial Supervisory Service's mandatory filing platform — every Korean listed company files here. Conceptually similar to SEC EDGAR but with richer structured data (XBRL-native since 2013, dimensional data for shareholders / compensation / capital events).
- **OpenDART** is the machine-readable API surface over DART. Free, 20,000 req/day per key, no commercial-use restriction.
- **corp_code** is an 8-digit company ID used by OpenDART — different from the 6-digit KRX stock ticker. This MCP handles conversion transparently.
- **rcept_no** is a 14-digit filing receipt number. Each disclosure has one, used to pull originals via `download_document` / `get_attachments` / `get_xbrl`.

---

## References

- [OpenDART official API list](https://opendart.fss.or.kr/intro/infoApiList.do) — 83 endpoints
- [FinanceData/OpenDartReader](https://github.com/FinanceData/OpenDartReader) — pandas wrapper (438⭐)
- [josw123/dart-fss](https://github.com/josw123/dart-fss) — XBRL parser (364⭐)
- Sister project: [korean-law-mcp](https://github.com/chrisryugj/korean-law-mcp) — Korean statute MCP

## License

[MIT](./LICENSE)

---

<sub>Made by 류주임 @ Gwangjin-gu AI Club (AI.Do)</sub>
