import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const NAME="Solo Test", EMAIL="solo-test@second-pair.test", PASSWORD="solo-"+Math.random().toString(36).slice(2,10);
const { data: old } = await db.from("studios").select("id").eq("name",NAME).maybeSingle();
if (old) { const {data:p}=await db.from("artists").select("id").eq("studio_id",old.id); for(const a of p??[]) await db.from("bookings").delete().eq("artist_id",a.id);
  await db.from("contacts").delete().eq("studio_id",old.id); await db.from("artists").delete().eq("studio_id",old.id); await db.from("studio_members").delete().eq("studio_id",old.id); await db.from("studios").delete().eq("id",old.id); }
const { data: st, error } = await db.from("studios").insert({ name:NAME, slug:"solo-test", vertical:"tattoo", timezone:"Europe/London", deposit_mode:"none",
  hours:[{day:0,open:"10:00",close:"16:00",closed:true},...[1,2,3,4,5].map(d=>({day:d,open:"09:00",close:"18:00",closed:false})),{day:6,open:"10:00",close:"16:00",closed:false}] }).select("id").single();
if (error) throw new Error(error.message);
const { data: a } = await db.from("artists").insert({ studio_id:st.id, name:"Dave", active:true, booking_provider:"native", hourly_rate_pence:8000, min_charge_pence:5000 }).select("id").single();
const now=new Date(); const mon=new Date(now); mon.setDate(now.getDate()-((now.getDay()+6)%7)); mon.setHours(0,0,0,0);
const at=(d,h,m=0)=>{const x=new Date(mon); x.setDate(mon.getDate()+d); x.setHours(h,m,0,0); return x;};
const names=["Jo Marsh","Ellie Bright","Tom Hale","Nadia Khan","Ruth Patel"];
const cs=[]; for (const n of names) { const {data}=await db.from("contacts").insert({studio_id:st.id,name:n,phone:"077009002"+cs.length}).select("id").single(); cs.push(data); }
const week=[[0,10,0,180],[1,9,30,120],[2,11,0,240],[3,10,0,150],[4,9,30,180],[4,14,0,120],[5,11,0,90]];
let i=0; for (const [d,h,m,mins] of week) { const s0=at(d,h,m);
  await db.from("bookings").insert({ artist_id:a.id, contact_id:cs[i%cs.length].id, starts_at:s0.toISOString(), ends_at:new Date(s0.getTime()+mins*60000).toISOString(), type:"session", title:"Forearm piece", source:"manual", price_pence:12000+(i%4)*4000, deposit_amount_pence:0, blocks_availability:true }); i++; }
const { data:u } = await db.auth.admin.createUser({ email:EMAIL, password:PASSWORD, email_confirm:true });
let uid=u?.user?.id; if(!uid){const {data:l}=await db.auth.admin.listUsers(); uid=l.users.find(x=>x.email===EMAIL)?.id; if(uid) await db.auth.admin.updateUserById(uid,{password:PASSWORD});}
await db.from("studio_members").upsert({ studio_id:st.id, user_id:uid, role:"owner" });
console.log("EMAIL",EMAIL); console.log("PASSWORD",PASSWORD);
