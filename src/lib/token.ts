"use client";

import { useEffect, useState } from "react";

const KEY = "gpb_token";

export function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function writeToken(value: string) {
  if (typeof window === "undefined") return;
  if (value) window.localStorage.setItem(KEY, value);
  else window.localStorage.removeItem(KEY);
}

export function useToken() {
  const [token, setTokenState] = useState<string | null>(null);
  useEffect(() => {
    setTokenState(readToken());
  }, []);
  function setToken(v: string) {
    writeToken(v);
    setTokenState(v || null);
  }
  return { token, setToken };
}
