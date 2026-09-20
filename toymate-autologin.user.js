// ==UserScript==
// @name         Toymate Auto Checkout & Restock Monitor
// @namespace    https://toymate.com.au/
// @version      1.0.0
// @description  Advanced auto-checkout and background restock monitoring bot for Toymate.
// @author       Pythonic Shariful
// @match        https://toymate.com.au/*
// @match        https://www.toymate.com.au/*
// @match        https://checkout.toymate.com.au/*
// @match        https://*.adyen.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      toymate.com.au
// @connect      www.toymate.com.au
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     CONSTANTS
  ───────────────────────────────────────────── */
  const STORAGE_EMAIL = 'tm_auto_email';
  const STORAGE_PASS = 'tm_auto_pass';
  const STORAGE_AUTO = 'tm_auto_enable';
  const STORAGE_COUPON = 'tm_auto_coupon';
  const STORAGE_CC_NUM = 'tm_auto_cc_num';
  const STORAGE_CC_EXP = 'tm_auto_cc_exp';
  const STORAGE_CC_CVV = 'tm_auto_cc_cvv';
  const STORAGE_TARGET_URL = 'tm_target_url';
  const STORAGE_POLL_MIN = 'tm_poll_min';
  const STORAGE_POLL_MAX = 'tm_poll_max';
  const PANEL_ID = 'tm-autologin-panel';

  /* ─────────────────────────────────────────────
     STYLES – inject once
  ───────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('tm-autologin-styles')) return;
    const style = document.createElement('style');
    style.id = 'tm-autologin-styles';
    style.textContent = `
      @keyframes tm-fadeIn   { from { opacity:0; transform:translateY(20px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
      @keyframes tm-spin      { to { transform: rotate(360deg); } }
      @keyframes tm-gradient  { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
      @keyframes tm-pulse     { 0%,100%{opacity:.6} 50%{opacity:1} }

      #tm-toggle-bubble {
        position:fixed; bottom:24px; right:24px; z-index:2147483640;
        width:56px; height:56px; border-radius:50%; cursor:pointer;
        background:linear-gradient(135deg, #7C3AED 0%, #2563EB 100%);
        border:none;
        display:flex; align-items:center; justify-content:center;
        box-shadow:0 8px 32px rgba(124,58,237,.45), 0 2px 8px rgba(0,0,0,.3);
        transition:transform .2s ease, box-shadow .2s ease;
      }
      #tm-toggle-bubble:hover {
        transform:scale(1.12);
        box-shadow:0 12px 40px rgba(124,58,237,.6);
      }
      #tm-toggle-bubble svg { pointer-events:none; }

      #tm-autologin-panel {
        position:fixed; bottom:96px; right:28px; z-index:2147483641;
        width:360px; border-radius:20px; overflow:hidden;
        font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
        animation:tm-fadeIn .35s cubic-bezier(.22,1,.36,1) both;
        box-shadow:0 0 0 1px rgba(255,255,255,.08),0 24px 64px rgba(0,0,0,.55),0 0 80px rgba(124,58,237,.18);
        backdrop-filter:blur(24px) saturate(1.6);
        -webkit-backdrop-filter:blur(24px) saturate(1.6);
        background:rgba(12,12,20,.88);
      }
      #tm-autologin-panel.tm-hidden { display:none; }

      .tm-header-bar {
        height:4px;
        background:linear-gradient(90deg,#7C3AED,#2563EB,#06B6D4,#7C3AED);
        background-size:300% 100%; animation:tm-gradient 3s ease infinite;
      }
      .tm-header {
        display:flex; align-items:center; justify-content:space-between;
        padding:18px 20px 12px;
        border-bottom:1px solid rgba(255,255,255,.07);
      }
      .tm-header-left { display:flex; align-items:center; gap:10px; }
      .tm-logo {
        width:34px; height:34px; border-radius:10px;
        background:linear-gradient(135deg,#7C3AED,#2563EB);
        display:flex; align-items:center; justify-content:center;
        box-shadow:0 2px 8px rgba(124,58,237,.4); font-size:18px; line-height:1;
      }
      .tm-title { color:#fff; font-size:14px; font-weight:700; letter-spacing:.3px; }
      .tm-subtitle { color:rgba(255,255,255,.4); font-size:11px; margin-top:1px; }
      .tm-close-btn {
        background:rgba(255,255,255,.07); border:none; border-radius:8px;
        width:30px; height:30px; display:flex; align-items:center; justify-content:center;
        cursor:pointer; color:rgba(255,255,255,.5); transition:background .2s, color .2s;
      }
      .tm-close-btn:hover { background:rgba(255,255,255,.14); color:#fff; }

      .tm-body { padding:18px 20px 20px; display:flex; flex-direction:column; gap:14px; }

      .tm-field, .tm-form-group { display:flex; flex-direction:column; gap:5px; }
      .tm-label { color:rgba(255,255,255,.5); font-size:11px; font-weight:600; letter-spacing:.8px; text-transform:uppercase; }
      .tm-input-wrap, .tm-input-wrapper {
        position:relative; display:flex; align-items:center;
        background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1);
        border-radius:12px; transition:border-color .2s, box-shadow .2s, background .2s;
      }
      .tm-input-wrap:focus-within, .tm-input-wrapper:focus-within {
        border-color:rgba(124,58,237,.7); box-shadow:0 0 0 3px rgba(124,58,237,.18);
        background:rgba(255,255,255,.09);
      }
      .tm-input-icon { position:absolute; left:14px; color:rgba(255,255,255,.3); display:flex; align-items:center; pointer-events:none; }
      .tm-input-wrap input, .tm-input-wrapper input {
        width:100%; background:transparent; border:none; outline:none;
        color:#fff; font-size:13.5px; font-family:inherit;
        padding:12px 14px 12px 42px;
      }
      .tm-input-wrap input::placeholder, .tm-input-wrapper input::placeholder { color:rgba(255,255,255,.25); }
      .tm-eye-btn {
        position:absolute; right:12px; background:none; border:none; cursor:pointer;
        color:rgba(255,255,255,.3); display:flex; align-items:center;
        padding:4px; border-radius:6px; transition:color .2s;
      }
      .tm-eye-btn:hover { color:rgba(255,255,255,.7); }

      .tm-toggle-row {
        display:flex; align-items:center; justify-content:space-between;
        padding:10px 14px; background:rgba(255,255,255,.04);
        border:1px solid rgba(255,255,255,.07); border-radius:12px;
      }
      .tm-toggle-label { color:rgba(255,255,255,.65); font-size:12.5px; }
      .tm-switch { position:relative; width:40px; height:22px; }
      .tm-switch input { display:none; }
      .tm-switch-slider {
        position:absolute; inset:0; cursor:pointer;
        background:rgba(255,255,255,.12); border-radius:22px; transition:background .3s;
      }
      .tm-switch-slider::before {
        content:''; position:absolute;
        width:16px; height:16px; border-radius:50%;
        left:3px; top:3px; background:#fff; transition:transform .3s;
        box-shadow:0 1px 4px rgba(0,0,0,.4);
      }
      .tm-switch input:checked + .tm-switch-slider { background:linear-gradient(135deg,#7C3AED,#2563EB); }
      .tm-switch input:checked + .tm-switch-slider::before { transform:translateX(18px); }

      .tm-btn-row { display:flex; gap:10px; }
      .tm-btn {
        display:block; width:100%; padding:11px;
        border-radius:10px; border:none; cursor:pointer;
        font-family:inherit; font-size:13px; font-weight:700;
        text-align:center; transition:all .2s; margin-top:8px;
        display:flex; align-items:center; justify-content:center; gap:6px;
      }
      .tm-btn-primary {
        background:linear-gradient(135deg, #7C3AED 0%, #2563EB 100%);
        color:#fff; box-shadow:0 4px 16px rgba(124,58,237,.35);
      }
      .tm-btn-primary:hover { transform:translateY(-1px); box-shadow:0 6px 20px rgba(124,58,237,.5); }
      .tm-btn-secondary {
        background:rgba(255,255,255,.07); color:rgba(255,255,255,.8);
        border:1px solid rgba(255,255,255,.12);
      }
      .tm-btn-secondary:hover { background:rgba(255,255,255,.12); }
      .tm-btn-success {
        background:linear-gradient(135deg, #059669 0%, #10B981 100%);
        color:#fff; box-shadow:0 4px 16px rgba(16,185,129,.3);
      }
      .tm-btn-success:hover { transform:translateY(-1px); }

      /* Nintendo-style Status Badge */
      .tm-status {
        display:flex; align-items:center; gap:10px;
        padding:12px 14px; border-radius:12px; margin-bottom:12px;
        border:1px solid transparent;
      }
      .tm-status.info    { background:rgba(37,99,235,.15);  border-color:rgba(37,99,235,.3); }
      .tm-status.success { background:rgba(16,185,129,.12); border-color:rgba(16,185,129,.3); }
      .tm-status.warn    { background:rgba(245,158,11,.15); border-color:rgba(245,158,11,.3); }
      .tm-status.error   { background:rgba(239,68,68,.15);  border-color:rgba(239,68,68,.35); }
      
      .tm-status-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
      .tm-status.info    .tm-status-dot { background:#3B82F6; box-shadow:0 0 8px #3B82F6; animation:tm-pulse 1.4s infinite; }
      .tm-status.success .tm-status-dot { background:#10B981; box-shadow:0 0 8px #10B981; }
      .tm-status.warn    .tm-status-dot { background:#F59E0B; box-shadow:0 0 8px #F59E0B; animation:tm-pulse 1.4s infinite; }
      .tm-status.error   .tm-status-dot { background:#EF4444; box-shadow:0 0 8px #EF4444; animation:tm-pulse 1.4s infinite; }
      
      .tm-status-text { flex:1; }
      .tm-status-title { font-size:13px; font-weight:700; color:#fff; }
      .tm-status-desc  { font-size:11px; color:rgba(255,255,255,.55); margin-top:2px; }

      /* Page Badge */
      .tm-page-badge {
        display:inline-flex; align-items:center; gap:5px;
        padding:4px 10px; border-radius:20px; font-size:10px;
        font-weight:700; letter-spacing:.5px; text-transform:uppercase; margin-bottom:14px;
      }
      .tm-page-badge.product { background:rgba(230,0,18,.2); color:#ff7070; border:1px solid rgba(230,0,18,.3); }
      .tm-page-badge.home    { background:rgba(16,185,129,.15); color:#6ee7b7; border:1px solid rgba(16,185,129,.25); }
      .tm-page-badge.login   { background:rgba(99,102,241,.2); color:#a5b4fc; border:1px solid rgba(99,102,241,.3); }
      .tm-page-badge.other   { background:rgba(255,255,255,.08); color:rgba(255,255,255,.5); border:1px solid rgba(255,255,255,.12); }

      /* Toast */
      .tm-toast {
        position:fixed; bottom:100px; right:24px; z-index:2147483647;
        padding:12px 18px; border-radius:12px; font-family:inherit;
        font-size:13px; font-weight:600; color:#fff;
        box-shadow:0 8px 32px rgba(0,0,0,.4); display:flex; align-items:center; gap:8px;
        animation:tm-toast-in .3s cubic-bezier(.34,1.56,.64,1) forwards; max-width:300px;
      }
      .tm-toast.success { background:linear-gradient(135deg, #059669, #10B981); }
      .tm-toast.error   { background:linear-gradient(135deg, #DC2626, #EF4444); }
      .tm-toast.info    { background:linear-gradient(135deg, #2563EB, #3B82F6); }
      .tm-toast.warning { background:linear-gradient(135deg, #D97706, #F59E0B); }
      @keyframes tm-toast-in { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
      @keyframes tm-toast-out { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(20px); } }

      .tm-spinner {
        width:13px; height:13px; border-radius:50%;
        border:2px solid rgba(255,255,255,.2); border-top-color:#fff;
        animation:tm-spin .7s linear infinite; flex-shrink:0; display:inline-block;
      }
      .tm-divider { height:1px; background:rgba(255,255,255,.06); margin:12px 0; }
      .tm-footer {
        padding:10px 20px 14px; display:flex; align-items:center; justify-content:center;
        color:rgba(255,255,255,.2); font-size:11px; font-family:inherit;
      }

      /* Tabs */
      .tm-tabs {
        display:flex; border-bottom:1px solid rgba(255,255,255,.08);
        background:rgba(0,0,0,.2); flex-shrink:0; margin:-18px -20px 14px;
      }
      .tm-tab {
        flex:1; padding:10px 4px; text-align:center; font-size:11px; font-weight:600;
        color:rgba(255,255,255,.45); cursor:pointer; border-bottom:2px solid transparent;
        transition:all .15s; letter-spacing:.4px; text-transform:uppercase; user-select:none;
      }
      .tm-tab:hover { color:rgba(255,255,255,.75); }
      .tm-tab.active { color:#2563EB; border-bottom-color:#7C3AED; }

      .tm-section { display:none; flex-direction:column; gap:14px; }
      .tm-section.active { display:flex; }

      /* Product Info UI */
      .tm-product-card {
        background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07);
        border-radius:12px; padding:14px;
      }
      .tm-product-title { font-size:14px; font-weight:700; color:#fff; margin-bottom:10px; line-height:1.4; }
      .tm-product-row { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px; }
      .tm-product-label { font-size:11px; color:rgba(255,255,255,.5); text-transform:uppercase; font-weight:600; }
      .tm-product-sku { font-size:12px; color:rgba(255,255,255,.8); font-family:monospace; }
      .tm-product-price { font-size:18px; font-weight:800; color:#6EE7B7; }
      .tm-empty-state { text-align:center; color:rgba(255,255,255,.3); font-size:12px; padding:20px 0; }
      .tm-qty-wrap { display:flex; gap:8px; margin-top:12px; align-items:center; }
      .tm-qty-wrap input { width:60px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.15); color:#fff; text-align:center; border-radius:8px; padding:8px; font-weight:600; }
      .tm-btn-cart { background:linear-gradient(135deg,#D97706,#F59E0B); color:#fff; flex:1; padding:9px; border-radius:8px; border:none; cursor:pointer; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 4px 12px rgba(217,119,6,.3); transition:transform .2s; }
      .tm-btn-cart:hover { transform:translateY(-1px); box-shadow:0 6px 16px rgba(217,119,6,.4); }
      .tm-btn-stop { background:linear-gradient(135deg,#DC2626,#EF4444); color:#fff; flex:1; padding:9px; border-radius:8px; border:none; cursor:pointer; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 4px 12px rgba(220,38,38,.3); transition:transform .2s; }
      .tm-btn-stop:hover { transform:translateY(-1px); box-shadow:0 6px 16px rgba(220,38,38,.4); }

      /* ── Activity Log (Terminal) ── */
      .tm-activity-log {
        background: rgba(0,0,0,.4); border-radius: 8px;
        padding: 12px; font-family: monospace; font-size: 11px;
        max-height: 120px; overflow-y: auto; color: #A7F3D0;
        display: flex; flex-direction: column; gap: 4px;
        margin: 12px 20px;
        border: 1px solid rgba(255,255,255,0.05);
      }
      .tm-activity-log::-webkit-scrollbar { width: 4px; }
      .tm-activity-log::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 4px; }
      .tm-log-item { display: flex; gap: 8px; line-height: 1.4; animation: tm-fadeIn 0.3s ease; }
      .tm-log-time { color: rgba(255,255,255,.3); flex-shrink: 0; }
      .tm-log-msg { color: rgba(255,255,255,.7); word-break: break-word; }
      .tm-log-item.info .tm-log-msg { color: #93C5FD; }
      .tm-log-item.success .tm-log-msg { color: #6EE7B7; }
      .tm-log-item.warn .tm-log-msg { color: #FCD34D; }
      .tm-log-item.error .tm-log-msg { color: #FCA5A5; }
    `;
    document.head.appendChild(style);
  }

  /* ─────────────────────────────────────────────
     SVG HELPERS
  ───────────────────────────────────────────── */
  const mkSvg = (d, w = 16, h = 16) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  const ICON_MAIL = mkSvg('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>');
  const ICON_LOCK = mkSvg('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>');
  const ICON_EYE = mkSvg('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>');
  const ICON_EYEOFF = mkSvg('<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>');
  const ICON_USER = mkSvg('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>');
  const ICON_CLOSE = mkSvg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
  const ICON_KEY = mkSvg('<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>');
  const ICON_SAVE = mkSvg('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>');
  const ICON_CART = mkSvg('<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>');
  const ICON_STOP = mkSvg('<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>');

  /* ─────────────────────────────────────────────
     UTILITY
  ───────────────────────────────────────────── */
  let botRunning = false;
  let botLoopTimeout = null;

  const escAttr = s => String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');

  function nativeSet(el, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ─────────────────────────────────────────────
     STATUS & LOGGING
  ───────────────────────────────────────────── */
  function setStatus(type, title, desc = '', spinner = false) {
    const box = document.getElementById('tm-status');
    if (!box) return;
    box.className = 'tm-status ' + type;
    box.innerHTML = `
      ${spinner ? '<div class="tm-spinner"></div>' : '<div class="tm-status-dot"></div>'}
      <div class="tm-status-text">
        <div class="tm-status-title">${title}</div>
        ${desc ? `<div class="tm-status-desc">${desc}</div>` : ''}
      </div>
    `;
  }

  function showToast(msg, type = 'info', dur = 3500) {
    const t = document.createElement('div');
    t.className = 'tm-toast ' + type;
    t.innerHTML = '<span>' + msg + '</span>';
    document.documentElement.insertAdjacentElement('beforeend', t);
    setTimeout(() => {
      t.style.animation = 'tm-toast-out .3s forwards';
      setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
    }, dur);
  }

  function logActivity(text, type = 'info') {
    const logContainer = document.getElementById('tm-activity-log');
    if (!logContainer) return;

    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const item = document.createElement('div');
    item.className = 'tm-log-item ' + type;
    item.innerHTML = `<span class="tm-log-time">[${time}]</span><span class="tm-log-msg">${text}</span>`;

    logContainer.appendChild(item);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  /* ─────────────────────────────────────────────
     BUILD PANEL
  ───────────────────────────────────────────── */
  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const savedEmail = GM_getValue(STORAGE_EMAIL, '');
    const savedPass = GM_getValue(STORAGE_PASS, '');
    const savedCoupon = GM_getValue(STORAGE_COUPON, '');
    const savedCcNum = GM_getValue(STORAGE_CC_NUM, '');
    const savedCcExp = GM_getValue(STORAGE_CC_EXP, '');
    const savedCcCvv = GM_getValue(STORAGE_CC_CVV, '');
    const savedTargetUrl = GM_getValue(STORAGE_TARGET_URL, '');
    const savedPollMin = GM_getValue(STORAGE_POLL_MIN, 3);
    const savedPollMax = GM_getValue(STORAGE_POLL_MAX, 6);
    const autoEnabled = GM_getValue(STORAGE_AUTO, false);

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="tm-header-bar"></div>
      <div class="tm-header">
        <div class="tm-header-left">
          <div class="tm-logo">🧸</div>
          <div>
            <div class="tm-title">Toymate Auto Login</div>
            <div class="tm-subtitle">Credential Manager</div>
          </div>
        </div>
        <button class="tm-close-btn" id="tm-close-btn" title="Hide panel">${ICON_CLOSE}</button>
      </div>
      <div class="tm-body">
        
        <div class="tm-tabs" id="tm-tabs">
          <div class="tm-tab active" data-target="tm-sec-auth">🔑 Login</div>
          <div class="tm-tab" data-target="tm-sec-more">⚙️ More</div>
          <div class="tm-tab" data-target="tm-sec-pay">💳 Pay</div>
          <div class="tm-tab" data-target="tm-sec-bot">🎯 Config</div>
          <div class="tm-tab" data-target="tm-sec-product">📦 Item</div>
        </div>

        <div id="tm-page-badge" class="tm-page-badge other">Page Detected</div>

        <!-- STATUS (always visible) -->
        <div class="tm-status info" id="tm-status" style="margin: 0 16px 6px;">
          <div class="tm-status-dot"></div>
          <div class="tm-status-text">
            <div class="tm-status-title">Enter credentials and click Login</div>
          </div>
        </div>

        <!-- LOGIN TAB -->
        <div class="tm-section active" id="tm-sec-auth">
          <div class="tm-field">
            <div class="tm-label">Email</div>
            <div class="tm-input-wrap">
              <span class="tm-input-icon">${ICON_MAIL}</span>
              <input id="tm-email" type="email" placeholder="you@example.com" autocomplete="email" value="${escAttr(savedEmail)}" />
            </div>
          </div>
          <div class="tm-field">
            <div class="tm-label">Password</div>
            <div class="tm-input-wrap">
              <span class="tm-input-icon">${ICON_LOCK}</span>
              <input id="tm-pass" type="password" placeholder="••••••••" autocomplete="current-password" value="${escAttr(savedPass)}" />
              <button class="tm-eye-btn" id="tm-eye-btn" title="Toggle visibility">${ICON_EYE}</button>
            </div>
          </div>
          <div class="tm-btn-row">
            <button class="tm-btn tm-btn-primary" id="tm-login-btn" style="flex:1;">${ICON_KEY}&nbsp;Login Now</button>
          </div>
        </div>

        <!-- MORE TAB (coupon + toggle) -->
        <div class="tm-section" id="tm-sec-more">
          <div class="tm-field">
            <div class="tm-label">Coupon Code (Optional)</div>
            <div class="tm-input-wrap">
              <span class="tm-input-icon">${ICON_CART}</span>
              <input id="tm-coupon" type="text" placeholder="e.g. TOYS10" value="${escAttr(savedCoupon)}" />
            </div>
          </div>
          <div class="tm-toggle-row">
            <span class="tm-toggle-label">🔄&nbsp; Auto-login on page load</span>
            <label class="tm-switch">
              <input type="checkbox" id="tm-auto-toggle" ${autoEnabled ? 'checked' : ''} />
              <span class="tm-switch-slider"></span>
            </label>
          </div>
        </div>

        <!-- PAY TAB -->
        <div class="tm-section" id="tm-sec-pay">
          <div class="tm-field">
            <div class="tm-label">Card Number</div>
            <div class="tm-input-wrap">
              <span class="tm-input-icon">${ICON_CART}</span>
              <input type="text" id="tm-cc-num" placeholder="1234 5678 1234 5678" value="${escAttr(savedCcNum)}" />
            </div>
          </div>
          <div style="display:flex;gap:8px;">
            <div class="tm-field" style="flex:1;">
              <div class="tm-label">MM/YY</div>
              <input type="text" id="tm-cc-exp" placeholder="MM/YY" value="${escAttr(savedCcExp)}" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:9px 12px;font-family:inherit;font-size:13px;outline:none;" />
            </div>
            <div class="tm-field" style="flex:1;">
              <div class="tm-label">CVV</div>
              <input type="text" id="tm-cc-cvv" placeholder="123" value="${escAttr(savedCcCvv)}" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:9px 12px;font-family:inherit;font-size:13px;outline:none;" />
            </div>
          </div>
        </div>

        <!-- CONFIG TAB -->
        <div class="tm-section" id="tm-sec-bot">
          <div class="tm-field">
            <div class="tm-label">🎯 Target URL</div>
            <div style="display:flex;gap:5px;align-items:center;">
              <input type="text" id="tm-target-url" placeholder="https://toymate.com.au/..." value="${escAttr(savedTargetUrl)}" style="flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:10px;padding:8px 11px;font-family:inherit;font-size:11.5px;outline:none;" />
              <button id="tm-clear-url-btn" style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:9px;padding:8px 10px;cursor:pointer;font-size:11px;white-space:nowrap;">📍 Here</button>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <div class="tm-field" style="flex:1;">
              <div class="tm-label">Min (s)</div>
              <input type="number" id="tm-poll-min" value="${savedPollMin}" min="1" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:9px 12px;font-family:inherit;font-size:13px;outline:none;" />
            </div>
            <div class="tm-field" style="flex:1;">
              <div class="tm-label">Max (s)</div>
              <input type="number" id="tm-poll-max" value="${savedPollMax}" min="1" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:9px 12px;font-family:inherit;font-size:13px;outline:none;" />
            </div>
          </div>
        </div>

        <!-- PRODUCT TAB -->
        <div class="tm-section" id="tm-sec-product">
          <div id="tm-product-container">
            <div class="tm-empty-state">Waiting for a product page...</div>
          </div>
        </div>

      </div>
      <div class="tm-divider"></div>

      <!-- Activity Log -->
      <div class="tm-activity-log" id="tm-activity-log" style="max-height:60px;">
        <div class="tm-log-item info"><span class="tm-log-time">[${new Date().toLocaleTimeString('en-US', { hour12: false })}]</span><span class="tm-log-msg">Bot initialized. UI ready.</span></div>
      </div>

      <!-- Global Actions -->
      <div class="tm-global-actions" style="padding:8px 16px 12px;">
        <div class="tm-btn-row" style="margin-bottom:8px;gap:6px;">
          <button class="tm-btn tm-btn-secondary" id="tm-save-btn" style="flex:1;padding:9px;font-size:12.5px;">${ICON_SAVE}&nbsp;Save</button>
          <button class="tm-btn tm-btn-primary" id="tm-login-btn-2" onclick="document.getElementById('tm-login-btn').click()" style="flex:1;padding:9px;font-size:12.5px;">${ICON_KEY}&nbsp;Login</button>
        </div>
        <div class="tm-qty-wrap" style="margin-top:0;gap:6px;">
          <input type="number" id="tm-qty-input" value="1" min="1" title="Qty" style="width:52px;" />
          <button class="tm-btn-cart" id="tm-start-bot-btn">${ICON_CART} Start Bot</button>
          <button class="tm-btn-stop" id="tm-stop-bot-btn" style="display:none;">${ICON_STOP} Stop</button>
        </div>
      </div>
      <div class="tm-footer" style="padding:4px 16px 10px;font-size:10px;">🔒 Stored locally · never transmitted</div>
    `;
    document.body.appendChild(panel);

    /* Wire events */
    document.getElementById('tm-close-btn').addEventListener('click', () => {
      document.getElementById(PANEL_ID).classList.add('tm-hidden');
    });
    document.getElementById('tm-save-btn').onclick = saveCredentials;
    document.getElementById('tm-login-btn').onclick = loginNow;
    document.getElementById('tm-start-bot-btn').addEventListener('click', startBot);
    document.getElementById('tm-stop-bot-btn').addEventListener('click', stopBot);
    document.getElementById('tm-auto-toggle').onchange = e => GM_setValue(STORAGE_AUTO, e.target.checked);
    document.getElementById('tm-clear-url-btn').onclick = () => {
      const urlInput = document.getElementById('tm-target-url');
      urlInput.value = window.location.href.split('?')[0];
      GM_setValue(STORAGE_TARGET_URL, urlInput.value);
      showToast('Target URL set to current page!', 'success');
    };

    document.querySelectorAll('.tm-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tm-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tm-section').forEach(s => s.classList.remove('active'));
        e.target.classList.add('active');
        const targetId = e.target.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');
      });
    });

    /* Eye toggle */
    let showing = false;
    document.getElementById('tm-eye-btn').onclick = () => {
      showing = !showing;
      document.getElementById('tm-pass').type = showing ? 'text' : 'password';
      document.getElementById('tm-eye-btn').innerHTML = showing ? ICON_EYEOFF : ICON_EYE;
    };
  }

  /* ─────────────────────────────────────────────
     TOGGLE BUBBLE
  ───────────────────────────────────────────── */
  function buildToggleBubble() {
    if (document.getElementById('tm-toggle-bubble')) return;
    const bubble = document.createElement('div');
    bubble.id = 'tm-toggle-bubble';
    bubble.title = 'Toymate Auto Login';
    bubble.innerHTML = mkSvg(
      '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      22, 22
    ).replace('stroke="currentColor"', 'stroke="white"');
    bubble.onclick = () => {
      buildPanel();
      const p = document.getElementById(PANEL_ID);
      if (p) p.classList.toggle('tm-hidden');
    };
    document.body.appendChild(bubble);
  }

  /* ─────────────────────────────────────────────
     CREDENTIALS
  ───────────────────────────────────────────── */
  function saveCredentials() {
    const email = document.getElementById('tm-email')?.value.trim() || '';
    const pass = document.getElementById('tm-pass')?.value || '';
    const coupon = document.getElementById('tm-coupon')?.value.trim() || '';
    const ccNum = document.getElementById('tm-cc-num')?.value.trim() || '';
    const ccExp = document.getElementById('tm-cc-exp')?.value.trim() || '';
    const ccCvv = document.getElementById('tm-cc-cvv')?.value.trim() || '';
    const targetUrl = document.getElementById('tm-target-url')?.value.trim() || '';
    const pollMin = parseInt(document.getElementById('tm-poll-min')?.value) || 3;
    const pollMax = Math.max(pollMin, parseInt(document.getElementById('tm-poll-max')?.value) || 6);
    
    GM_setValue(STORAGE_EMAIL, email);
    GM_setValue(STORAGE_PASS, pass);
    GM_setValue(STORAGE_COUPON, coupon);
    GM_setValue(STORAGE_CC_NUM, ccNum);
    GM_setValue(STORAGE_CC_EXP, ccExp);
    GM_setValue(STORAGE_CC_CVV, ccCvv);
    GM_setValue(STORAGE_TARGET_URL, targetUrl);
    GM_setValue(STORAGE_POLL_MIN, pollMin);
    GM_setValue(STORAGE_POLL_MAX, pollMax);
    
    if (!email || !pass) {
      setStatus('success', 'Saved', 'Data saved (Login empty)');
      showToast('Saved (Email/Pass empty)', 'success');
      logActivity('Saved data, but email/password are empty. Auto-login will be skipped.', 'warn');
    } else {
      setStatus('success', 'Saved', 'Credentials stored.');
      showToast('Credentials saved locally!', 'success');
      logActivity('Credentials saved to secure storage.', 'success');
      setTimeout(() => setStatus('info', 'Ready', 'Waiting...'), 2500);
    }
  }

  function getCredentials() {
    const ei = document.getElementById('tm-email');
    const pi = document.getElementById('tm-pass');
    return {
      email: ei ? ei.value.trim() : GM_getValue(STORAGE_EMAIL, ''),
      pass: pi ? pi.value : GM_getValue(STORAGE_PASS, '')
    };
  }

  /* ─────────────────────────────────────────────
     FIND PROFILE / LOGOUT LINK
  ───────────────────────────────────────────── */
  function findProfileLink() {
    const a = document.querySelector('a[aria-label="Profile"][href*="/login"]');
    if (a) return a;
    for (const link of document.querySelectorAll('a[href*="/login"]')) {
      if (link.querySelector('svg')) return link;
    }
    return null;
  }

  /* ─────────────────────────────────────────────
     HUMAN-LIKE TYPING
     Simulates real keypresses character-by-character
     with random delays so React state updates properly.
  ───────────────────────────────────────────── */

  /** Return a random int in [min, max] */
  function randDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Focus + click the input, then type each character
   * one at a time with keydown → keypress → input → keyup events.
   * Returns a Promise that resolves when typing is complete.
   */
  function humanType(el, text) {
    return new Promise(resolve => {
      /* Bring field into focus the way a user would */
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      el.click();

      /* Clear any existing value first */
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeSetter.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));

      let idx = 0;

      function typeNext() {
        if (idx >= text.length) {
          /* Final blur → focus cycle to trigger validation */
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          setTimeout(resolve, randDelay(120, 250));
          return;
        }

        const char = text[idx++];
        const keyCode = char.charCodeAt(0);

        const keyInit = {
          key: char, code: 'Key' + char.toUpperCase(),
          keyCode, charCode: keyCode, which: keyCode,
          bubbles: true, cancelable: true
        };

        el.dispatchEvent(new KeyboardEvent('keydown', keyInit));
        el.dispatchEvent(new KeyboardEvent('keypress', keyInit));

        /* Append char to the real value via native setter */
        nativeSetter.call(el, el.value + char);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        el.dispatchEvent(new KeyboardEvent('keyup', keyInit));

        /* Random human delay: 20–50 ms per keystroke (fast typing) */
        setTimeout(typeNext, randDelay(20, 50));
      }

      /* Small pause before starting to type */
      setTimeout(typeNext, randDelay(50, 150));
    });
  }

  /**
   * Simulates a human clicking a button with mousedown/mouseup events and slight delay
   */
  function humanClick(el) {
    return new Promise(resolve => {
      if (!document.body.contains(el)) return resolve();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        if (!document.body.contains(el)) return resolve();
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.click();
        resolve();
      }, randDelay(50, 150));
    });
  }

  /* ─────────────────────────────────────────────
     PERFORM LOGIN ON /login PAGE
     Finds inputs by name= attribute (robust against
     React's randomised dynamic IDs like _R_55inp…)
  ───────────────────────────────────────────── */
  function performLogin(email, pass) {
    setStatus('info', 'Looking for login form…', 'Scanning the page', true);
    logActivity('Searching for email and password fields on login page...', 'info');

    const tryFill = (n = 0) => {
      /* Prefer name= selectors — works regardless of dynamic ID */
      const emailInp = document.querySelector('input[name="email"]')
        || document.querySelector('input[placeholder*="Email"]')
        || document.querySelector('input[type="email"]');
      const passInp = document.querySelector('input[name="password"]')
        || document.querySelector('input[type="password"]');

      /* Find the 'Sign in' button specifically */
      const submitBtn = Array.from(document.querySelectorAll('button')).find(
        b => (b.type === 'submit' || b.getAttribute('type') === 'submit') &&
          (b.textContent.toLowerCase().includes('sign in') || b.textContent.toLowerCase().includes('log in'))
      ) || document.querySelector('button[type="submit"]');

      if (emailInp && passInp && submitBtn) {
        setStatus('info', 'Typing email…', 'Simulating human typing', true);
        logActivity('Found login form. Starting human typing simulation.', 'success');
        logActivity('Typing email address...', 'info');

        humanType(emailInp, email).then(() => {
          setStatus('info', 'Typing password…', 'Simulating human typing', true);
          logActivity('Typing password...', 'info');

          /* Natural pause between fields */
          return new Promise(r => setTimeout(r, randDelay(300, 600)))
            .then(() => humanType(passInp, pass));
        }).then(() => {
          setStatus('info', 'Submitting…', 'Wait a moment', true);
          logActivity('Credentials entered. Waiting to click submit...', 'info');

          /* Brief pause before clicking submit, like a human */
          setTimeout(() => {
            submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            submitBtn.focus();
            setTimeout(() => {
              submitBtn.click();
              setStatus('success', 'Login submitted!', 'Waiting for response');
              showToast('Login requested', 'success');
              logActivity('Clicked "Sign in" button successfully. Login request submitted.', 'success');
            }, randDelay(200, 500));
          }, randDelay(400, 700));
        });

      } else if (n < 30) {
        /* Page still hydrating — retry */
        if (n % 10 === 0 && n > 0) logActivity('Still searching for login form elements...', 'warn');
        setTimeout(() => tryFill(n + 1), 400);
      } else {
        setStatus('error', 'Login form not found', 'Could not locate form fields.');
        showToast('Failed to find login fields', 'error');
        logActivity('Failed to find login fields (email/password/submit) after 30 attempts.', 'error');
      }
    };

    tryFill();
  }

  /* ─────────────────────────────────────────────
     LOGIN NOW (button handler)
  ───────────────────────────────────────────── */
  function loginNow() {
    const { email, pass } = getCredentials();
    if (!email || !pass) {
      setStatus('error', 'Credentials missing', 'Enter email and password first.');
      showToast('Enter credentials first', 'warning');
      logActivity('Cannot login: Email or password missing.', 'error');
      return;
    }

    if (/\/login/i.test(window.location.pathname)) {
      logActivity('Login button clicked. We are already on the login page.', 'info');
      performLogin(email, pass);
    } else {
      setStatus('info', 'Navigating to login page…', 'Redirecting', true);
      logActivity('Login button clicked. Navigating to login page...', 'info');
      GM_setValue(STORAGE_EMAIL, email);
      GM_setValue(STORAGE_PASS, pass);
      const link = findProfileLink();
      if (link) {
        logActivity('Found profile/logout link. Clicking it to navigate.', 'success');
        link.click();
      } else {
        logActivity('Could not find profile link. Falling back to direct URL navigation.', 'warn');
        window.location.href = 'https://toymate.com.au/login/';
      }
    }
  }

  /* ─────────────────────────────────────────────
     SET PAGE BADGE
  ───────────────────────────────────────────── */
  function setPageBadge(type, label) {
    const b = document.getElementById('tm-page-badge');
    if (b) {
      b.className = 'tm-page-badge ' + type;
      b.textContent = label;
    }
  }

  /* ─────────────────────────────────────────────
     HOME PAGE CHECK
  ───────────────────────────────────────────── */
  function checkHomePage() {
    setPageBadge('home', 'Homepage');
    
    const loggedInLink = document.querySelector('a[href*="/account/settings/"]');
    if (loggedInLink) {
      buildPanel();
      document.getElementById(PANEL_ID).classList.remove('tm-hidden');
      setStatus('success', 'Logged In', 'Account is ready');
      logActivity('User is already logged in! Auto-login skipped.', 'success');
      return;
    }
    
    const profileLink = findProfileLink();
    if (!profileLink) {
      logActivity('Could not detect login state. (No profile links found)', 'warn');
      return;
    }

    logActivity('Home page detected. User is currently logged out.', 'info');

    const autoEnabled = GM_getValue(STORAGE_AUTO, false);
    const savedEmail = GM_getValue(STORAGE_EMAIL, '');
    const savedPass = GM_getValue(STORAGE_PASS, '');

    if (autoEnabled && savedEmail && savedPass) {
      buildPanel();
      setStatus('info', 'Logged out detected', 'Navigating to login…', true);
      logActivity('Auto-login is enabled and credentials found. Navigating to login page...', 'success');
      setTimeout(() => profileLink.click(), 1200);
    } else {
      buildPanel();
      document.getElementById(PANEL_ID).classList.remove('tm-hidden');
      setStatus('warn', 'Not logged in', 'Enter credentials and click Login.');
      logActivity('Auto-login is disabled or credentials missing. Waiting for user input.', 'warn');
    }
  }

  /* ─────────────────────────────────────────────
     LOGIN PAGE CHECK
  ───────────────────────────────────────────── */
  function checkLoginPage() {
    const autoEnabled = GM_getValue(STORAGE_AUTO, false);
    const savedEmail = GM_getValue(STORAGE_EMAIL, '');
    const savedPass = GM_getValue(STORAGE_PASS, '');

    buildPanel();
    setPageBadge('login', 'Login Page');
    logActivity('Login page detected.', 'info');

    if (autoEnabled && savedEmail && savedPass) {
      setStatus('info', 'Auto-login enabled', 'Filling form…', true);
      logActivity('Auto-login enabled. Preparing to fill credentials...', 'success');
      setTimeout(() => performLogin(savedEmail, savedPass), 800);
    } else {
      setStatus('info', 'Login page ready', 'Click "Login Now" to sign in.');
      logActivity('Auto-login is disabled or credentials missing. Waiting for user to click Login Now.', 'warn');
    }
  }

  /* ─────────────────────────────────────────────
     BACKGROUND STOCK POLLING (no page refresh)
  ───────────────────────────────────────────── */
  let stockPollTimeout = null;

  function checkStockInBackground(url, onInStockCallback) {
    // Clear any previous poll
    if (stockPollTimeout) clearTimeout(stockPollTimeout);

    let pollCount = 0;
    const cleanUrl = url.split('?')[0]; // Strip query params for clean fetch
    
    const minDelay = GM_getValue(STORAGE_POLL_MIN, 3) * 1000;
    const maxDelay = GM_getValue(STORAGE_POLL_MAX, 6) * 1000;

    const scheduleNextPoll = () => {
      const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      stockPollTimeout = setTimeout(doPoll, delay);
    };

    const doPoll = () => {
      if (!botRunning && !GM_getValue(STORAGE_AUTO, false)) {
        logActivity('Stock polling stopped (bot stopped).', 'warn');
        return;
      }

      pollCount++;
      if (pollCount % 5 === 0) {
        logActivity(`Still polling stock... (check #${pollCount}) — ${cleanUrl}`, 'warn');
      }

      GM_xmlhttpRequest({
        method: 'GET',
        url: cleanUrl + "?_t=" + Date.now(), // Cache-busting timestamp
        headers: {
          'Accept': 'text/html',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        onload: function(res) {
          if (!botRunning && !GM_getValue(STORAGE_AUTO, false)) {
            return;
          }

          const html = res.responseText.toLowerCase();
          const hasAddToCart = html.includes('add to cart');
          const isOutOfStock = html.includes('out of stock') || html.includes('sold out') || html.includes('notify me');

          if (hasAddToCart && !isOutOfStock) {
            logActivity(`✅ STOCK DETECTED for ${cleanUrl}`, 'success');
            setStatus('success', 'In Stock!', 'Triggering buy...', true);
            showToast('🎉 In Stock! Buying now!', 'success');
            onInStockCallback();
          } else {
             scheduleNextPoll();
          }
        },
        onerror: function() {
          // silently ignore network errors — keep polling
          scheduleNextPoll();
        }
      });
    };

    doPoll(); // immediate first check
  }

  /* ─────────────────────────────────────────────
     AUTO-BUY LOGIC
  ───────────────────────────────────────────── */
  function startBot() {
    if (botRunning) return;
    botRunning = true;

    // Enable auto mode globally
    GM_setValue(STORAGE_AUTO, true);
    const toggle = document.getElementById('tm-auto-toggle');
    if (toggle) toggle.checked = true;

    document.getElementById('tm-start-bot-btn').style.display = 'none';
    document.getElementById('tm-stop-bot-btn').style.display = 'flex';

    logActivity('Bot started! Auto-mode enabled.', 'info');
    showToast('Bot Started', 'info');

    // Route to correct page logic
    const path = window.location.pathname;
    const host = window.location.hostname;

    if (/\/login/i.test(path)) {
      checkLoginPage();
    } else if (/\/cart/i.test(path)) {
      checkCartPage();
    } else if (host.includes('checkout.toymate.com.au') || /\/checkout/i.test(path)) {
      checkCheckoutPage();
    } else {
      runBuyLoop();
    }
  }

  function stopBot() {
    botRunning = false;
    clearTimeout(botLoopTimeout);

    // Disable auto mode globally
    GM_setValue(STORAGE_AUTO, false);
    const toggle = document.getElementById('tm-auto-toggle');
    if (toggle) toggle.checked = false;

    const startBtn = document.getElementById('tm-start-bot-btn');
    const stopBtn = document.getElementById('tm-stop-bot-btn');
    if (startBtn && stopBtn) {
      startBtn.style.display = 'flex';
      stopBtn.style.display = 'none';
    }

    logActivity('Bot stopped manually.', 'warn');
    setStatus('warn', 'Bot Stopped', 'Waiting for input');
    showToast('Bot Stopped', 'warning');
  }

  function runBuyLoop() {
    if (!botRunning) return;

    const qtyInputUI = document.getElementById('tm-qty-input');
    let currentQty = parseInt(qtyInputUI.value) || 1;

    const nativeQtyInput = document.querySelector('input[name="quantity"]');
    const nativeAddBtn = Array.from(document.querySelectorAll('button[type="submit"]')).find(b => b.textContent.toLowerCase().includes('add to cart'));

    if (!nativeQtyInput || !nativeAddBtn) {
      // No Add to Cart button visible — product might be out of stock right now.
      // Use background fetch to poll stock silently instead of page refreshing.
      const targetUrl = GM_getValue(STORAGE_TARGET_URL, '') || window.location.href;
      logActivity('Add to Cart not found. Polling stock silently via fetch...', 'warn');
      setStatus('warn', 'Waiting', 'Polling stock (no refresh)...', true);
      checkStockInBackground(targetUrl, () => {
        // Callback fires when stock detected — navigate to the product page
        logActivity('Stock detected via fetch! Navigating to product page to buy...', 'success');
        setStatus('info', 'In Stock!', 'Navigating...', true);
        setTimeout(() => { window.location.href = targetUrl; }, 500);
      });
      return;
    }

    logActivity(`Attempting to add ${currentQty} to cart...`, 'info');
    setStatus('info', 'Running', `Attempting qty: ${currentQty}`, true);

    humanType(nativeQtyInput, String(currentQty)).then(() => {
      if (!botRunning) return;

      const cartBadge = document.querySelector('a[href="/cart/"] span');
      const initialCount = cartBadge ? parseInt(cartBadge.textContent) || 0 : 0;

      // Re-query the Add to Cart button as typing may have caused React to re-render it
      const freshAddBtn = Array.from(document.querySelectorAll('button[type="submit"]')).find(b => b.textContent.toLowerCase().includes('add to cart'));

      if (!freshAddBtn) {
        logActivity('Add to cart button disappeared after typing. Retrying...', 'error');
        botLoopTimeout = setTimeout(runBuyLoop, 1000);
        return;
      }

      humanClick(freshAddBtn).then(() => {
        let checks = 0;
        const verifyInterval = setInterval(() => {
          if (!botRunning) { clearInterval(verifyInterval); return; }

          checks++;
          const newBadge = document.querySelector('a[href="/cart/"] span');
          const newCount = newBadge ? parseInt(newBadge.textContent) || 0 : 0;

          // 1. Check for success (cart count increased)
          if (newCount > initialCount) {
            clearInterval(verifyInterval);
            botRunning = false;
            logActivity(`Success! Added ${currentQty} to cart. Total: ${newCount}`, 'success');
            setStatus('success', 'Added to Cart', 'Redirecting to checkout...');
            showToast('Success! Redirecting...', 'success');

            setTimeout(() => {
              window.location.href = 'https://checkout.toymate.com.au/checkout';
            }, 1000);
            return;
          }

          // 2. Check for "Out of Stock" error banner
          const errorBanner = Array.from(document.querySelectorAll('div')).find(div =>
            div.className.includes('bg-[var(--form-status-light-background-error') &&
            div.textContent.includes('out of stock')
          );

          if (errorBanner) {
            clearInterval(verifyInterval);
            logActivity('Out of stock error detected by site.', 'warn');

            if (currentQty > 1) {
              currentQty--;
              qtyInputUI.value = currentQty;
              logActivity(`Reducing quantity to ${currentQty} and retrying...`, 'warn');
              setStatus('warn', 'Out of Stock', `Lowered qty to ${currentQty}`, true);
              botLoopTimeout = setTimeout(runBuyLoop, randDelay(500, 1000));
            } else {
              logActivity('Quantity is already 1, cannot reduce. Waiting 3s before retrying...', 'warn');
              setStatus('warn', 'Out of Stock', 'Waiting to retry (Qty: 1)', true);
              botLoopTimeout = setTimeout(runBuyLoop, 3000); // Wait longer if flickering stock
            }
            return;
          }

          // 3. Timeout check (site lag, no error, no success)
          if (checks > 40) { // ~4 seconds wait before retry
            clearInterval(verifyInterval);
            logActivity('No response from site after 4 seconds. Retrying click...', 'warn');
            setStatus('warn', 'Timeout', 'Retrying click', true);
            botLoopTimeout = setTimeout(runBuyLoop, randDelay(300, 800));
          }
        }, 100); // 100ms interval for faster checks
      });
    });
  }

  /* ─────────────────────────────────────────────
     PRODUCT PAGE CHECK
  ───────────────────────────────────────────── */
  function checkProductPage() {
    const titleEl = document.querySelector('h1');
    const skuSpan = Array.from(document.querySelectorAll('span')).find(el => el.textContent.trim() === 'SKU#:');
    const priceDiv = document.querySelector('.group\\/product-price');
    const priceEl = priceDiv ? priceDiv.querySelector('span.font-bold, span') : null;

    if (titleEl && skuSpan) {
      buildPanel();
      setPageBadge('product', 'Product Page');
      document.getElementById(PANEL_ID).classList.remove('tm-hidden');

      const title = titleEl.textContent.trim();
      const sku = skuSpan.parentElement.textContent.replace('SKU#:', '').trim();
      const price = priceEl ? priceEl.textContent.trim() : 'Unknown';

      setStatus('success', 'Product Detected', 'See Product tab for details');

      const productContainer = document.getElementById('tm-product-container');
      if (productContainer) {
        productContainer.innerHTML = `
          <div class="tm-product-card">
            <div class="tm-product-title">${escAttr(title)}</div>
            <div class="tm-product-row">
              <span class="tm-product-label">SKU</span>
              <span class="tm-product-sku">${escAttr(sku)}</span>
            </div>
            <div class="tm-product-row">
              <span class="tm-product-label">Price</span>
              <span class="tm-product-price">${escAttr(price)}</span>
            </div>
          </div>
        `;
      }

      logActivity('Product page detected and details extracted.', 'info');
    }
  }

  /* ─────────────────────────────────────────────
     CART PAGE LOGIC
  ───────────────────────────────────────────── */
  function checkCartPage() {
    buildPanel();
    setPageBadge('product', 'Cart Page');
    document.getElementById(PANEL_ID).classList.remove('tm-hidden');

    const autoEnabled = GM_getValue(STORAGE_AUTO, false);
    if (!autoEnabled) {
      logActivity('Auto-checkout disabled. Waiting for user input.', 'warn');
      setStatus('info', 'Cart Page Ready', 'Auto-login disabled.');
      return;
    }

    logActivity('Cart page detected. Waiting for cart app to load...', 'info');
    setStatus('info', 'Auto-Checkout', 'Waiting for cart...', true);

    const tryCheckout = (n = 0) => {
      if (!botRunning && !GM_getValue(STORAGE_AUTO, false)) return;

      const couponCode = GM_getValue(STORAGE_COUPON, '').trim();
      const couponInput = document.querySelector('input[name="couponCode"]');
      const checkoutBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().toLowerCase() === 'checkout' || b.textContent.includes('Checkout'));

      if (checkoutBtn) {
        setStatus('info', 'Auto-Checkout', 'Processing cart...', true);
        const proceedToCheckout = () => {
          logActivity('Clicking checkout button...', 'info');
          // Re-query checkout button as typing the coupon may have re-rendered it
          const freshCheckoutBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().toLowerCase() === 'checkout' || b.textContent.includes('Checkout'));
          if (freshCheckoutBtn) {
            humanClick(freshCheckoutBtn);
          } else {
            logActivity('Checkout button missing after typing coupon.', 'error');
          }
        };

        if (couponCode && couponInput) {
          logActivity(`Applying coupon code: ${couponCode}`, 'info');
          setStatus('info', 'Applying Coupon', 'Typing code...', true);
          humanType(couponInput, couponCode).then(() => {
            setTimeout(proceedToCheckout, 400);
          });
        } else {
          if (couponCode) logActivity('Coupon provided, but input field not found on page.', 'warn');
          setTimeout(proceedToCheckout, 400);
        }
      } else if (n < 60) {
        if (n % 10 === 0 && n > 0) logActivity('Still waiting for checkout button...', 'warn');
        setTimeout(() => tryCheckout(n + 1), 200);
      } else {
        logActivity('Checkout button not found on page after 12 seconds.', 'error');
        setStatus('error', 'Error', 'Checkout button missing');
      }
    };

    tryCheckout();
  }

  /* ─────────────────────────────────────────────
     CHECKOUT PAGE LOGIC
  ───────────────────────────────────────────── */
  function checkCheckoutPage() {
    buildPanel();
    setPageBadge('product', 'Checkout Page');
    document.getElementById(PANEL_ID).classList.remove('tm-hidden');

    const autoEnabled = GM_getValue(STORAGE_AUTO, false);
    if (!autoEnabled) {
      logActivity('Auto-checkout disabled. Waiting for user input.', 'warn');
      setStatus('info', 'Checkout Ready', 'Auto-login disabled.');
      return;
    }

    logActivity('Checkout page detected. Looking for continue button...', 'info');
    setStatus('info', 'Auto-Checkout', 'Processing shipping...', true);

    const tryContinue = (n = 0) => {
      if (!botRunning && !GM_getValue(STORAGE_AUTO, false)) return;

      const continueBtn = document.getElementById('checkout-shipping-continue');
      const ccRadio = document.getElementById('radio-adyenv3-scheme');
      const ccLabel = document.querySelector('label[for="radio-adyenv3-scheme"]');
      const placeOrderBtn = document.getElementById('checkout-payment-continue');

      // Step 1: Click Continue on Shipping if it's there
      if (continueBtn && !continueBtn.disabled && document.body.contains(continueBtn)) {
        setStatus('info', 'Auto-Checkout', 'Continuing to payment...', true);
        logActivity('Clicking shipping continue button...', 'info');
        humanClick(continueBtn).then(() => {
          setTimeout(() => tryContinue(0), 1000);
        });
        
      // Step 2: Select Credit Card if we are on Payment step
      } else if (ccRadio && !ccRadio.checked && ccLabel) {
        setStatus('info', 'Auto-Checkout', 'Selecting Credit Card...', true);
        logActivity('Selecting Credit Card payment method...', 'info');
        humanClick(ccLabel).then(() => {
          logActivity('Credit Card selected. Waiting for details...', 'success');
          setStatus('success', 'Payment', 'Enter CC details');
          setTimeout(() => tryContinue(0), 1000);
        });

      // Step 3: Click Place Order once Credit Card is selected and button is available
      } else if (ccRadio && ccRadio.checked && placeOrderBtn && document.body.contains(placeOrderBtn)) {
        if (!placeOrderBtn.disabled) {
          setStatus('info', 'Auto-Checkout', 'Placing order...', true);
          logActivity('Clicking Place Order button...', 'info');
          humanClick(placeOrderBtn).then(() => {
            logActivity('Click sent. Re-verifying in 2s...', 'success');
            // Retry clicking after 2 seconds if the button is still there (heavy site)
            setTimeout(() => tryContinue(n + 1), 2000);
          });
        } else {
          if (n % 10 === 0 && n > 0) logActivity('Waiting for Place Order to become enabled...', 'warn');
          setTimeout(() => tryContinue(n + 1), 250);
        }

      // Step 4: Keep waiting for steps to load
      } else if (n < 80) {
        if (n % 10 === 0 && n > 0) logActivity('Waiting for checkout steps...', 'warn');
        setTimeout(() => tryContinue(n + 1), 250);
      } else {
        logActivity('Checkout step not found after 20 seconds.', 'error');
        setStatus('error', 'Error', 'Checkout stalled');
      }
    };

    tryContinue();
  }

  /* ─────────────────────────────────────────────
     ADYEN IFRAME CHECK (CREDIT CARD)
  ───────────────────────────────────────────── */
  function checkAdyenIframe() {
    const autoEnabled = GM_getValue(STORAGE_AUTO, false);
    if (!autoEnabled) return;

    // Check which field this is and fill it
    const loop = setInterval(() => {
      if (!botRunning && !GM_getValue(STORAGE_AUTO, false)) {
        clearInterval(loop);
        return;
      }

      const numInput = document.querySelector('input[data-fieldtype="encryptedCardNumber"]');
      const expInput = document.querySelector('input[data-fieldtype="encryptedExpiryDate"]');
      const cvvInput = document.querySelector('input[data-fieldtype="encryptedSecurityCode"]');

      if (numInput && !numInput.value) {
        clearInterval(loop);
        const ccNum = GM_getValue(STORAGE_CC_NUM, '');
        if (ccNum) humanType(numInput, ccNum);
      } else if (expInput && !expInput.value) {
        clearInterval(loop);
        const ccExp = GM_getValue(STORAGE_CC_EXP, '');
        if (ccExp) humanType(expInput, ccExp);
      } else if (cvvInput && !cvvInput.value) {
        clearInterval(loop);
        const ccCvv = GM_getValue(STORAGE_CC_CVV, '');
        if (ccCvv) humanType(cvvInput, ccCvv);
      }
    }, 500);
  }

  /* ─────────────────────────────────────────────
     INIT
  ───────────────────────────────────────────── */
  function init() {
    injectStyles();
    buildToggleBubble();
    const path = window.location.pathname;
    const host = window.location.hostname;

    if (host.includes('adyen.com')) {
      checkAdyenIframe();
      return;
    }

    if (/\/login/i.test(path)) {
      checkLoginPage();
    } else if (/\/cart/i.test(path)) {
      checkCartPage();
    } else if (host.includes('checkout.toymate.com.au') || /\/checkout/i.test(path)) {
      checkCheckoutPage();
    } else {
      setTimeout(() => {
        checkHomePage();
        checkProductPage();
      }, 1500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
