#!/usr/bin/env node
/** 记忆星图（2026-11-12 P2）：读 memory.db 生成单文件 canvas HTML；不联网、无依赖。
 * 用法：node scripts/memory-map.mjs [--data-dir ...] [--out path] [--limit 800]
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { openDb } from '../lib/store/db.js'

const args = process.argv.slice(2)
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const dataDir = getArg('--data-dir', process.env.DY_MEMORY_DIR || '/sdcard/DSHA/记忆/数据')
const out = getArg('--out', join(dataDir, 'memory-map.html'))
const limit = Math.max(10, Number(getArg('--limit', 800)) || 800)
const { db } = openDb(dataDir)
const rows = db.prepare("SELECT id,kind,text,importance,created_at_epoch,pinned FROM memories WHERE status='active' ORDER BY created_at_epoch DESC LIMIT ?").all(limit)
const KIND_CN = { episode: '事件', fact: '事实', preference: '偏好', relation: '关系', skill: '技能', todo: '待办', lesson: '教训', reflection: '反思' }
const data = rows.map((r) => ({ id: r.id, k: r.kind, t: String(r.text).slice(0, 500), imp: Number(r.importance) || 0.5, at: Number(r.created_at_epoch) || Date.now(), p: Number(r.pinned) ? 1 : 0 }))
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>记忆星图</title><style>html,body{margin:0;height:100%;background:#03050c;color:#e8f0ff;font-family:system-ui,sans-serif;overflow:hidden}
#c{display:block;width:100%;height:100%;cursor:grab}#hud{position:fixed;left:14px;top:12px;font-size:12px;color:#8fb6ff;opacity:.8}
#panel{position:fixed;right:12px;bottom:12px;max-width:min(420px,80vw);background:#0b1120ee;border:1px solid #26406e;border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.55;display:none;white-space:pre-wrap;word-break:break-word}
#panel b{color:#ffd479}</style><canvas id="c"></canvas><div id="hud">拖动旋转 · 滚轮缩放 · 点星看记忆 · 共 ${data.length} 颗</div><div id="panel"></div>
<script>
const DATA=${JSON.stringify(data)}, KIND_CN=${JSON.stringify(KIND_CN)};
const c=document.getElementById('c'),x=c.getContext('2d'),panel=document.getElementById('panel');
let W=0,H=0,theta=0,phi=.35,dist=13.5,targetDist=13.5,t0=performance.now(),selected=null;
function resize(){const r=c.getBoundingClientRect();W=r.width;H=r.height;c.width=W*devicePixelRatio;c.height=H*devicePixelRatio;x.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}
addEventListener('resize',resize);resize();
const colors={episode:'#6ea8ff',fact:'#ffd479',preference:'#ff9ad5',relation:'#ff7b7b',skill:'#7dffb0',todo:'#c9a7ff',lesson:'#ffe08a',reflection:'#9adfff'};
const stars=DATA.map((m,i)=>{const r=1.2+Math.sqrt(i+1)*.38, a=i*2.399963, z=(Math.random()-.5)*1.4;return {...m,r,a,z,size:1.6+m.imp*3.2,color:colors[m.k]||'#9ec1ff'}});
let drag=null;
c.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,theta,phi};c.setPointerCapture(e.pointerId)});
c.addEventListener('pointermove',e=>{if(!drag)return;theta=drag.theta+(e.clientX-drag.x)*.006;phi=Math.max(-1.2,Math.min(1.2,drag.phi+(e.clientY-drag.y)*.005))});
c.addEventListener('pointerup',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag=null;if(Math.hypot(dx,dy)<5)pick(e.clientX,e.clientY)});
c.addEventListener('wheel',e=>{targetDist=Math.max(4,Math.min(20,targetDist+e.deltaY*.008));e.preventDefault()},{passive:false});
function project(p){const ct=Math.cos(theta),st=Math.sin(theta),cp=Math.cos(phi),sp=Math.sin(phi);
 let X=p.r*Math.cos(p.a),Z=p.r*Math.sin(p.a),Y=p.z;
 let x1=X*ct-Z*st,z1=X*st+Z*ct,y1=Y*cp-z1*sp,z2=Y*sp+z1*cp;
 const d=dist-z2, s=650/Math.max(.4,d);return {x:W/2+x1*s,y:H/2+y1*s,s,z:d}}
function frame(now){const dt=Math.min(.05,(now-t0)/1000);t0=now;dist+=(targetDist-dist)*Math.min(1,dt*8);theta+=dt*.035;
 x.fillStyle='#03050c';x.fillRect(0,0,W,H);
 const g=x.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*.7);g.addColorStop(0,'rgba(40,80,160,.18)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,W,H);
 for(const s of stars){const p=project(s);if(p.x<-20||p.x>W+20||p.y<-20||p.y>H+20)continue;const a=Math.max(.18,Math.min(1,1.2-p.z/8))*(.55+s.imp*.45);x.globalAlpha=a;x.fillStyle=s.color;x.beginPath();x.arc(p.x,p.y,Math.max(.8,s.size*p.s*.65),0,7);x.fill();if(s.p){x.globalAlpha=a*.5;x.beginPath();x.arc(p.x,p.y,s.size*p.s*1.6,0,7);x.fill()}}
 x.globalAlpha=1;requestAnimationFrame(frame)}
function pick(cx,cy){let best=null,bd=16;for(const s of stars){const p=project(s);const d=Math.hypot(p.x-cx,p.y-cy);if(d<bd){bd=d;best=s}}
 if(!best){panel.style.display='none';return}selected=best;panel.style.display='block';panel.innerHTML='<b>'+KIND_CN[best.k]+' · 重要度 '+(best.imp*100).toFixed(0)+'%</b>\\n'+new Date(best.at).toLocaleString()+'\\n\\n'+best.t.replace(/</g,'&lt;')}
requestAnimationFrame(frame);
</script></html>`
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, html, 'utf8')
console.log(JSON.stringify({ ok: true, out, stars: data.length, bytes: html.length }))
