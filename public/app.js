const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const CONTACT_URL = "https://t.me/tacxsa";
const ranks = [
  { name: "Phoenix", image: "ranks/rank1.png?v=4" },
  { name: "Ranger", image: "ranks/rank2.png?v=4" },
  { name: "Champion", image: "ranks/rank3.png?v=4" },
  { name: "Master", image: "ranks/rank4.png?v=4" },
  { name: "Elite", image: "ranks/rank5.png?v=4" },
  { name: "The Legend", image: "ranks/rank6.png?v=4" }
];

const prices = {
  allies: {
    with:    [[30,60,25],[35,70,30],[45,90,40],[55,110,50],[160,320,150]],
    without: [[45,90,40],[50,100,45],[65,130,60],[80,160,75],[220,440,215]]
  },
  mm: {
    with:    [[45,90,40],[55,110,50],[65,130,60],[80,160,75],[200,400,190]],
    without: [[60,120,55],[75,150,70],[90,180,80],[120,240,115],[300,600,295]]
  }
};

let mode = "allies", access = "with", payment = "rub", fromRank = null, toRank = null, reviewStars = 5, promoCode = "", promoDiscount = 0;
const $ = id => document.getElementById(id);
const fromSelect=$('fromSelect'), toSelect=$('toSelect'), fromOptions=$('fromOptions'), toOptions=$('toOptions');
const promoInput=$('promoCode'), promoBtn=$('promoBtn'), promoMessage=$('promoMessage');
const fromSelectedText=$('fromSelectedText'), toSelectedText=$('toSelectedText'), selection=$('selection'), priceLines=$('priceLines'), orderBtn=$('orderBtn'), message=$('message');

function haptic(type="selectionChanged"){ if(!tg?.HapticFeedback)return; if(type==='success'||type==='error')tg.HapticFeedback.notificationOccurred(type); else tg.HapticFeedback.impactOccurred('light'); }
function rankByName(n){return ranks.find(r=>r.name===n)}
function priceFor(){ if(fromRank===null||toRank===null)return null; const a=ranks.findIndex(r=>r.name===fromRank), b=ranks.findIndex(r=>r.name===toRank); if(a<0||b<=a)return null; return prices[mode][access].slice(a,b).reduce((sum,p)=>[sum[0]+p[0],sum[1]+p[1],sum[2]+p[2]],[0,0,0]); }
function renderOptions(container,type){
  container.innerHTML='';
  ranks.forEach((rank,index)=>{
    const button=document.createElement('button'); button.type='button'; button.className='rank-option';
    const selected=type==='from'?fromRank===rank.name:toRank===rank.name; if(selected)button.classList.add('selected');
    const fromIndex=fromRank?ranks.findIndex(r=>r.name===fromRank):-1;
    if(type==='to' && fromIndex>=0 && index<=fromIndex){button.classList.add('disabled');button.disabled=true;}
    button.innerHTML=`<img src="${rank.image}" alt="${rank.name}"><span>${rank.name}</span>`;
    button.addEventListener('click',()=>{
      if(type==='from'){fromRank=rank.name; const i=ranks.findIndex(r=>r.name===fromRank); toRank=ranks[i+1]?.name||null;}
      else toRank=rank.name;
      closeAll(); update(); haptic();
    });
    container.appendChild(button);
  });
}
function updateSelected(selectText,type){
  const name=type==='from'?fromRank:toRank, rank=name?rankByName(name):null, image=selectText.parentElement.querySelector('.selected-rank-image');
  if(rank){selectText.textContent=rank.name;image.className='selected-rank-image';image.style.backgroundImage=`url("${rank.image}")`;image.style.backgroundSize='contain';image.style.backgroundPosition='center';image.style.backgroundRepeat='no-repeat';image.style.opacity='1';}
  else{selectText.textContent='Выберите звание';image.className='selected-rank-image empty-image';image.style.backgroundImage='none';}
}
function update(){
  updateSelected(fromSelectedText,'from'); updateSelected(toSelectedText,'to'); renderOptions(fromOptions,'from'); renderOptions(toOptions,'to');
  const base=priceFor();
  if(base){const p=promoDiscount?base.map(v=>Math.max(0,Math.round(v*(100-promoDiscount)/100))):base;selection.textContent=`${mode==='allies'?'Allies':'MM'} · ${fromRank} → ${toRank}`;priceLines.innerHTML=`<span>${p[0]} ₽</span><span>${p[1]} Gold</span><span>${p[2]} Stars</span>${promoDiscount?`<small class="old-price">−${promoDiscount}%</small>`:''}`;orderBtn.disabled=false;}
  else{selection.textContent='Выберите звание';priceLines.innerHTML='<span>— ₽</span><span>— Gold</span><span>— Stars</span>';orderBtn.disabled=true;}
}
function closeAll(){[fromSelect,toSelect].forEach(s=>{s.classList.remove('open');s.setAttribute('aria-expanded','false')});[fromOptions,toOptions].forEach(o=>o.classList.remove('open'));}
function toggle(s,o){const open=o.classList.contains('open');closeAll();if(!open){o.classList.add('open');s.classList.add('open');s.setAttribute('aria-expanded','true');haptic();}}
fromSelect.addEventListener('click',()=>toggle(fromSelect,fromOptions)); toSelect.addEventListener('click',()=>toggle(toSelect,toOptions));
[fromSelect,toSelect].forEach(s=>s.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle(s,s===fromSelect?fromOptions:toOptions)}}));
document.addEventListener('click',e=>{if(!e.target.closest('.rank-card'))closeAll()});

document.querySelectorAll('.mode-btn').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;document.querySelectorAll('.mode-btn').forEach(x=>x.classList.toggle('active',x===b));update();haptic()}));
document.querySelectorAll('.access-btn').forEach(b=>b.addEventListener('click',()=>{access=b.dataset.access;document.querySelectorAll('.access-btn').forEach(x=>x.classList.toggle('active',x===b));update();haptic()}));
document.querySelectorAll('.payment-btn').forEach(b=>b.addEventListener('click',()=>{payment=b.dataset.payment;document.querySelectorAll('.payment-btn').forEach(x=>x.classList.toggle('active',x===b));haptic()}));

promoBtn?.addEventListener('click',async()=>{
  const code=promoInput.value.trim();
  if(!code){promoCode="";promoDiscount=0;promoMessage.textContent="Введите промокод.";promoMessage.className="promo-message error";return;}
  promoBtn.disabled=true;
  try{const r=await fetch('/api/promo/check?code='+encodeURIComponent(code));const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Промокод не найден');promoCode=d.code;promoDiscount=d.discount;promoInput.value=d.code;promoMessage.textContent=`Промокод применён: −${d.discount}%`;promoMessage.className='promo-message success';haptic('success');update();}
  catch(e){promoCode="";promoDiscount=0;promoMessage.textContent=e.message;promoMessage.className='promo-message error';update();}
  finally{promoBtn.disabled=false;}
});

async function createOrder(){
  const p=priceFor(); if(!p)return;
  const user=tg?.initDataUnsafe?.user||{};
  orderBtn.disabled=true; orderBtn.querySelector('b').textContent='СОЗДАНИЕ ЗАКАЗА...'; message.style.display='none';
  try{
    const response=await fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':tg?.initData||''},body:JSON.stringify({fromRank,toRank,mode,access,payment,promoCode,user:{id:user.id,username:user.username,first_name:user.first_name},initData:tg?.initData||''})});
    const data=await response.json();
    if(!response.ok||!data.ok)throw new Error(data.error||'Ошибка создания заказа');
    if(payment==='stars' && data.invoiceLink){
      if(tg?.openInvoice){
        tg.openInvoice(data.invoiceLink,(status)=>{
          if(status==='paid'){showMessage(`Оплата заказа #${data.orderId} прошла. Сейчас откроется @tacxsa.`);haptic('success');setTimeout(()=>window.open(CONTACT_URL,'_blank'),500);}
          else if(status==='cancelled'){showMessage('Оплата отменена. Заказ сохранён — вы можете повторить оплату.');}
          else if(status==='failed'){showMessage('Не удалось провести оплату Stars. Попробуйте ещё раз.');haptic('error');}
        });
      } else {window.open(data.invoiceLink,'_blank');}
    } else {
      showMessage(`Заказ #${data.orderId} создан. Для оплаты ${payment==='rub'?'рублями':'Gold'} напишите @tacxsa — откроем контакт.`);setTimeout(()=>window.open(CONTACT_URL,'_blank'),700);haptic('success');
    }
  }catch(e){showMessage(e.message||'Не удалось создать заказ.');haptic('error');}
  finally{orderBtn.disabled=false;orderBtn.querySelector('b').textContent='ОФОРМИТЬ БУСТ';update();}
}
function showMessage(t){message.textContent=t;message.style.display='block'}
orderBtn.addEventListener('click',createOrder);

document.querySelectorAll('.nav-item').forEach(item=>item.addEventListener('click',()=>{const target=item.dataset.page;document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===target));document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n===item));if(target==='reviews'){loadReviews();checkReviewEligibility();}window.scrollTo({top:0,behavior:'smooth'});}));

function setReviewStars(n){reviewStars=n;document.querySelectorAll('#reviewStars button').forEach(b=>b.classList.toggle('active',Number(b.dataset.star)<=n));}
setReviewStars(5);document.querySelectorAll('#reviewStars button').forEach(b=>b.addEventListener('click',()=>setReviewStars(Number(b.dataset.star))));
async function loadReviews(){try{const r=await fetch('/api/reviews');const d=await r.json();const list=$('reviewsList');if(!d.reviews.length){list.innerHTML='<div class="empty-card"><div class="empty-icon">★</div><h3>Пока нет отзывов</h3><p>Отзывы появятся после завершённых заказов.</p></div>';return}list.innerHTML=d.reviews.map(x=>`<div class="review-card"><div class="review-head"><span class="review-name">${escapeHtml(x.name)}</span><span class="review-stars">${'★'.repeat(x.stars)}${'☆'.repeat(5-x.stars)}</span></div><div class="review-text">${escapeHtml(x.text)}</div><div class="review-meta">Заказ ${escapeHtml(x.orderId||'')}</div></div>`).join('')}catch{}}
async function checkReviewEligibility(){const gate=$('reviewGate'),form=$('reviewForm');if(!gate||!form)return;try{const r=await fetch('/api/review-eligibility',{headers:{'X-Telegram-Init-Data':tg?.initData||''}});const d=await r.json();if(d.ok&&d.eligible){gate.textContent=`Можно оставить отзыв по завершённому заказу ${d.orderId}.`;gate.className='review-gate success';form.style.display='block';}else{gate.textContent=d.error||'Оставить отзыв можно только после завершения заказа.';gate.className='review-gate';form.style.display='none';}}catch{gate.textContent='Откройте Mini App из Telegram, чтобы оставить отзыв.';form.style.display='none';}}
$('reviewBtn').addEventListener('click',async()=>{const name=$('reviewName').value.trim(),text=$('reviewText').value.trim();if(!text)return showMessage('Напишите отзыв.');try{const r=await fetch('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':tg?.initData||''},body:JSON.stringify({name,text,stars:reviewStars,initData:tg?.initData||''})});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Ошибка');$('reviewName').value='';$('reviewText').value='';showMessage('Спасибо! Отзыв опубликован.');loadReviews();checkReviewEligibility()}catch(e){showMessage(e.message||'Не удалось отправить отзыв.')}});

function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
update();loadReviews();
