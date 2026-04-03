// api.js — Centralised HTTP client for all backend calls
// Loaded before all other scripts via base.html
"use strict";

const API = (() => {

  /* ── Base fetch wrapper ───────────────────────────────────────────────────── */
  async function _request(method, url, body = null) {
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body !== null) opts.body = JSON.stringify(body);

    let resp;
    try {
      resp = await fetch(url, opts);
    } catch (networkErr) {
      throw new Error("Network error — is the server running?");
    }

    // Try to parse JSON regardless of status code
    let data;
    try {
      data = await resp.json();
    } catch (_) {
      if (!resp.ok) throw new Error(`Server error (${resp.status})`);
      return {};
    }

    if (!resp.ok) {
      // Surface the backend's error message when available
      throw new Error(data.error || `Request failed (${resp.status})`);
    }
    return data;
  }

  /* ── Public helpers ───────────────────────────────────────────────────────── */
  return {
    get:    (url)        => _request("GET",  url),
    post:   (url, body)  => _request("POST", url, body || {}),
    put:    (url, body)  => _request("PUT",  url, body || {}),
    delete: (url)        => _request("DELETE", url),

    /* Multipart upload (file + form fields) */
    upload: async (url, formData) => {
      let resp;
      try {
        resp = await fetch(url, { method: "POST", body: formData });
      } catch (_) {
        throw new Error("Network error — is the server running?");
      }
      let data;
      try { data = await resp.json(); } catch (_) { data = {}; }
      if (!resp.ok) throw new Error(data.error || `Upload failed (${resp.status})`);
      return data;
    },
  };
})();