# 🧸 Toymate Auto Checkout & Restock Monitor

> **Author:** Pythonic Shariful  
> **Platform:** Tampermonkey (Chrome / Firefox / Edge)  
> **Target Site:** [Toymate.com.au](https://toymate.com.au)

A powerful, stealthy Tampermonkey userscript that fully automates the Toymate checkout process, monitors out-of-stock products **and entire search pages** in the background **without refreshing the page**, sends real-time **Discord notifications**, and plays **notification sounds** for every key event.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🚀 **End-to-End Checkout** | Auto login → Add to Cart → Coupon → Shipping → Credit Card → Place Order |
| 🕵️ **Stealth Polling** | Silently checks stock in background using fetch — no page refreshes, no detection |
| 🎲 **Randomized Delays** | Configurable min/max polling interval with jitter to appear human-like |
| 📦 **Custom Quantity & Human-Like Interactions** | Set a target Buy Quantity. The bot physically clicks the `+` button extremely fast to reach the quantity, perfectly bypassing React restrictions |
| 🎯 **Remote Product Monitoring** | Monitor a single product's stock from ANY page on the site |
| 🔎 **Category Page Monitoring** | Monitor an *entire* category page (e.g. all Pokemon TCG products) and instantly detect when *any* item drops back in stock |
| 🃏 **TCG Release Alerts** | Dedicated background worker that watches for brand new, never-before-seen products to drop on the site |
| 🔔 **Decoupled Category Monitor** | Dedicated Restock Monitor strictly for notifications (Ping/Toast/Sound), with an optional Auto-Buy toggle for the brave |
| 🔔 **Discord Notifications** | Instant webhook alerts for: Stock Detected, New Releases, Order Placed |
| 💳 **Adyen CC Support** | Auto-fills Credit Card Number, Expiry, CVV into secure Adyen iframes |
| 🎛️ **5-Tab UI** | Clean, compact floating panel with tabs — Login, Pay, Bot, Alerts, Item |

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
- Toggle **Auto-login on page load** to automatically log in whenever the bot detects you're not signed in.
- Click **Login Now** to log in immediately.

### 💳 Pay Tab
- Enter your **Credit Card Number**, **Expiry (MM/YY)**, and **CVV**.
- Enter your **Coupon Code** (optional, e.g., `TOYS10`) — auto-applied at checkout.
- *Stored locally and auto-filled into the Adyen payment iframe during checkout.*

### 🎯 Monitor Tab
- **Target Product URL (For Sniper)**: The specific product URL you want the bot to auto-checkout.
- **Category Monitor URL (Notify-Only)**: The search/category URL the background worker watches for restocks (defaults to Pokémon TCG).
- **Buy Quantity**: The number of items you want to buy (bot clicks `+` this many times).
- **Min / Max (s)**: The randomized delay interval for stock checks.
- **⚡ Auto-Buy on Restock (Warning)**: If ON, the Category Monitor will instantly navigate to and buy the first item that restocks. Leave OFF for notify-only mode.

### 📡 Alerts Tab
- **Discord Webhook URL**: Paste your Discord channel webhook here to receive alerts.
- **Notification Sounds**: Toggle audio alerts on/off.
- **TCG Release Alerts**: Toggle the background worker that hunts for brand new items.
- **TCG Search URL**: The category URL the background worker watches for new drops (e.g. `https://toymate.com.au/trading-cards/battling-card-games/pokemon-trading-cards/`).

Click **💾 Save** at the bottom to save all settings!

---

## 🎮 How to Use

### ✅ Scenario A — Buy an In-Stock Product Right Now

1. Go to the product page of the item you want.
2. Open the **Monitor tab**, click **📍 Here** (in the Item tab) to set the URL, and set your **Buy Quantity** (e.g. 36).
3. Click **Start Bot**.
4. The bot will:
   - Rapidly click the `+` button 35 times.
   - Add the item to your cart.
   - Navigate to the cart page and apply your coupon code.
   - Click Checkout.
   - Select Credit Card and fill in your card details into the Adyen iframe.
   - Click **Place Order**.
   - Play a success sound 🎵 and send a Discord notification 📣.

---

### ⏳ Scenario B — Monitor a Specific Out-of-Stock Product

1. Navigate to the out-of-stock product page.
2. Open the **Monitor tab** and ensure your Target URL is set.
3. Click **Start Bot**.
4. The bot notices the "Add to Cart" button is missing and silently starts polling the page in the background.
5. The moment stock drops:
   - A 🎵 **stock alert sound** plays.
   - A 🔔 **Discord message** is sent.
   - The browser navigates to the product page and executes the full auto-buy loop.

---

### 🔎 Scenario C — Monitor an Entire Category Page for ANY Restocks

Don't want to track just one item? You can track a whole category page!

1. Open the **Monitor tab** and ensure your **Category Monitor URL** is set (defaults to Pokémon TCG).
2. Click the blue **🔎 Monitor** button at the bottom of the bot panel.
3. The bot will take a snapshot of every product on the page using Next.js compatible parsing.
4. It will silently poll the page in the background based on your Min/Max delays.
5. If *any* product goes from "Out of Stock" to "In Stock":
   - It blasts a Discord notification with a direct link to the product.
   - Plays a sound and shows a toast.
   - If **⚡ Auto-Buy on Restock** is ON, it instantly navigates to that product and starts the auto-checkout bot! (Warning: Buys the first thing that restocks).

---

## 🔔 Discord Notification Setup

1. Open your Discord server.
2. Go to **Server Settings → Integrations → Webhooks → New Webhook**.
3. Choose the channel where you want alerts.
4. Click **Copy Webhook URL**.
5. Paste it into the **Discord Webhook URL** field in the **Alerts tab**.
6. Click **Save**.

---

## 🛑 Stopping the Bot

- Click **⏹ Stop Bot** to halt auto-checkout loops.
- Click **🛑 Stop Monitor** to halt the search page monitor.

---

## ⚠️ Disclaimer

This script is provided for **educational purposes only**. Use responsibly and ensure you comply with Toymate's terms of service. The author takes no responsibility for any account actions taken by the website.