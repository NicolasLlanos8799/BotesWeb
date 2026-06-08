import{i as $}from"./chunks/chunk-57UAQDRW.js";document.addEventListener("DOMContentLoaded",()=>{let t=window.location.pathname;t.endsWith("/admin/bookings")||t.includes("/admin/bookings.html")?I():t.endsWith("/admin/stats")||t.includes("/admin/stats.html")?C():t.endsWith("/admin/manifest")||t.includes("/admin/manifest.html")?D():(t==="/admin"||t==="/admin/"||t.includes("/admin/index.html"))&&M()});async function b(){try{let t=await fetch("/api/admin/get-bookings");if(!t.ok)throw new Error("Failed to fetch bookings");return(await t.json()).bookings.map(n=>{let d="2026-01-01";if(n.booking_date){let c=new Date(n.booking_date),h=c.getFullYear(),f=String(c.getMonth()+1).padStart(2,"0"),a=String(c.getDate()).padStart(2,"0");d=`${h}-${f}-${a}`}let l=n.booking_time||"00:00:00";return{id:n.id,start:`${d}T${l}`,date:d,time:l,tourName:n.tour_name,customerName:n.customer_name,customerEmail:n.customer_email,customerPhone:n.customer_phone,passengers:parseInt(n.passengers)||0,status:n.payment_status,price:parseFloat(n.total_price)||0,calendar:n.tour_id||"N/A",lang:n.lang||"english"}})}catch(t){return console.error("Error fetching bookings:",t),[]}}async function I(){let t=document.getElementById("bookings-tbody"),m=document.getElementById("bookings-pagination"),n=document.getElementById("booking-search"),d=document.getElementById("booking-filter-status"),l=document.getElementById("filter-date-from"),c=document.getElementById("filter-date-to"),h=document.getElementById("refresh-bookings"),f=[],a=[],i=1,y=5,r=g=>{if(!m)return;let u=Math.ceil(g/y);if(u<=1){m.innerHTML="";return}m.innerHTML=`
      <button class="btn btn--outline btn--sm" ${i===1?"disabled":""} id="prev-page">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
        Prev
      </button>
      <span style="font-size: 0.9rem; font-weight: 600; opacity: 0.8;">Page ${i} of ${u}</span>
      <button class="btn btn--outline btn--sm" ${i===u?"disabled":""} id="next-page">
        Next
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    `,document.getElementById("prev-page")?.addEventListener("click",()=>{i--,e(a)}),document.getElementById("next-page")?.addEventListener("click",()=>{i++,e(a)})},e=g=>{if(!t)return;let u=(i-1)*y,k=u+y,s=g.slice(u,k);if(g.length===0){t.innerHTML='<tr><td colspan="7" style="text-align: center; padding: 3rem; color: rgba(255,255,255,0.4);">No bookings found for this period.</td></tr>',r(0);return}t.innerHTML=s.map(o=>{let v=new Date(o.start),E=v.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}),x=v.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});return`
        <tr>
          <td>
            <div style="font-weight: 700; color: #fff;">${E}</div>
            <div style="font-size: 0.8rem; opacity: 0.6;">${x}</div>
          </td>
          <td>
            <div style="font-weight: 600;">${o.customerName}</div>
            <div style="font-size: 0.8rem; opacity: 0.5;">${o.customerEmail}</div>
          </td>
          <td style="font-size: 0.85rem;">${o.customerPhone||"\u2014"}</td>
          <td>${o.tourName}</td>
          <td>${o.passengers} pax</td>
          <td><span style="text-transform: capitalize;">${o.calendar}</span></td>
          <td>
            <span class="badge-status status-${o.status.toLowerCase()}">${o.status}</span>
          </td>
        </tr>
      `}).join(""),r(g.length)},p=()=>{let g=n.value.toLowerCase(),u=d.value.toLowerCase(),k=l?.value,s=c?.value;a=f.filter(o=>{let v=o.customerName.toLowerCase().includes(g)||o.customerEmail.toLowerCase().includes(g)||o.tourName.toLowerCase().includes(g),E=u==="all"||o.status.toLowerCase()===u,x=(!k||o.date>=k)&&(!s||o.date<=s);return v&&E&&x}),i=1,e(a)},w=async()=>{t.innerHTML='<tr><td colspan="7" style="text-align: center; padding: 4rem;"><div class="po-spinner" style="margin: 0 auto 1rem;"></div>Loading bookings...</td></tr>',f=await b(),f.sort((g,u)=>new Date(u.start)-new Date(g.start)),a=[...f],e(a)};n?.addEventListener("input",p),d?.addEventListener("change",p),l?.addEventListener("change",p),c?.addEventListener("change",p),h?.addEventListener("click",w),w()}async function M(){let t={revenueMonth:document.getElementById("stat-revenue-month"),growth:document.getElementById("stat-growth-container"),pax:document.getElementById("stat-passengers"),upcoming:document.getElementById("upcoming-tbody")},m=await b(),n=m.filter(r=>r.status==="PAID"),d=new Date,l=d.getMonth(),c=d.getFullYear(),h=n.filter(r=>{let e=new Date(r.start);return e.getMonth()===l&&e.getFullYear()===c}),f=n.filter(r=>{let e=new Date(r.start),p=l===0?11:l-1,w=l===0?c-1:c;return e.getMonth()===p&&e.getFullYear()===w}),a=h.reduce((r,e)=>r+e.price,0),i=f.reduce((r,e)=>r+e.price,0);if(t.revenueMonth&&(t.revenueMonth.textContent=$(a)),t.growth){let r=0;i>0?r=(a-i)/i*100:a>0&&(r=100);let e=r>=0;t.growth.className=`stat-card__trend ${e?"trend-up":"trend-down"}`,t.growth.innerHTML=`
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="${e?"23 6 13.5 15.5 8.5 10.5 1 18":"23 18 13.5 8.5 8.5 13.5 1 6"}"></polyline><polyline points="${e?"17 6 23 6 23 12":"17 18 23 18 23 12"}"></polyline></svg>
      <span>${Math.abs(Math.round(r))}% vs last month</span>
    `}let y=n.reduce((r,e)=>r+e.passengers,0);if(t.pax&&(t.pax.textContent=y),t.upcoming){let r=m.filter(e=>new Date(e.start)>=d).sort((e,p)=>new Date(e.start)-new Date(p.start)).slice(0,5);r.length===0?t.upcoming.innerHTML='<tr><td colspan="4" style="text-align: center; padding: 2rem; opacity: 0.5;">No upcoming bookings found.</td></tr>':t.upcoming.innerHTML=r.map(e=>`
          <tr>
            <td>${new Date(e.start).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})} @ ${e.time.substring(0,5)}</td>
            <td>${e.customerName}</td>
            <td>${e.tourName}</td>
            <td>${e.calendar}</td>
          </tr>
        `).join("")}}var B={};async function C(){let t=document.getElementById("apply-filters"),m=document.getElementById("filter-date-from"),n=document.getElementById("filter-date-to"),d=await b(),l=()=>{let c=m?.value,h=n?.value,a=d.filter(s=>(!c||s.date>=c)&&(!h||s.date<=h)).filter(s=>s.status==="PAID"),i=a.reduce((s,o)=>s+o.price,0),y=a.reduce((s,o)=>s+o.passengers,0),r=a.length>0?i/a.length:0;document.getElementById("stat-revenue").textContent=$(i),document.getElementById("stat-bookings").textContent=a.length,document.getElementById("stat-avg").textContent=$(r),document.getElementById("stat-passengers").textContent=y;let e=Array(24).fill(0);a.forEach(s=>{let o=parseInt(s.time.split(":")[0]);e[o]++}),L("chart-hours",Array.from({length:24},(s,o)=>`${o}:00`),e,"Bookings by Hour");let p=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],w=Array(7).fill(0);a.forEach(s=>{let o=new Date(s.start).getDay();w[o]+=s.price}),L("chart-weekdays",p,w,"Revenue by Day (\u20AC)","#4ade80");let g={};a.forEach(s=>{g[s.lang]=(g[s.lang]||0)+1}),_("chart-languages",Object.keys(g),Object.values(g));let u={};a.forEach(s=>{u[s.tourName]=(u[s.tourName]||0)+1});let k=document.getElementById("tour-distribution");if(k){let s=Object.entries(u).sort((o,v)=>v[1]-o[1]);k.innerHTML=s.map(([o,v])=>{let E=a.length>0?Math.round(v/a.length*100):0;return`<div style="margin-bottom: 0.5rem;">
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.2rem;">
            <span>${o}</span><span>${v} (${E}%)</span>
          </div>
          <div style="height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden;">
            <div style="height: 100%; background: var(--admin-accent); width: ${E}%;"></div>
          </div>
        </div>`}).join("")}};t?.addEventListener("click",l),l()}async function D(){let t=document.getElementById("manifest-container"),m=document.getElementById("manifest-date"),n=new Date,d=n.getFullYear(),l=String(n.getMonth()+1).padStart(2,"0"),c=String(n.getDate()).padStart(2,"0"),h=`${d}-${l}-${c}`;m&&(m.textContent=n.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}));let a=(await b()).filter(i=>i.date===h).sort((i,y)=>i.time.localeCompare(y.time));t&&(a.length===0?t.innerHTML='<div style="text-align: center; padding: 4rem; opacity: 0.5;">No bookings scheduled for today. Enjoy the calm! \u2693</div>':t.innerHTML=a.map(i=>`
      <div class="manifest-item">
        <div class="manifest-item__info">
          <div class="manifest-item__time">${i.time.substring(0,5)}</div>
          <div class="manifest-item__name">${i.customerName}</div>
          <div class="manifest-item__meta">${i.tourName} \u2022 ${i.lang.toUpperCase()}</div>
        </div>
        <div class="manifest-item__pax">
          <span class="manifest-item__pax-num">${i.passengers}</span>
          <span class="manifest-item__pax-label">Pax</span>
        </div>
      </div>
    `).join(""))}function L(t,m,n,d,l="#e8834a"){let c=document.getElementById(t);c&&(B[t]&&B[t].destroy(),B[t]=new Chart(c,{type:"bar",data:{labels:m,datasets:[{label:d,data:n,backgroundColor:l,borderRadius:4}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{y:{beginAtZero:!0,grid:{color:"rgba(255,255,255,0.05)"},ticks:{color:"rgba(255,255,255,0.5)"}},x:{grid:{display:!1},ticks:{color:"rgba(255,255,255,0.5)"}}}}}))}function _(t,m,n){let d=document.getElementById(t);d&&(B[t]&&B[t].destroy(),B[t]=new Chart(d,{type:"doughnut",data:{labels:m,datasets:[{data:n,backgroundColor:["#e8834a","#4ade80","#60a5fa","#f472b6","#fbbf24"],borderWidth:0}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{position:"right",labels:{color:"rgba(255,255,255,0.7)",font:{size:10}}}}}}))}
