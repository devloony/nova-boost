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

if (!token) { console.error("BOT_TOKEN is not set."); process.exit(1); }
fs.mkdirSync(DATA_DIR,{recursive:true});
function load(file,fallback=[]){try{return JSON.parse(fs.readFileSync(file,"utf8"))}catch{return fallback}}
function save(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2));}
let orders=load(ORDERS_FILE,[]), reviews=load(REVIEWS_FILE,[]);
const app=express(); app.use(express.json({limit:"1mb"})); app.use(express.static("public"));
app.get("/health",(req,res)=>res.json({ok:true}));

const PRICES={
  allies:{with:[[30,60,25],[35,70,30],[45,90,40],[55,110,50],[160,320,150]],without:[[45,90,40],[50,100,45],[65,130,60],[80,160,75],[220,440,215]]},
  mm:{with:[[45,90,40],[55,110,50],[65,130,60],[80,160,75],[200,400,190]],without:[[60,120,55],[75,150,70],[90,180,80],[120,240,115],[300,600,295]]}
};
const RANKS=["Phoenix","Ranger","Champion","Master","Elite","The Legend"];
function getPrice(mode,access,from,to){const a=RANKS.indexOf(from),b=RANKS.indexOf(to);if(a<0||b!==a+1)return null;return PRICES[mode]?.[access]?.[a]||null}
function makeOrder(body){
 const p=getPrice(body.mode,body.access,body.fromRank,body.toRank); if(!p)throw Error("Недоступный переход между званиями");
 const id=`NB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
 const order={id,createdAt:new Date().toISOString(),user:body.user||{},mode:body.mode,access:body.access,fromRank:body.fromRank,toRank:body.toRank,payment:body.payment,prices:{rub:p[0],gold:p[1],stars:p[2]},status:body.payment==='stars'?'Ожидает оплату':'Ожидает оплаты',contact:CONTACT};
 orders.unshift(order);save(ORDERS_FILE,orders);return order;
}
async function tgApi(method,body){const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!d.ok)throw Error(d.description||"Telegram API error");return d.result}
function validateInitData(initData){
 if(!initData)return null; const params=new URLSearchParams(initData), hash=params.get("hash"); if(!hash)return null;
 const pairs=[]; for(const [k,v] of params.entries())if(k!=="hash")pairs.push(`${k}=${v}`); pairs.sort();
 const secret=crypto.createHmac("sha256",token).update("WebAppData").digest();
 const check=crypto.createHmac("sha256",secret).update(pairs.join("\n")).digest("hex");
 if(!crypto.timingSafeEqual(Buffer.from(check),Buffer.from(hash)))return null;
 const authDate=Number(params.get("auth_date")||0); if(!authDate||Date.now()/1000-authDate>86400)return null;
 try{return JSON.parse(params.get("user")||"null")}catch{return null}
}
function userFromReq(req){return validateInitData(req.headers["x-telegram-init-data"]||req.body?.initData||"")}
function isAdmin(req){const u=userFromReq(req);return u&&String(u.id)===ADMIN_ID}

app.post("/api/order",async(req,res)=>{
 try{
  const order=makeOrder(req.body);
  let invoiceLink=null;
  if(order.payment==='stars'){
    invoiceLink=await tgApi("createInvoiceLink",{title:`Nova Boost ${order.fromRank} → ${order.toRank}`,description:`${order.mode==='allies'?'Allies':'MM'}, ${order.access==='with'?'со входом':'без входа'}. Заказ ${order.id}`,payload:JSON.stringify({orderId:order.id}),currency:"XTR",prices:[{label:"Буст звания",amount:order.prices.stars}],provider_token:""});
    order.invoiceLink=invoiceLink;save(ORDERS_FILE,orders);
  }
  try{await tgApi("sendMessage",{chat_id:ADMIN_ID,text:`🆕 НОВЫЙ ЗАКАЗ ${order.id}\n\nРежим: ${order.mode==='allies'?'Allies':'MM'}\nЗвания: ${order.fromRank} → ${order.toRank}\nДоступ: ${order.access==='with'?'Со входом':'Без входа'}\nОплата: ${order.payment}\nЦена: ${order.prices.rub} ₽ / ${order.prices.gold} Gold / ${order.prices.stars} Stars\nПользователь: ${order.user?.username?`@${order.user.username}`:(order.user?.first_name||'не указан')}\n\nСтатус: ${order.status}`})}catch(e){console.error('Admin notify error',e.message)}
  res.json({ok:true,orderId:order.id,invoiceLink});
 }catch(e){res.status(400).json({ok:false,error:e.message})}
});

app.get("/api/reviews",(req,res)=>res.json({ok:true,reviews:reviews.filter(x=>x.approved).slice(0,30)}));
app.post("/api/reviews",(req,res)=>{const name=String(req.body.name||"").trim().slice(0,40),text=String(req.body.text||"").trim().slice(0,300),stars=Math.max(1,Math.min(5,Number(req.body.stars)||5));if(!name||!text)return res.status(400).json({ok:false,error:"Заполните имя и отзыв"});reviews.unshift({id:Date.now(),name,text,stars,createdAt:new Date().toISOString(),approved:false});save(REVIEWS_FILE,reviews);res.json({ok:true,message:"Отзыв отправлен на модерацию"})});

app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("/api/admin/check",(req,res)=>res.json({ok:true,admin:isAdmin(req)}));
app.get("/api/admin/orders",(req,res)=>{if(!isAdmin(req))return res.status(403).json({ok:false,error:"Доступ запрещён"});res.json({ok:true,orders})});
app.post("/api/admin/order-status",(req,res)=>{if(!isAdmin(req))return res.status(403).json({ok:false,error:"Доступ запрещён"});const o=orders.find(x=>x.id===req.body.id);if(!o)return res.status(404).json({ok:false,error:"Заказ не найден"});o.status=String(req.body.status||"В работе").slice(0,50);save(ORDERS_FILE,orders);res.json({ok:true,order:o})});
app.get("/api/admin/reviews",(req,res)=>{if(!isAdmin(req))return res.status(403).json({ok:false,error:"Доступ запрещён"});res.json({ok:true,reviews})});
app.post("/api/admin/review",(req,res)=>{if(!isAdmin(req))return res.status(403).json({ok:false,error:"Доступ запрещён"});const r=reviews.find(x=>String(x.id)===String(req.body.id));if(!r)return res.status(404).json({ok:false,error:"Отзыв не найден"});r.approved=Boolean(req.body.approved);save(REVIEWS_FILE,reviews);res.json({ok:true})});

app.listen(port,"0.0.0.0",()=>console.log(`Mini App server started on port ${port}`));
const bot=new TelegramBot(token,{polling:true});
bot.onText(/\/start/,async msg=>{const text=`🚀 Nova Boost — сервис буста в Standoff 2\n\nПомогаем быстро достичь желаемого ранга. Надёжное выполнение, опытные бустеры и удобное оформление заказа.\n\n👇 Выбери нужную услугу в Mini App и оформи заказ за пару минут.`;const options=webAppUrl?{reply_markup:{keyboard:[[{text:"🛒 Открыть Nova Boost",web_app:{url:webAppUrl}}]],resize_keyboard:true,is_persistent:true}}:{};await bot.sendMessage(msg.chat.id,text,options)});
bot.on("pre_checkout_query",async q=>{try{const payload=JSON.parse(q.invoice_payload);const o=orders.find(x=>x.id===payload.orderId);if(!o||o.payment!=="stars")return bot.answerPreCheckoutQuery(q.id,false,{error_message:"Заказ не найден или уже недействителен."});await bot.answerPreCheckoutQuery(q.id,true)}catch(e){console.error(e);try{await bot.answerPreCheckoutQuery(q.id,false,{error_message:"Не удалось проверить заказ."})}catch{}}});
bot.on("successful_payment",async msg=>{const sp=msg.successful_payment;let payload={};try{payload=JSON.parse(sp.invoice_payload)}catch{};const o=orders.find(x=>x.id===payload.orderId);if(o){o.status="Оплачен";o.telegramPaymentChargeId=sp.telegram_payment_charge_id;o.paidAt=new Date().toISOString();save(ORDERS_FILE,orders);try{await bot.sendMessage(ADMIN_ID,`💳 ОПЛАТА ПОЛУЧЕНА\nЗаказ: ${o.id}\n${o.fromRank} → ${o.toRank}\nСумма: ${sp.total_amount} Stars\nПользователь: ${msg.from?.username?`@${msg.from.username}`:msg.from?.first_name||msg.from?.id}`)}catch(e){console.error(e.message)}}});
bot.onText(/\/paysupport/,msg=>bot.sendMessage(msg.chat.id,`По вопросам оплаты: ${CONTACT}`));
bot.onText(/\/terms/,msg=>bot.sendMessage(msg.chat.id,"Условия заказа и оплаты: выберите режим, звание и вариант доступа в Mini App. После оформления заказа свяжитесь с @tacxsa для дальнейших действий."));
bot.on("polling_error",e=>console.error("Telegram polling error:",e.message));
