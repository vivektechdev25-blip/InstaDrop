# Project Overview

## What it is

Instadrop is a high-performance, privacy-focused, zero-friction web application that parses, extracts, previews, and downloads **public** Instagram media — Photos, Reels, Videos, Carousel posts, and IGTV.

## Core objectives

- **Sub-second extraction latency** — process and return media metadata in under 800ms
- **Zero user friction** — 100% guest-accessible, no login, no registration, no paywalls
- **SEO & organic dominance** — SSR architecture, >95 Lighthouse score, rich JSON-LD markup
- **Resilient architecture** — multi-tier fallback scrapers to survive Instagram's DOM changes

## Target users

| Segment | Need | Instadrop solution |
|---|---|---|
| Content creators & marketers | Archive owned media | Original-resolution HD downloads, no re-compression |
| Social media managers | Batch capture campaign assets | Carousel multi-slide parser with per-slide downloads |
| General public / mobile users | Save recipes, reels, guides | PWA support, seamless clipboard paste |

## Key architectural rule

Instadrop never stores Instagram media on its own servers. All media is proxy-streamed directly to the user's browser.

See [FEATURES.md](./FEATURES.md) for MVP scope and [ROADMAP.md](./ROADMAP.md) for what comes after.
