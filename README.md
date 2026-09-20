# 🧸 Toymate Auto Checkout & Restock Monitor

> **Author:** Pythonic Shariful  
> **Platform:** Tampermonkey (Chrome / Firefox / Edge)  
> **Target Site:** [Toymate.com.au](https://toymate.com.au)

A powerful, stealthy Tampermonkey userscript that fully automates the Toymate checkout process, monitors out-of-stock products in the background **without refreshing the page**, sends real-time **Discord notifications**, and plays **notification sounds** for every key event.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🚀 **End-to-End Checkout** | Auto login → Add to Cart → Coupon → Shipping → Credit Card → Place Order |
| 🕵️ **Stealth Polling** | Silently checks stock in background using fetch — no page refreshes, no detection |
| 🎲 **Randomized Delays** | Configurable min/max polling interval with jitter to appear human-like |
| 🔄 **Cache Busting** | Appends unique timestamp to every stock check to prevent stale HTML responses |
| 💳 **Adyen CC Support** | Auto-fills Credit Card Number, Expiry, CVV into secure Adyen iframes |
| 🎯 **Remote Monitoring** | Monitor a product from ANY page on the site — works from homepage, cart, etc. |
| 🔔 **Discord Notifications** | Instant webhook alerts for: Stock Detected, Order Placed |
| 🎵 **Notification Sounds** | Custom audio tones for: Stock detected, Order placed, Error |
| 🎛️ **5-Tab Compact UI** | Floating panel with tabs — Login, More, Pay, Config, Item |
| 🔒 **100% Local Storage** | All credentials stored locally in Tampermonkey — never transmitted externally |

---

## 📦 Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Open Tampermonkey Dashboard → **Create a new script**.
3. Copy the entire contents of [`toymate-autologin.user.js`](./toymate-autologin.user.js) and paste it into the editor.
4. Click **Save** (Ctrl+S).
5. Go to [Toymate](https://toymate.com.au) — the 🧸 floating bubble will appear in the bottom-right corner.

---

## 🛠️ Initial Setup

Click the **🧸 bubble** to open the panel, then configure each tab:

### 🔑 Login Tab
- Enter your Toymate **Email** and **Password**.
- Click **Login Now** to log in immediately.

### ⚙️ More Tab
- Enter your **Coupon Code** (optional, e.g., `TOYS10`) — auto-applied at checkout.
- Toggle **Auto-login on page load** to automatically log in whenever the bot detects you're not signed in.
- Toggle **Notification Sounds** to enable/disable audio alerts.

### 💳 Pay Tab
- Enter your **Credit Card Number**, **Expiry (MM/YY)**, and **CVV**.
- These are stored locally and auto-filled into the Adyen payment iframe during checkout.

### 🎯 Config Tab
- **Target URL**: The product URL you want to monitor for stock.
- Click **📍 Here** to instantly set it to the current page URL.
- **Min / Max Poll Delay (s)**: The bot will wait a random number of seconds between these two values before each stock check (e.g., 3–6 seconds).
- **Discord Webhook URL**: Paste your Discord channel webhook here to receive alerts (see Discord setup below).

Click **💾 Save** at the bottom to save all settings.

---

## 🎮 How to Use

### ✅ Scenario A — Buy an In-Stock Product Right Now

1. Go to the product page of the item you want.
2. In the **Config tab**, click **📍 Here** to set the target URL.
3. Click **💾 Save**, then click **🛒 Start Bot**.
4. The bot will:
   - Add the item to your cart.
   - Navigate to the cart page and apply your coupon code.
   - Click Checkout.
   - Select Credit Card on the payment page.
   - Fill in your card details into the Adyen iframe.
   - Click **Place Order**.
   - Play a success sound 🎵 and send a Discord notification 📣.

---

### ⏳ Scenario B — Monitor an Out-of-Stock Product (from the Product Page)

1. Navigate to the out-of-stock product page.
2. Open the bot panel → **Config tab** → Click **📍 Here**.
3. Optionally adjust **Min/Max Poll Delay**.
4. Click **💾 Save**, then click **🛒 Start Bot**.
5. The bot notices the "Add to Cart" button is missing and silently starts polling the page in the background.
6. The moment stock drops:
   - A 🎵 **stock alert sound** plays.
   - A 🔔 **Discord message** is sent.
   - The browser navigates to the product page.
   - The full buy loop executes automatically.

---

### 🌍 Scenario C — Monitor an Out-of-Stock Product from ANY Page

You don't need to be on the product page at all!

1. Go to any page (homepage, search results, etc.).
2. Open the bot panel → **Config tab**.
3. Paste the product URL into **Target URL**.
4. Click **💾 Save**, then click **🛒 Start Bot**.
5. The bot polls the product silently in the background while you browse.
6. When stock drops → sound alert + Discord alert + auto-navigate + auto-buy.

---

## 🔔 Discord Notification Setup

1. Open your Discord server.
2. Go to **Server Settings → Integrations → Webhooks → New Webhook**.
3. Choose the channel where you want alerts.
4. Click **Copy Webhook URL**.
5. Paste it into the **🔔 Discord Webhook URL** field in the **Config tab**.
6. Click **Save**.

You will receive Discord notifications for:
| Event | Color | Message |
|---|---|---|
| 🟢 Stock Detected | Green | Product link + status |
| 🔵 Order Placed | Blue | Checkout link + confirmation |

---

## 🎵 Notification Sounds

Sounds are generated using the browser's Web Audio API (no external files needed). They play automatically for:

| Sound | Trigger |
|---|---|
| 📈 Stock Alert (rising 4-note melody) | When stock is detected via background poll |
| ✅ Success (3-note ascending) | When Place Order is clicked |
| ❌ Error (descending 2 notes) | On critical errors |

You can toggle sounds on/off in the **⚙️ More tab**.

---

## 🛑 Stopping the Bot

Click the **⏹ Stop Bot** button at any time to immediately halt:
- Background stock polling
- Auto-checkout loops
- Adyen iframe interaction

---

## 📂 Tab Reference

| Tab | Fields |
|---|---|
| 🔑 **Login** | Email, Password, Login Now button |
| ⚙️ **More** | Coupon Code, Auto-login toggle, Sound toggle |
| 💳 **Pay** | Card Number, Expiry, CVV |
| 🎯 **Config** | Target URL, Min/Max Delay, Discord Webhook |
| 📦 **Item** | Live product detection info (SKU, Price, Title) |

---

## ⚠️ Disclaimer

This script is provided for **educational purposes only**. Use responsibly and ensure you comply with Toymate's terms of service. The author takes no responsibility for any account actions taken by the website.