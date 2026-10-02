// ==UserScript==
// @name         Toymate Auto Checkout & Restock Monitor
// @namespace    https://toymate.com.au/
// @version      2.1.0
// @description  Advanced auto-checkout, flash restock sniper, bezier human emulation, and TCG release alert bot for Toymate.
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
// @connect      checkout.toymate.com.au
// @connect      discord.com
// @connect      discordapp.com
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     ANTI-DETECTION: Early Browser Spoofing
  ───────────────────────────────────────────── */
  try {
    if (Object.defineProperty) {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true
      });
    }
  } catch (e) { /* ignore */ }

  /* ─────────────────────────────────────────────
     CONSTANTS & STORAGE KEYS
  ───────────────────────────────────────────── */
  const STORAGE_EMAIL            = 'tm_auto_email';
  const STORAGE_PASS             = 'tm_auto_pass';
  const STORAGE_AUTO             = 'tm_auto_enable';
  const STORAGE_COUPON           = 'tm_auto_coupon';
  const STORAGE_CC_NUM           = 'tm_auto_cc_num';
  const STORAGE_CC_EXP           = 'tm_auto_cc_exp';
  const STORAGE_CC_CVV           = 'tm_auto_cc_cvv';
  const STORAGE_TARGET_URL       = 'tm_target_url';
  const STORAGE_POLL_MIN         = 'tm_poll_min';
  const STORAGE_POLL_MAX         = 'tm_poll_max';
  const STORAGE_DISCORD_WEBHOOK  = 'tm_discord_webhook';
  const STORAGE_SOUND_ENABLED    = 'tm_sound_enabled';
  const STORAGE_TARGET_QTY       = 'tm_target_qty';
  const STORAGE_TCG_ENABLED      = 'tm_tcg_monitor_enabled';
  const STORAGE_TCG_URL          = 'tm_tcg_category_url';
  const STORAGE_TCG_KNOWN_IDS    = 'tm_tcg_known_ids';
  const STORAGE_AUTO_BUY_MONITOR = 'tm_auto_buy_monitor';
  const STORAGE_MONITOR_URL      = 'tm_monitor_url';
  const STORAGE_PERSONALITY      = 'tm_personality_mode';
  const STORAGE_TURBO_POLL       = 'tm_turbo_poll_enabled';
  const STORAGE_BOT_DETECT_COUNT = 'tm_bot_detect_count';
  const PANEL_ID                 = 'tm-autologin-panel';

  /* ─────────────────────────────────────────────
     PERSONALITY PROFILES (HUMAN TIMING VARIATION)
  ───────────────────────────────────────────── */
  const PROFILES = {
    cautious: {
      name: 'Cautious (Stealth)',
      minType: 35, maxType: 80,
      minPause: 300, maxPause: 700,
      minHover: 120, maxHover: 260,
      typoRate: 0.015,
      bezierSteps: [8, 14],
      scrollOvershoot: [30, 70]
    },
    normal: {
      name: 'Normal (Balanced)',
      minType: 18, maxType: 50,
      minPause: 180, maxPause: 450,
      minHover: 60, maxHover: 160,
      typoRate: 0.008,
      bezierSteps: [6, 10],
      scrollOvershoot: [20, 50]
    },
    fast_typer: {
      name: 'Turbo Sniper (Fast)',
      minType: 8, maxType: 24,
      minPause: 80, maxPause: 220,
      minHover: 30, maxHover: 90,
      typoRate: 0.002,
      bezierSteps: [4, 7],
      scrollOvershoot: [10, 30]
    }
  };

  function getActiveProfile() {
    const key = GM_getValue(STORAGE_PERSONALITY, 'normal');
    return PROFILES[key] || PROFILES.normal;
  }

  /* ─────────────────────────────────────────────
     BOT STATE MACHINE
  ───────────────────────────────────────────── */
  const BotState = {
    IDLE: 'IDLE',
    MONITORING: 'MONITORING',
    TURBO_MONITORING: 'TURBO_MONITORING',
    PRODUCT_DETECTED: 'PRODUCT_DETECTED',
    ADJUSTING_QTY: 'ADJUSTING_QTY',
    ADDING_TO_CART: 'ADDING_TO_CART',
    VERIFYING_CART: 'VERIFYING_CART',
    NAVIGATING_TO_CART: 'NAVIGATING_TO_CART',
    ON_CART_PAGE: 'ON_CART_PAGE',
    CHECKOUT_SHIPPING: 'CHECKOUT_SHIPPING',
    CHECKOUT_PAYMENT: 'CHECKOUT_PAYMENT',
    COMPLETED: 'COMPLETED',
    BACKOFF_RETRY: 'BACKOFF_RETRY'
  };

  let currentState = BotState.IDLE;
  let botRunning = false;
  let botLoopTimeout = null;
  let stockPollTimeout = null;
  let tcgPollTimeout = null;
  let pageMonitorTimeout = null;
  let pageMonitorRunning = false;
  let liveProductObserver = null;
  let watchdogInterval = null;
  let lastActivityTimestamp = Date.now();
  let turboModeExpiresAt = 0;
  let knownProductStatuses = {};

  function setBotState(newState, detail = '') {
    currentState = newState;
    lastActivityTimestamp = Date.now();
    const badge = document.getElementById('tm-bot-state-badge');
    if (badge) {
      badge.textContent = newState + (detail ? ` (${detail})` : '');
    }
  }

  /* ─────────────────────────────────────────────
     HUMAN EMULATION LAYER
     - Cursor tracking
     - Cubic Bezier curved mouse trajectories
     - Scroll with overshoot & settle
     - Realistic keyboard events with typo correction
     - PointerEvent + MouseEvent synthetic event dispatch
  ───────────────────────────────────────────── */
  let lastMouseX = Math.floor(window.innerWidth / 2) || 400;
  let lastMouseY = Math.floor(window.innerHeight / 2) || 300;

  document.addEventListener('mousemove', e => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }, { passive: true });

  function randDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function bezierPoint(p0, p1, p2, p3, t) {
    const cX = 3 * (p1.x - p0.x);
    const bX = 3 * (p2.x - p1.x) - cX;
    const aX = p3.x - p0.x - cX - bX;

    const cY = 3 * (p1.y - p0.y);
    const bY = 3 * (p2.y - p1.y) - cY;
    const aY = p3.y - p0.y - cY - bY;

    const x = aX * Math.pow(t, 3) + bX * Math.pow(t, 2) + cX * t + p0.x;
    const y = aY * Math.pow(t, 3) + bY * Math.pow(t, 2) + cY * t + p0.y;

    return { x, y };
  }

  /**
   * Smoothly moves mouse from current position to element center along a curved trajectory
   */
  async function simulateMouseTrajectory(targetEl) {
    if (!targetEl || !document.body.contains(targetEl)) return;
    const profile = getActiveProfile();
    const rect = targetEl.getBoundingClientRect();
    
    const targetX = rect.left + rect.width * (0.35 + Math.random() * 0.3);
    const targetY = rect.top + rect.height * (0.35 + Math.random() * 0.3);

    const start = { x: lastMouseX, y: lastMouseY };
    const end = { x: targetX, y: targetY };

    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const curvature = Math.min(distance * 0.25, 80) * (Math.random() > 0.5 ? 1 : -1);

    const cp1 = {
      x: start.x + (end.x - start.x) * 0.25 + (Math.random() * curvature - curvature / 2),
      y: start.y + (end.y - start.y) * 0.25 - curvature
    };
    const cp2 = {
      x: start.x + (end.x - start.x) * 0.75 + (Math.random() * curvature - curvature / 2),
      y: start.y + (end.y - start.y) * 0.75 + curvature * 0.5
    };

    const steps = randDelay(profile.bezierSteps[0], profile.bezierSteps[1]);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const pt = bezierPoint(start, cp1, cp2, end, t);
      const jitterX = (Math.random() - 0.5) * 2;
      const jitterY = (Math.random() - 0.5) * 2;
      
      const currentPtX = Math.round(pt.x + jitterX);
      const currentPtY = Math.round(pt.y + jitterY);
      lastMouseX = currentPtX;
      lastMouseY = currentPtY;

      const evtInit = {
        clientX: currentPtX,
        clientY: currentPtY,
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window
      };
      
      const elAtPt = document.elementFromPoint(currentPtX, currentPtY) || targetEl;
      try {
        if (window.PointerEvent) {
          elAtPt.dispatchEvent(new PointerEvent('pointermove', evtInit));
        }
        elAtPt.dispatchEvent(new MouseEvent('mousemove', evtInit));
      } catch (e) {}

      await new Promise(r => setTimeout(r, randDelay(6, 16)));
    }
  }

  /**
   * Human-like scrolling with smooth overshoot and settling
   */
  async function humanScrollTo(targetEl) {
    if (!targetEl || !document.body.contains(targetEl)) return;
    const profile = getActiveProfile();
    const rect = targetEl.getBoundingClientRect();
    const isVisible = rect.top >= 50 && rect.bottom <= (window.innerHeight - 50);

    if (!isVisible) {
      const overshoot = randDelay(profile.scrollOvershoot[0], profile.scrollOvershoot[1]);
      const targetScrollY = window.scrollY + rect.top - (window.innerHeight / 2) + overshoot;

      window.scrollTo({
        top: Math.max(0, targetScrollY),
        behavior: 'smooth'
      });

      await new Promise(r => setTimeout(r, randDelay(180, 320)));

      window.scrollTo({
        top: Math.max(0, targetScrollY - overshoot),
        behavior: 'smooth'
      });

      await new Promise(r => setTimeout(r, randDelay(120, 220)));
    }
  }

  /**
   * Complete human click: Scroll -> Curved Mouse Trajectory -> Hover -> Mousedown -> Mouseup -> Click
   * Compatible with React 18 synthetic event delegation & PointerEvents
   */
  async function humanClick(el) {
    if (!el || !document.body.contains(el)) return;
    const profile = getActiveProfile();

    await humanScrollTo(el);
    await simulateMouseTrajectory(el);

    if (!document.body.contains(el)) return;

    const rect = el.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    const eventOpts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      button: 0,
      buttons: 1
    };

    // 1. Mouse & Pointer Over
    try {
      el.dispatchEvent(new MouseEvent('mouseover', eventOpts));
      el.dispatchEvent(new MouseEvent('mouseenter', eventOpts));
      if (window.PointerEvent) {
        el.dispatchEvent(new PointerEvent('pointerover', eventOpts));
        el.dispatchEvent(new PointerEvent('pointerenter', eventOpts));
      }
    } catch (e) {}

    await new Promise(r => setTimeout(r, randDelay(profile.minHover, profile.maxHover)));
    if (!document.body.contains(el)) return;

    // 2. Pointerdown / Mousedown
    try {
      if (window.PointerEvent) {
        el.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
      }
      el.dispatchEvent(new MouseEvent('mousedown', eventOpts));
    } catch (e) {}

    await new Promise(r => setTimeout(r, randDelay(30, 75)));
    if (!document.body.contains(el)) return;

    // 3. Pointerup / Mouseup
    const upOpts = { ...eventOpts, buttons: 0 };
    try {
      if (window.PointerEvent) {
        el.dispatchEvent(new PointerEvent('pointerup', upOpts));
      }
      el.dispatchEvent(new MouseEvent('mouseup', upOpts));
      el.dispatchEvent(new MouseEvent('click', upOpts));
    } catch (e) {}

    // 4. Native invocation
    if (typeof el.click === 'function') {
      try { el.click(); } catch (e) {}
    }

    // Also trigger on closest button if click target was an inner span/svg
    const parentBtn = el.closest('button');
    if (parentBtn && parentBtn !== el && typeof parentBtn.click === 'function') {
      try { parentBtn.click(); } catch (e) {}
    }

    await new Promise(r => setTimeout(r, randDelay(50, 120)));
  }

  /**
   * Key code mapping for realistic keyboard events
   */
  function getKeyMetadata(char) {
    if (char >= 'a' && char <= 'z') {
      return { code: 'Key' + char.toUpperCase(), key: char, isShift: false };
    }
    if (char >= 'A' && char <= 'Z') {
      return { code: 'Key' + char, key: char, isShift: true };
    }
    if (char >= '0' && char <= '9') {
      return { code: 'Digit' + char, key: char, isShift: false };
    }
    const special = {
      '@': { code: 'Digit2', key: '@', isShift: true },
      '.': { code: 'Period', key: '.', isShift: false },
      '-': { code: 'Minus', key: '-', isShift: false },
      '_': { code: 'Minus', key: '_', isShift: true },
      ' ': { code: 'Space', key: ' ', isShift: false }
    };
    return special[char] || { code: 'Key' + char.toUpperCase(), key: char, isShift: false };
  }

  /**
   * Realistic human typing with keydown -> keypress -> input -> keyup
   */
  function humanType(el, text) {
    return new Promise(async (resolve) => {
      if (!el || !document.body.contains(el)) return resolve();
      const profile = getActiveProfile();

      await humanClick(el);
      el.focus();

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set || function (v) { el.value = v; };

      nativeSetter.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const meta = getKeyMetadata(char);

        if (Math.random() < profile.typoRate && char.match(/[a-z0-9]/i)) {
          const typoChar = String.fromCharCode(char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1));
          nativeSetter.call(el, el.value + typoChar);
          el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          await new Promise(r => setTimeout(r, randDelay(100, 200)));
          
          nativeSetter.call(el, el.value.slice(0, -1));
          el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          await new Promise(r => setTimeout(r, randDelay(60, 140)));
        }

        const keyInit = {
          key: meta.key,
          code: meta.code,
          shiftKey: meta.isShift,
          bubbles: true,
          cancelable: true,
          composed: true
        };

        el.dispatchEvent(new KeyboardEvent('keydown', keyInit));
        el.dispatchEvent(new KeyboardEvent('keypress', keyInit));

        nativeSetter.call(el, el.value + char);
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

        el.dispatchEvent(new KeyboardEvent('keyup', keyInit));

        await new Promise(r => setTimeout(r, randDelay(profile.minType, profile.maxType)));
      }

      await new Promise(r => setTimeout(r, randDelay(profile.minPause / 2, profile.maxPause / 2)));
      el.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
      resolve();
    });
  }

  /* ─────────────────────────────────────────────
     ROBUST ELEMENT LOCATORS FOR TOYMATE REACT UI
  ───────────────────────────────────────────── */
  function findAddToCartButton() {
    const buttons = Array.from(document.querySelectorAll('button'));
    const found = buttons.find(b => {
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') return false;
      const txt = (b.textContent || '').trim().toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      return (txt.includes('add to cart') || aria.includes('add to cart')) && !txt.includes('out of stock') && !txt.includes('sold out');
    });
    if (found) return found;

    // Fallback: look for submit buttons inside product purchase containers
    const submitBtns = Array.from(document.querySelectorAll('button[type="submit"]:not([disabled])'));
    return submitBtns[0] || null;
  }

  function findQuantityControls() {
    const input = document.querySelector('input[name="quantity"]')
      || document.querySelector('input[aria-label="Quantity"]')
      || document.querySelector('input[id*="quantity"]')
      || document.querySelector('input[type="number"]');

    // Increase and decrease buttons in Toymate's number-input component
    const incBtn = document.querySelector('button[aria-label="Increase quantity"]')
      || document.querySelector('button[aria-label*="increase" i]')
      || (input ? input.parentElement?.querySelector('button:last-of-type') : null);

    const decBtn = document.querySelector('button[aria-label="Decrease quantity"]')
      || document.querySelector('button[aria-label*="decrease" i]')
      || (input ? input.parentElement?.querySelector('button:first-of-type') : null);

    return { input, incBtn, decBtn };
  }

  function findCartLink() {
    const links = Array.from(document.querySelectorAll('a[aria-label="Cart"], a[href="/cart/"], a[href*="/cart"]'));
    const visible = links.find(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden';
    });
    return visible || links[0] || null;
  }

  function getCartBadgeInfo() {
    const link = findCartLink();
    if (!link) {
      const span = document.querySelector('a[href*="cart"] span, span[class*="nav-cart-count"]');
      if (span) {
        const count = parseInt(span.textContent.trim()) || 0;
        return { hasBadge: true, count, link: span.closest('a') || findCartLink(), span };
      }
      return { hasBadge: false, count: 0, link: null };
    }
    const span = link.querySelector('span') || link.parentElement?.querySelector('span[class*="nav-cart-count"]');
    if (!span) return { hasBadge: false, count: 0, link };
    const count = parseInt(span.textContent.trim()) || 0;
    return { hasBadge: true, count, link, span };
  }

  /* ─────────────────────────────────────────────
     STYLES (MODERN GLASSMORPHISM DESIGN)
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
      @keyframes tm-turbo     { 0%{box-shadow:0 0 4px #F59E0B} 50%{box-shadow:0 0 16px #EF4444} 100%{box-shadow:0 0 4px #F59E0B} }

      #tm-toggle-bubble {
        position:fixed; bottom:24px; right:24px; z-index:2147483640;
        width:56px; height:56px; border-radius:50%; cursor:pointer;
        background:linear-gradient(135deg, #7C3AED 0%, #2563EB 100%);
        border:none; display:flex; align-items:center; justify-content:center;
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
        width:380px; border-radius:20px; overflow:hidden;
        font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
        animation:tm-fadeIn .35s cubic-bezier(.22,1,.36,1) both;
        box-shadow:0 0 0 1px rgba(255,255,255,.08),0 24px 64px rgba(0,0,0,.55),0 0 80px rgba(124,58,237,.18);
        backdrop-filter:blur(24px) saturate(1.6);
        -webkit-backdrop-filter:blur(24px) saturate(1.6);
        background:rgba(12,12,20,.92);
      }
      #tm-autologin-panel.tm-hidden { display:none; }

      .tm-header-bar {
        height:4px;
        background:linear-gradient(90deg,#7C3AED,#2563EB,#06B6D4,#7C3AED);
        background-size:300% 100%; animation:tm-gradient 3s ease infinite;
      }
      .tm-header {
        display:flex; align-items:center; justify-content:space-between;
        padding:16px 20px 10px;
      }
      .tm-title-group { display:flex; align-items:center; gap:10px; }
      .tm-icon-wrap {
        width:34px; height:34px; border-radius:10px;
        background:linear-gradient(135deg,#7C3AED,#2563EB);
        display:flex; align-items:center; justify-content:center;
        font-size:18px; box-shadow:0 4px 12px rgba(124,58,237,.4);
      }
      .tm-title { font-size:15px; font-weight:700; color:#fff; letter-spacing:-.2px; }
      .tm-subtitle { font-size:11px; color:rgba(255,255,255,.45); margin-top:1px; }

      .tm-badge-row {
        display:flex; gap:6px; align-items:center; padding:0 20px 10px;
      }
      .tm-state-badge {
        font-size:10px; font-weight:700; text-transform:uppercase;
        padding:3px 8px; border-radius:12px; background:rgba(255,255,255,.08);
        color:rgba(255,255,255,.8); border:1px solid rgba(255,255,255,.12);
        letter-spacing:0.4px;
      }
      .tm-turbo-badge {
        font-size:10px; font-weight:700; text-transform:uppercase;
        padding:3px 8px; border-radius:12px; background:rgba(239,68,68,.2);
        color:#FCA5A5; border:1px solid rgba(239,68,68,.4);
        display:none; animation:tm-turbo 1.5s infinite;
      }

      .tm-close-btn {
        background:rgba(255,255,255,.07); border:none; border-radius:8px;
        width:28px; height:28px; cursor:pointer; color:rgba(255,255,255,.5);
        display:flex; align-items:center; justify-content:center; transition:all .15s;
      }
      .tm-close-btn:hover { background:rgba(255,255,255,.14); color:#fff; }

      .tm-body { padding:0 20px 14px; }
      .tm-field { margin-bottom:10px; }
      .tm-label { font-size:11px; font-weight:600; color:rgba(255,255,255,.6); margin-bottom:4px; text-transform:uppercase; letter-spacing:.5px; }
      .tm-input-wrap {
        position:relative; display:flex; align-items:center;
        background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1);
        border-radius:10px; transition:border-color .2s;
      }
      .tm-input-wrap:focus-within { border-color:#7C3AED; background:rgba(255,255,255,.09); }
      .tm-input-icon { padding-left:12px; color:rgba(255,255,255,.35); display:flex; align-items:center; }
      .tm-input {
        width:100%; padding:9px 12px 9px 8px; background:transparent; border:none;
        outline:none; color:#fff; font-size:13px; font-family:inherit;
      }
      .tm-input::placeholder { color:rgba(255,255,255,.25); }
      .tm-input-btn {
        background:none; border:none; padding:0 10px; color:rgba(255,255,255,.35);
        cursor:pointer; display:flex; align-items:center; transition:color .15s;
      }
      .tm-input-btn:hover { color:#fff; }

      .tm-select {
        width:100%; padding:8px 12px; background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.12); border-radius:10px;
        color:#fff; font-size:12.5px; outline:none; font-family:inherit;
      }
      .tm-select option { background:#1E1E2E; color:#fff; }

      .tm-toggle-row {
        display:flex; align-items:center; justify-content:space-between;
        padding:8px 0; border-top:1px solid rgba(255,255,255,.06);
      }
      .tm-toggle-label { font-size:12px; color:rgba(255,255,255,.8); font-weight:500; }
      .tm-switch { position:relative; display:inline-block; width:40px; height:22px; }
      .tm-switch input { opacity:0; width:0; height:0; }
      .tm-switch-slider {
        position:absolute; inset:0; border-radius:22px; cursor:pointer;
        background:rgba(255,255,255,.15); transition:.25s;
      }
      .tm-switch-slider:before {
        content:''; position:absolute; height:16px; width:16px;
        left:3px; bottom:3px; border-radius:50%; background:#fff;
        transition:.25s; box-shadow:0 2px 4px rgba(0,0,0,.3);
      }
      .tm-switch input:checked + .tm-switch-slider { background:#7C3AED; }
      .tm-switch input:checked + .tm-switch-slider:before { transform:translateX(18px); }

      .tm-status {
        margin:8px 0 12px; padding:10px 14px; border-radius:12px;
        display:flex; align-items:center; gap:10px; font-size:12px;
        border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.04);
      }
      .tm-status.info    { background:rgba(37,99,235,.15);  border-color:rgba(37,99,235,.35); }
      .tm-status.success { background:rgba(16,185,129,.15); border-color:rgba(16,185,129,.35); }
      .tm-status.warn    { background:rgba(245,158,11,.15); border-color:rgba(245,158,11,.35); }
      .tm-status.error   { background:rgba(239,68,68,.15);  border-color:rgba(239,68,68,.35); }
      
      .tm-status-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
      .tm-status.info    .tm-status-dot { background:#3B82F6; box-shadow:0 0 8px #3B82F6; animation:tm-pulse 1.4s infinite; }
      .tm-status.success .tm-status-dot { background:#10B981; box-shadow:0 0 8px #10B981; }
      .tm-status.warn    .tm-status-dot { background:#F59E0B; box-shadow:0 0 8px #F59E0B; animation:tm-pulse 1.4s infinite; }
      .tm-status.error   .tm-status-dot { background:#EF4444; box-shadow:0 0 8px #EF4444; animation:tm-pulse 1.4s infinite; }
      
      .tm-status-text { flex:1; }
      .tm-status-title { font-size:13px; font-weight:700; color:#fff; }
      .tm-status-desc  { font-size:11px; color:rgba(255,255,255,.55); margin-top:2px; }

      .tm-page-badge {
        display:inline-flex; align-items:center; gap:5px;
        padding:4px 10px; border-radius:20px; font-size:10px;
        font-weight:700; letter-spacing:.5px; text-transform:uppercase; margin-bottom:10px;
      }
      .tm-page-badge.product { background:rgba(230,0,18,.2); color:#ff7070; border:1px solid rgba(230,0,18,.3); }
      .tm-page-badge.home    { background:rgba(16,185,129,.15); color:#6ee7b7; border:1px solid rgba(16,185,129,.25); }
      .tm-page-badge.login   { background:rgba(99,102,241,.2); color:#a5b4fc; border:1px solid rgba(99,102,241,.3); }
      .tm-page-badge.other   { background:rgba(255,255,255,.08); color:rgba(255,255,255,.5); border:1px solid rgba(255,255,255,.12); }

      .tm-toast {
        position:fixed; bottom:100px; right:24px; z-index:2147483647;
        padding:12px 18px; border-radius:12px; font-family:inherit;
        font-size:13px; font-weight:600; color:#fff;
        box-shadow:0 8px 32px rgba(0,0,0,.4); display:flex; align-items:center; gap:8px;
        animation:tm-toast-in .3s cubic-bezier(.34,1.56,.64,1) forwards; max-width:320px;
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
      .tm-divider { height:1px; background:rgba(255,255,255,.06); margin:10px 0; }
      .tm-footer {
        padding:8px 20px 12px; display:flex; align-items:center; justify-content:center;
        color:rgba(255,255,255,.2); font-size:10.5px; font-family:inherit;
      }

      .tm-tabs {
        display:flex; border-bottom:1px solid rgba(255,255,255,.08);
        background:rgba(0,0,0,.25); flex-shrink:0; margin:-16px -20px 12px;
      }
      .tm-tab {
        flex:1; padding:10px 2px; text-align:center; font-size:10.5px; font-weight:600;
        color:rgba(255,255,255,.45); cursor:pointer; border-bottom:2px solid transparent;
        transition:all .15s; letter-spacing:.3px; text-transform:uppercase; user-select:none;
      }
      .tm-tab:hover { color:rgba(255,255,255,.8); }
      .tm-tab.active { color:#38BDF8; border-bottom-color:#7C3AED; }

      .tm-section { display:none; flex-direction:column; gap:10px; }
      .tm-section.active { display:flex; }

      .tm-product-card {
        background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07);
        border-radius:12px; padding:12px;
      }
      .tm-product-title { font-size:13.5px; font-weight:700; color:#fff; margin-bottom:8px; line-height:1.4; }
      .tm-product-row { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px; }
      .tm-product-label { font-size:10.5px; color:rgba(255,255,255,.5); text-transform:uppercase; font-weight:600; }
      .tm-product-sku { font-size:11.5px; color:rgba(255,255,255,.8); font-family:monospace; }
      .tm-product-price { font-size:17px; font-weight:800; color:#6EE7B7; }
      .tm-empty-state { text-align:center; color:rgba(255,255,255,.3); font-size:11.5px; padding:16px 0; }

      .tm-qty-wrap { display:flex; gap:8px; margin-top:10px; align-items:center; }
      .tm-qty-wrap input { width:56px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.15); color:#fff; text-align:center; border-radius:8px; padding:8px; font-weight:600; }
      .tm-btn-cart { background:linear-gradient(135deg,#D97706,#F59E0B); color:#fff; flex:1; padding:9px; border-radius:8px; border:none; cursor:pointer; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 4px 12px rgba(217,119,6,.3); transition:transform .2s; }
      .tm-btn-cart:hover { transform:translateY(-1px); box-shadow:0 6px 16px rgba(217,119,6,.4); }
      .tm-btn-stop { background:linear-gradient(135deg,#DC2626,#EF4444); color:#fff; flex:1; padding:9px; border-radius:8px; border:none; cursor:pointer; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 4px 12px rgba(220,38,38,.3); transition:transform .2s; }
      .tm-btn-stop:hover { transform:translateY(-1px); box-shadow:0 6px 16px rgba(220,38,38,.4); }

      .tm-activity-log {
        background: rgba(0,0,0,.45); border-radius: 8px;
        padding: 10px 12px; font-family: monospace; font-size: 10.5px;
        max-height: 85px; overflow-y: auto; color: #A7F3D0;
        display: flex; flex-direction: column; gap: 3px;
        margin: 8px 20px; border: 1px solid rgba(255,255,255,0.05);
      }
      .tm-activity-log::-webkit-scrollbar { width: 4px; }
      .tm-activity-log::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 4px; }
      .tm-log-item { display: flex; gap: 6px; line-height: 1.35; animation: tm-fadeIn 0.25s ease; }
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
     SVG ICONS
  ───────────────────────────────────────────── */
  const mkSvg = (d, w = 15, h = 15) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  const ICON_MAIL = mkSvg('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>');
  const ICON_LOCK = mkSvg('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>');
  const ICON_EYE = mkSvg('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>');
  const ICON_CLOSE = mkSvg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
  const ICON_SAVE = mkSvg('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>');
  const ICON_CART = mkSvg('<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>');
  const ICON_STOP = mkSvg('<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>');

  const escAttr = s => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');

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
    lastActivityTimestamp = Date.now();
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
     NOTIFICATION SOUNDS & DISCORD
  ───────────────────────────────────────────── */
  function playSound(type) {
    if (!GM_getValue(STORAGE_SOUND_ENABLED, true)) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const sequences = {
        success: [{f:523,d:.12},{f:659,d:.12},{f:784,d:.22}],
        stock:   [{f:880,d:.1},{f:988,d:.1},{f:1047,d:.1},{f:1175,d:.25}],
        error:   [{f:400,d:.15},{f:300,d:.25}],
        info:    [{f:660,d:.15}]
      };
      const notes = sequences[type] || sequences.info;
      let t = ctx.currentTime;
      notes.forEach(({f, d}) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + d);
        osc.start(t); osc.stop(t + d);
        t += d + 0.03;
      });
    } catch(e) { /* audio not supported */ }
  }

  function sendDiscordNotification(title, description, color = 3066993) {
    const webhookUrl = GM_getValue(STORAGE_DISCORD_WEBHOOK, '').trim();
    if (!webhookUrl) return;
    const payload = {
      username: '🧸 Toymate Bot v2',
      embeds: [{
        title,
        description,
        color,
        timestamp: new Date().toISOString(),
        footer: { text: 'Toymate Auto Checkout & Flash Monitor v2.0' }
      }]
    };
    GM_xmlhttpRequest({
      method: 'POST',
      url: webhookUrl,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(payload),
      onerror: () => logActivity('Discord notification failed to deliver.', 'warn')
    });
  }

  /* ─────────────────────────────────────────────
     REQUEST JITTERING & CACHE-BUSTING
  ───────────────────────────────────────────── */
  function getJitteredHeaders() {
    const baseHeaders = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-AU,en-US;q=0.9,en;q=0.8'
    };
    if (Math.random() > 0.3) {
      baseHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    }
    if (Math.random() > 0.5) {
      baseHeaders['Pragma'] = 'no-cache';
    }
    return baseHeaders;
  }

  function getJitteredUrl(rawUrl) {
    const paramKey = ['_t', '_cb', '_r', 'v'][Math.floor(Math.random() * 4)];
    const sep = rawUrl.includes('?') ? '&' : '?';
    return rawUrl + sep + paramKey + '=' + Date.now();
  }

  /* ─────────────────────────────────────────────
     BUILD PANEL UI
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
    const savedTargetQty = GM_getValue(STORAGE_TARGET_QTY, 1);
    const savedPollMin = GM_getValue(STORAGE_POLL_MIN, 3);
    const savedPollMax = GM_getValue(STORAGE_POLL_MAX, 6);
    const savedDiscordWebhook = GM_getValue(STORAGE_DISCORD_WEBHOOK, '');
    const savedSoundEnabled = GM_getValue(STORAGE_SOUND_ENABLED, true);
    const savedTcgEnabled = GM_getValue(STORAGE_TCG_ENABLED, false);
    const savedTcgUrl = GM_getValue(STORAGE_TCG_URL, 'https://toymate.com.au/trading-cards/battling-card-games/pokemon-trading-cards/');
    const autoBuyMonitor = GM_getValue(STORAGE_AUTO_BUY_MONITOR, false);
    const savedPersonality = GM_getValue(STORAGE_PERSONALITY, 'normal');
    const savedMonitorUrl = GM_getValue(STORAGE_MONITOR_URL, 'https://toymate.com.au/trading-cards/battling-card-games/pokemon-trading-cards/');

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'tm-hidden';
    panel.innerHTML = `
      <div class="tm-header-bar"></div>
      <div class="tm-header">
        <div class="tm-title-group">
          <div class="tm-icon-wrap">🧸</div>
          <div>
            <div class="tm-title">Toymate Sniper v2.0</div>
            <div class="tm-subtitle">Human Emulation & Flash Restock</div>
          </div>
        </div>
        <button class="tm-close-btn" id="tm-close-btn">${ICON_CLOSE}</button>
      </div>

      <div class="tm-badge-row">
        <span class="tm-state-badge" id="tm-bot-state-badge">IDLE</span>
        <span class="tm-turbo-badge" id="tm-turbo-badge">⚡ TURBO FLASH MODE</span>
      </div>

      <div class="tm-body">
        <div class="tm-tabs">
          <div class="tm-tab active" data-tab="credentials">Auth</div>
          <div class="tm-tab" data-tab="checkout">Checkout</div>
          <div class="tm-tab" data-tab="monitor">Monitor</div>
          <div class="tm-tab" data-tab="stealth">Stealth</div>
          <div class="tm-tab" data-tab="alerts">Alerts</div>
          <div class="tm-tab" data-tab="product">Product</div>
        </div>

        <div id="tm-page-badge-container">
          <span class="tm-page-badge other" id="tm-page-badge">Detecting...</span>
        </div>

        <div class="tm-status info" id="tm-status">
          <div class="tm-status-dot"></div>
          <div class="tm-status-text">
            <div class="tm-status-title">System Ready</div>
            <div class="tm-status-desc">Waiting for trigger or action.</div>
          </div>
        </div>

        <!-- AUTH TAB -->
        <div class="tm-section active" id="tm-sec-credentials">
          <div class="tm-field">
            <div class="tm-label">Email</div>
            <div class="tm-input-wrap">
              <span class="tm-input-icon">${ICON_MAIL}</span>
              <input class="tm-input" type="email" id="tm-email" placeholder="you@example.com" value="${escAttr(savedEmail)}" />
            </div>
          </div>
          <div class="tm-field">
            <div class="tm-label">Password</div>
            <div class="tm-input-wrap">
              <span class="tm-input-icon">${ICON_LOCK}</span>
              <input class="tm-input" type="password" id="tm-pass" placeholder="••••••••" value="${escAttr(savedPass)}" />
              <button class="tm-input-btn" id="tm-toggle-pass" type="button">${ICON_EYE}</button>
            </div>
          </div>
          <div class="tm-toggle-row">
            <span class="tm-toggle-label">⚡ Auto-Login / Auto-Flow</span>
            <label class="tm-switch">
              <input type="checkbox" id="tm-auto-toggle" ${GM_getValue(STORAGE_AUTO, false) ? 'checked' : ''} />
              <span class="tm-switch-slider"></span>
            </label>
          </div>
        </div>

        <!-- CHECKOUT TAB -->
        <div class="tm-section" id="tm-sec-checkout">
          <div class="tm-field">
            <div class="tm-label">Promo / Coupon Code</div>
            <input type="text" id="tm-coupon" value="${escAttr(savedCoupon)}" placeholder="e.g. TOY10" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:8px 12px;font-family:inherit;font-size:12.5px;outline:none;" />
          </div>
          <div class="tm-field">
            <div class="tm-label">Credit Card Number</div>
            <input type="password" id="tm-cc-num" value="${escAttr(savedCcNum)}" placeholder="•••• •••• •••• ••••" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:8px 12px;font-family:inherit;font-size:12.5px;outline:none;" />
          </div>
          <div style="display:flex;gap:8px;">
            <div class="tm-field" style="flex:1;">
              <div class="tm-label">Expiry (MM/YY)</div>
              <input type="text" id="tm-cc-exp" value="${escAttr(savedCcExp)}" placeholder="MM/YY" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:8px 12px;font-family:inherit;font-size:12.5px;outline:none;" />
            </div>
            <div class="tm-field" style="flex:1;">
              <div class="tm-label">CVV</div>
              <input type="password" id="tm-cc-cvv" value="${escAttr(savedCcCvv)}" placeholder="•••" maxlength="4" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:8px 12px;font-family:inherit;font-size:12.5px;outline:none;" />
            </div>
          </div>
        </div>

        <!-- MONITOR TAB -->
        <div class="tm-section" id="tm-sec-monitor">
          <div class="tm-field">
            <div class="tm-label">🎯 Target Product URL (For Sniper)</div>
            <input type="text" id="tm-target-url" value="${escAttr(savedTargetUrl)}" placeholder="https://toymate.com.au/product/..." style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:8px 12px;font-family:inherit;font-size:11.5px;outline:none;" />
          </div>
          <div style="display:flex;gap:8px;">
            <div class="tm-field" style="flex:1;">
              <div class="tm-label">Buy Qty</div>
              <input type="number" id="tm-target-qty" value="${savedTargetQty}" min="1" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:8px 12px;font-family:inherit;font-size:12.5px;outline:none;" />
            </div>
            <div class="tm-field" style="flex:1;">
              <div class="tm-label">Min Poll (s)</div>
              <input type="number" id="tm-poll-min" value="${savedPollMin}" min="1" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:8px 12px;font-family:inherit;font-size:12.5px;outline:none;" />
            </div>
            <div class="tm-field" style="flex:1;">
              <div class="tm-label">Max Poll (s)</div>
              <input type="number" id="tm-poll-max" value="${savedPollMax}" min="1" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:8px 12px;font-family:inherit;font-size:12.5px;outline:none;" />
            </div>
          </div>
          <div class="tm-field">
            <div class="tm-label">📋 Category Monitor URL (Notify-Only)</div>
            <input type="text" id="tm-monitor-url" value="${escAttr(savedMonitorUrl)}" placeholder="https://toymate.com.au/trading-cards/..." style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:8px 12px;font-family:inherit;font-size:11.5px;outline:none;" />
            <div style="font-size:10px;color:rgba(255,255,255,.4);margin-top:4px;">
              🔔 Monitors this page for restocks. Sends notification — never auto-buys.
            </div>
          </div>
          <div class="tm-toggle-row">
            <span class="tm-toggle-label">⚡ Auto-Buy on Restock (Warning: Buys Any)</span>
            <label class="tm-switch">
              <input type="checkbox" id="tm-autobuy-monitor-toggle" ${autoBuyMonitor ? 'checked' : ''} />
              <span class="tm-switch-slider"></span>
            </label>
          </div>
        </div>

        <!-- STEALTH TAB -->
        <div class="tm-section" id="tm-sec-stealth">
          <div class="tm-field">
            <div class="tm-label">🎭 Human Personality Profile</div>
            <select class="tm-select" id="tm-personality-select">
              <option value="cautious" ${savedPersonality === 'cautious' ? 'selected' : ''}>🛡️ Cautious (High Stealth)</option>
              <option value="normal" ${savedPersonality === 'normal' ? 'selected' : ''}>⚖️ Normal (Balanced)</option>
              <option value="fast_typer" ${savedPersonality === 'fast_typer' ? 'selected' : ''}>⚡ Turbo Sniper (Fastest)</option>
            </select>
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,.6);line-height:1.4;background:rgba(255,255,255,.03);padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.06);">
            ✨ <b>Active Anti-Detection:</b><br/>
            • Cubic Bezier curved mouse paths<br/>
            • Smooth scroll with overshoot settling<br/>
            • Keypress jitter & typo simulation<br/>
            • Exponential backoff on cart resets
          </div>
        </div>

        <!-- ALERTS TAB -->
        <div class="tm-section" id="tm-sec-alerts">
          <div class="tm-field">
            <div class="tm-label">🔔 Discord Webhook URL</div>
            <input type="text" id="tm-discord-webhook" placeholder="https://discord.com/api/webhooks/..." value="${escAttr(savedDiscordWebhook)}" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:10px;padding:8px 11px;font-family:inherit;font-size:11px;outline:none;" />
          </div>
          <div class="tm-toggle-row">
            <span class="tm-toggle-label">🔔 Notification Sounds</span>
            <label class="tm-switch">
              <input type="checkbox" id="tm-sound-toggle" ${savedSoundEnabled ? 'checked' : ''} />
              <span class="tm-switch-slider"></span>
            </label>
          </div>
          <div class="tm-toggle-row">
            <span class="tm-toggle-label">🃏 TCG Release Alerts</span>
            <label class="tm-switch">
              <input type="checkbox" id="tm-tcg-toggle" ${savedTcgEnabled ? 'checked' : ''} />
              <span class="tm-switch-slider"></span>
            </label>
          </div>
          <div class="tm-field" id="tm-tcg-url-row" style="${savedTcgEnabled ? '' : 'opacity:.45;'}">
            <div class="tm-label">🃏 TCG Search URL</div>
            <input type="text" id="tm-tcg-url" value="${escAttr(savedTcgUrl)}" placeholder="https://toymate.com.au/..." style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:10px;padding:8px 11px;font-family:inherit;font-size:10.5px;outline:none;" />
          </div>
        </div>

        <!-- PRODUCT TAB -->
        <div class="tm-section" id="tm-sec-product">
          <div id="tm-product-container">
            <div class="tm-empty-state">Waiting for product page...</div>
          </div>
        </div>

      </div>

      <div class="tm-divider"></div>

      <!-- Activity Log -->
      <div class="tm-activity-log" id="tm-activity-log">
        <div class="tm-log-item info"><span class="tm-log-time">[${new Date().toLocaleTimeString('en-US', { hour12: false })}]</span><span class="tm-log-msg">Sniper v2.0.1 initialized. Stealth engine active.</span></div>
      </div>

      <!-- Global Action Bar -->
      <div style="padding:4px 20px 10px;">
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <button class="tm-btn-cart" id="tm-save-btn" style="background:rgba(255,255,255,.1);flex:1;box-shadow:none;font-size:12px;">${ICON_SAVE} Save</button>
          <button class="tm-btn-cart" id="tm-monitor-btn" style="background:linear-gradient(135deg, #06B6D4, #2563EB);flex:1.2;font-size:12px;">🔎 Monitor</button>
        </div>
        <div class="tm-qty-wrap" style="margin-top:0;">
          <input type="number" id="tm-qty-input" value="${savedTargetQty}" min="1" title="Qty" />
          <button class="tm-btn-cart" id="tm-start-bot-btn">${ICON_CART} Start Sniper</button>
          <button class="tm-btn-stop" id="tm-stop-bot-btn" style="display:none;">${ICON_STOP} Stop</button>
        </div>
      </div>
      <div class="tm-footer">🔒 Protected by Anti-Detection Bezier Engine · Toymate Bot</div>
    `;

    document.body.appendChild(panel);

    panel.querySelectorAll('.tm-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        panel.querySelectorAll('.tm-tab').forEach(t => t.classList.remove('active'));
        panel.querySelectorAll('.tm-section').forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        const sec = document.getElementById('tm-sec-' + tab.dataset.tab);
        if (sec) sec.classList.add('active');
      });
    });

    document.getElementById('tm-close-btn').onclick = () => panel.classList.add('tm-hidden');
    document.getElementById('tm-save-btn').onclick = saveAllSettings;
    document.getElementById('tm-start-bot-btn').onclick = startBot;
    document.getElementById('tm-stop-bot-btn').onclick = stopBot;
    document.getElementById('tm-monitor-btn').onclick = togglePageMonitor;
    
    document.getElementById('tm-toggle-pass').onclick = () => {
      const p = document.getElementById('tm-pass');
      p.type = p.type === 'password' ? 'text' : 'password';
    };

    document.getElementById('tm-auto-toggle').onchange = e => GM_setValue(STORAGE_AUTO, e.target.checked);
    document.getElementById('tm-sound-toggle').onchange = e => GM_setValue(STORAGE_SOUND_ENABLED, e.target.checked);
    document.getElementById('tm-autobuy-monitor-toggle').onchange = e => GM_setValue(STORAGE_AUTO_BUY_MONITOR, e.target.checked);
    document.getElementById('tm-personality-select').onchange = e => {
      GM_setValue(STORAGE_PERSONALITY, e.target.value);
      logActivity(`Personality profile switched to: ${PROFILES[e.target.value]?.name}`, 'info');
    };

    document.getElementById('tm-tcg-toggle').onchange = e => {
      GM_setValue(STORAGE_TCG_ENABLED, e.target.checked);
      const row = document.getElementById('tm-tcg-url-row');
      if (row) row.style.opacity = e.target.checked ? '1' : '0.45';
      if (e.target.checked) {
        const url = document.getElementById('tm-tcg-url')?.value.trim();
        startTcgMonitor(url);
      } else {
        stopTcgMonitor();
      }
    };
  }

  function buildToggleBubble() {
    if (document.getElementById('tm-toggle-bubble')) return;
    const bubble = document.createElement('button');
    bubble.id = 'tm-toggle-bubble';
    bubble.title = 'Toymate Bot v2';
    bubble.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`;
    bubble.onclick = () => {
      buildPanel();
      const p = document.getElementById(PANEL_ID);
      if (p) p.classList.toggle('tm-hidden');
    };
    document.body.appendChild(bubble);
  }

  function saveAllSettings() {
    GM_setValue(STORAGE_EMAIL, document.getElementById('tm-email')?.value.trim() || '');
    GM_setValue(STORAGE_PASS, document.getElementById('tm-pass')?.value || '');
    GM_setValue(STORAGE_COUPON, document.getElementById('tm-coupon')?.value.trim() || '');
    GM_setValue(STORAGE_CC_NUM, document.getElementById('tm-cc-num')?.value.trim() || '');
    GM_setValue(STORAGE_CC_EXP, document.getElementById('tm-cc-exp')?.value.trim() || '');
    GM_setValue(STORAGE_CC_CVV, document.getElementById('tm-cc-cvv')?.value.trim() || '');
    GM_setValue(STORAGE_TARGET_URL, document.getElementById('tm-target-url')?.value.trim() || '');
    GM_setValue(STORAGE_TARGET_QTY, parseInt(document.getElementById('tm-target-qty')?.value) || 1);
    GM_setValue(STORAGE_POLL_MIN, parseInt(document.getElementById('tm-poll-min')?.value) || 3);
    GM_setValue(STORAGE_POLL_MAX, parseInt(document.getElementById('tm-poll-max')?.value) || 6);
    GM_setValue(STORAGE_DISCORD_WEBHOOK, document.getElementById('tm-discord-webhook')?.value.trim() || '');
    GM_setValue(STORAGE_TCG_URL, document.getElementById('tm-tcg-url')?.value.trim() || '');
    GM_setValue(STORAGE_MONITOR_URL, document.getElementById('tm-monitor-url')?.value.trim() || '');
    showToast('All settings saved!', 'success');
    logActivity('All settings saved to secure local storage.', 'success');
  }

  function setPageBadge(type, label) {
    const b = document.getElementById('tm-page-badge');
    if (b) {
      b.className = 'tm-page-badge ' + type;
      b.textContent = label;
    }
  }

  /* ─────────────────────────────────────────────
     WATCHDOG TIMER (Auto Recovery)
  ───────────────────────────────────────────── */
  function startWatchdog() {
    if (watchdogInterval) clearInterval(watchdogInterval);
    watchdogInterval = setInterval(() => {
      if (!botRunning) return;
      const idleTime = Date.now() - lastActivityTimestamp;
      if (idleTime > 25000) {
        logActivity('⚠️ Watchdog: No activity for 25s. Recovering current state...', 'warn');
        if (window.location.pathname.includes('/cart/')) {
          checkCartPage();
        } else if (window.location.pathname.includes('/checkout/') || window.location.hostname.includes('checkout.')) {
          checkCheckoutPage();
        } else {
          runBuyLoop();
        }
      }
    }, 10000);
  }

  /* ─────────────────────────────────────────────
     TURBO FLASH RESTOCK MODE TRIGGER
  ───────────────────────────────────────────── */
  function triggerTurboMode(durationSec = 90) {
    turboModeExpiresAt = Date.now() + durationSec * 1000;
    const turboBadge = document.getElementById('tm-turbo-badge');
    if (turboBadge) turboBadge.style.display = 'inline-block';
    logActivity(`🔥 TURBO FLASH MODE ACTIVATED for ${durationSec}s! (Fast 300-600ms polling)`, 'warn');
    playSound('info');
  }

  function isTurboModeActive() {
    const active = Date.now() < turboModeExpiresAt;
    const turboBadge = document.getElementById('tm-turbo-badge');
    if (turboBadge) turboBadge.style.display = active ? 'inline-block' : 'none';
    return active;
  }

  /* ─────────────────────────────────────────────
     PRODUCT PAGE & LIVE MUTATION OBSERVER
  ───────────────────────────────────────────── */
  function setupLiveProductObserver() {
    if (liveProductObserver) liveProductObserver.disconnect();

    liveProductObserver = new MutationObserver(() => {
      if (!botRunning) return;
      const nativeAddBtn = findAddToCartButton();

      if (nativeAddBtn && currentState === BotState.MONITORING) {
        logActivity('⚡ Live DOM MutationObserver detected Add to Cart button appearance!', 'success');
        clearTimeout(botLoopTimeout);
        clearTimeout(stockPollTimeout);
        runBuyLoop();
      }
    });

    liveProductObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
  }

  /* ─────────────────────────────────────────────
     START / STOP BOT CONTROLS
  ───────────────────────────────────────────── */
  function startBot() {
    // Pre-flight: require a target URL before arming the bot
    const savedTarget = GM_getValue(STORAGE_TARGET_URL, '').trim();
    if (!savedTarget) {
      showToast('⚠️ Set a Target Product URL in the Monitor tab first!', 'error', 6000);
      logActivity('🚫 Start blocked: no Target Product URL configured. Go to Monitor tab and set one.', 'error');
      setStatus('error', 'No Target Set', 'Open the Monitor tab and set a Target URL.');
      // Switch to Monitor tab automatically
      const monitorTab = document.querySelector('.tm-tab[data-tab="monitor"]');
      if (monitorTab) monitorTab.click();
      return;
    }

    botRunning = true;
    GM_setValue(STORAGE_AUTO, true);
    const autoToggle = document.getElementById('tm-auto-toggle');
    if (autoToggle) autoToggle.checked = true;

    const startBtn = document.getElementById('tm-start-bot-btn');
    const stopBtn = document.getElementById('tm-stop-bot-btn');
    if (startBtn && stopBtn) {
      startBtn.style.display = 'none';
      stopBtn.style.display = 'flex';
    }

    startWatchdog();
    logActivity('Sniper Bot started! Real-time sniper & human emulation armed.', 'success');
    setStatus('info', 'Bot Active', 'Analyzing page...', true);
    showToast('🎯 Sniper Bot Activated', 'success');
    playSound('info');

    const path = window.location.pathname;
    const host = window.location.hostname;

    if (/\/cart/i.test(path)) {
      checkCartPage();
    } else if (host.includes('checkout.toymate.com.au') || /\/checkout/i.test(path)) {
      checkCheckoutPage();
    } else {
      setupLiveProductObserver();
      runBuyLoop();
    }
  }

  function stopBot() {
    botRunning = false;
    clearTimeout(botLoopTimeout);
    clearTimeout(stockPollTimeout);
    if (liveProductObserver) liveProductObserver.disconnect();
    if (watchdogInterval) clearInterval(watchdogInterval);

    GM_setValue(STORAGE_AUTO, false);
    const toggle = document.getElementById('tm-auto-toggle');
    if (toggle) toggle.checked = false;

    const startBtn = document.getElementById('tm-start-bot-btn');
    const stopBtn = document.getElementById('tm-stop-bot-btn');
    if (startBtn && stopBtn) {
      startBtn.style.display = 'flex';
      stopBtn.style.display = 'none';
    }

    setBotState(BotState.IDLE);
    logActivity('Bot stopped by user.', 'warn');
    setStatus('warn', 'Bot Stopped', 'Waiting for input');
    showToast('Bot Stopped', 'warning');
  }

  /* ─────────────────────────────────────────────
     BUY LOOP & FLASH CART ADD
  ───────────────────────────────────────────── */
  function runBuyLoop() {
    if (!botRunning) return;

    // ── SAFETY CHECK: Only act on the configured target product URL ──
    const targetUrl = GM_getValue(STORAGE_TARGET_URL, '').trim();

    // Block entirely if no target URL is configured
    if (!targetUrl) {
      setBotState(BotState.IDLE);
      logActivity('🚫 No Target Product URL set. Configure one in the Monitor tab before starting.', 'error');
      setStatus('error', 'No Target Set', 'Set a Target URL in the Monitor tab first.');
      showToast('⚠️ Set a Target Product URL first!', 'error', 6000);
      stopBot();
      return;
    }

    // Block if we are on the wrong page — redirect to target instead
    // Normalise both URLs: strip www., lowercase hostname, strip trailing slash & query string
    const normaliseUrl = (raw) => {
      try {
        const u = new URL(raw);
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        const path = u.pathname.replace(/\/$/, '').toLowerCase();
        return host + path;
      } catch (e) {
        return raw.split('?')[0].replace(/\/$/, '').toLowerCase();
      }
    };

    const currentNorm = normaliseUrl(window.location.href);
    const targetNorm  = normaliseUrl(targetUrl);

    if (currentNorm !== targetNorm) {
      // Guard: prevent infinite redirect loops using sessionStorage counter
      const REDIRECT_KEY = 'tm_redirect_count';
      const redirectCount = parseInt(sessionStorage.getItem(REDIRECT_KEY) || '0');
      if (redirectCount >= 3) {
        sessionStorage.removeItem(REDIRECT_KEY);
        logActivity('🚫 Redirect loop detected (3 redirects with no match). Stopping bot. Check your Target URL is correct.', 'error');
        setStatus('error', 'Redirect Loop', 'Check your Target URL in Monitor tab.');
        showToast('⚠️ Redirect loop stopped! Fix your Target URL.', 'error', 8000);
        stopBot();
        return;
      }
      sessionStorage.setItem(REDIRECT_KEY, String(redirectCount + 1));

      // We are NOT on the target page — navigate there and let the page reload trigger the loop
      setBotState(BotState.MONITORING, 'Navigating to target');
      logActivity(`⚠️ Current page does not match target. Navigating to target URL... (attempt ${redirectCount + 1}/3)`, 'warn');
      setStatus('warn', 'Wrong Page', 'Redirecting to target product...', true);
      window.location.href = targetUrl;
      return;
    }

    // On the correct page — clear any redirect counter
    sessionStorage.removeItem('tm_redirect_count');


    setBotState(BotState.PRODUCT_DETECTED);
    const uiTargetQty = parseInt(document.getElementById('tm-target-qty')?.value);
    const savedTargetQty = GM_getValue(STORAGE_TARGET_QTY, 1);
    let currentQty = (uiTargetQty > 0 ? uiTargetQty : savedTargetQty) || 1;

    const { input: nativeQtyInput, incBtn, decBtn } = findQuantityControls();
    const nativeAddBtn = findAddToCartButton();

    if (!nativeAddBtn) {
      // Out of stock on page — trigger dual-mode background polling
      const pollUrl = targetUrl || window.location.href;
      setBotState(BotState.MONITORING, 'Polling stock');
      logActivity('Add to Cart not found. Polling stock in background...', 'warn');
      setStatus('warn', 'Waiting for Stock', 'Silent polling active...', true);

      checkStockInBackground(pollUrl, () => {
        logActivity('Stock spotted! Navigating to product page...', 'success');
        triggerTurboMode(90);
        window.location.href = pollUrl;
      });
      return;
    }

    setBotState(BotState.ADJUSTING_QTY, `Target: ${currentQty}`);
    logActivity(`Found product! Setting quantity: ${currentQty}...`, 'info');
    setStatus('info', 'Adjusting Qty', `Target qty: ${currentQty}`, true);

    const setQtyPromise = new Promise(async (resolve) => {
      if (nativeQtyInput) {
        let currentVal = parseInt(nativeQtyInput.value) || 1;
        const maxAttr = parseInt(nativeQtyInput.getAttribute('max'));
        const effectiveTarget = (!isNaN(maxAttr) && maxAttr > 0) ? Math.min(currentQty, maxAttr) : currentQty;
        let diff = effectiveTarget - currentVal;

        if (diff > 0 && incBtn) {
          logActivity(`Clicking Increase (+) button up to ${diff} time(s)...`, 'info');
          for (let i = 0; i < diff; i++) {
            if (!botRunning) return resolve();

            // Stop if increase button is disabled
            if (incBtn.disabled || incBtn.getAttribute('aria-disabled') === 'true' || incBtn.classList.contains('disabled')) {
              logActivity('Reached maximum product limit (button disabled).', 'warn');
              break;
            }

            const prevVal = parseInt(nativeQtyInput.value) || 0;
            await humanClick(incBtn);
            await new Promise(r => setTimeout(r, randDelay(35, 75)));

            const afterVal = parseInt(nativeQtyInput.value) || 0;
            if (afterVal > 0 && afterVal === prevVal && i > 0) {
              logActivity(`Maximum available limit reached (${afterVal}). Keeping it.`, 'info');
              break;
            }
          }
        } else if (diff < 0 && decBtn) {
          const decreaseTimes = Math.abs(diff);
          logActivity(`Clicking Decrease (-) button ${decreaseTimes} time(s)...`, 'info');
          for (let i = 0; i < decreaseTimes; i++) {
            if (!botRunning) return resolve();
            if (decBtn.disabled || decBtn.getAttribute('aria-disabled') === 'true') {
              break;
            }
            await humanClick(decBtn);
            await new Promise(r => setTimeout(r, randDelay(35, 75)));
          }
        }

        const finalVal = parseInt(nativeQtyInput.value) || currentVal;
        logActivity(`Purchase quantity set to: ${finalVal}`, 'success');
      }
      resolve();
    });

    setQtyPromise.then(async () => {
      if (!botRunning) return;

      const initialBadge = getCartBadgeInfo();

      const freshAddBtn = findAddToCartButton();
      if (!freshAddBtn) {
        logActivity('Add to Cart button missing after setting quantity. Retrying...', 'error');
        botLoopTimeout = setTimeout(runBuyLoop, 600);
        return;
      }

      setBotState(BotState.ADDING_TO_CART);
      logActivity('Clicking "Add to cart" button with human curve trajectory...', 'info');
      await humanClick(freshAddBtn);

      let verified = false;
      let cartObserver = null;

      const proceedToCartNavigation = (finalCount) => {
        if (verified) return;
        verified = true;
        clearInterval(verifyInterval);
        if (cartObserver) { cartObserver.disconnect(); cartObserver = null; }

        setBotState(BotState.VERIFYING_CART, 'Added successfully');
        logActivity(`✅ Success! Cart icon updated (Items: ${finalCount}). Opening cart...`, 'success');
        setStatus('success', 'Added to Cart', 'Opening cart with human navigation...');
        showToast(`✅ Added! (${finalCount} in cart)`, 'success');
        playSound('success');

        const cartDelay = randDelay(500, 1000);
        logActivity(`Waiting ${cartDelay}ms then clicking cart icon like a human...`, 'info');
        setTimeout(async () => {
          setBotState(BotState.NAVIGATING_TO_CART);
          const cartLink = findCartLink();

          if (cartLink && document.body.contains(cartLink)) {
            logActivity('Simulating human mouse trajectory to Cart icon in navbar...', 'info');
            await humanClick(cartLink);
            // Safety timeout: direct navigate if React router hasn't changed path within 1.2s
            setTimeout(() => {
              if (!window.location.pathname.includes('/cart')) {
                logActivity('Executing navigation to /cart/...', 'info');
                window.location.href = '/cart/';
              }
            }, 1200);
          } else {
            logActivity('Cart link not found. Navigating directly to /cart/...', 'warn');
            window.location.href = '/cart/';
          }
        }, cartDelay);
      };

      // Real-time observer on Cart link and header container to detect <span> appearance immediately (<5ms)
      const cartLink = findCartLink();
      if (cartLink) {
        cartObserver = new MutationObserver(() => {
          const current = getCartBadgeInfo();
          if (!initialBadge.hasBadge && current.hasBadge) {
            proceedToCartNavigation(current.count);
          } else if (current.hasBadge && current.count > initialBadge.count) {
            proceedToCartNavigation(current.count);
          }
        });
        cartObserver.observe(cartLink, { childList: true, subtree: true, characterData: true });
        if (cartLink.parentElement) {
          cartObserver.observe(cartLink.parentElement, { childList: true, subtree: true, characterData: true });
        }
      }

      // Fallback interval check
      let checks = 0;
      const verifyInterval = setInterval(() => {
        if (!botRunning || verified) {
          clearInterval(verifyInterval);
          if (cartObserver) cartObserver.disconnect();
          return;
        }

        checks++;
        const current = getCartBadgeInfo();

        // 1. SUCCESS: Cart icon changed from empty (no span) to filled (span present)
        if (!initialBadge.hasBadge && current.hasBadge) {
          proceedToCartNavigation(current.count);
          return;
        }

        // 2. SUCCESS: Cart count increased
        if (current.hasBadge && current.count > initialBadge.count) {
          proceedToCartNavigation(current.count);
          return;
        }

        // 3. SUCCESS: Cart already has items and 1s passed
        if (current.hasBadge && current.count > 0 && checks >= 12) {
          proceedToCartNavigation(current.count);
          return;
        }

        // 4. Out of Stock banner detected
        const errorBanner = Array.from(document.querySelectorAll('div, span')).find(el =>
          (el.className && typeof el.className === 'string' && (el.className.includes('error') || el.className.includes('form-status-light-background-error'))) &&
          el.textContent.toLowerCase().includes('out of stock')
        );

        if (errorBanner) {
          clearInterval(verifyInterval);
          if (cartObserver) cartObserver.disconnect();
          triggerTurboMode(90);
          logActivity('Site reported Out of Stock during add-to-cart.', 'warn');

          if (currentQty > 1) {
            currentQty--;
            logActivity(`Lowering quantity to ${currentQty} and retrying...`, 'warn');
            setStatus('warn', 'Retrying', `Lowered qty to ${currentQty}`, true);
            botLoopTimeout = setTimeout(runBuyLoop, randDelay(400, 800));
          } else {
            logActivity('Stock flickered out. Switching to Turbo Polling...', 'warn');
            botLoopTimeout = setTimeout(runBuyLoop, randDelay(1000, 2000));
          }
          return;
        }

        // 5. Timeout check
        if (checks > 75) {
          clearInterval(verifyInterval);
          if (cartObserver) cartObserver.disconnect();
          if (current.hasBadge && current.count > 0) {
            proceedToCartNavigation(current.count);
          } else {
            logActivity('No cart badge change after 6s. Retrying add-to-cart...', 'warn');
            botLoopTimeout = setTimeout(runBuyLoop, randDelay(1000, 2000));
          }
        }
      }, 80);
    });
  }

  /* ─────────────────────────────────────────────
     BACKGROUND STOCK POLLING (TWO-TIER: NORMAL & TURBO)
  ───────────────────────────────────────────── */
  function checkStockInBackground(url, onInStockCallback) {
    if (stockPollTimeout) clearTimeout(stockPollTimeout);

    let pollCount = 0;
    const cleanUrl = url.split('?')[0];

    const doPoll = () => {
      if (!botRunning && !GM_getValue(STORAGE_AUTO, false)) return;

      pollCount++;
      const isTurbo = isTurboModeActive();
      const minDelay = isTurbo ? 300 : (GM_getValue(STORAGE_POLL_MIN, 3) * 1000);
      const maxDelay = isTurbo ? 600 : (GM_getValue(STORAGE_POLL_MAX, 6) * 1000);

      const reqUrl = getJitteredUrl(cleanUrl);
      const headers = getJitteredHeaders();

      if (pollCount % 6 === 0 || isTurbo) {
        logActivity(`[${isTurbo ? 'TURBO' : 'POLL'} #${pollCount}] Checking ${cleanUrl}...`, isTurbo ? 'warn' : 'info');
      }

      GM_xmlhttpRequest({
        method: 'GET',
        url: reqUrl,
        headers,
        onload: function (res) {
          if (!botRunning && !GM_getValue(STORAGE_AUTO, false)) return;

          const html = res.responseText.toLowerCase();
          const hasAddToCart = html.includes('add to cart');
          const isOutOfStock = html.includes('out of stock') || html.includes('sold out') || html.includes('notify me');

          if (hasAddToCart && !isOutOfStock) {
            logActivity(`🚀 FLASH RESTOCK DETECTED for ${cleanUrl}!`, 'success');
            setStatus('success', 'In Stock!', 'Executing purchase...', true);
            showToast('🎉 In Stock! Sniping now!', 'success', 8000);
            playSound('stock');
            sendDiscordNotification(
              '🎉 FLASH RESTOCK DETECTED!',
              `Product is **IN STOCK**!\n\n🔗 [${cleanUrl}](${cleanUrl})`,
              0x00E676
            );
            onInStockCallback();
          } else {
            const nextDelay = randDelay(minDelay, maxDelay);
            stockPollTimeout = setTimeout(doPoll, nextDelay);
          }
        },
        onerror: function () {
          stockPollTimeout = setTimeout(doPoll, randDelay(minDelay, maxDelay));
        }
      });
    };

    doPoll();
  }

  /* ─────────────────────────────────────────────
     CART PAGE HANDLER (SMART RECOVERY & BOT AVOIDANCE)
  ───────────────────────────────────────────── */
  function checkCartPage() {
    buildPanel();
    setPageBadge('product', 'Cart Page');
    document.getElementById(PANEL_ID).classList.remove('tm-hidden');
    setBotState(BotState.ON_CART_PAGE);

    const autoEnabled = GM_getValue(STORAGE_AUTO, false);
    if (!autoEnabled) {
      logActivity('Auto-checkout disabled. Ready on Cart page.', 'info');
      setStatus('info', 'Cart Page', 'Auto-checkout disabled.');
      return;
    }

    logActivity('Cart page loaded. Verifying cart contents...', 'info');
    setStatus('info', 'Cart Page', 'Verifying items...', true);

    const tryCheckout = (n = 0) => {
      if (!botRunning && !GM_getValue(STORAGE_AUTO, false)) return;

      const emptyHeading = Array.from(document.querySelectorAll('h1, h2, div')).find(
        el => el.textContent.trim().toLowerCase().includes('your cart is empty')
      );

      if (emptyHeading) {
        let botDetectCount = GM_getValue(STORAGE_BOT_DETECT_COUNT, 0) + 1;
        GM_setValue(STORAGE_BOT_DETECT_COUNT, botDetectCount);

        const backoffMs = Math.min(Math.round(randDelay(2500, 4500) * Math.pow(1.4, botDetectCount)), 30000);
        logActivity(`⚠️ Cart empty (Site wipe #${botDetectCount}). Exponential backoff: ${(backoffMs/1000).toFixed(1)}s...`, 'error');
        setStatus('error', 'Cart Cleared', `Retrying in ${(backoffMs/1000).toFixed(1)}s...`);
        showToast('⚠️ Cart cleared by site. Retrying...', 'error');

        const targetUrl = GM_getValue(STORAGE_TARGET_URL, '').trim() || document.referrer || 'https://toymate.com.au/';
        setTimeout(() => {
          botRunning = true;
          window.location.href = targetUrl;
        }, backoffMs);
        return;
      }

      GM_setValue(STORAGE_BOT_DETECT_COUNT, 0);

      const couponCode = GM_getValue(STORAGE_COUPON, '').trim();
      const couponInput = document.querySelector('input[name="couponCode"]');
      
      const getCheckoutBtn = () => {
        return Array.from(document.querySelectorAll('button, a, input[type="submit"]')).find(b => {
          const text = (b.textContent || b.value || '').trim().toLowerCase();
          return text === 'checkout' || text.includes('checkout');
        });
      };

      const checkoutBtn = getCheckoutBtn();

      if (checkoutBtn && !checkoutBtn.disabled && !checkoutBtn.classList.contains('disabled')) {
        setStatus('info', 'Checkout', 'Applying details & proceeding...', true);
        
        const proceedToClick = async () => {
          logActivity('Proceeding to Checkout with human click...', 'info');
          const freshBtn = getCheckoutBtn();
          if (freshBtn) {
            await humanClick(freshBtn);
          }
        };

        if (couponCode && couponInput && !couponInput.value) {
          logActivity(`Applying coupon code: ${couponCode}`, 'info');
          humanType(couponInput, couponCode).then(() => {
            setTimeout(proceedToClick, randDelay(400, 800));
          });
        } else {
          setTimeout(proceedToClick, randDelay(300, 600));
        }
      } else if (n < 50) {
        setTimeout(() => tryCheckout(n + 1), 250);
      } else {
        logActivity('Checkout button did not appear within 12s.', 'error');
        setStatus('error', 'Cart Error', 'Checkout button missing');
      }
    };

    tryCheckout();
  }

  /* ─────────────────────────────────────────────
     CHECKOUT PAGE HANDLER (SHIPPING & PAYMENT)
  ───────────────────────────────────────────── */
  function checkCheckoutPage() {
    buildPanel();
    setPageBadge('product', 'Checkout');
    document.getElementById(PANEL_ID).classList.remove('tm-hidden');

    const autoEnabled = GM_getValue(STORAGE_AUTO, false);
    if (!autoEnabled) {
      logActivity('Auto-checkout disabled. Waiting for user.', 'info');
      setStatus('info', 'Checkout Ready', 'Auto-login disabled.');
      return;
    }

    logActivity('Checkout page detected. Processing steps...', 'info');
    setBotState(BotState.CHECKOUT_SHIPPING);

    const tryContinue = (n = 0) => {
      if (!botRunning && !GM_getValue(STORAGE_AUTO, false)) return;

      const continueBtn = document.getElementById('checkout-shipping-continue');
      const ccRadio = document.getElementById('radio-adyenv3-scheme');
      const ccLabel = document.querySelector('label[for="radio-adyenv3-scheme"]');
      const placeOrderBtn = document.getElementById('checkout-payment-continue');

      // Step 1: Shipping Continue
      if (continueBtn && !continueBtn.disabled && document.body.contains(continueBtn)) {
        setBotState(BotState.CHECKOUT_SHIPPING, 'Continuing');
        logActivity('Clicking shipping continue button...', 'info');
        humanClick(continueBtn).then(() => {
          setTimeout(() => tryContinue(0), 1000);
        });

      // Step 2: Select Credit Card Payment
      } else if (ccRadio && !ccRadio.checked && ccLabel) {
        setBotState(BotState.CHECKOUT_PAYMENT, 'Selecting Card');
        logActivity('Selecting Credit Card payment method...', 'info');
        humanClick(ccLabel).then(() => {
          logActivity('Credit Card selected. Waiting for Adyen frame...', 'success');
          setTimeout(() => tryContinue(0), 1000);
        });

      // Step 3: Place Order
      } else if (ccRadio && ccRadio.checked && placeOrderBtn && document.body.contains(placeOrderBtn)) {
        if (!placeOrderBtn.disabled) {
          setBotState(BotState.CHECKOUT_PAYMENT, 'Placing Order');
          logActivity('Clicking Place Order button with human curve...', 'info');
          humanClick(placeOrderBtn).then(() => {
            logActivity('Place Order click sent!', 'success');
            playSound('success');
            sendDiscordNotification(
              '✅ ORDER PLACED!',
              `🛒 Place Order button submitted on Toymate!\n\n🔗 [Checkout](${window.location.href})`,
              0x2196F3
            );
            setTimeout(() => tryContinue(n + 1), 2500);
          });
        } else {
          setTimeout(() => tryContinue(n + 1), 300);
        }
      } else if (n < 70) {
        setTimeout(() => tryContinue(n + 1), 300);
      } else {
        logActivity('Checkout step stalled after 20s.', 'warn');
      }
    };

    tryContinue();
  }

  /* ─────────────────────────────────────────────
     ADYEN SECURE IFRAME AUTO-FILL
  ───────────────────────────────────────────── */
  function checkAdyenIframe() {
    const autoEnabled = GM_getValue(STORAGE_AUTO, false);
    if (!autoEnabled) return;

    const loop = setInterval(() => {
      if (!GM_getValue(STORAGE_AUTO, false)) {
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
    }, 400);
  }

  /* ─────────────────────────────────────────────
     CATEGORY / PAGE MONITOR
  ───────────────────────────────────────────── */
  function togglePageMonitor() {
    pageMonitorRunning = !pageMonitorRunning;
    const btn = document.getElementById('tm-monitor-btn');
    if (pageMonitorRunning) {
      if (btn) btn.textContent = '⏹ Stop Mon';
      logActivity('Page monitor started.', 'info');
      const targetUrl = GM_getValue(STORAGE_MONITOR_URL, 'https://toymate.com.au/trading-cards/battling-card-games/pokemon-trading-cards/') || window.location.href;
      schedulePageMonitorPoll(targetUrl);
    } else {
      if (btn) btn.textContent = '🔎 Monitor';
      clearTimeout(pageMonitorTimeout);
      logActivity('Page monitor stopped.', 'warn');
    }
  }

  function schedulePageMonitorPoll(url) {
    if (!pageMonitorRunning) return;
    const minDelay = GM_getValue(STORAGE_POLL_MIN, 3) * 1000;
    const maxDelay = GM_getValue(STORAGE_POLL_MAX, 6) * 1000;
    const delay = randDelay(minDelay, maxDelay);
    pageMonitorTimeout = setTimeout(() => executePageMonitorCheck(url), delay);
  }

  function parseRestockableProducts(doc, baseUrl) {
    const results = [];
    doc.querySelectorAll('a[id]').forEach(anchor => {
      const pid = anchor.id;
      if (!/^\d+$/.test(pid)) return;
      const href = anchor.getAttribute('href') || '';
      const productLink = href.startsWith('http') ? href : new URL(href, baseUrl).href;
      const productName = anchor.getAttribute('aria-label') || anchor.textContent?.trim() || `Product #${pid}`;
      const card = anchor.closest('li, article, [class*="product"]') || anchor.parentElement?.parentElement;
      const btn = card?.querySelector('button');
      const btnAriaLabel = (btn?.getAttribute('aria-label') || '').toLowerCase();
      const btnText = (btn?.textContent || '').trim().toLowerCase();
      const isOutOfStock = btnText.includes('out of stock') || btnText.includes('notify') || btnAriaLabel.includes('notify') || btnAriaLabel.includes('out of stock') || (card?.textContent || '').toLowerCase().includes('out of stock');
      results.push({ pid, productName, productLink, isOutOfStock });
    });
    if (results.length === 0) {
      doc.querySelectorAll('button[aria-label]').forEach(btn => {
        const ariaLabel = btn.getAttribute('aria-label') || '';
        const isAddToCart = ariaLabel.toLowerCase().includes('add to cart');
        const isNotify = ariaLabel.toLowerCase().includes('notify') || ariaLabel.toLowerCase().includes('out of stock');
        if (!isAddToCart && !isNotify) return;
        const card = btn.closest('li, article, [class*="product"]') || btn.parentElement?.parentElement;
        const anchor = card?.querySelector('a[href*="/"]');
        const href = anchor?.getAttribute('href') || '';
        const productLink = href.startsWith('http') ? href : (href ? new URL(href, baseUrl).href : baseUrl);
        const pid = anchor?.id || ariaLabel.replace(/[^a-z0-9]/gi, '').substring(0, 20);
        const productName = ariaLabel.replace(/^(add to cart for|notify me for)\s*/i, '').trim() || `Product via btn`;
        results.push({ pid, productName, productLink, isOutOfStock: isNotify });
      });
    }
    return results;
  }

  function executePageMonitorCheck(url) {
    if (!pageMonitorRunning) return;
    GM_xmlhttpRequest({
      method: 'GET',
      url: getJitteredUrl(url),
      headers: getJitteredHeaders(),
      onload: function (res) {
        if (!pageMonitorRunning) return;
        const doc = new DOMParser().parseFromString(res.responseText, 'text/html');
        const products = parseRestockableProducts(doc, url);

        products.forEach(({ pid, productName, productLink, isOutOfStock }) => {
          const currentStatus = isOutOfStock ? 'out_of_stock' : 'in_stock';
          if (knownProductStatuses[pid] === 'out_of_stock' && currentStatus === 'in_stock') {
            logActivity(`🚀 RESTOCK: ${productName}`, 'success');
            showToast(`🚀 RESTOCK: ${productName.substring(0, 45)}`, 'success', 20000);
            playSound('stock');
            triggerTurboMode(60);
            sendDiscordNotification(
              '🚀 RESTOCK ALERT — Pokémon TCG',
              `**${productName}** is back in stock!\n\n🔗 [Buy Now — Click to Purchase](${productLink})\n\n⚠️ *This is a notification only unless Auto-Buy is ON.*`,
              0x10B981
            );
            
            if (GM_getValue(STORAGE_AUTO_BUY_MONITOR, false)) {
              logActivity(`Auto-Buy is ON! Navigating to purchase ${productName}...`, 'warn');
              window.location.href = productLink;
              return; // Stop processing further products to avoid multiple redirects
            }
          }
          knownProductStatuses[pid] = currentStatus;
        });
        schedulePageMonitorPoll(url);
      },
      onerror: () => schedulePageMonitorPoll(url)
    });
  }

  /* ─────────────────────────────────────────────
     TCG RELEASE MONITOR
  ───────────────────────────────────────────── */
  function startTcgMonitor(url) {
    if (tcgPollTimeout) clearTimeout(tcgPollTimeout);
    let knownIds = JSON.parse(GM_getValue(STORAGE_TCG_KNOWN_IDS, '[]'));

    const pollTcg = () => {
      if (!GM_getValue(STORAGE_TCG_ENABLED, false)) return;
      GM_xmlhttpRequest({
        method: 'GET',
        url: getJitteredUrl(url || 'https://toymate.com.au/trading-cards/battling-card-games/pokemon-trading-cards/'),
        headers: getJitteredHeaders(),
        onload: function (res) {
          const doc = new DOMParser().parseFromString(res.responseText, 'text/html');
          const anchors = Array.from(doc.querySelectorAll('a[id]')).filter(a => /^\d+$/.test(a.id));
          const currentIds = anchors.map(a => a.id).filter(Boolean);

          const newProducts = currentIds.filter(id => !knownIds.includes(id));
          if (newProducts.length > 0 && knownIds.length > 0) {
            logActivity(`🃏 NEW TCG PRODUCTS FOUND: ${newProducts.length} new listings!`, 'success');
            playSound('stock');
            sendDiscordNotification(
              '🃏 NEW TCG LISTINGS DETECTED!',
              `Toymate just listed ${newProducts.length} new TCG item(s)!\n\n🔗 [View Search](${url})`,
              0x8B5CF6
            );
          }

          knownIds = Array.from(new Set([...knownIds, ...currentIds]));
          GM_setValue(STORAGE_TCG_KNOWN_IDS, JSON.stringify(knownIds));
          tcgPollTimeout = setTimeout(pollTcg, randDelay(15000, 30000));
        },
        onerror: () => {
          tcgPollTimeout = setTimeout(pollTcg, 20000);
        }
      });
    };

    pollTcg();
  }

  function stopTcgMonitor() {
    if (tcgPollTimeout) clearTimeout(tcgPollTimeout);
  }

  /* ─────────────────────────────────────────────
     PRODUCT PAGE DETAILS EXTRACTION
  ───────────────────────────────────────────── */
  function checkProductPageDetails() {
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
    }
  }

  /* ─────────────────────────────────────────────
     INIT & BOOTSTRAP
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

    if (/\/cart/i.test(path)) {
      checkCartPage();
    } else if (host.includes('checkout.toymate.com.au') || /\/checkout/i.test(path)) {
      checkCheckoutPage();
    } else {
      setTimeout(() => {
        checkProductPageDetails();
        // Do NOT auto-start; user must click "Start Sniper" each session to prevent rogue buys
        const savedTarget = GM_getValue(STORAGE_TARGET_URL, '').trim();
        if (savedTarget) {
          setStatus('info', 'Ready to Snipe', `Target: ${savedTarget.substring(0,40)}...`);
          logActivity(`Target configured: ${savedTarget}. Click "Start Sniper" to arm.`, 'info');
        } else {
          setStatus('warn', 'No Target Set', 'Set a Target URL in the Monitor tab.');
        }
      }, 800);
    }

    if (GM_getValue(STORAGE_TCG_ENABLED, false)) {
      const tcgUrl = GM_getValue(STORAGE_TCG_URL, 'https://toymate.com.au/trading-cards/battling-card-games/pokemon-trading-cards/');
      setTimeout(() => startTcgMonitor(tcgUrl), 2000);
    }

    // React SPA Soft Navigation Fallback Observer
    let lastPath = window.location.pathname;
    setInterval(() => {
      const currentPath = window.location.pathname;
      if (currentPath !== lastPath) {
        lastPath = currentPath;
        if (/\/cart/i.test(currentPath) && currentState !== BotState.ON_CART_PAGE) {
          logActivity('SPA soft navigation to /cart detected. Checking cart...', 'info');
          if (botRunning) checkCartPage();
        } else if (window.location.hostname.includes('checkout.') || /\/checkout/i.test(currentPath)) {
          if (botRunning) checkCheckoutPage();
        }
      }
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
