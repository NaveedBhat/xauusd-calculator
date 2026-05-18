/* =========================================
   XAUUSD PRO CALCULATOR — APP LOGIC
   ========================================= */

"use strict";

// ── CONSTANTS ──────────────────────────────────────────────────────────
const XAUUSD = {
  pipValue: 0.10,  // per 0.01 lot per pip
  lotSize: 100,   // oz per standard lot
  standardLot: 100,
  miniLot: 10,
  microLot: 1,
};

// ── STATE ──────────────────────────────────────────────────────────────
const state = {
  slMode: 'pips',     // 'pips' | 'dollars' | 'price'
  direction: 'buy',
  lotType: 'standard',
  leverage: 100,
  tradeLog: [],
  livePrice: 2350.00,
  lastCalc: null,
};

// ── ELEMENT REFS ───────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── LIVE CLOCK & REAL-TIME OANDA XAUUSD PRICE (FINNHUB) ────────────────
function updateClock() {
  const now = new Date();
  $('headerTime').textContent = now.toLocaleTimeString('en-US', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// PASTE YOUR FULL FINNHUB API KEY HERE
const FINNHUB_API_KEY = 'd85j71pr01qitd92913gd85j71pr01qitd929140';

let sessionInitialPrice = null;

function connectLivePrice() {
  // Connecting to Finnhub's Live WebSocket for exact OANDA XAU_USD data
  const ws = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`);

  ws.onopen = () => {
    console.log("Connected to Finnhub!");
    // Subscribe to OANDA XAUUSD
    ws.send(JSON.stringify({ 'type': 'subscribe', 'symbol': 'OANDA:XAU_USD' }));
  };

  ws.onmessage = (event) => {
    const response = JSON.parse(event.data);

    // Check if it's a trade update
    if (response.type === 'trade' && response.data && response.data.length > 0) {
      const latestTrade = response.data[0]; // get the most recent trade in the payload
      const newPrice = parseFloat(latestTrade.p); // trade price

      // Store the first price we see to calculate session % change
      if (sessionInitialPrice === null) {
        sessionInitialPrice = newPrice;
      }

      const changePct = ((newPrice - sessionInitialPrice) / sessionInitialPrice) * 100;

      state.livePrice = newPrice;

      $('livePrice').textContent = state.livePrice.toFixed(2);

      const changeEl = $('liveChange');
      changeEl.textContent = (changePct >= 0 ? '+' : '') + changePct.toFixed(4) + '%';
      changeEl.style.color = changePct >= 0 ? 'var(--green)' : 'var(--red)';
    }
  };

  ws.onclose = () => {
    console.log("WebSocket disconnected. Reconnecting in 5s...");
    setTimeout(connectLivePrice, 5000);
  };

  ws.onerror = (err) => {
    console.error("WebSocket Error:", err);
  };
}

connectLivePrice();

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
      const slUSD = parseFloat($('slDollars').value) || 0;
      // $1 SL in USD = 10 pips for 0.01 lot, so derive from lot value
      // We'll compute: pipValue per lot at standard lot = slUSD / (lots * 0.10)
      // But we don't know lots yet — use the risk amount to infer pips
      // pipValue per pip per standard lot = $10
      // SL$ = lots * 10 * pips → pips = SL$ / (lots * 10)
      // But lots depends on pips — so solve: lots = risk / (pips * pipValPerLot)
      // Use dollars directly: pip value at 0.01 lot = $0.10
      // SL in pips: slUSD / (risk/slUSD) — no, simplify:
      // We'll treat: pips = slUSD * 10  (because $1 = 10 pips at 0.01 lot level)
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
  const balance = parseFloat(accountBalance.value) || 0;
  const risk = parseFloat(riskAmount.value) || 0;
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

  // Update result cards
  $('resRisk').textContent = '$' + risk.toFixed(2);
  $('resRiskPct').textContent = riskPct.toFixed(2) + '%';
  $('resSLPips').textContent = slPips.toFixed(1);
  $('resSLUSD').textContent = '$' + slUSD.toFixed(2);
  $('resUnits').textContent = (lots * 100000).toLocaleString('en-US', { maximumFractionDigits: 0 });
  $('resPipValue').textContent = '$' + pipValForPosition.toFixed(2);

  // R:R update
  updateRR(lots, slPips, pipValForPosition);

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
  };
}

// ── R:R CALCULATION ────────────────────────────────────────────────────
function updateRR(lots, slPips, pipValForPosition) {
  const tpPips = parseFloat($('tpPips').value) || 0;

  if (slPips <= 0 || tpPips <= 0) return;

  const ratio = tpPips / slPips;
  const potProfit = lots * 10 * tpPips;
  const potLoss = lots * 10 * slPips;

  $('rrRatio').textContent = '1:' + ratio.toFixed(2);
  $('potentialProfit').textContent = '+$' + potProfit.toFixed(2);
  $('potentialLoss').textContent = '-$' + potLoss.toFixed(2);

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
  const winRate = parseFloat($('winRate').value) / 100 || 0.5;

  if (tpPips <= 0 || slPips <= 0) return;

  const rr = tpPips / slPips;

  // Min win rate to break even: loss / (profit + loss)
  const beWR = (1 / (1 + rr)) * 100;
  $('beWinRate').textContent = beWR.toFixed(1) + '%';
  $('beWinRate').style.color = winRate * 100 > beWR ? 'var(--green)' : 'var(--red)';

  // Expected Value
  const ev = (winRate * rr) - (1 - winRate);
  $('beEV').textContent = ev.toFixed(3);
  $('beEV').style.color = ev > 0 ? 'var(--green)' : 'var(--red)';

  // Kelly Criterion: f = W - (1-W)/R
  const kelly = winRate - (1 - winRate) / rr;
  $('beKelly').textContent = (kelly * 100).toFixed(1) + '%';
  $('beKelly').style.color = kelly > 0 ? 'var(--green)' : 'var(--red)';
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
});

$('clearLogBtn').addEventListener('click', () => {
  if (state.tradeLog.length === 0) return;
  if (confirm('Clear all logged trades?')) {
    state.tradeLog = [];
    renderLog();
    renderHistoryTable();
    updateHistoryStats();
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

    // Randomly mark older trades as win/loss for demo
    let status = t.status;
    let pl = t.pl;
    if (i < state.tradeLog.length - 1 && status === 'open') {
      t.status = Math.random() > 0.45 ? 'win' : 'loss';
      t.pl = t.status === 'win' ? (pipVal * tp).toFixed(2) : (-pipVal * sl).toFixed(2);
      status = t.status;
      pl = t.pl;
    }

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

// ── CALCULATE BUTTON ───────────────────────────────────────────────────
$('calcBtn').addEventListener('click', () => {
  calculate();
  // Scroll to results
  document.querySelector('.panel-results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ── INITIAL CALCULATION ────────────────────────────────────────────────
calculate();
updateRiskBadge();
