import axios from "axios";
import { API_BASE_URL } from "@/lib/apiConfig";

export const apiClient = axios.create({
  // axios joins this with each request path ("/fetch"), collapsing the
  // slashes between them - and apiConfig has already stripped any trailing
  // slash, so the result is always exactly <base>/fetch.
  baseURL: API_BASE_URL,
  // Was 15000 - measured live against the deployed Railway backend at a
  // comfortable ~4-4.5s under good conditions, but that margin isn't safe
  // for two things that stack: a slower/mobile network's extra round-trip
  // latency, and the backend's Playwright browser being a lazy singleton
  // (browserManager.ts) - the first request after any idle period pays a
  // real Chromium cold-launch cost on top of the usual render time. When a
  // request genuinely times out, axios never populates `error.response` at
  // all, so useInstagramDownloader.ts's error handler falls through to its
  // generic "Something went wrong" message - indistinguishable from a real
  // network/CORS failure without checking DevTools, which is what made a
  // "works on my network, fails on another" report hard to diagnose from
  // the symptom alone.
  timeout: 30000,
});
