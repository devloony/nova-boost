require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEBAPP_URL || (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : "");
const port = Number(process.env.PORT || 3000);
const ADMIN_ID = "7859115911";
const CONTACT = "@tacxsa";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const REVIEWS_FILE = path.join(DATA_DIR, "reviews.json");
const PROMOS_FILE = path.join(DATA_DIR, "promos.json");

if (!token) { console.error("BOT_TOKEN is not set."); process.exit(1); }
fs.mkdirSync(DATA_DIR,{recursive:true});
function load(file,fallback=[]){try{return JSON.parse(fs.readFileSync(file,"utf8"))}catch{return fallback}}
function save(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2));}
let orders=load(ORDERS_FILE,[]), reviews=load(REVIEWS_FILE,[]), promos=load(PROMOS_FILE,[]);
const app=express(); app.use(express.json({limit:"1mb"})); app.use(express.static("public"));
app.get("/health",(req,res)=>res.json({ok:true}));

const PRICES={
  allies:{with:[[30,60,25],[35,70,30],[45,90,40],[55,110,50],[160,320,150]],without:[[45,90,40],[50,100,45],[65,130,60],[80,160,75],[220,440,215]]},
  mm:{with:[[45,90,40],[55,110,50],[65,130,60],[80,160,75],[200,400,190]],without:[[60,120,55],[75,150,70],[90,180,80],[120,240,115],[300,600,295]]}
};
const RANKS=["Phoenix","Ranger","Champion","Master","Elite","The Legend"];
const VALID_STATUSES=["Ожидает оплаты","Оплачен","В работе","Завершён","Отменён"];
function getPrice(mode,access,from,to){const a=RANKS.indexOf(from),b=RANKS.indexOf(to);if(a<0||b<=a)return null;const steps=PRICES[mode]?.[access]?.slice(a,b);if(!steps||steps.length!==b-a)return null;return steps.reduce((sum,p)=>[sum[0]+p[0],sum[1]+p[1],sum[2]+p[2]],[0,0,0])}
function getDiscountedPrices(promo,p){if(!promo)return p;const discount=Math.max(0,Math.min(100,Number(promo.discount)||0));return p.map(v=>Math.max(0,Math.round(v*(100-discount)/100)))}
function findPromo(code){const normalized=String(code||"").trim().toUpperCase();if(!normalized)return null;return promos.find(p=>p.active!==false&&String(p.code).toUpperCase()===normalized)||null}
function makeOrder(body, telegramUser){
 const base=getPrice(body.mode,body.access,body.fromRank,body.toRank); if(!base)throw Error("Недоступный переход между званиями");
 const promo=findPromo(body.promoCode); const p=getDiscountedPrices(promo,base);
 const id=`NB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
 const order={id,createdAt:new Date().toISOString(),user:telegramUser,mode:body.mode,access:body.access,fromRank:body.fromRank,toRank:body.toRank,payment:body.payment,promoCode:promo?.code||null,discountPercent:promo?.discount||0,basePrices:{rub:base[0],gold:base[1],stars:base[2]},prices:{rub:p[0],gold:p[1],stars:p[2]},status:'Ожидает оплаты',booster:null,contact:CONTACT};
 orders.unshift(order);save(ORDERS_FILE,orders);return order;
}
async function tgApi(method,body){const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!d.ok)throw Error(d.description||"Telegram API error");return d.result}
function validateInitData(initData){
 if(!initData || typeof initData !== "string" || initData.length > 10000) return null;
 const params = new URLSearchParams(initData);
 const hash = params.get("hash");
 if(!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;

 const pairs = [];
 for(const [k,v] of params.entries()){
   if(k !== "hash") pairs.push(`${k}=${v}`);
 }
 pairs.sort();
 const dataCheckString = pairs.join("\n");

 // Telegram Web Apps validation: secret_key = HMAC-SHA256("WebAppData", bot_token)
 const secret = crypto
   .createHmac("sha256", "WebAppData")
   .update(token)
   .digest();

 const check = crypto
   .createHmac("sha256", secret)
   .update(dataCheckString)
   .digest("hex");

 if(check.length !== hash.length || !crypto.timingSafeEqual(
   Buffer.from(check, "hex"),
   Buffer.from(hash, "hex")
 )) return null;

 const authDate = Number(params.get("auth_date") || 0);
 if(!authDate || Date.now()/1000 - authDate > 86400) return null;

 try { return JSON.parse(params.get("user") || "null"); }
 catch { return null; }
}
function userFromReq(req){return validateInitData(req.headers["x-telegram-init-data"]||req.body?.initData||"")}
function isAdmin(req){const u=userFromReq(req);return u&&String(u.id)===ADMIN_ID}
function userOrderFor(req){const u=userFromReq(req);if(!u)return null;return {user:u,orders:orders.filter(o=>String(o.user?.id)===String(u.id))}}
async function notifyUser(userId,text){if(!userId)return;try{await tgApi("sendMessage",{chat_id:userId,text})}catch(e){console.error("User notify error:",e.message)}}
function orderLabel(o){return `${o.mode==='allies'?'Allies':'MM'} · ${o.fromRank} → ${o.toRank}`}

app.post("/api/order",async(req,res)=>{
 try{
  const telegramUser = userFromReq(req);
  if(!telegramUser){
   return res.status(401).json({ok:false,error:"Откройте Mini App из Telegram и попробуйте снова."});
  }
  const order=makeOrder(req.body, telegramUser);let invoiceLink=null;
  if(order.payment==='stars'){
   invoiceLink=await tgApi("createInvoiceLink",{title:`Nova Boost ${order.fromRank} → ${order.toRank}`,description:`${order.mode==='allies'?'Allies':'MM'}, ${order.access==='with'?'со входом':'без входа'}. Заказ ${order.id}`,payload:JSON.stringify({orderId:order.id}),currency:"XTR",prices:[{label:"Буст звания",amount:order.prices.stars}],provider_token:""});
   order.invoiceLink=invoiceLink;save(ORDERS_FILE,orders);
  }
  try{await tgApi("sendMessage",{chat_id:ADMIN_ID,text:`🆕 НОВЫЙ ЗАКАЗ ${order.id}\n\nРежим: ${order.mode==='allies'?'Allies':'MM'}\nЗвания: ${order.fromRank} → ${order.toRank}\nДоступ: ${order.access==='with'?'Со входом':'Без входа'}\nОплата: ${order.payment}\nЦена: ${order.prices.rub} ₽ / ${order.prices.gold} Gold / ${order.prices.stars} Stars${order.promoCode?`\nПромокод: ${order.promoCode} (-${order.discountPercent}%)`:''}\nПользователь: ${order.user?.username?`@${order.user.username}`:(order.user?.first_name||'не указан')}\n\nСтатус: ${order.status}`})}catch(e){console.error('Admin notify error',e.message)}
  res.json({ok:true,orderId:order.id,invoiceLink,prices:order.prices,promoCode:order.promoCode,discountPercent:order.discountPercent});
 }catch(e){res.status(400).json({ok:false,error:e.message})}
});

app.get("/api/promo/check",(req,res)=>{const p=findPromo(req.query.code);if(!p)return res.status(404).json({ok:false,error:"Промокод не найден или отключён"});res.json({ok:true,code:p.code,discount:p.discount})});
app.get("/api/reviews",(req,res)=>res.json({ok:true,reviews:reviews.filter(x=>x.approved!==false&&x.orderId&&x.userId).slice(0,50)}));
app.get("/api/review-eligibility",(req,res)=>{const u=userFromReq(req);if(!u)return res.status(401).json({ok:false,eligible:false,error:"Откройте Mini App из Telegram"});const completed=orders.find(o=>String(o.user?.id)===String(u.id)&&o.status==="Завершён"&&!reviews.some(r=>String(r.userId)===String(u.id)&&String(r.orderId)===String(o.id)));if(!completed)return res.json({ok:true,eligible:false,error:"Оставить отзыв можно только после завершения вашего заказа."});res.json({ok:true,eligible:true,orderId:completed.id})});
app.get("/api/my-orders",(req,res)=>{const data=userOrderFor(req);if(!data)return res.status(401).json({ok:false,error:"Откройте Mini App из Telegram"});res.json({ok:true,orders:data.orders.slice(0,30)});});
app.post("/api/reviews",(req,res)=>{
 const user=userFromReq(req);if(!user)return res.status(401).json({ok:false,error:"Оставлять отзыв можно только из Telegram Mini App"});
 const text=String(req.body.text||"").trim().slice(0,300),stars=Math.max(1,Math.min(5,Number(req.body.stars)||5));
 if(!text)return res.status(400).json({ok:false,error:"Напишите отзыв"});
 const completed=orders.find(o=>String(o.user?.id)===String(user.id)&&o.status==="Завершён");
 if(!completed)return res.status(403).json({ok:false,error:"Оставить отзыв можно после завершения вашего заказа."});
 const already=reviews.find(r=>String(r.userId)===String(user.id)&&String(r.orderId)===String(completed.id));
 if(already)return res.status(400).json({ok:false,error:"Вы уже оставили отзыв по этому заказу."});
 const name=String(req.body.name||user.first_name||user.username||"Клиент").trim().slice(0,40);
 const review={id:Date.now(),orderId:completed.id,userId:String(user.id),name,text,stars,createdAt:new Date().toISOString(),approved:true};
 reviews.unshift(review);save(REVIEWS_FILE,reviews);
 try{tgApi("sendMessage",{chat_id:ADMIN_ID,text:`⭐ НОВЫЙ ОТЗЫВ\n\n${name}: ${stars}/5\n${text}\n\nЗаказ: ${completed.id}`})}catch{}
 res.json({ok:true,message:"Отзыв опубликован"});
});

app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("/api/admin/check",(req,res)=>res.json({ok:true,admin:isAdmin(req)}));
app.get("/api/admin/stats",(req,res)=>{if(!isAdmin(req))return res.status(403).json({ok:false,error:"Доступ запрещён"});const completed=orders.filter(o=>o.status==="Завершён").length,active=orders.filter(o=>["Ожидает оплаты","Оплачен","В работе"].includes(o.status)).length,revenueRub=orders.filter(o=>o.status!=="Отменён"&&o.status!=="Ожидает оплаты").reduce((s,o)=>s+(o.prices?.rub||0),0);res.json({ok:true,stats:{total:orders.length,active,completed,revenueRub,reviews:reviews.length,promos:promos.filter(p=>p.active!==false).length}})});
app.get("/api/admin/orders",(req,res)=>{if(!isAdmin(req))return res.status(403).json({ok:false,error:"Доступ запрещён"});res.json({ok:true,orders})});
app.post("/api/admin/order-status",async(req,res)=>{if(!isAdmin(req))return res.status(403).json({ok:false,error:"Доступ запрещён"});const o=orders.find(x=>x.id===req.body.id);if(!o)return res.status(404).json({ok:false,error:"Заказ не найден"});const old=o.status,newStatus=String(req.body.status||"В работе").slice(0,50);if(!VALID_STATUSES.includes(newStatus))return res.status(400).json({ok:false,error:"Недопустимый статус"});o.status=newStatus;save(ORDERS_FILE,orders);if(old!==newStatus){await notifyUser(o.user?.id,`📦 Nova Boost\nЗаказ ${o.id}\n${orderLabel(o)}\n\nСтатус: ${newStatus}${o.booster?`\nБустер: ${o.booster}`:''}${newStatus==='Завершён'?`\n\nСпасибо! Теперь вы можете оставить отзыв в разделе «Отзывы».`:''}`);try{await tgApi("sendMessage",{chat_id:ADMIN_ID,text:`🔔 СТАТУС ЗАКАЗА ИЗМЕНЁН\n${o.id}\n${old} → ${newStatus}\n${orderLabel(o)}`})}catch{}}res.json({ok:true,order:o})});
app.post("/api/admin/order-booster",async(req,res)=>{if(!isAdmin(req))return res.status(403).json({ok:false,error:"Доступ запрещён"});const o=orders.find(x=>x.id===req.body.id);if(!o)return res.status(404).json({ok:false,error:"Заказ не найден"});o.booster=String(req.body.booster||"").trim().slice(0,80)||null;save(ORDERS_FILE,orders);await notifyUser(o.user?.id,`👤 Бустер назначен\nЗаказ ${o.id}\nБустер: ${o.booster||'не назначен'}`);res.json({ok:true,order:o})});
app.get("/api/admin/reviews",(req,res)=>{if(!isAdmin(req))return res.status(403).json({ok:false,error:"Доступ запрещён"});res.json({ok:true,reviews})});
app.post("/api/admin/review",(req,res)=>{if(!isAdmin(req))return res.status(403).json({ok:false,error:"Доступ запрещён"});const r=reviews.find(x=>String(x.id)===String(req.body.id));if(!r)return res.status(404).json({ok:false,error:"Отзыв не найден"});r.approved=Boolean(req.body.approved);save(REVIEWS_FILE,reviews);res.json({ok:true})});
app.get("/api/admin/promos",(req,res)=>{if(!isAdmin(req))return res.status(403).json({ok:false,error:"Доступ запрещён"});res.json({ok:true,promos})});
app.post("/api/admin/promo",(req,res)=>{if(!isAdmin(req))return res.status(403).json({ok:false,error:"Доступ запрещён"});const code=String(req.body.code||"").trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,24);const discount=Math.max(1,Math.min(100,Number(req.body.discount)||0));if(!code||!discount)return res.status(400).json({ok:false,error:"Введите код и скидку"});if(promos.some(p=>p.code===code))return res.status(400).json({ok:false,error:"Такой промокод уже существует"});promos.unshift({code,discount,active:true,createdAt:new Date().toISOString()});save(PROMOS_FILE,promos);res.json({ok:true})});
app.post("/api/admin/promo-toggle",(req,res)=>{if(!isAdmin(req))return res.status(403).json({ok:false,error:"Доступ запрещён"});const p=promos.find(x=>x.code===String(req.body.code));if(!p)return res.status(404).json({ok:false,error:"Промокод не найден"});p.active=!p.active;save(PROMOS_FILE,promos);res.json({ok:true,promo:p})});

app.listen(port,"0.0.0.0",()=>console.log(`Mini App server started on port ${port}`));
const bot=new TelegramBot(token,{polling:true});
bot.onText(/\/admin(?:@\w+)?$/, async msg => {
  if (String(msg.from?.id) !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, "Доступ запрещён.");
  }
  if (!webAppUrl) {
    return bot.sendMessage(msg.chat.id, "WEBAPP_URL не настроен.");
  }
  await bot.sendMessage(msg.chat.id, "🛠 Админ-панель Nova Boost", {
    reply_markup: {
      inline_keyboard: [[
        { text: "Открыть админ-панель", web_app: { url: `${webAppUrl.replace(/\/$/, "")}/admin` } }
      ]]
    }
  });
});
bot.onText(/\/start/,async msg=>{const text=`🚀 Nova Boost — сервис буста в Standoff 2\n\nПомогаем быстро достичь желаемого ранга. Надёжное выполнение, опытные бустеры и удобное оформление заказа.\n\n👇 Выбери нужную услугу в Mini App и оформи заказ за пару минут.`;const options=webAppUrl?{reply_markup:{keyboard:[[{text:"🛒 Открыть Nova Boost",web_app:{url:webAppUrl}}]],resize_keyboard:true,is_persistent:true}}:{};await bot.sendMessage(msg.chat.id,text,options)});
bot.on("pre_checkout_query",async q=>{try{const payload=JSON.parse(q.invoice_payload);const o=orders.find(x=>x.id===payload.orderId);if(!o||o.payment!=="stars"||o.status!=="Ожидает оплаты")return bot.answerPreCheckoutQuery(q.id,false,{error_message:"Заказ не найден или уже недействителен."});await bot.answerPreCheckoutQuery(q.id,true)}catch(e){console.error(e);try{await bot.answerPreCheckoutQuery(q.id,false,{error_message:"Не удалось проверить заказ."})}catch{}}});
bot.on("successful_payment",async msg=>{const sp=msg.successful_payment;let payload={};try{payload=JSON.parse(sp.invoice_payload)}catch{};const o=orders.find(x=>x.id===payload.orderId);if(o){o.status="Оплачен";o.telegramPaymentChargeId=sp.telegram_payment_charge_id;o.paidAt=new Date().toISOString();save(ORDERS_FILE,orders);try{await bot.sendMessage(ADMIN_ID,`💳 ОПЛАТА ПОЛУЧЕНА\nЗаказ: ${o.id}\n${o.fromRank} → ${o.toRank}\nСумма: ${sp.total_amount} Stars\nПользователь: ${msg.from?.username?`@${msg.from.username}`:msg.from?.first_name||msg.from?.id}`)}catch(e){console.error(e.message)}}});
bot.onText(/\/paysupport/,msg=>bot.sendMessage(msg.chat.id,`По вопросам оплаты: ${CONTACT}`));
bot.onText(/\/terms/,msg=>bot.sendMessage(msg.chat.id,"Условия заказа и оплаты: выберите режим, звание и вариант доступа в Mini App. После оформления заказа свяжитесь с @tacxsa для дальнейших действий."));
bot.on("polling_error",e=>console.error("Telegram polling error:",e.message));
