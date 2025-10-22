const { useState, useId } = React;

/* ---------- AQI bands ---------- */
const aqiBands = [
  { label:'GOOD',           max:50,  color:'#10b981' },
  { label:'MODERATE',       max:100, color:'#fbbf24' },
  { label:'USG',            max:150, color:'#f97316' },
  { label:'UNHEALTHY',      max:200, color:'#ef4444' },
  { label:'VERY UNHEALTHY', max:300, color:'#a855f7' },
  { label:'HAZARDOUS',      max:500, color:'#991b1b' },
];

/* ---------- Axes ---------- */
const hours = Array.from({length:25}, (_,i)=> i);  // 0..24
const yTicks50 = [0,50,100,150,200,250,300];
const tickEvery4hVals = [0,4,8,12,16,20,24];

/* ---------- Demo data ---------- */
function mkSeries(seed, peakHour=15, peak=140, noise=6){
  return hours.map(h=>{
    const base = Math.max(8,(Math.sin((h-3)/2)+1)*18+12);
    const bump = Math.max(0, peak*Math.exp(-0.5*Math.pow((h-peakHour)/1.1, 2)));
    const val = Math.min(260, Math.round(base + bump + (Math.sin(h*1.3+seed)*noise)));
    return {h, v:val};
  });
}
const seriesSolo = mkSeries(0.3, 15, 140);
const compareData = [
  {name:'Schaefer & Joy (AG)',   cls:'series-1', data: mkSeries(0.1,  9,  45)},
  {name:'Scotten & W Jefferson', cls:'series-2', data: mkSeries(0.6, 12, 180)},
  {name:'Schoolcraft / Dossin',  cls:'series-3', data: mkSeries(1.2, 18,  70)},
  {name:'A & W Daycare',         cls:'series-4', data: mkSeries(1.8, 20,  55)},
];

/* ---------- Compare encodings (shape + dash) ---------- */
const SERIES_STYLES = [
  { marker:'circle',  dash:''           }, // solid
  { marker:'square',  dash:'12 8'       }, // dash
  { marker:'triangle',dash:'3 9'        }, // dot
  { marker:'diamond', dash:'18 8 3 8'   }, // dot-dash
];

/* ---------- Helpers ---------- */
function crPath(points, sx, sy, t=0.8){
  if(points.length<2) return '';
  const P = points.map(p=>({x:sx(p.h), y:sy(p.v)}));
  let d = `M ${P[0].x} ${P[0].y}`;
  for(let i=0;i<P.length-1;i++){
    const p0=P[i-1]??P[i], p1=P[i], p2=P[i+1], p3=P[i+2]??P[i+1];
    const c1x=p1.x+(p2.x-p0.x)*(t/6), c1y=p1.y+(p2.y-p0.y)*(t/6);
    const c2x=p2.x-(p3.x-p1.x)*(t/6), c2y=p2.y-(p3.y-p1.y)*(t/6);
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
function lineGradientStops(yMax=300){
  const steps = [
    { v:   0, color:'#10b981' },
    { v:  50, color:'#fbbf24' },
    { v: 100, color:'#f97316' },
    { v: 150, color:'#ef4444' },
    { v: 200, color:'#a855f7' },
    { v: 300, color:'#a855f7' },
  ];
  const eps = 0.002, out = [];
  for (let i=0;i<steps.length;i++){
    const {v,color} = steps[i], off = v/yMax;
    if (i>0) out.push({offset: Math.max(0, off-eps), color: steps[i-1].color});
    out.push({offset: off, color});
    if (i<steps.length-1) out.push({offset: Math.min(1, off+eps), color});
  }
  return out.sort((a,b)=>a.offset-b.offset);
}
function markerPath(shape, r=4){
  switch(shape){
    case 'square':   return `M ${-r} ${-r} L ${r} ${-r} L ${r} ${r} L ${-r} ${r} Z`;
    case 'triangle': return `M 0 ${-r} L ${r} ${r} L ${-r} ${r} Z`;
    case 'diamond':  return `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`;
    default: return null; // circle handled separately
  }
}
const fmtHour = h => `${String(h).padStart(2,'0')}:00`;
function getSeriesColor(cls){
  const map={'series-1':'#60a5fa','series-2':'#f59e0b','series-3':'#34d399','series-4':'#e879f9'};
  return map[cls] || '#60a5fa';
}

/* ---------- Label layout (fan + clamp) ---------- */
function layoutLabels(endpoints, {minGap=40, top, bottom, maxRight}){
  const H = 20, G = Math.max(minGap, H);
  const list = endpoints.map(e=>({...e, y:e.y}));
  list.sort((a,b)=>a.y-b.y);
  for(let pass=0; pass<4; pass++){
    for(let i=1;i<list.length;i++){
      const overlap = (list[i-1].y + G) - list[i].y;
      if(overlap > 0) list[i].y += overlap;
    }
    for(let i=list.length-2;i>=0;i--){
      const overlap = (list[i].y + G) - list[i+1].y;
      if(overlap > 0) list[i].y -= overlap;
    }
    list.forEach(l=>{ l.y = Math.max(top + H/2, Math.min(bottom - H/2, l.y)); });
  }
  list.forEach(l => { l.labelX = Math.min(l.x + 10, maxRight); });
  return list;
}

/* ---------- Legend Button with swatch (shape + dash) ---------- */
function LegendButton({ active, onClick, color, text, dash, marker }) {
  const r = 3.6, cx = 21, cy = 8;
  const d = marker && marker !== 'circle' ? markerPath(marker, r) : null;
  return (
    <button
      type="button"
      className={`badge ${active ? 'active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
      title={`Toggle focus: ${text}`}
    >
      <svg className="legend-swatch" viewBox="0 0 44 16" role="img"
           aria-label={`${text} sample: ${dash ? 'patterned' : 'solid'} line with ${marker} markers`}>
        <path className="legend-line" d="M5 8 H39" stroke={color} strokeDasharray={dash || undefined}/>
        {marker === 'circle'
          ? <circle className="legend-marker" cx={cx} cy={cy} r={r}/>
          : <path className="legend-marker" d={d} transform={`translate(${cx},${cy})`}/>}
      </svg>
      <span>{text}</span>
    </button>
  );
}

/* ---------- Chart ---------- */
function LineChart({series, title, mode='single', height=360}){
  const [detail,setDetail]   = useState(false);
  const [hovering,setHover]  = useState(false);
  const [activeLegend, setActiveLegend] = useState(null);
  const chartId = useId();

  const padding = {l:56, r:16, t:12, b:32};
  const w=1100, h=height, innerW=w-padding.l-padding.r, innerH=h-padding.t-padding.b;

  const xMax=24, yMax=300;
  const X = hh => padding.l + innerW * (hh)/(xMax||1);
  const Y = vv => padding.t + innerH * (1 - (vv)/(yMax));

  const multi = Array.isArray(series) ? series : [{name:series.name||'Series',cls:'series-1',data:series.data}];

  const showBands = hovering || detail;               // <— single source of truth
  const svgClass = `${showBands ? 'hovering ' : ''}${detail ? 'detail' : ''}`;

  const onLegendClick = (name) => {
    if(mode !== 'compare') return;
    setActiveLegend(prev => prev === name ? null : name);
  };

  // Points visibility:
  const showAllPoints = hovering || detail;           // hover/click => ALL points
  const shouldShowPoints = (name) => showAllPoints || (mode==='compare' && activeLegend === name);

  // End labels (only selected one when a legend is active)
  let endpoints = multi.map((s)=> {
    const last = s.data[s.data.length-1];
    return { name:s.name, x:X(last.h), y:Y(last.v) };
  });
  if (mode==='compare' && activeLegend) endpoints = endpoints.filter(e => e.name === activeLegend);
  const labels = layoutLabels(endpoints, {
    minGap: 40, top: padding.t, bottom: padding.t + innerH, maxRight: padding.l + innerW - 8
  });

  return (
    <section className="card" role="group" aria-label={title}>
      <div className="title-row">
        <h2 className="title">{title}</h2>
        <div className="legend" role="toolbar" aria-label="Series">
          {multi.map((s,i)=>{
            const style = SERIES_STYLES[i % SERIES_STYLES.length];
            return (
              <LegendButton
                key={s.name}
                active={mode==='compare' ? activeLegend===s.name : false}
                onClick={()=>onLegendClick(s.name)}
                color={getSeriesColor(s.cls)}
                text={s.name}
                dash={style.dash}
                marker={style.marker}
              />
            );
          })}
        </div>
      </div>

      <div className="chart"
           tabIndex={0}
           onKeyDown={(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); setDetail(v=>!v); }}}
           onMouseEnter={()=>setHover(true)}
           onMouseLeave={()=>setHover(false)}
           onClick={()=>setDetail(v=>!v)}>
        <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} className={svgClass}>
          {/* defs: single-monitor gradient */}
          <defs>
            <linearGradient id={`aqiLineGradient-${chartId}`}
              gradientUnits="userSpaceOnUse"
              x1="0" y1={padding.t + innerH} x2="0" y2={padding.t}>
              {lineGradientStops(300).map((st,i)=>(<stop key={`ln-${i}`} offset={st.offset} stopColor={st.color}/>))}
            </linearGradient>
          </defs>

          {/* AQI blocks (now explicitly toggled) */}
          <g className={`band ${showBands ? 'visible' : ''}`}>
            {aqiBands.reduce((acc, band, i)=>{
              const yTop = i===0 ? Y(0) : Y(aqiBands[i-1].max);
              const yBot = Y(band.max);
              acc.push(
                <rect key={`b-${band.max}`}
                      className="band-rect"
                      x={padding.l} y={yTop} width={innerW} height={Math.max(0,yBot-yTop)}
                      fill={band.color} aria-hidden="true" />
              );
              return acc;
            },[])}
            {[{label:'GOOD',v0:0,v1:50},{label:'MODERATE',v0:50,v1:100},{label:'USG',v0:100,v1:150},{label:'UNHEALTHY',v0:150,v1:200},{label:'VERY UNHEALTHY',v0:200,v1:300}]
              .map(b=>{
                const yMid=(Y(b.v0)+Y(b.v1))/2;
                return <text key={b.label} x={padding.l+12} y={yMid} className="band-text">
                  {b.label==='USG'?'UNHEALTHY FOR SENSITIVE GROUPS':b.label}
                </text>;
              })}
          </g>

          {/* Grid (also explicitly toggled) */}
          {yTicks50.map(v=>(
            <line key={`gy${v}`} className={`grid grid-y-50 ${showBands ? 'visible' : ''}`}
                  x1={padding.l} x2={padding.l+innerW} y1={Y(v)} y2={Y(v)} />
          ))}
          {tickEvery4hVals.map(hh=>(
            <line key={`gx${hh}`} className={`grid grid-x ${showBands ? 'visible' : ''}`}
                  y1={padding.t} y2={padding.t+innerH} x1={X(hh)} x2={X(hh)} />
          ))}

          {/* SERIES */}
          {multi.map((s, idx)=>{
            const style = SERIES_STYLES[idx % SERIES_STYLES.length];
            const d = crPath(s.data, X, Y, 0.8);

            const focused = mode==='compare' ? (activeLegend ? activeLegend===s.name : true) : true;
            const clsExtra = mode==='compare' && activeLegend ? (focused ? 'emph' : 'faded') : '';

            // Build class; animate only when not dashed or in single mode
            const baseClass = `series ${clsExtra}` + ((mode==='single' || !style.dash) ? ' draw' : '');
            const strokeProps = (mode==='single')
              ? { stroke:`url(#aqiLineGradient-${chartId})` }
              : { dash:style.dash };

            return (
              <g key={s.name}>
                <path
                  d={d}
                  className={`${baseClass} ${mode==='compare'? s.cls : ''}`}
                  strokeDasharray={mode==='compare' ? strokeProps.dash : undefined}
                  strokeLinecap="round"
                  {...( (mode==='single') ? { pathLength:"1", stroke: strokeProps.stroke } : {})}
                />

                {/* POINTS:
                   - Hover/detail: all series show
                   - Otherwise: only selected legend */}
                {s.data.map((pt,i)=>{
                  const cx=X(pt.h), cy=Y(pt.v), r=4.2;
                  const showPt = (hovering || detail) || (mode==='compare' && activeLegend === s.name);
                  const title = `${fmtHour(pt.h)} — ${s.name} AQI ${pt.v}`;
                  const shape = style.marker;
                  const common = {
                    className:`point ${clsExtra} ${showPt?'show':''}`,
                    style:{opacity: showPt ? 1 : 0},
                  };
                  return shape==='circle'
                    ? <circle key={`p-${s.name}-${i}`} {...common}
                              cx={cx} cy={cy} r={r}
                              fill="#fff" stroke="#111827" strokeWidth="1.4"><title>{title}</title></circle>
                    : <path key={`p-${s.name}-${i}`} {...common}
                            d={markerPath(shape,r)} transform={`translate(${cx},${cy})`}
                            fill="#fff" stroke="#111827" strokeWidth="1.4"><title>{title}</title></path>;
                })}
              </g>
            );
          })}

          {/* End labels (fan, clamp; only selected remains when focused) */}
          {labels.map((L,i)=>{
            const labelW = Math.max(84, L.name.length*7.2) + 10;
            const rightEdge = padding.l + innerW - 4;
            const leftX = Math.min(rightEdge - labelW, L.labelX);
            const leaderX = leftX - 6;
            const faded = (mode==='compare' && activeLegend && activeLegend !== L.name) ? 'faded' : '';
            return (
              <g key={`lab-${i}`} aria-hidden="true">
                <line x1={L.x} y1={L.y} x2={leaderX} y2={L.y} className={`label-link ${faded}`}/>
                <g className={`label-pill ${faded}`} transform={`translate(${leftX},${L.y})`}>
                  <rect x="0" y="-10" width={labelW} height="20"
                        rx="10" fill="rgba(17,24,39,.9)" stroke="rgba(255,255,255,.25)" strokeWidth="1"/>
                  <text x="10" y="4" fill="#fff" fontWeight="700" fontSize="12">{L.name}</text>
                </g>
              </g>
            );
          })}

          {/* Axes labels */}
          {yTicks50.map(v=>(
            <text key={`yt${v}`} x={padding.l-12} y={Y(v)+4} textAnchor="end" className="axis-label">{v}</text>
          ))}
          {tickEvery4hVals.map(hh=>(
            <text key={`xt${hh}`} x={X(hh)} y={padding.t+innerH+20} textAnchor="middle" className="axis-label">
              {`${String(hh).padStart(2,'0')}:00`}
            </text>
          ))}
        </svg>
      </div>
    </section>
  );
}

/* ---------- App ---------- */
function App(){
  return (
    <div style={{display:'grid',gap:24}}>
      <LineChart
        title=""
        series={{name:'Scotten & W Jefferson', data:mkSeries(0.3, 15, 140)}}
        mode="single"
      />
      <LineChart
        title="Compare Monitors"
        series={compareData}
        mode="compare"
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);