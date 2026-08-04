"use client";

export function useClipboard() {
  async function readText(): Promise<string | null> {
    try {
      if (!navigator.clipboard?.readText) return null;
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  }

  async function writeText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  return { readText, writeText };
}
