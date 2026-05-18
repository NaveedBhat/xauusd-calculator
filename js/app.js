/* =========================================
   XAUUSD PRO CALCULATOR — APP LOGIC
   ========================================= */

"use strict";

// ── CONSTANTS ──────────────────────────────────────────────────────────
const XAUUSD = {
  pipValue: 0.10,
  lotSize: 100,
  standardLot: 100,
  miniLot: 10,
  microLot: 1,
};

// API KEY
const FINNHUB_API_KEY = 'd85j71pr01qitd92913gd85j71pr01qitd929140';

// ── ELEMENT REFS ──────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── STATE ──────────────────────────────────────────────────────────────
const state = {
  slMode: 'pips',
  direction: 'buy',
  lotType: 'standard',
  leverage: 100,
  tradeLog: [],
  livePrice: 0,   // starts at 0 — never show a stale default
  lastCalc: null,
};

let exchangeRate = 1.0;

function saveInputs() {
  const data = {
    balance: $('accountBalance').value,
    currency: $('accountCurrency') ? $('accountCurrency').value : 'USD',
    riskAmount: $('riskAmount').value,
    slPips: $('slPips').value,
    commission: $('commission') ? $('commission').value : '0',
    swap: $('swapFee') ? $('swapFee').value : '0',
    winRate: $('winRate').value,
    tradeLog: state.tradeLog,
    // Only cache the price if a REAL live price has been received
    lastLivePrice: priceConnected ? state.livePrice : null
  };
  localStorage.setItem('xauusd_data', JSON.stringify(data));
}

function loadInputs() {
  try {
    const saved = JSON.parse(localStorage.getItem('xauusd_data'));
    if (saved) {
      if(saved.balance) $('accountBalance').value = saved.balance;
      if(saved.currency && $('accountCurrency')) {
        $('accountCurrency').value = saved.currency;
        const symbols = {USD:'$', EUR:'€', GBP:'£', AUD:'A$', JPY:'¥', CAD:'C$'};
        $('currencySymbol').textContent = symbols[saved.currency] || '$';
        fetchExchangeRate(saved.currency);
      }
      if(saved.riskAmount) $('riskAmount').value = saved.riskAmount;
      if(saved.slPips) $('slPips').value = saved.slPips;
      if(saved.commission && $('commission')) $('commission').value = saved.commission;
      if(saved.swap && $('swapFee')) $('swapFee').value = saved.swap;
      if(saved.winRate) $('winRate').value = saved.winRate;
      if(saved.tradeLog) state.tradeLog = saved.tradeLog;

      // INSTANT PRICE: Show last cached price immediately (0ms delay)
      // Only use it if it looks like a real gold price (>1000 USD/oz)
      if (saved.lastLivePrice && saved.lastLivePrice > 1000) {
        state.livePrice = saved.lastLivePrice;
        sessionInitialPrice = saved.lastLivePrice;
        $('livePrice').textContent = saved.lastLivePrice.toFixed(2);
        $('livePrice').style.fontSize = '';
        $('livePrice').style.letterSpacing = '';
        $('liveChange').textContent = '+0.0000%';
        $('liveChange').style.color = 'var(--green)';
        const dot = document.querySelector('.live-dot');
        if (dot) { dot.style.background = 'var(--gold)'; dot.style.boxShadow = '0 0 8px var(--gold)'; }
      }
    }
  } catch(e) {}
}

async function fetchExchangeRate(targetCurrency) {
  if (targetCurrency === 'USD') {
    exchangeRate = 1.0;
    calculate();
    return;
  }
  try {
    const res = await fetch(`https://finnhub.io/api/v1/forex/rates?base=USD&token=${FINNHUB_API_KEY}`);
    const data = await res.json();
    if (data && data.quote && data.quote[targetCurrency]) {
      // API returns rate for 1 USD = X TargetCurrency.
      // To convert TargetCurrency to USD, divide by the rate.
      exchangeRate = 1 / data.quote[targetCurrency];
    }
  } catch(e) { console.error("Rate fetch failed", e); }
  calculate();
}

let sessionInitialPrice = null;
let priceConnected = false;

// ── PRICE UI HELPERS ───────────────────────────────────────────────────
function setConnectingState() {
  const priceEl = $('livePrice');
  priceEl.textContent = 'SYNC...';
  priceEl.style.fontSize = '0.75rem';
  priceEl.style.letterSpacing = '0.15em';
  const dot = document.querySelector('.live-dot');
  if (dot) { dot.style.background = 'var(--gold)'; dot.style.boxShadow = '0 0 8px var(--gold)'; }
  $('liveChange').textContent = 'CONNECTING';
  $('liveChange').style.color = 'var(--gold)';
}

function applyPrice(newPrice, changePct) {
  if (!newPrice || newPrice <= 0) return;
  const priceEl = $('livePrice');
  priceEl.textContent = newPrice.toFixed(2);
  priceEl.style.fontSize = '';
  priceEl.style.letterSpacing = '';
  const dot = document.querySelector('.live-dot');
  if (dot) { dot.style.background = 'var(--green)'; dot.style.boxShadow = '0 0 8px var(--green)'; }
  state.livePrice = newPrice;
  if (!priceConnected) { priceConnected = true; }
  if (changePct !== undefined) {
    const changeEl = $('liveChange');
    changeEl.textContent = (changePct >= 0 ? '+' : '') + changePct.toFixed(4) + '%';
    changeEl.style.color = changePct >= 0 ? 'var(--green)' : 'var(--red)';
  }
}

// ── REST PRICE FETCH (polling fallback, CORS-safe) ──────────────────────────
async function fetchRestPrice() {
  // Primary: metals.live — free, no auth, CORS open (works from file:// too)
  try {
    const res = await fetch('https://api.metals.live/v1/spot/gold', { cache: 'no-store' });
    const data = await res.json();
    if (Array.isArray(data) && data[0] && data[0].gold > 0) {
      const price = parseFloat(data[0].gold);
      if (sessionInitialPrice === null) sessionInitialPrice = price;
      const pct = ((price - sessionInitialPrice) / sessionInitialPrice) * 100;
      applyPrice(price, pct);
      return true;
    }
  } catch(e) {}

  // Fallback: Finnhub forex rates (works from https:// served pages)
  try {
    const res = await fetch(`https://finnhub.io/api/v1/forex/rates?base=USD&token=${FINNHUB_API_KEY}`, { cache: 'no-store' });
    const data = await res.json();
    if (data && data.quote && data.quote['XAU'] && data.quote['XAU'] > 0) {
      const price = parseFloat((1 / data.quote['XAU']).toFixed(2));
      if (sessionInitialPrice === null) sessionInitialPrice = price;
      const pct = ((price - sessionInitialPrice) / sessionInitialPrice) * 100;
      applyPrice(price, pct);
      return true;
    }
  } catch(e) { /* silent fail — WebSocket will take over */ }
  return false;
}

// ── LIVE WEBSOCKET PRICE ──────────────────────────────────────────────
function connectLivePrice() {
  const ws = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ 'type': 'subscribe', 'symbol': 'OANDA:XAU_USD' }));
  };

  ws.onmessage = (event) => {
    const response = JSON.parse(event.data);
    if (response.type === 'trade' && response.data && response.data.length > 0) {
      const latestTrade = response.data[response.data.length - 1];
      const newPrice = parseFloat(latestTrade.p);
      if (sessionInitialPrice === null) sessionInitialPrice = newPrice;
      const changePct = ((newPrice - sessionInitialPrice) / sessionInitialPrice) * 100;
      applyPrice(newPrice, changePct);

      // Real-time margin updates
      if (state.lastCalc && state.lastCalc.lots) {
        const balance = parseFloat($('accountBalance').value) * exchangeRate || 0;
        const lots = parseFloat(state.lastCalc.lots);
        const notionalValue = lots * XAUUSD.standardLot * state.livePrice;
        const marginReq = notionalValue / state.leverage;
        const freeMargin = balance - marginReq;
        const marginLevel = marginReq > 0 ? (balance / marginReq * 100) : 0;
        const mReqEl = $('marginRequired');
        if (mReqEl) mReqEl.textContent = '$' + marginReq.toFixed(2);
        const fMarginEl = $('freeMargin');
        if (fMarginEl) {
          fMarginEl.textContent = (freeMargin >= 0 ? '$' : '-$') + Math.abs(freeMargin).toFixed(2);
          fMarginEl.style.color = freeMargin >= 0 ? 'var(--green)' : 'var(--red)';
        }
        const mLevelEl = $('marginLevel');
        if (mLevelEl) {
          mLevelEl.textContent = marginLevel.toFixed(0) + '%';
          mLevelEl.style.color = marginLevel > 500 ? 'var(--green)' : marginLevel > 200 ? 'var(--gold)' : 'var(--red)';
        }
      }
    }
  };

  ws.onclose = () => {
    setTimeout(connectLivePrice, 5000);
  };

  ws.onerror = () => {};
}

// ── LIVE CLOCK ──────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  $('headerTime').textContent = now.toLocaleTimeString('en-US', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// ── STARTUP SEQUENCE ───────────────────────────────────────────────────
// 1. Show connecting state immediately (no more ---.-- blank)
setConnectingState();
// 2. Try REST immediately for fast initial display
fetchRestPrice();
// 3. Connect WebSocket for real-time ticks
connectLivePrice();
// 4. Polling fallback every 30s in case WS has no ticks (quiet market)
setInterval(fetchRestPrice, 30000);

// ── TOGGLE SETUP ───────────────────────────────────────────────────────
function setupToggle(groupId, stateKey, onChange) {
  const group = $(groupId);
  if (!group) return;
  group.querySelectorAll('.tog').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.tog').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset[stateKey === 'slMode' ? 'mode' :
        stateKey === 'direction' ? 'dir' :
          stateKey === 'lotType' ? 'lot' : 'lev'];
      state[stateKey] = val;
      if (onChange) onChange(val);
    });
  });
}

// SL Mode toggle — show/hide correct input group
setupToggle('slModeToggle', 'slMode', mode => {
  ['slPipsGroup', 'slDollarsGroup', 'slPriceGroup'].forEach(id => {
    $(id).classList.add('hidden');
  });
  if (mode === 'pips') $('slPipsGroup').classList.remove('hidden');
  if (mode === 'dollars') $('slDollarsGroup').classList.remove('hidden');
  if (mode === 'price') $('slPriceGroup').classList.remove('hidden');
  calculate();
});

setupToggle('directionToggle', 'direction', () => calculate());
setupToggle('lotTypeToggle', 'lotType', () => calculate());
setupToggle('leverageToggle', 'leverage', val => {
  state.leverage = parseInt(val);
  calculate();
});

// ── RISK SLIDER ────────────────────────────────────────────────────────
const riskSlider = $('riskSlider');
const riskAmount = $('riskAmount');
const accountBalance = $('accountBalance');

riskSlider.addEventListener('input', () => {
  const bal = parseFloat(accountBalance.value) || 0;
  const pct = parseFloat(riskSlider.value);
  riskAmount.value = (bal * pct / 100).toFixed(2);
  updateRiskBadge();
  calculate();
});

riskAmount.addEventListener('input', () => {
  updateRiskBadge();
  calculate();
});

accountBalance.addEventListener('input', () => {
  updateRiskBadge();
  calculate();
});

if ($('accountCurrency')) {
  $('accountCurrency').addEventListener('change', (e) => {
    const symbols = {USD:'$', EUR:'€', GBP:'£', AUD:'A$', JPY:'¥', CAD:'C$'};
    $('currencySymbol').textContent = symbols[e.target.value] || '$';
    fetchExchangeRate(e.target.value);
  });
}

function updateRiskBadge() {
  const bal = parseFloat(accountBalance.value) || 1;
  const risk = parseFloat(riskAmount.value) || 0;
  const pct = (risk / bal * 100);
  $('riskPctBadge').textContent = pct.toFixed(2) + '%';
  // Sync slider
  riskSlider.value = Math.min(10, pct);
}

// ── CORE CALCULATION ───────────────────────────────────────────────────
function getSLInPips() {
  switch (state.slMode) {
    case 'pips':
      return parseFloat($('slPips').value) || 0;
    case 'dollars': {
      // SL in dollars directly: use risk / risk ratio approach
      // For XAU: lots = risk / (pips * 10), and SL$ should equal risk
      // So treat SL dollars as a fixed pip value directly
      const slUSD = parseFloat($('slDollars').value) || 0;
      // $1 pip value at 0.01 lot, so slUSD maps to slUSD * 10 pips at micro scale
      return slUSD * 10;
    }
    case 'price': {
      const entry = parseFloat($('entryPrice').value) || 0;
      const sl = parseFloat($('slPrice').value) || 0;
      const diff = Math.abs(entry - sl);
      return diff * 10; // 1 pip = $0.10 per unit, 1 dollar = 10 pips on XAU
    }
    default: return 0;
  }
}

function calculate() {
  const balanceRaw = parseFloat(accountBalance.value) || 0;
  const riskRaw = parseFloat(riskAmount.value) || 0;
  
  // Convert balance and risk to USD for core calculations
  const balance = balanceRaw * exchangeRate;
  const risk = riskRaw * exchangeRate;
  
  const slPips = getSLInPips();

  if (slPips <= 0 || risk <= 0) {
    $('positionSize').textContent = '0.00';
    return;
  }

  // Position size formula:
  // lots = Risk / (SL_pips * pip_value_per_lot)
  // pip value for 1 standard lot on XAUUSD ≈ $10 per pip
  const pipValPerLot = 10; // $10 per pip per standard lot
  const lots = risk / (slPips * pipValPerLot);

  // Adjust for lot type display
  let displayLots, displayUnit, displaySub;
  if (state.lotType === 'standard') {
    displayLots = lots;
    displayUnit = 'LOTS';
    displaySub = `= ${lots.toFixed(4)} standard lots`;
  } else if (state.lotType === 'mini') {
    displayLots = lots * 10;
    displayUnit = 'MINI LOTS';
    displaySub = `= ${lots.toFixed(4)} standard lots`;
  } else {
    displayLots = lots * 100;
    displayUnit = 'MICRO LOTS';
    displaySub = `= ${lots.toFixed(4)} standard lots`;
  }

  // Derived values
  const slUSD = risk;
  const units = Math.round(lots * XAUUSD.standardLot * 1000) / 10; // notional oz-ish
  const pipValForPosition = lots * pipValPerLot;
  const riskPct = balance > 0 ? (risk / balance * 100) : 0;

  // Margin calculation
  const notionalValue = lots * XAUUSD.standardLot * state.livePrice; // lots * 100oz * price
  const marginReq = notionalValue / state.leverage;
  const freeMargin = balance - marginReq;
  const marginLevel = marginReq > 0 ? (balance / marginReq * 100) : 0;

  // Update hero
  const heroEl = $('positionSize');
  heroEl.textContent = displayLots.toFixed(2);
  heroEl.classList.add('updated');
  setTimeout(() => heroEl.classList.remove('updated'), 600);

  $('positionUnit').textContent = displayUnit;
  $('positionSub').textContent = displaySub;

  // Update result cards (displaying in USD)
  $('resRisk').textContent = '$' + risk.toFixed(2);
  $('resRiskPct').textContent = riskPct.toFixed(2) + '%';
  $('resSLPips').textContent = slPips.toFixed(1);
  $('resSLUSD').textContent = '$' + slUSD.toFixed(2);
  $('resUnits').textContent = (lots * 100000).toLocaleString('en-US', { maximumFractionDigits: 0 });
  $('resPipValue').textContent = '$' + pipValForPosition.toFixed(2);

  // Commission & Swap Costs (in USD)
  const commission = parseFloat($('commission') ? $('commission').value : 0) || 0;
  const swap = parseFloat($('swapFee') ? $('swapFee').value : 0) || 0;
  const totalCost = (commission * displayLots) + swap;

  // R:R update
  updateRR(lots, slPips, pipValForPosition, totalCost);

  // Multi-TP
  updateMultiTP(lots, pipValPerLot);

  // Break-even / EV / Kelly
  updateBreakEven();

  // Margin
  $('marginRequired').textContent = '$' + marginReq.toFixed(2);
  $('freeMargin').textContent = (freeMargin >= 0 ? '$' : '-$') + Math.abs(freeMargin).toFixed(2);
  $('freeMargin').style.color = freeMargin >= 0 ? 'var(--green)' : 'var(--red)';
  $('marginLevel').textContent = marginLevel.toFixed(0) + '%';
  $('marginLevel').style.color = marginLevel > 500 ? 'var(--green)' : marginLevel > 200 ? 'var(--gold)' : 'var(--red)';

  // Save last calc
  state.lastCalc = {
    lots: lots.toFixed(2),
    slPips: slPips.toFixed(1),
    risk: risk.toFixed(2),
    riskPct: riskPct.toFixed(2),
    direction: state.direction,
    tpPips: parseFloat($('tpPips').value) || 0,
    balance: balance.toFixed(2),
    pipValForPosition: pipValForPosition.toFixed(2),
    cost: totalCost
  };
  
  saveInputs();
}

// ── R:R CALCULATION ────────────────────────────────────────────────────
function updateRR(lots, slPips, pipValForPosition, totalCost = 0) {
  const tpPips = parseFloat($('tpPips').value) || 0;

  if (slPips <= 0 || tpPips <= 0) return;

  const ratio = tpPips / slPips;
  const potProfit = (lots * 10 * tpPips) - totalCost;
  const potLoss = (lots * 10 * slPips) + totalCost;

  $('rrRatio').textContent = '1:' + ratio.toFixed(2);
  $('potentialProfit').textContent = (potProfit >= 0 ? '+$' : '-$') + Math.abs(potProfit).toFixed(2);
  $('potentialLoss').textContent = '-$' + potLoss.toFixed(2);
  $('potentialProfit').className = 'rp-value ' + (potProfit >= 0 ? 'green' : 'red');

  // Grade
  const gradeEl = $('rrGrade');
  gradeEl.className = 'rr-grade';
  if (ratio >= 3) { gradeEl.textContent = 'EXCELLENT'; gradeEl.classList.add('excellent'); }
  else if (ratio >= 2) { gradeEl.textContent = 'GOOD'; gradeEl.classList.add('good'); }
  else if (ratio >= 1.5) { gradeEl.textContent = 'FAIR'; gradeEl.classList.add('fair'); }
  else { gradeEl.textContent = 'POOR'; gradeEl.classList.add('poor'); }

  // Bars
  const total = slPips + tpPips;
  $('slBar').style.width = (slPips / total * 100) + '%';
  $('tpBar').style.width = (tpPips / total * 100) + '%';
  $('slBarVal').textContent = slPips.toFixed(0) + ' pips';
  $('tpBarVal').textContent = tpPips.toFixed(0) + ' pips';
}

// ── MULTI-TP CALCULATION ───────────────────────────────────────────────
function updateMultiTP(lots, pipValPerLot) {
  const rows = $$('.mtp-inp');
  let totalWeighted = 0;
  rows.forEach((inp, i) => {
    const pips = parseFloat(inp.value) || 0;
    const pct = parseFloat(inp.dataset.pct) / 100;
    const profit = lots * pct * pipValPerLot * pips;
    totalWeighted += profit;
    const el = $('mtp' + i);
    if (el) el.textContent = '+$' + profit.toFixed(2);
  });
  $('mtpTotal').textContent = '+$' + totalWeighted.toFixed(2);
}

// ── BREAK-EVEN & KELLY ─────────────────────────────────────────────────
function updateBreakEven() {
  const tpPips = parseFloat($('tpPips').value) || 0;
  const slPips = getSLInPips();

  // --- Pull win rate from real trade history if available ---
  const closed = state.tradeLog.filter(t => t.status !== 'open');
  const wins = closed.filter(t => t.status === 'win');
  let winRate;
  let fromHistory = false;

  if (closed.length >= 5) {
    winRate = wins.length / closed.length;
    fromHistory = true;
    $('winRate').value = (winRate * 100).toFixed(0);
  } else {
    winRate = parseFloat($('winRate').value) / 100 || 0.5;
    fromHistory = false;
  }

  // Update source badge
  const badge = $('beSourceBadge');
  const sourceTag = $('winRateSource');
  const hint = $('winRateHint');
  if (badge) {
    badge.textContent = fromHistory
      ? `📊 FROM HISTORY (${closed.length} trades)`
      : '✎ MANUAL INPUT';
    badge.className = fromHistory ? 'be-source-badge' : 'be-source-badge manual';
  }
  if (sourceTag) sourceTag.textContent = fromHistory ? 'FROM HISTORY' : 'MANUAL';
  if (hint) hint.textContent = fromHistory
    ? `Based on ${wins.length} wins / ${closed.length} closed trades`
    : 'Log 5+ closed trades and win rate auto-updates from history';

  if (tpPips <= 0 || slPips <= 0) return;

  const rr = tpPips / slPips;

  const beWR = (1 / (1 + rr)) * 100;
  $('beWinRate').textContent = beWR.toFixed(1) + '%';
  $('beWinRate').style.color = winRate * 100 > beWR ? 'var(--green)' : 'var(--red)';

  const ev = (winRate * rr) - (1 - winRate);
  $('beEV').textContent = ev.toFixed(3);
  $('beEV').style.color = ev > 0 ? 'var(--green)' : 'var(--red)';

  const kelly = winRate - (1 - winRate) / rr;
  $('beKelly').textContent = (kelly * 100).toFixed(1) + '%';
  $('beKelly').style.color = kelly > 0 ? 'var(--green)' : 'var(--red)';
  
  state.currentKellyPct = kelly > 0 ? kelly * 100 : 0;
}

if ($('applyKellyBtn')) {
  $('applyKellyBtn').addEventListener('click', () => {
    if (state.currentKellyPct && state.currentKellyPct > 0) {
      riskSlider.value = Math.min(10, state.currentKellyPct);
      const bal = parseFloat(accountBalance.value) || 0;
      riskAmount.value = (bal * state.currentKellyPct / 100).toFixed(2);
      updateRiskBadge();
      calculate();
    }
  });
}

// ── TRADE LOG ──────────────────────────────────────────────────────────
$('logTradeBtn').addEventListener('click', () => {
  if (!state.lastCalc) {
    alert('Please calculate a position first.');
    return;
  }

  const c = state.lastCalc;
  const entry = {
    id: state.tradeLog.length + 1,
    time: new Date().toLocaleTimeString('en-US', { hour12: false }),
    direction: c.direction,
    lots: c.lots,
    slPips: c.slPips,
    tpPips: c.tpPips,
    risk: c.risk,
    riskPct: c.riskPct,
    rr: c.tpPips > 0 ? (c.tpPips / c.slPips).toFixed(2) : '0',
    status: 'open',
    pl: 0,
  };

  state.tradeLog.push(entry);
  renderLog();
  renderHistoryTable();
  updateHistoryStats();
  saveInputs();
});

$('clearLogBtn').addEventListener('click', () => {
  if (state.tradeLog.length === 0) return;
  if (confirm('Clear all logged trades?')) {
    state.tradeLog = [];
    renderLog();
    renderHistoryTable();
    updateHistoryStats();
    saveInputs();
  }
});

function renderLog() {
  const logEl = $('tradeLog');
  if (state.tradeLog.length === 0) {
    logEl.innerHTML = '<div class="log-empty">No trades logged yet.</div>';
    return;
  }
  logEl.innerHTML = state.tradeLog.slice().reverse().map(t => `
    <div class="log-entry">
      <span>${t.time} | ${t.direction.toUpperCase()} | ${t.lots} lots</span>
      <span style="color:var(--gold)">SL ${t.slPips}p / TP ${t.tpPips}p</span>
    </div>
  `).join('');
}

function renderHistoryTable() {
  const tbody = $('historyBody');
  if (state.tradeLog.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-row">No trades logged. Calculate & log a trade above.</td></tr>';
    return;
  }

  tbody.innerHTML = state.tradeLog.map((t, i) => {
    const lots = parseFloat(t.lots) || 0;
    const sl = parseFloat(t.slPips) || 0;
    const tp = parseFloat(t.tpPips) || 0;
    const pipVal = lots * 10;

    let status = t.status;
    let pl = t.pl;

    const plNum = parseFloat(pl);
    return `
      <tr>
        <td>${t.id}</td>
        <td>${t.time}</td>
        <td><span class="dir-badge ${t.direction}">${t.direction.toUpperCase()}</span></td>
        <td>${t.lots}</td>
        <td>${t.slPips}</td>
        <td>${t.tpPips || '--'}</td>
        <td>$${t.risk}</td>
        <td>${t.riskPct}%</td>
        <td>1:${t.rr}</td>
        <td><span class="status-badge ${status}">${status.toUpperCase()}</span></td>
        <td style="color:${plNum > 0 ? 'var(--green)' : plNum < 0 ? 'var(--red)' : 'var(--text-dim)'}">
          ${plNum > 0 ? '+' : ''}${status === 'open' ? '--' : '$' + pl}
        </td>
      </tr>
    `;
  }).join('');
}

function updateHistoryStats() {
  const trades = state.tradeLog;
  const closed = trades.filter(t => t.status !== 'open');
  const wins = closed.filter(t => t.status === 'win');
  const wr = closed.length > 0 ? (wins.length / closed.length * 100).toFixed(0) : 0;
  const totalPL = closed.reduce((s, t) => s + (parseFloat(t.pl) || 0), 0);
  const avgRR = trades.reduce((s, t) => s + (parseFloat(t.rr) || 0), 0) / (trades.length || 1);

  $('statTrades').textContent = trades.length;
  $('statWR').textContent = wr + '%';
  const plEl = $('statPL');
  plEl.textContent = (totalPL >= 0 ? '+$' : '-$') + Math.abs(totalPL).toFixed(2);
  plEl.style.color = totalPL >= 0 ? 'var(--green)' : 'var(--red)';
  $('statRR').textContent = avgRR.toFixed(2);

  // Sync Break-Even Calculator whenever history changes
  updateBreakEven();
}

// ── WIRE UP ALL INPUTS ─────────────────────────────────────────────────
[
  'slPips', 'slDollars', 'entryPrice', 'slPrice',
  'tpPips', 'winRate'
].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('input', calculate);
});

$$('.mtp-inp').forEach(inp => {
  inp.addEventListener('input', () => {
    const slPips = getSLInPips();
    const risk = parseFloat(riskAmount.value) || 0;
    const lots = slPips > 0 ? risk / (slPips * 10) : 0;
    updateMultiTP(lots, 10);
  });
});

// ── TP PRICE LEVEL ⇒ AUTO-FILL PIPS ──────────────────────────────────────
function wireTPPriceInputs() {
  const tpPriceEl = $('tpPrice');
  const tpPriceLevelEl = $('tpPriceLevel');

  function convertTPPriceToRRPips(tpPriceInput) {
    tpPriceInput.addEventListener('input', () => {
      const tpPriceVal = parseFloat(tpPriceInput.value);
      if (!tpPriceVal || tpPriceVal <= 0) return;

      // Use entry price if available (Price Level mode), else use live price
      let entryP = parseFloat($('entryPrice') ? $('entryPrice').value : null) || state.livePrice;
      if (state.slMode !== 'price') entryP = state.livePrice;

      const pipDiff = Math.abs(tpPriceVal - entryP) * 10; // 1 pip = $0.10 on XAU
      const calcPips = Math.round(pipDiff);

      if (calcPips > 0) {
        $('tpPips').value = calcPips;
        const hint = tpPriceInput === tpPriceLevelEl ? $('tpPipsCalc') : $('tpPipsFromPrice');
        if (hint) hint.textContent = `= ${calcPips} pips from entry`;
        calculate();
      }
    });
  }

  if (tpPriceEl) convertTPPriceToRRPips(tpPriceEl);
  if (tpPriceLevelEl) convertTPPriceToRRPips(tpPriceLevelEl);
}

// ── CALCULATE BUTTON ───────────────────────────────────────────────────
$('calcBtn').addEventListener('click', () => {
  calculate();
  // Scroll to results
  document.querySelector('.panel-results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ── CSV EXPORT ─────────────────────────────────────────────────────────
if ($('exportCsvBtn')) {
  $('exportCsvBtn').addEventListener('click', () => {
    if (state.tradeLog.length === 0) {
      alert("No trades to export.");
      return;
    }
    let csv = "ID,Time,Direction,Lots,SL Pips,TP Pips,Risk $,Risk %,R:R,Status,P/L\n";
    state.tradeLog.forEach(t => {
      csv += `${t.id},${t.time},${t.direction},${t.lots},${t.slPips},${t.tpPips},${t.risk},${t.riskPct},${t.rr},${t.status},${t.pl}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'xauusd_trades.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}

// ── TRADINGVIEW WIDGET ─────────────────────────────────────────────────
function initTradingView() {
  if (typeof TradingView !== 'undefined' && $('tv_chart_container')) {
    new TradingView.widget({
      "autosize": true,
      "symbol": "OANDA:XAUUSD",
      "interval": "5",
      "timezone": "Etc/UTC",
      "theme": "dark",
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "backgroundColor": "#0e1620",
      "gridColor": "#1e3048",
      "hide_top_toolbar": false,
      "hide_legend": false,
      "save_image": false,
      "container_id": "tv_chart_container",
      "support_host": "https://www.tradingview.com"
    });
  }
}

// ── INITIAL CALCULATION ────────────────────────────────────────────────
loadInputs();
calculate();
updateRiskBadge();
wireTPPriceInputs();

// Render UI for logged trades on page load
if (state.tradeLog.length > 0) {
  renderLog();
  renderHistoryTable();
  updateHistoryStats();
}

setTimeout(initTradingView, 500);
