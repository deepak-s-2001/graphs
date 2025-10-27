// Robustly register zoom plugin for any UMD export shape
// Robustly register chartjs-plugin-zoom for any UMD shape (ChartZoom or ['chartjs-plugin-zoom'], with/without .default)
const _zoomUMD = window.ChartZoom || window['chartjs-plugin-zoom'];
const ZoomPlugin = _zoomUMD && (_zoomUMD.default || _zoomUMD);
if (ZoomPlugin) Chart.register(ZoomPlugin);

/* ====== Data & helpers (unchanged) ====== */
const hours = Array.from({length:25}, (_,i)=>i); // 0..24 inclusive

function mkSeries(seed, peakHour=15, peak=140, noise=6){
  const out = [];
  for (let h=0; h<=24; h++){
    const base = Math.max(8, (Math.sin((h-3)/2) + 1)*18 + 12);
    const bump = Math.max(0, peak*Math.exp(-0.5*Math.pow((h-peakHour)/1.1, 2)));
    const val = Math.min(260, Math.round(base + bump + (Math.sin(h*1.3 + seed)*noise)));
    out.push({x:h, y:val});
  }
  return out;
}

const singleSeries = mkSeries(0.3, 15, 140);
const compareSeries = [
  { name:'Schaefer & Joy (AG)',   color:'#60a5fa', shape:'circle',  dash:[],               data: mkSeries(0.1,  9, 45)  },
  { name:'Scotten & W Jefferson', color:'#f59e0b', shape:'rect',    dash:[12,8],           data: mkSeries(0.6, 12,180) },
  { name:'Schoolcraft / Dossin',  color:'#34d399', shape:'triangle',dash:[3,9],            data: mkSeries(1.2, 18, 70) },
  { name:'A & W Daycare',         color:'#e879f9', shape:'rectRot', dash:[18,8,3,8],       data: mkSeries(1.8, 20, 55) },
];

const bands = [
  { label:'GOOD',           max:50,  color:'#10b981' },
  { label:'MODERATE',       max:100, color:'#fbbf24' },
  { label:'USG',            max:150, color:'#f97316' },
  { label:'UNHEALTHY',      max:200, color:'#ef4444' },
  { label:'VERY UNHEALTHY', max:300, color:'#a855f7' },
];

function aqiColor(v){
  if (v <= 50)  return '#10b981';
  if (v <= 100) return '#fbbf24';
  if (v <= 150) return '#f97316';
  if (v <= 200) return '#ef4444';
  return '#a855f7';
}

/* ====== Axes & ticks (unchanged) ====== */
const xTicks = [0,4,8,12,16,20,24];
const yTicks = [0,50,100,150,200,250,300];

function commonScales(showGrid){
  const gridColorH = showGrid ? 'rgba(51,65,85,.10)' : 'rgba(0,0,0,0)';
  const yGridColor  = showGrid ? 'rgba(51,65,85,.18)' : 'rgba(0,0,0,0)';
  return {
    x: {
      type: 'linear', min:0, max:24,
      ticks: { callback: v => `${String(v).padStart(2,'0')}:00`, values: xTicks, color:'#334155' },
      grid: { color: gridColorH, borderColor:'#94a3b8', lineWidth:1, borderWidth:1, borderDash:[] }
    },
    y: {
      type: 'linear', min:0, max:300,
      ticks: { color:'#334155', callback: v => (yTicks.includes(v)? v : ''), stepSize:50 },
      grid: { color: yGridColor, borderColor:'#94a3b8', lineWidth:1, borderWidth:1, borderDash: yGridColor ? [3,5] : [] }
    }
  };
}

/* ====== Plugins ====== */
// AQI bands behind data (unchanged)
// --- Auto-fit Y domain to data that's currently shown (respects selection & avoids fighting zoom) ---
const YAutoDomainPlugin = {
  id: 'yAutoDomain',
  beforeLayout(chart) {
    const st = chart.$state || (chart.$state = {});
    // If user has zoomed/panned, don't auto-fit until they reset
    if (st.userZoomed) return;

    // Collect visible values
    const ds = chart.data.datasets || [];
    const sel = st.selectedSet; // Set of selected indices for compare chart; undefined for single
    const values = [];

    ds.forEach((d, idx) => {
      // Skip non-selected when a selection exists
      if (sel && sel.size > 0 && !sel.has(idx)) return;

      // If a dataset is effectively hidden (e.g., width 0), skip
      // (We check controller meta visibility too)
      const meta = chart.getDatasetMeta(idx);
      if (!meta || meta.hidden) return;

      (d.data || []).forEach(p => {
        const y = (typeof p === 'number') ? p : p?.y;
        if (typeof y === 'number' && !Number.isNaN(y)) values.push(y);
      });
    });

    if (!values.length) return;

    // Compute padded min/max, snapped to 50-AQI ticks, capped to [0, 300]
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Snap to 50 boundaries
    const snapDown = v => Math.floor(v / 50) * 50;
    const snapUp   = v => Math.ceil(v  / 50) * 50;

    // Lower bound: snap down, but not below 0
    let yMin = Math.max(0, snapDown(min)); // instead of 0
    // Upper bound: snap up, but not above 300
    let yMax = Math.min(300, snapUp(max));

    // Ensure we always have at least one band height (~50) so labels/grids look good
    if (yMax - yMin < 50) {
      yMax = Math.min(300, yMin + 50);
    }

    // Apply to scales without rebuilding the scales object (so zoom plugin can do its job)
    const sy = chart.options.scales?.y;
    if (sy) {
      sy.min = yMin;
      sy.max = yMax;
    }
  }
};

const BandsPlugin = {
  id: 'aqiBands',
  beforeDatasetsDraw(chart){
    const { ctx, chartArea } = chart;
    const st = chart.$state || {};
const show = st.hovering || st.showBands || (st.selectedSet && st.selectedSet.size > 0);
    if (!show) return;
    const {top, bottom, left, right} = chartArea;
    const yScale = chart.scales.y;

    ctx.save();
    bands.forEach((b,i)=>{
      const y1 = yScale.getPixelForValue(i===0 ? 0 : bands[i-1].max);
      const y2 = yScale.getPixelForValue(b.max);
      ctx.fillStyle = b.color + '33';
      ctx.fillRect(left, y2, right-left, y1 - y2);

      ctx.fillStyle = 'rgba(0,0,0,.75)';
      ctx.font = '700 12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        b.label === 'USG' ? 'UNHEALTHY FOR SENSITIVE GROUPS' : b.label,
        left + 8, (y1 + y2) / 2
      );
    });
    ctx.restore();
  }
};

// Keep grid visibility synced with state WITHOUT touching min/max (so zoom sticks)
// Keep grid visibility synced with state WITHOUT touching min/max (so zoom sticks)
const GridSyncPlugin = {
  id: 'gridSync',
  beforeUpdate(chart) {
    const st = chart.$state || {};
    const show = st.hovering || st.showBands || (st.selectedSet && st.selectedSet.size > 0);

    const sx = chart.options.scales.x;
    const sy = chart.options.scales.y;
    if (!sx || !sy) return;

    // only tweak grid styles
    sx.grid.color = show ? 'rgba(51,65,85,.10)' : 'rgba(0,0,0,0)';
    sx.grid.borderColor = '#94a3b8';
    sx.grid.lineWidth = 1; sx.grid.borderWidth = 1; sx.grid.borderDash = [];

    sy.grid.color = show ? 'rgba(51,65,85,.18)' : 'rgba(0,0,0,0)';
    sy.grid.borderColor = '#94a3b8';
    sy.grid.lineWidth = 1; sy.grid.borderWidth = 1;
    sy.grid.borderDash = show ? [3,5] : [];
  }
};

// NEW: End-of-line direct labels with simple collision avoidance
const EndLabelsPlugin = {
  id: 'endLabels',
  afterDatasetsDraw(chart) {
    if (!chart.data?.datasets?.length) return;
    const {ctx, chartArea, scales:{x, y}} = chart;
    const st = chart.$state || {};
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    // Build endpoints (use last defined point in viewport)
    // Build endpoints from the last VISIBLE element (respects zoom)
const endpoints = chart.data.datasets.map((d, idx) => {
  // skip labels for non-selected when something is selected
  if (st.selectedSet && st.selectedSet.size > 0 && !st.selectedSet.has(idx)) return null;


  const meta = chart.getDatasetMeta(idx);
  const els = meta.data || [];
  // filter to points actually in viewport (by pixel)
  const visEls = els.filter(el => !Number.isNaN(el.x) && el.x >= chartArea.left && el.x <= chartArea.right);
  const lastEl = visEls.length ? visEls[visEls.length - 1] : els[els.length - 1];
  if (!lastEl) return null;

  return { idx, name: d.label, x: lastEl.x, y: lastEl.y, color: (typeof d.borderColor === 'function') ? d.borderColor({chart, datasetIndex: idx}) : d.borderColor };
}).filter(Boolean);

// Fan vertically, preserving top→bottom order by where lines end
const top = chartArea.top + 12;
const bottom = chartArea.bottom - 12;
const minGap = 30;    // a touch more spacing
const rightPad = 18;  // more room to keep pills inside

// 1) Sort by y so label order matches where lines finish
endpoints.sort((a,b)=> a.y - b.y);

// 2) Enforce strictly increasing y with minGap
for (let i=1; i<endpoints.length; i++){
  if (endpoints[i].y < endpoints[i-1].y + minGap){
    endpoints[i].y = endpoints[i-1].y + minGap;
  }
}

// 3) Clamp to chart and, if we hit bottom, shift the whole stack up together
const overflowDown = endpoints.length ? (endpoints[endpoints.length-1].y - bottom) : 0;
const overflowUp   = endpoints.length ? (top - endpoints[0].y) : 0;
const shift = overflowDown > 0 ? overflowDown : (overflowUp > 0 ? -overflowUp : 0);
if (shift){
  endpoints.forEach(p => { p.y -= shift; });
  // final clamp
  endpoints.forEach(p => { p.y = Math.max(top, Math.min(bottom, p.y)); });
}

// Draw leader + pill (clamped inside right edge)
endpoints.forEach(p => {
  const pillW = Math.max(96, p.name.length * 7.2 + 14);
  const rx = 10;
  const leftX = Math.min(chartArea.right - rightPad - pillW, p.x + 10);
  const leaderEndX = leftX - 6;
  const ly = p.y;

  // leader
  ctx.strokeStyle = 'rgba(51,65,85,.65)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(p.x, ly); ctx.lineTo(leaderEndX, ly); ctx.stroke();

  // pill
  ctx.fillStyle = 'rgba(17,24,39,.90)';
  ctx.strokeStyle = 'rgba(0,0,0,.15)';
  ctx.lineWidth = 1;
  roundRect(ctx, leftX, ly - 10, pillW, 20, rx); ctx.fill(); ctx.stroke();

  // text
  ctx.fillStyle = '#fff';
  ctx.font = '700 12px system-ui,-apple-system,Segoe UI,Roboto,Arial';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.name, leftX + 8, ly);
});
ctx.restore();
  }
};

function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, h/2, w/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y,   x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x,   y+h, rr);
  ctx.arcTo(x,   y+h, x,   y,   rr);
  ctx.arcTo(x,   y,   x+w, y,   rr);
  ctx.closePath();
}
function fitYToSelection(chart){
  const st = chart.$state || {};
  const sel = st.selectedSet;
  const ds = chart.data?.datasets || [];
  const values = [];

  ds.forEach((d, idx) => {
    if (sel && sel.size > 0 && !sel.has(idx)) return;  // ignore non-selected
    (d.data || []).forEach(p => {
      const y = (typeof p === 'number') ? p : p?.y;
      if (typeof y === 'number' && !Number.isNaN(y)) values.push(y);
    });
  });
  if (!values.length) return;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const snapDown = v => Math.floor(v/50)*50;
  const snapUp   = v => Math.ceil(v/50)*50;

  let yMin = Math.max(0, snapDown(min));
  let yMax = Math.min(300, snapUp(max));
  if (yMax - yMin < 50) yMax = Math.min(300, yMin + 50);

  const sy = chart.options.scales?.y;
  if (sy){ sy.min = yMin; sy.max = yMax; }
}

// HTML legend for compare chart (shows dash + marker shape; unchanged)
const HtmlLegendPlugin = {
  id: 'htmlLegend',
  afterUpdate(chart){
    if (chart.canvas.id !== 'compareChart') return;
    const container = document.getElementById('compareLegend');
    if (!container) return;
    container.innerHTML = '';

    const ds = chart.data.datasets;
    ds.forEach((d, idx)=>{
      const pill = document.createElement('button');
      const st = chart.$state || (chart.$state = {});
const sel = st.selectedSet || (st.selectedSet = new Set());

const isActive = sel.has(idx);
const isMuted  = sel.size > 0 && !isActive;
pill.className = 'legend-pill' + (isActive ? ' active' : '') + (isMuted ? ' muted' : '');
pill.setAttribute('aria-pressed', isActive ? 'true' : 'false');

pill.addEventListener('click', ()=>{
  if (sel.has(idx)) sel.delete(idx); else sel.add(idx);
  // re-enable autoscale and apply it immediately
  chart.$state = { ...(chart.$state||{}), userZoomed:false };
  fitYToSelection(chart);
  chart.update();
});

      // swatch (line dash + marker shape)
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('class','legend-swatch');
      svg.setAttribute('viewBox','0 0 44 16');

      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
path.setAttribute('class','legend-line');
path.setAttribute('d','M5 8 H39');

// Resolve color (dataset borderColor can be a function)
const color = (typeof d.borderColor === 'function')
  ? d.borderColor({ chart, datasetIndex: idx, dataset: d })
  : d.borderColor;
path.setAttribute('stroke', color);


// Resolve dash (dataset borderDash may be array or function)
let dash = [];
if (Array.isArray(d.borderDash)) dash = d.borderDash;
else if (typeof d.borderDash === 'function') {
  dash = d.borderDash({ chart, datasetIndex: idx, dataset: d }) || [];
}
if (dash.length) path.setAttribute('stroke-dasharray', dash.join(' '));

      if (d.borderDash && d.borderDash.length) path.setAttribute('stroke-dasharray', d.borderDash.join(' '));
      svg.appendChild(path);

      const marker = document.createElementNS('http://www.w3.org/2000/svg', d.pointStyle==='circle' ? 'circle' : 'path');
      marker.setAttribute('class','legend-marker');
      if (d.pointStyle==='circle'){
        marker.setAttribute('cx','21'); marker.setAttribute('cy','8'); marker.setAttribute('r','3.6');
      } else {
        const r = 3.6;
        let dPath='';
        if (d.pointStyle==='rect')      dPath = `M ${-r} ${-r} L ${r} ${-r} L ${r} ${r} L ${-r} ${r} Z`;
        if (d.pointStyle==='rectRot')   dPath = `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`;
        if (d.pointStyle==='triangle')  dPath = `M 0 ${-r} L ${r} ${r} L ${-r} ${r} Z`;
        marker.setAttribute('d', dPath);
        marker.setAttribute('transform','translate(21,8)');
      }
      svg.appendChild(marker);

      const text = document.createElement('span');
      text.textContent = d.label;

      pill.appendChild(svg);
      pill.appendChild(text);
      container.appendChild(pill);
    });
    // Add "Reset graph" button to clear selection and un-mute others
const resetBtn = document.createElement('button');
resetBtn.className = 'legend-pill reset';

resetBtn.type = 'button';
resetBtn.textContent = 'Reset graph';
resetBtn.addEventListener('click', ()=>{
  const st = chart.$state || (chart.$state = {});
st.selectedSet?.clear();
st.userZoomed = false;
fitYToSelection(chart);
chart.update();

});
container.appendChild(resetBtn);
  }
};

/* ====== Shared utilities (unchanged) ====== */
function wireHoverToggle(chart){
  chart.$state = { ...(chart.$state || {}), showBands:false, hovering:false };
  const canvas = chart.canvas;
  canvas.addEventListener('mouseenter', ()=>{
    chart.$state.hovering = true;
    if (!chart.$state.isInteracting) chart.update('none');
  });
  canvas.addEventListener('mouseleave', ()=>{
    chart.$state.hovering = false;
    if (!chart.$state.isInteracting) chart.update('none');
  });
  canvas.addEventListener('click', ()=>{
    if (chart.$state.isInteracting) return; // ignore clicks that end a drag
    chart.$state.showBands = !chart.$state.showBands;
    chart.update('none');
  });
}

/* ====== Single monitor (curved + hover points + zoom) ====== */
const singleCfg = {
  type: 'line',
  data: {
    datasets: [{
      parsing: false,
      label: 'Scotten & W Jefferson',
      data: singleSeries,
      borderWidth: 3,
      tension: 0.35,                 // curved
      pointStyle: 'circle',
      pointRadius: ctx => {
        const st = ctx.chart.$state || {};
        return (st.hovering || st.showBands) ? 4 : 0;
      },
      pointHoverRadius: 5,
      segment: { borderColor: ctx => aqiColor(ctx.p1.parsed.y) } // AQI “gradient”
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false, axis: 'x' },
    animation: { duration: 500, easing: 'easeOutCubic' },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true, callbacks: { title: it => `${String(it[0].parsed.x).padStart(2,'0')}:00` } },
      // Zoom: wheel/pinch; hold Shift to drag-zoom; drag pan is enabled always
      zoom: {
  zoom: {
    wheel: { enabled: true, modifierKey: null, speed: 0.1 },
    pinch: { enabled: true },
    drag:  { enabled: true, backgroundColor: 'rgba(148,163,184,0.15)', threshold: 0 },
    mode: 'xy'
  },
  pan: { enabled: true, modifierKey: 'alt', mode: 'xy' },

  // root-level callbacks (correct place)
  onZoomStart({chart})    { (chart.$state ||= {}).isInteracting = true; },
  onZoomComplete({chart}) { (chart.$state ||= {}).isInteracting = false; (chart.$state.userZoomed = true); },
  onPanStart({chart})     { (chart.$state ||= {}).isInteracting = true; },
  onPanComplete({chart})  { (chart.$state ||= {}).isInteracting = false; (chart.$state.userZoomed = true); },

  // sensible limits
  limits: { x: { min: 0, max: 24, minRange: 1 }, y: { min: 0, max: 300, minRange: 10 } }
}
    },
    scales: commonScales(false)
  },
  plugins: [BandsPlugin, GridSyncPlugin, EndLabelsPlugin, YAutoDomainPlugin]
};

/* ====== Compare monitors (fade others on focus + labels + zoom) ====== */
function buildCompareDatasets(){
  return compareSeries.map((s, i) => ({
    parsing: false,
    label: s.name,
    data: s.data,
   borderColor: ctx => {
  const st = ctx.chart.$state || {};
  const sel = st.selectedSet;
  const color = s.color;
  if (!sel || sel.size === 0) return color;                         // no selection → all visible
  return sel.has(ctx.datasetIndex) ? color : toAlpha(color, 0.0);   // hide non-selected
},
    borderWidth: ctx => {
  const st = ctx.chart.$state || {};
  const sel = st.selectedSet;
  if (!sel || sel.size === 0) return 2.2;
  return sel.has(ctx.datasetIndex) ? 3.2 : 0;   // 0 = effectively hidden
},

    borderDash: s.dash,
    spanGaps: true,       // continuous hover line even if a point is missing
pointHitRadius: 10,   // easier to “catch” with the cursor
    pointStyle: s.shape,           // 'circle' | 'rect' | 'triangle' | 'rectRot'
   pointRadius: ctx => {
  const st = ctx.chart.$state || {};
  const sel = st.selectedSet;
  if (sel && sel.size > 0) return sel.has(ctx.datasetIndex) ? 4 : 0;   // only selected series show points
  // No selection: hover or bands => show points on all; otherwise hide
  return (st.hovering || st.showBands) ? 4 : 0;
},
pointHoverRadius: ctx => {
  const st = ctx.chart.$state || {};
  const sel = st.selectedSet;
  if (sel && sel.size > 0) return sel.has(ctx.datasetIndex) ? 5 : 0; // no hover bubble for non-selected
  return (st.hovering || st.showBands) ? 5 : 0;
},
pointHitRadius: ctx => {
  const st = ctx.chart.$state || {};
  const sel = st.selectedSet;
  if (sel && sel.size > 0) return sel.has(ctx.datasetIndex) ? 10 : 0; // don't catch hover on hidden series
  return (st.hovering || st.showBands) ? 10 : 0;
},
    tension: 0.35
  }));
}

// Bands-only reference chart (no datasets), fixed Y = 50..300, X = 0..24
const bandsOnlyCfg = {
  type: 'line',
  data: { datasets: [] }, // no data lines
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
      zoom: { zoom: { wheel:{enabled:false}, pinch:{enabled:false}, drag:{enabled:false} }, pan:{enabled:false} }
    },
    scales: {
      x: {
        type: 'linear', min: 0, max: 24,
        ticks: { callback: v => `${String(v).padStart(2,'0')}:00`, values:[0,4,8,12,16,20,24], color:'#334155' },
        grid: { color: 'rgba(51,65,85,.10)', borderColor:'#94a3b8', lineWidth:1, borderWidth:1 }
      },
      y: {
  type: 'linear',
  min: 0,            // ← include full GOOD band 0–50
  max: 300,
  ticks: {
    color:'#334155',
    stepSize:50,
    callback: v => (v === 0 ? '0' : v)  // keep labels at 50 intervals; show 0 once
  },
  grid: { color: 'rgba(51,65,85,.18)', borderColor:'#94a3b8', lineWidth:1, borderWidth:1, borderDash: [3,5] }
}
    }
  },
  plugins: [BandsPlugin]  // only the bands, no labels plugin needed
};

const bandsOnlyChart = new Chart(document.getElementById('bandsOnlyChart'), bandsOnlyCfg);
// Show bands by default on this one
bandsOnlyChart.$state = { showBands: true };
bandsOnlyChart.update();


const compareCfg = {
  type: 'line',
  data: { datasets: buildCompareDatasets(), parsing: false},
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: false },
    animation: { duration: 500, easing: 'easeOutCubic' },
    plugins: {
      legend: { display: false },   // HTML legend below canvas
      tooltip: {
  enabled: true,
  mode: 'index',
  intersect: false,
  axis: 'x',
  filter: ctx => {
  const st = ctx.chart.$state || {};
  const sel = st.selectedSet;
  return !sel || sel.size === 0 || sel.has(ctx.datasetIndex);
},
  callbacks: {
    title: items => `${String(items[0].parsed.x).padStart(2,'0')}:00`,
    label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}`
  }
},
      zoom: {
zoom: {
  zoom: {
    wheel: { enabled: true, modifierKey: null, speed: 0.1 },
    pinch: { enabled: true },
    drag:  { enabled: true, backgroundColor: 'rgba(148,163,184,0.15)', threshold: 0 },
    mode: 'xy'
  },
  pan: { enabled: true, modifierKey: 'alt', mode: 'xy' },

  // root-level callbacks (correct place)
  onZoomStart({chart})    { (chart.$state ||= {}).isInteracting = true; },
  onZoomComplete({chart}) { (chart.$state ||= {}).isInteracting = false; (chart.$state.userZoomed = true); },
  onPanStart({chart})     { (chart.$state ||= {}).isInteracting = true; },
  onPanComplete({chart})  { (chart.$state ||= {}).isInteracting = false; (chart.$state.userZoomed = true); },

  // sensible limits
  limits: { x: { min: 0, max: 24, minRange: 1 }, y: { min: 0, max: 300, minRange: 10 } }
}
}

    },
    // Fade others strongly when focusing via legend pill
    datasets: {
      line: {
        borderWidth: ctx => {
          const st = ctx.chart.$state || {};
          if (st.selectedDataset == null) return 2.5;
          return (ctx.datasetIndex === st.selectedDataset) ? 3.6 : 2;
        },
        pointBackgroundColor: ctx => {
          const st = ctx.chart.$state || {};
          const isSelected = st.selectedDataset == null || ctx.datasetIndex === st.selectedDataset;
          return isSelected ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.60)'; // softer fill
        },
        pointBorderColor: ctx => {
          const st = ctx.chart.$state || {};
          const isSelected = st.selectedDataset == null || ctx.datasetIndex === st.selectedDataset;
          return isSelected ? 'rgba(17,24,39,0.55)' : 'rgba(17,24,39,0.25)';       // softer outline
        },
        pointBorderWidth: ctx => (
          (ctx.chart.$state && ctx.chart.$state.selectedDataset === ctx.datasetIndex) ? 1.2 : 1
        ),

      }
    },
    scales: commonScales(false)
  },
  plugins: [BandsPlugin, HtmlLegendPlugin, GridSyncPlugin, EndLabelsPlugin, YAutoDomainPlugin]
};

/* small helper to add alpha to hex colors */
function toAlpha(hex, a){
  // accept #rrggbb or already rgba(...)
  if (!hex || hex.startsWith('rgba')) return hex;
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r=parseInt(m[1],16), g=parseInt(m[2],16), b=parseInt(m[3],16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ====== Init & wiring (unchanged except resetZoom guards already in your HTML wiring) ====== */
const singleChart  = new Chart(document.getElementById('singleChart'), singleCfg);
const compareChart = new Chart(document.getElementById('compareChart'), compareCfg);


singleChart.$state  = { showBands:false, hovering:false };
compareChart.$state = { showBands:false, hovering:false, selectedSet: new Set() };

wireHoverToggle(singleChart);
wireHoverToggle(compareChart);

// Toggle bands buttons
document.getElementById('single-toggle').addEventListener('click', (e)=>{
  singleChart.$state.showBands = !singleChart.$state.showBands;
  e.currentTarget.setAttribute('aria-pressed', String(singleChart.$state.showBands));
  singleChart.update();
});
document.getElementById('compare-toggle').addEventListener('click', (e)=>{
  compareChart.$state.showBands = !compareChart.$state.showBands;
  e.currentTarget.setAttribute('aria-pressed', String(compareChart.$state.showBands));
  compareChart.update();
});

// Reset zoom (guarded)
document.getElementById('single-reset').addEventListener('click', ()=>{
  if (singleChart) {
    singleChart.$state = { ...(singleChart.$state||{}), userZoomed:false };
    if (typeof singleChart.resetZoom === 'function') singleChart.resetZoom();
    singleChart.update();
  }
});
document.getElementById('compare-reset').addEventListener('click', ()=>{
  if (compareChart) {
    compareChart.$state = { ...(compareChart.$state||{}), userZoomed:false };
    if (typeof compareChart.resetZoom === 'function') compareChart.resetZoom();
    compareChart.update();
  }
});