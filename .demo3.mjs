import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const NAME="Diary Test Salon", EMAIL="diary-test@second-pair.test", PASSWORD="diary-"+Math.random().toString(36).slice(2,10);
const { data: old } = await db.from("studios").select("id").eq("name", NAME).maybeSingle();
if (old) { const { data:p } = await db.from("artists").select("id").eq("studio_id", old.id); for (const a of p??[]) await db.from("bookings").delete().eq("artist_id", a.id); await db.from("contacts").delete().eq("studio_id", old.id); await db.from("artists").delete().eq("studio_id", old.id); await db.from("studio_members").delete().eq("studio_id", old.id); await db.from("studios").delete().eq("id", old.id); }
const { data: st, error } = await db.from("studios").insert({ name:NAME, slug:"diary-test-salon", vertical:"hair", timezone:"Europe/London", deposit_mode:"none",
  hours:[{day:0,open:"10:00",close:"16:00",closed:true},...[1,2,3,4,5].map(d=>({day:d,open:"09:00",close:"18:00",closed:false})),{day:6,open:"09:00",close:"16:00",closed:false}] }).select("id").single();
if (error) throw new Error(error.message);
const made=[]; for (const [n,c] of [["Sarah","#e0507a"],["Mo","#2f8fd6"],["Priya","#5aa84f"]]) { const { data } = await db.from("artists").insert({ studio_id:st.id, name:n, active:true, booking_provider:"native", hourly_rate_pence:4500, min_charge_pence:2500, colour:c }).select("id").single(); made.push(data); }
const names=["Jo Marsh","Ellie Bright","Tom Hale","Nadia Khan","Ruth Patel","Dan Okafor","Beth Crow","Sam Idris"];
const cs=[]; for (const n of names) { const { data } = await db.from("contacts").insert({ studio_id:st.id, name:n, phone:"077009001"+cs.length }).select("id").single(); cs.push(data); }
const now=new Date(); const mon=new Date(now); mon.setDate(now.getDate()-((now.getDay()+6)%7)); mon.setHours(0,0,0,0);
const at=(d,h,m=0)=>{const x=new Date(mon); x.setDate(mon.getDate()+d); x.setHours(h,m,0,0); return x;};
const week=[[0,9,30,60,0,"Cut and finish"],[0,11,0,90,1,"Half head foils"],[1,9,0,120,0,"Full head colour"],[1,11,30,45,2,"Blow dry"],[1,15,0,60,1,"Cut and finish"],
  [2,9,0,60,0,"Cut and finish"],[2,10,30,180,1,"Full head bleach"],[2,14,0,90,0,"Half head foils"],[2,16,0,60,2,"Restyle"],
  [3,9,0,90,0,"Balayage"],[3,12,0,45,2,"Blow dry"],[3,13,30,120,0,"Full head colour"],[3,16,0,60,1,"Cut and finish"],
  [4,9,30,60,1,"Cut and finish"],[4,11,0,150,0,"Full head foils"],[4,14,30,60,1,"Restyle"],[4,16,0,45,2,"Blow dry"],
  [5,10,0,60,0,"Cut and finish"],[5,13,0,60,2,"Cut and finish"]];
let i=0; for (const [d,h,m,mins,who,title] of week) { const s0=at(d,h,m);
  await db.from("bookings").insert({ artist_id:made[who].id, contact_id:cs[i%cs.length].id, starts_at:s0.toISOString(), ends_at:new Date(s0.getTime()+mins*60000).toISOString(), type:"session", title, source:"manual", price_pence:3500+(i%5)*1500, deposit_amount_pence:0, blocks_availability:true }); i++; }
const { data:u, error:ue } = await db.auth.admin.createUser({ email:EMAIL, password:PASSWORD, email_confirm:true });
let uid=u?.user?.id; if (!uid) { const { data:l } = await db.auth.admin.listUsers(); uid=l.users.find(x=>x.email===EMAIL)?.id; if (uid) await db.auth.admin.updateUserById(uid,{password:PASSWORD}); }
await db.from("studio_members").upsert({ studio_id:st.id, user_id:uid, role:"owner" });
console.log("EMAIL", EMAIL); console.log("PASSWORD", PASSWORD); console.log("bookings", week.length);
