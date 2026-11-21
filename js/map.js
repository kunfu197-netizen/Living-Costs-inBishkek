function htmlEscape(value){
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[character]));
}

let publicApiCsrf = '';

async function loadAdminListings(){
  try{
    const response=await fetch('api.php',{headers:{Accept:'application/json'}});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const result=await response.json();
    if(!Array.isArray(result.listings)) throw new Error('API маалыматынын түзүлүшү туура эмес');
    publicApiCsrf=typeof result.csrf==='string'?result.csrf:'';
    const typeForKind={shop:'market',hotel:'hotel',market:'bazar'};
    result.listings.forEach(listing=>{
      const type=typeForKind[listing.kind];
      if(!type||typeof listing.name!=='string') return;
      const defaults={market:{emoji:'🏬',avg:0,delivery:'Жок',parking:'Жок',hours:'',items:''},hotel:{emoji:'🏨',min:0,max:0,rooms:0,pool:'Жок',wifi:'Жок',breakfast:'Жок'},bazar:{emoji:'🏪',veg:'Жок',meat:'Жок',clothes:'Жок',hours:'',specialty:''}};
      const details=listing.details&&typeof listing.details==='object'?listing.details:{};
      const item={
        ...defaults[type],
        ...details,
        id:Number(listing.id),
        name:listing.name,
        cat:listing.category||'',
        district:listing.district||listing.address||'',
        hours:details.hours||listing.opening_hours||'',
        photo:listing.photo||'',
        summary:listing.summary||'',
        tag:details.tag||listing.category||'Жаңы',
        stars:Number(details.stars)||0,
        bg:'#eef2ff',
        products:Array.isArray(listing.products)?listing.products:[],
        reviews:Array.isArray(listing.reviews)?listing.reviews:[]
      };
      cardsData[type]=cardsData[type].filter(existing=>
        existing.name.trim().toLocaleLowerCase()!==item.name.trim().toLocaleLowerCase()
      );
      cardsData[type].push(item);
    });
    ['market','hotel','bazar'].forEach(type=>{
      updateCountBadge(type);
      if(currentPage===type) renderCards(type);
    });
  }catch(error){
    console.error('Сервердеги админ маалыматтарын жүктөө мүмкүн болгон жок.',error);
    showToast('⚠ Сервердеги маалыматтар жүктөлгөн жок. Сервер/API жөндөөлөрүн текшериңиз.');
  }
}

// ─── PAGE NAVIGATION with ANIMATION ────────────────────────
let currentPage = 'flat';

function goPage(page, btn){
  if(page === currentPage) return;

  document.querySelectorAll('.htab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');

  const mapArea = document.getElementById('mapArea');
  const panel   = document.getElementById('panel');

  // Animate out current page
  const leavingPage = document.querySelector('.page.active');
  if(leavingPage){
    leavingPage.classList.add('leaving');
    setTimeout(()=>{leavingPage.classList.remove('active','leaving');},220);
  }

  if(page==='flat'){
    setTimeout(()=>{
      mapArea.style.display='';
      panel.style.display='';
      mapArea.classList.add('fade-in');
      setTimeout(()=>mapArea.classList.remove('fade-in'),500);
      if(leafletMap) setTimeout(()=>leafletMap.invalidateSize(),100);
    }, leavingPage ? 200 : 0);
  } else {
    setTimeout(()=>{
      mapArea.style.display='none';
      panel.style.display='none';
      const pg = document.getElementById('page-'+page);
      if(pg){
        pg.classList.add('active');
        renderCards(page);
        updateCountBadge(page);
      }
    }, leavingPage ? 200 : 0);
  }

  currentPage = page;
}

function updateCountBadge(type){
  const badge = document.getElementById(type+'-count');
  if(!badge) return;
  const n = cardsData[type]?.length || 0;
  const labels = {market:'дүкөн', hotel:'мейманкана', bazar:'базар'};
  badge.textContent = n + ' ' + (labels[type]||'');
}

// ─── CARDS DATA ─────────────────────────────
const cardsData = {
  market:[
    {name:'Народный',      photo:'https://dostek.kg/api/?action=Files.get&link=20170322163248',  cat:'Супермаркет', district:'Биринчи май району', emoji:'🏬', avg:800,  tag:'Супермаркет', stars:4.2, hours:'08:00–22:00', items:'Азык-түлүк, козметика, үй буюмдары', delivery:'Бар', parking:'Жок', bg:'#e3f2fd'},
    {name:'Бета Сторес',   photo:'https://elitka.kg/uploads/builder/1756373802629-273272843.jpg',  cat:'Супермаркет', district:'Ленин району ',    emoji:'🛍', avg:1500, tag:'Супермаркет', stars:4.4, hours:'09:00–22:00', items:'Импорт азыктар, шарап, деликатестер', delivery:'Бар', parking:'Бар', bg:'#f3e5f5'},
    {name:'Globus',        photo:'https://upload.wikimedia.org/wikipedia/commons/b/bb/Globus_logo.png',  cat:'Гипермаркет', district:' Октябрь району',  emoji:'🏪', avg:1200, tag:'Гипермаркет', stars:4.5, hours:'08:00–23:00', items:'Тамак, электроника, кийим, спорт', delivery:'Бар', parking:'Бар', bg:'#e8f5e9'},
    {name:'Carrefour',     photo:'https://s3-symbol-logo.tradingview.com/carrefour--600.png',  cat:'Гипермаркет', district:'Тунгуч району',       emoji:'🛒', avg:1000, tag:'Гипермаркет', stars:4.1, hours:'09:00–22:00', items:'Европалык стандарт азыктар', delivery:'Жок', parking:'Бар', bg:'#fff3e0'},
    {name:'Green Market',  photo:'https://img.freepik.com/premium-vector/eco-green-market-natural-supermarket-logo-design_600323-2504.jpg',  cat:'Эко маркет',  district:'Асанбай району',      emoji:'🌿', avg:900,  tag:'Супермаркет', stars:4.3, hours:'08:00–21:00', items:'Органикалык, жергиликтүү азыктар', delivery:'Бар', parking:'Жок', bg:'#e8f5e9'},
    {name:'Фрунзе Маркет', photo:'https://24.kg/files/media/11/11272.jpg',  cat:'Маркет',      district:'Свердлов району', emoji:'🏬', avg:600,  tag:'Арзан',       stars:3.9, hours:'07:00–21:00', items:'Азык-түлүк, турмуш буюмдары', delivery:'Жок', parking:'Жок', bg:'#fce4ec'},
    {name:'Атлас Маркет',  photo:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRcjONW3OaoFds-AUdXgkYaoycUq-8Q2Rgu7A&s',  cat:'Маркет',      district:'Кант р-н',     emoji:'🏪', avg:500,  tag:'Арзан',       stars:3.8, hours:'08:00–20:00', items:'Жергиликтүү азыктар, нан', delivery:'Жок', parking:'Жок', bg:'#fff8e1'},
    {name:'SmartShop',     photo:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT9heOWjwucieF_QFhkLWXHvp_TNj9tiKZGGg&s',  cat:'Супермаркет', district:'Жал',          emoji:'🛍', avg:750,  tag:'24/7',        stars:4.0, hours:'24/7',         items:'Азык-түлүк, ичимдиктер', delivery:'Бар', parking:'Жок', bg:'#e3f2fd'},
    {name:'Дордой Маркет', photo:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSq2HFoq4Nik8Zm-Gf2MjRVT6RUrkhuioucxg&s',  cat:'Маркет',      district:'Дордой',       emoji:'🏬', avg:550,  tag:'Арзан',       stars:3.7, hours:'07:00–19:00', items:'Арзан азык-түлүк, консерва', delivery:'Жок', parking:'Бар', bg:'#f1f8e9'},
    {name:'Азия',    photo:'https://abal.kg/wp-content/uploads/2025/09/%D0%90%D0%B7%D0%B8%D1%8F.webp',  cat:'Супермаркет', district:'Октябрь району',  emoji:'🌸', avg:1300, tag:'Супермаркет', stars:4.4, hours:'08:00–22:00', items:'Японча, корейче, азиялык азыктар', delivery:'Бар', parking:'Бар', bg:'#fce4ec'},
    {name:'SPAR',    photo:'https://cdn.worldvectorlogo.com/logos/spar-2.svg',  cat:'Кечки',       district:'Ленин району',    emoji:'🌙', avg:950,  tag:'24/7',        stars:3.6, hours:'24/7',         items:'Ичимдиктер, снэк, кичи азыктар', delivery:'Жок', parking:'Жок', bg:'#ede7f6'},
    {name:'Кыргыз Маркет', photo:'https://i0.wp.com/kgmarket.kg/wp-content/uploads/2025/06/cropped-KGmarket_Logo_NoBackground.png?fit=1158754&ssl=1',  cat:'Жергиликтүү', district:'Аламүдүн',    emoji:'🇰🇬', avg:450,  tag:'Арзан',       stars:4.1, hours:'07:00–20:00', items:'Жергиликтүү өнүмдөр, сүт, жашылча', delivery:'Жок', parking:'Жок', bg:'#e8f5e9'},
  ],
  hotel:[
    {name:'Hyatt Regency',       photo:'https://img.hhcdn.ru/ichameleon/520380.jpg', cat:'5★ Люкс',    district:'Абдрахманов көчөсү 191, Бишкек',  emoji:'🏛', min:7000,  max:18000, tag:'5★',     stars:4.9, rooms:300, pool:'Бар', wifi:'Бар', breakfast:'Кошулган', bg:'#fff8e1'},
    {name:'Golden Dragon',       photo:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSWLurOYimE9T2ailbPe3Vz24QMCnBuDcnR0w&s', cat:'4★ Бизнес',  district:'Элебаев көчөсү 60, Бишкек',    emoji:'🐉', min:4500,  max:9000,  tag:'4★',     stars:4.5, rooms:120, pool:'Бар', wifi:'Бар', breakfast:'Кошулган', bg:'#fce4ec'},
    {name:'Jannat Regency',      photo:'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/08/fd/54/2e/caption.jpg?w=900&h=500&s=1', cat:'4★',         district:'Аалы Токомбаев көчөсү, Бишкек',  emoji:'🌺', min:3500,  max:7000,  tag:'4★',     stars:4.3, rooms:85,  pool:'Жок', wifi:'Бар', breakfast:'Кошулган', bg:'#f3e5f5'},
    {name:'City Hotel ',       photo:'https://avatars.mds.yandex.net/get-altay/1344805/2a0000018586316e2fd553219010538e78b1/L_height', cat:'3★ Классик', district:'Байтик Баатыр көчөсү 34, Бишкек', emoji:'🏨', min:2000,  max:4000,  tag:'3★',     stars:3.9, rooms:65,  pool:'Жок', wifi:'Бар', breakfast:'Айрым',    bg:'#e3f2fd'},
    {name:'Asia Mountains',      photo:'https://asiamountains-hotels.com/wp-content/uploads/2017/05/EKA_6033.jpg', cat:'3★ классик',         district:'Линейная көчөсү 1А, Бишкек', emoji:'⛰', min:1500,  max:3000,  tag:'3★',     stars:3.7, rooms:42,  pool:'Жок', wifi:'Бар', breakfast:'Жок',       bg:'#e8f5e9'},
    {name:'Orion Hotel',         photo:'https://cf.bstatic.com/xdata/images/hotel/max1024x768/100083446.jpg?k=4b2c45a50ffff255c349eacb71f74a4d2ec2a07f6e862877a394d4acaaf221c3&o=', cat:'4★ Бюджет',  district:'Манас проспекти 16, Бишкек',     emoji:'🏩', min:8000,   max:20000,  tag:'5', stars:4.8, rooms:84,  pool:'Бар', wifi:'Бар', breakfast:'Кошулган',       bg:'#fff3e0'},
    {name:'Novotel ', photo:'https://komandirovka.ru/upload/save_file14/960/960d3d698a2dc5f17b2eaefb0bff03d2.jpg', cat:'5★ Люкс', district:'Мана проспекти, 16',      emoji:'🏡', min:9000,   max:10000,  tag:'Бюджет', stars:4.6, rooms:160,  pool:'бар', wifi:'Бар', breakfast:'Кошулган', bg:'#e8f5e9'},
    {name:'Ambassador Hotel ',   photo:'https://www.bishkekhotels.ru/wp-content/uploads/2023/09/ambassadorr.webp', cat:'4★ Бизнес',     district:'Орозбеков көчөсү 32, Бишкек',       emoji:'🏠', min:5000,   max:9000,  tag:'4★', stars:4.6, rooms:70,  pool:'Жок', wifi:'Бар', breakfast:'Кошулган',       bg:'#e3f2fd'},
    {name:'Futuro Hotel ',     photo:'https://www.advantour.com/img/kyrgyzstan/hotels/bishkek/futuro/futuro.jpg', cat:'3★',district:'Удмуртская көчөсү 13, Бишкек',    emoji:'🕌', min:3000,  max:6000, tag:'3★',     stars:4.8, rooms:60,  pool:'Жок', wifi:'Бар', breakfast:'Кошулган', bg:'#f1f8e9'},
    {name:'Ак-Кеме',             photo:'https://data.kaktus.media/image/big/2022-03-17_12-35-57_540350.jpg', cat:'3★',         district:'Горький көчөсү 93, Бишкек',  emoji:'🛥', min:2500,  max:5500,  tag:'3★',     stars:4.0, rooms:55,  pool:'Бар', wifi:'Бар', breakfast:'Айрым',    bg:'#e3f2fd'},
    {name:'Plaza Hotel ',       photo:'https://media-cdn.tripadvisor.com/media/photo-s/06/db/45/a8/plaza-hotel.jpg', cat:'4★',  district:'Тоголок Молдо көчөсү 52, Бишкек',    emoji:'💼', min:4500,  max:8500,  tag:'4★',     stars:4.4, rooms:65,  pool:'Бар', wifi:'Бар', breakfast:'Кошулган', bg:'#fff3e0'},
    {name:'Bishkek Boutique Hotel',         photo:'https://cf.bstatic.com/xdata/images/hotel/max1024x768/133065514.jpg?k=bca9910deda767111b23759d0253f29f4954902f648e95d1eb4a0ce0e4f29f79&o=', cat:'3★',     district:'Суюмбаев көчөсү 126, Бишкек',     emoji:'', min:2500,   max:5000,   tag:'3★', stars:4.3, rooms:25,   pool:'Жок', wifi:'Бар', breakfast:'Кошулган',       bg:'#fce4ec'},
  ],
  bazar:[
    {name:'Дордой Базар',   photo:'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/1a/6f/0a/e6/by-anything-and-everything.jpg?w=1200&h=-1&s=1', cat:'Дүң базар',    district:'Дордой',       emoji:'🏙', tag:'Дүң',        stars:4.0, hours:'06:00–18:00', specialty:'Кийим, электроника, жыйынтык товарлар', veg:'35–200',  meat:'350–600', clothes:'200–2000', bg:'#fff3e0'},
    {name:'Ош Базар',       photo:'https://www.shutterstock.com/image-photo/bishkek-kyrgyzstan-2-september-2025-260nw-2688225403.jpg', cat:'Азык-түлүк',   district:' Свердлов району', emoji:'🌶', tag:'Азык-түлүк', stars:4.3, hours:'07:00–19:00', specialty:'Жашылча, жемиш, эт, сүт өнүмдөрү',    veg:'50–300',  meat:'400–700', clothes:'Жок',      bg:'#e8f5e9'},
    {name:'Аламедин Базар', photo:'https://cdn-1.aki.kg/st_gallery/39/1172139.9df565c52fc5e677e28409a959ee2f49.jpg', cat:'Аралаш',       district:'Аламүдүн району',     emoji:'🥦', tag:'Азык-түлүк', stars:4.1, hours:'06:00–18:00', specialty:'Жашылча, жемиш, жергиликтүү өнүм',    veg:'40–250',  meat:'380–650', clothes:'150–800',  bg:'#e8f5e9'},
    {name:'Мадина Базар',   photo:'https://ютк-текстиль.рф/image/cache/catalog/fototovarov/tkanlana/lana1-2000x2000.jpg', cat:'Кийим',        district:'Свердлов району', emoji:'👗', tag:'Кийим',      stars:3.8, hours:'08:00–19:00', specialty:'Аял кийими, балдар кийими',            veg:'Жок',     meat:'Жок',     clothes:'150–1500', bg:'#fce4ec'},
    {name:'Кудайберген Базар', photo:'https://www.akchabar.kg/_next/image?url=https%3A%2F%2Fakchabar-storage.fra1.digitaloceanspaces.com%2Fakchabar-storage%2Fmedia%2Fnews%2Fgalery%2F2024%2F08%2F25%2Faf4853bf-2ba0-4ad9-b984-bd0d533e3ff4.webp&w=2048&q=75', cat:'Аралаш',       district:'Патриса Лумумба көчөсү, 48Б',     emoji:'🛍', tag:'Азык-түлүк', stars:3.9, hours:'07:00–18:00', specialty:'Азык-түлүк, кенже буюмдар',           veg:'45–280',  meat:'360–620', clothes:'100–700',  bg:'#e3f2fd'},
    {name:'Кант Базар',     photo:'https://www.akchabar.kg/_next/image?url=https%3A%2F%2Fakchabar-storage.fra1.digitaloceanspaces.com%2Fakchabar-storage%2Fmedia%2Fnews%2Fgalery%2F2024%2F08%2F25%2F57d217ed-dada-4d98-9653-460c60f1b231.webp&w=1200&q=75', cat:'Жергиликтүү',  district:'Кант р-н',     emoji:'🌾', tag:'Жакын',      stars:3.7, hours:'07:00–17:00', specialty:'Жашылча, жемиш, дан өнүмдөрү',       veg:'30–180',  meat:'320–580', clothes:'80–500',   bg:'#f1f8e9'},
    {name:'Орто-Сай Базар', photo:'https://media-cdn.tripadvisor.com/media/photo-s/1a/59/07/77/caption.jpg', cat:'Аралаш',       district:'Жал району',          emoji:'🏪', tag:'Жакын',      stars:3.8, hours:'07:00–18:00', specialty:'Азык-түлүк, турмуш буюмдар',         veg:'40–220',  meat:'350–600', clothes:'120–900',  bg:'#fff8e1'},
    {name:'Таатан Базар',          photo:'https://media-cdn.tripadvisor.com/media/photo-s/14/4b/87/f2/img-20180824-175736-814.jpg', cat:'Супербазар',   district:' Октябрь району',  emoji:'🏬', tag:'Дүң',        stars:4.2, hours:'08:00–20:00', specialty:'Кийим, аксессуар, эл аралык товар',  veg:'Жок',     meat:'Жок',     clothes:'300–3000', bg:'#f3e5f5'},
    {name:'Жибек Жолу Базар',      photo:'https://cdn-1.aki.kg/cdn-st-0/qgo/H/3658954.6c63f71080d1e6f0b8e0dc16c559c040.jpg', cat:'Кийим',        district:'Ленин району',    emoji:'🧵', tag:'Кийим',      stars:4.0, hours:'09:00–19:00', specialty:'Кол өнөрчүлүк, дизайнер кийим',      veg:'Жок',     meat:'Жок',     clothes:'500–5000', bg:'#ede7f6'},
    {name:'Чыгыш Базар',   photo:'https://cdn-1.aki.kg/cdn-st-0/qZl/5/1103767.fd5968f2c9e3565aa9dd5945ee65e05e.500.jpg', cat:'Азык-түлүк',   district:'Асанбай району',      emoji:'🫐', tag:'Азык-түлүк', stars:4.0, hours:'06:00–17:00', specialty:'Жашылча, жемиш, кептирилген жемиш', veg:'45–260',  meat:'370–640', clothes:'Жок',      bg:'#e8f5e9'},
  ]
  
};

let activeFilters = {market:'', hotel:'', bazar:''};
let cardSearch = {market:'', hotel:'', bazar:''};

function renderCards(type, filter=cardSearch[type], tagFilter=activeFilters[type]){
  const grid = document.getElementById('grid-'+type);
  if(!grid) return;
  grid.onclick=event=>{
    const card=event.target.closest('[data-card-key]');
    if(card&&grid.contains(card)) openCardModal(type,card.dataset.cardKey);
  };
  let data = cardsData[type];

  // text filter
  const f = filter.toLowerCase();
  if(f) data = data.filter(d=>String(d.name).toLowerCase().includes(f)||String(d.district).toLowerCase().includes(f)||String(d.cat).toLowerCase().includes(f));

  // tag filter
  if(tagFilter) data = data.filter(d=>d.tag===tagFilter||d.cat.includes(tagFilter));

  // Update count badge
  const badge = document.getElementById(type+'-count');
  if(badge){
    const labels = {market:'дүкөн', hotel:'мейманкана', bazar:'базар'};
    badge.textContent = data.length + ' ' + (labels[type]||'');
  }

  if(!data.length){
    grid.innerHTML = '<div style="padding:60px 28px;text-align:center;color:var(--muted);font-size:14px;">😕 Табылган жок</div>';
    return;
  }

  grid.innerHTML = data.map((item, idx) => {
    let priceHtml='', priceSubHtml='', extraInfo='';
    if(type==='market'){
      priceHtml = `~${Number(item.avg||0).toLocaleString()} сом`;
      priceSubHtml = 'орточо чек';
      extraInfo = `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
        <span style="font-size:10px;padding:2px 8px;border-radius:100px;background:${item.delivery==='Бар'?'rgba(46,184,114,0.12)':'rgba(232,64,64,0.08)'};color:${item.delivery==='Бар'?'var(--cheap)':'var(--exp)'};">
          🚚 ${item.delivery==='Бар'?'Жеткирүү бар':'Жеткирүү жок'}
        </span>
        <span style="font-size:10px;padding:2px 8px;border-radius:100px;background:var(--bg);color:var(--muted);">🕐 ${htmlEscape(item.hours)}</span>
      </div>`;
    } else if(type==='hotel'){
      priceHtml = `${Number(item.min||0).toLocaleString()} – ${Number(item.max||0).toLocaleString()}`;
      priceSubHtml = 'сом / 1 түн';
      extraInfo = `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
        ${item.pool==='Бар'?'<span style="font-size:10px;padding:2px 8px;border-radius:100px;background:rgba(61,90,254,0.08);color:var(--accent);">🏊 Бассейн</span>':''}
        ${item.breakfast==='Кошулган'?'<span style="font-size:10px;padding:2px 8px;border-radius:100px;background:rgba(245,166,35,0.1);color:var(--mid);">🍳 Тамак кошулган</span>':''}
        <span style="font-size:10px;padding:2px 8px;border-radius:100px;background:var(--bg);color:var(--muted);">🛏 ${htmlEscape(item.rooms)} бөлмө</span>
      </div>`;
    } else {
      priceHtml = `${item.veg!=='Жок'?htmlEscape(item.veg)+' сом/кг':'Кийим: '+htmlEscape(item.clothes)}`;
      priceSubHtml = htmlEscape(String(item.specialty||'').slice(0,34))+'...';
      extraInfo = `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
        <span style="font-size:10px;padding:2px 8px;border-radius:100px;background:var(--bg);color:var(--muted);">🕐 ${htmlEscape(item.hours)}</span>
        ${item.meat!=='Жок'?`<span style="font-size:10px;padding:2px 8px;border-radius:100px;background:rgba(232,64,64,0.07);color:var(--exp);">🥩 ${htmlEscape(item.meat)} сом/кг</span>`:''}
      </div>`;
    }

    const imgContent = item.photo
      ? `<img src="${htmlEscape(item.photo)}" alt="${htmlEscape(item.name)}" style="width:100%;height:100%;object-fit:cover;display:block;">`
      : `<span style="font-size:52px">${htmlEscape(item.emoji)}</span>`;

    // Star rating
    const fullStars = Math.max(0,Math.min(5,Math.round(Number(item.stars)||0)));
    const stars = '★'.repeat(fullStars) + '☆'.repeat(5-fullStars);
    const starsHtml = `<span style="color:var(--mid);letter-spacing:1px;">${'★'.repeat(fullStars)}</span><span style="color:#ddd;">${'☆'.repeat(5-fullStars)}</span> <span style="color:var(--muted);font-size:11px;font-family:'JetBrains Mono',monospace">${htmlEscape(item.stars)}</span>`;
    const cardKey=item.id?`id:${item.id}`:`name:${item.name}`;

    return `
    <div class="icard" data-card-key="${htmlEscape(cardKey)}" style="animation-delay:${idx*0.06}s">
      <div class="icard-img" style="background:${item.bg};overflow:hidden;">
        ${imgContent}
        <div class="icard-badge badge-${item.tag==='5★'||item.tag==='4★'?'exp':item.tag==='Бюджет'||item.tag==='Арзан'?'cheap':'mid'}">${htmlEscape(item.tag)}</div>
      </div>
      <div class="icard-body">
        <div class="icard-name">${htmlEscape(item.name)}</div>
        <div class="icard-district">📍 ${htmlEscape(item.district)} · <span style="color:var(--accent);font-weight:600">${htmlEscape(item.cat)}</span></div>
        <div class="icard-price">${priceHtml}</div>
        <div class="icard-price-sub">${priceSubHtml}</div>
        ${extraInfo}
        <div class="icard-row">
          <div class="icard-stars">${starsHtml}</div>
          <button class="icard-btn">Көбүрөөк →</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterCards(type, val){
  cardSearch[type] = val;
  renderCards(type);
}

function filterByTag(type, tag, btn){
  activeFilters[type] = tag;
  document.querySelectorAll(`#filter-${type} .fchip`).forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  renderCards(type);
}

function openCardModal(type, name){
  const item = cardsData[type].find(d=>name.startsWith('id:')?String(d.id)===name.slice(3):d.name===name.slice(5));
  if(!item) return;
  const box = document.getElementById('cardModalBox');
  let rows = '';
  if(type==='market'){
    rows = `
      <div class="cmd-row"><span class="cmd-key">📍 Район</span><span class="cmd-val">${htmlEscape(item.district)}</span></div>
      <div class="cmd-row"><span class="cmd-key">🕐 Иш убактысы</span><span class="cmd-val">${htmlEscape(item.hours)}</span></div>
      <div class="cmd-row"><span class="cmd-key">💰 Орточо чек</span><span class="cmd-val">~${Number(item.avg||0).toLocaleString()} сом</span></div>
      <div class="cmd-row"><span class="cmd-key">🚚 Жеткирүү</span><span class="cmd-val">${htmlEscape(item.delivery)}</span></div>
      <div class="cmd-row"><span class="cmd-key">🚗 Паркинг</span><span class="cmd-val">${htmlEscape(item.parking)}</span></div>
      <div class="cmd-row"><span class="cmd-key">🛒 Товарлар</span><span class="cmd-val" style="max-width:220px;text-align:right;font-family:sans-serif;font-size:12px">${htmlEscape(item.items)}</span></div>`;
  } else if(type==='hotel'){
    rows = `
      <div class="cmd-row"><span class="cmd-key">📍 Дарек</span><span class="cmd-val">${htmlEscape(item.district)}</span></div>
      <div class="cmd-row"><span class="cmd-key">💰 Баа / түн</span><span class="cmd-val">${Number(item.min||0).toLocaleString()}–${Number(item.max||0).toLocaleString()} сом</span></div>
      <div class="cmd-row"><span class="cmd-key">🛏 Бөлмө саны</span><span class="cmd-val">${htmlEscape(item.rooms)}</span></div>
      <div class="cmd-row"><span class="cmd-key">🏊 Бассейн</span><span class="cmd-val">${htmlEscape(item.pool)}</span></div>
      <div class="cmd-row"><span class="cmd-key">📶 Wi-Fi</span><span class="cmd-val">${htmlEscape(item.wifi)}</span></div>
      <div class="cmd-row"><span class="cmd-key">🍳 Эртең мененки тамак</span><span class="cmd-val">${htmlEscape(item.breakfast)}</span></div>`;
  } else {
    rows = `
      <div class="cmd-row"><span class="cmd-key">📍 Район</span><span class="cmd-val">${htmlEscape(item.district)}</span></div>
      <div class="cmd-row"><span class="cmd-key">🕐 Иш убактысы</span><span class="cmd-val">${htmlEscape(item.hours)}</span></div>
      <div class="cmd-row"><span class="cmd-key">🥦 Жашылча (1 кг)</span><span class="cmd-val">${htmlEscape(item.veg)} сом</span></div>
      <div class="cmd-row"><span class="cmd-key">🥩 Эт (1 кг)</span><span class="cmd-val">${htmlEscape(item.meat)} сом</span></div>
      <div class="cmd-row"><span class="cmd-key">👗 Кийим</span><span class="cmd-val">${htmlEscape(item.clothes)} сом</span></div>
      <div class="cmd-row"><span class="cmd-key">✨ Адистешүү</span><span class="cmd-val" style="max-width:200px;text-align:right;font-family:sans-serif;font-size:12px">${htmlEscape(item.specialty)}</span></div>`;
  }
  const productRows=(item.products||[]).map(product=>
    `<div class="cmd-row"><span class="cmd-key">${htmlEscape(product.name)}</span><span class="cmd-val">${Number(product.price).toLocaleString()} сом / ${htmlEscape(product.unit)}</span></div>`
  ).join('');
  const reviewRows=(item.reviews||[]).map(review=>
    `<div class="cmd-row"><span class="cmd-key">${htmlEscape(review.reviewer_name)} · ${Number(review.rating)}/5</span><span class="cmd-val" style="max-width:240px;white-space:normal">${htmlEscape(review.body)}</span></div>`
  ).join('');
  const modalImg = item.photo
    ? `<img src="${htmlEscape(item.photo)}" alt="${htmlEscape(item.name)}" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:16px 16px 0 0;">`
    : `<span>${htmlEscape(item.emoji)}</span>`;
  box.innerHTML = `
    <div class="card-modal-top" style="background:${item.photo?'#000':item.bg};overflow:hidden;">
      ${modalImg}
      <button class="card-modal-close" onclick="closeCardModal()">✕</button>
    </div>
    <div class="card-modal-body">
      <div class="card-modal-name">${htmlEscape(item.name)}</div>
      <div class="card-modal-sub">⭐ ${htmlEscape(item.stars)} · ${htmlEscape(item.cat)}</div>
      ${item.summary?`<p>${htmlEscape(item.summary)}</p>`:''}
      ${rows}
      ${productRows?`<h3>Товарлардын баасы</h3>${productRows}`:''}
      ${reviewRows?`<h3>Колдонуучулардын пикирлери</h3>${reviewRows}`:''}
      ${item.id?`<form class="public-review-form" id="publicReviewForm">
        <h3>Пикир калтыруу</h3>
        <label>Атыңыз<input name="reviewer_name" maxlength="100" required></label>
        <label>Рейтинг<select name="rating" required><option value="">Тандаңыз</option><option value="5">5 — эң жакшы</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1 — начар</option></select></label>
        <label>Пикир<textarea name="body" minlength="5" maxlength="2000" required></textarea></label>
        <button type="submit" class="add-btn">Пикир жөнөтүү</button>
      </form>`:''}
    </div>`;
  document.getElementById('cardModal').classList.add('open');
  const reviewForm=document.getElementById('publicReviewForm');
  if(reviewForm){
    reviewForm.addEventListener('submit',async event=>{
      event.preventDefault();
      if(!publicApiCsrf){showToast('⚠ Пикир жөнөтүү үчүн серверге туташуу керек.');return;}
      const submitButton=reviewForm.querySelector('button[type="submit"]');
      submitButton.disabled=true;
      try{
        const values=Object.fromEntries(new FormData(reviewForm).entries());
        const response=await fetch('api.php',{
          method:'POST',
          headers:{'Content-Type':'application/json','X-CSRF-Token':publicApiCsrf,Accept:'application/json'},
          body:JSON.stringify({listing_id:item.id,...values})
        });
        const result=await response.json();
        if(!response.ok) throw new Error(result.error||`HTTP ${response.status}`);
        reviewForm.reset();
        showToast('✓ Пикириңиз текшерүүгө жөнөтүлдү.');
      }catch(error){
        console.error('Пикир жөнөтүлгөн жок.',error);
        showToast(`⚠ ${error.message}`);
      }finally{
        submitButton.disabled=false;
      }
    });
  }
}
function closeCardModal(e){
  if(!e||e.target.id==='cardModal') document.getElementById('cardModal').classList.remove('open');
}

// ─── DATA ───────────────────────────────────
const districts = {
  pervomay:{
    name:'Биринчи май', photo:'', level:'cheap',
    flat:[14000,20000],food:[150,300],coffee:[80,150],taxi:[40,80],hair:[200,400],market:[2500,4000],
    desc:'Байыркы, тынч район. Кыргызча жашоо стили.',
    reports:64, lastUpdate:'2 саат мурун'
  },
  sverd:{
    name:'Свердлов ', photo:'', level:'mid',
    flat:[22000,32000],food:[200,500],coffee:[120,250],taxi:[50,100],hair:[300,600],market:[3000,5000],
    desc:'Өнүгүп келаткан район. Жакшы инфраструктура.',
    reports:91, lastUpdate:'45 мин мурун'
  },
  oktyabr:{
    name:'Октябрь ', photo:'', level:'exp',
    flat:[38000,55000],food:[400,900],coffee:[200,400],taxi:[60,120],hair:[500,1200],market:[4000,7000],
    desc:'Орто зона. Бизнес борборлору, заманбап үйлөр.',
    reports:128, lastUpdate:'18 мин мурун'
  },
  lenin:{
    name:'Ленин  (Борбор)', photo:'', level:'exp',
    flat:[45000,80000],food:[500,1500],coffee:[250,600],taxi:[70,150],hair:[600,1500],market:[4500,8000],
    desc:'Шаардын жүрөгү. Эң кымбат, эң ыңгайлуу.',
    reports:203, lastUpdate:'5 мин мурун'
  },
  alamedin:{
    name:'Аламүдүн', photo:'', level:'cheap',
    flat:[13000,18000],food:[100,250],coffee:[70,130],taxi:[35,70],hair:[150,350],market:[2000,3500],
    desc:'Арзан, тынч. Транспорт бар, борборго жакын эмес.',
    reports:48, lastUpdate:'3 саат мурун'
  },
  asanbay:{
    name:'Асанбай', photo:'', level:'mid',
    flat:[20000,30000],food:[200,450],coffee:[120,230],taxi:[50,90],hair:[280,550],market:[2800,4500],
    desc:'Популярдуу район. Маркет, мечит, мектеп бар.',
    reports:115, lastUpdate:'1 саат мурун'
  },
  tunguch:{
    name:'Тунгуч', photo:'', level:'mid',
    flat:[22000,33000],food:[200,480],coffee:[130,260],taxi:[55,100],hair:[300,600],market:[3000,4800],
    desc:'Тынч жашоолуу район. Жакшы жолдор.',
    reports:87, lastUpdate:'2 саат мурун'
  },
  jal:{
    name:'Жал микрор.', photo:'', level:'cheap',
    flat:[16000,24000],food:[150,350],coffee:[90,180],taxi:[45,85],hair:[200,450],market:[2500,4000],
    desc:'Чоң жашыл аймак. Спорт комплекслери бар.',
    reports:72, lastUpdate:'4 саат мурун'
  },
  kant:{
    name:'Кант р-ну', photo:'', level:'cheap',
    flat:[10000,16000],food:[100,220],coffee:[60,120],taxi:[30,60],hair:[130,300],market:[1800,3000],
    desc:'Эң арзан. Шаардан бир аз алыс.',
    reports:34, lastUpdate:'6 саат мурун'
  },
  archa:{
    name:'Арча Бешик', photo:'', level:'mid',
    flat:[19000,28000],food:[180,400],coffee:[110,220],taxi:[48,88],hair:[250,500],market:[2700,4200],
    desc:'Жаңы курулуш көп. Перспективалуу.',
    reports:56, lastUpdate:'3 саат мурун'
  },
  vostok:{
    name:'Чыгыш-5', photo:'', level:'mid',
    flat:[20000,29000],food:[180,420],coffee:[110,230],taxi:[50,90],hair:[260,520],market:[2800,4400],
    desc:'Чоң микрорайон. Базар, мектептер жакын.',
    reports:68, lastUpdate:'2 саат мурун'
  },
  dordoy:{
    name:'Дордой', photo:'', level:'cheap',
    flat:[12000,18000],food:[100,280],coffee:[70,140],taxi:[35,70],hair:[150,350],market:[2000,3200],
    desc:'Дордой базары жакын. Жандуу, тез.',
    reports:44, lastUpdate:'5 саат мурун'
  }
};

const catLabels={
  flat:  {icon:'🏠',label:'1-бөлмө батир (ижара)'},
  food:  {icon:'🍔',label:'Тамак (орточо'},
  coffee:{icon:'☕',label:'Кофе/чай'},
  taxi:  {icon:'🚕',label:'Такси ~3 км'},
  hair:  {icon:'💇',label:'Чачтарач'},
  market:{icon:'🛒',label:'Азык-түлүк (жума)'},
};
const levelLabel={cheap:'Арзан',mid:'Орточо',exp:'Кымбат'};
const levelColor={cheap:'var(--cheap)',mid:'var(--mid)',exp:'var(--exp)'};
const levelBg={cheap:'var(--cheap-bg)',mid:'var(--mid-bg)',exp:'var(--exp-bg)'};

const DISTRICT_STORAGE_KEY='baakarta-district-data-v1';

function loadDistrictData(){
  try{
    const saved=JSON.parse(localStorage.getItem(DISTRICT_STORAGE_KEY));
    if(!saved||typeof saved!=='object') return;
    Object.entries(districts).forEach(([id,district])=>{
      const stored=saved[id];
      if(!stored||typeof stored!=='object') return;
      district.reports=Number.isInteger(stored.reports)&&stored.reports>=0?stored.reports:district.reports;
      district.lastUpdate=typeof stored.lastUpdate==='string'?stored.lastUpdate:district.lastUpdate;
      Object.keys(catLabels).forEach(category=>{
        const range=stored[category];
        if(Array.isArray(range)&&range.length===2&&range.every(value=>Number.isFinite(value)&&value>0)&&range[1]>=range[0]){
          district[category]=range;
        }
        const entries=stored.priceHistory?.[category];
        if(Array.isArray(entries)){
          district.priceHistory ||= {};
          district.priceHistory[category]=entries.filter(entry=>
            entry&&Number.isFinite(entry.min)&&Number.isFinite(entry.max)&&entry.min>0&&entry.max>=entry.min&&Date.parse(entry.at)
          ).slice(-30);
        }
      });
    });
  }catch(error){
    console.warn('Сакталган бааларды окуу мүмкүн болгон жок.',error);
  }
}

function saveDistrictData(){
  try{
    localStorage.setItem(DISTRICT_STORAGE_KEY,JSON.stringify(districts));
  }catch(error){
    console.warn('Бааларды ушул түзмөктө сактоо мүмкүн болгон жок.',error);
  }
}

function renderPriceAnalysis(district){
  const history=district.priceHistory||{};
  const latestRecord=Object.entries(history)
    .flatMap(([category,entries])=>entries.map(entry=>({...entry,category})))
    .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))
    .pop();
  if(!latestRecord){
    return `<div class="analysis-card"><div class="analysis-title">Баалардын анализи</div><div class="analysis-copy">Салыштыруу үчүн азырынча жетиштүү тарыхый баа жок. Жаңы баалар ушул түзмөктө гана сакталат.</div></div>`;
  }

  const categoryLabel=catLabels[latestRecord.category].label;
  const latestAverage=(latestRecord.min+latestRecord.max)/2;
  const previousRecords=history[latestRecord.category];
  const updatedDate=new Date(latestRecord.at);
  const monthNames=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  const updatedAt=`${updatedDate.getDate()}-${monthNames[updatedDate.getMonth()]} ${updatedDate.getFullYear()}, ${String(updatedDate.getHours()).padStart(2,'0')}:${String(updatedDate.getMinutes()).padStart(2,'0')}`;
  if(previousRecords.length<2){
    return `<div class="analysis-card"><div class="analysis-title">Баалардын анализи · ${categoryLabel}</div><div class="analysis-values"><span>Акыркы баа: ${latestRecord.min.toLocaleString()}–${latestRecord.max.toLocaleString()} сом</span><span class="analysis-change stable">БАЗА</span></div><div class="analysis-copy">Биринчи маалымат ${updatedAt} киргизилди. Өзгөрүүнү эсептөө үчүн дагы бир баа керек.</div></div>`;
  }

  const previousRecord=previousRecords[previousRecords.length-2];
  const previousAverage=(previousRecord.min+previousRecord.max)/2;
  const change=latestAverage-previousAverage;
  const changePercent=Math.round(change/previousAverage*100);
  const trend=change>0?'up':change<0?'down':'stable';
  const trendLabel=change>0?'ӨСТҮ':change<0?'ТӨМӨНДӨДҮ':'ӨЗГӨРГӨН ЖОК';
  const signedChange=change>0?`+${Math.round(change).toLocaleString()}`:Math.round(change).toLocaleString();
  const signedPercent=change>0?`+${changePercent}%`:`${changePercent}%`;
  return `<div class="analysis-card"><div class="analysis-title">Баалардын анализи · ${categoryLabel}</div><div class="analysis-values"><span>${previousAverage.toLocaleString()} → ${latestAverage.toLocaleString()} сом</span><span class="analysis-change ${trend}">${trendLabel} ${signedPercent}</span></div><div class="analysis-copy">Орточо баа ${signedChange} сомго өзгөрдү. Акыркы маалымат: ${updatedAt}. Салыштыруу ушул түзмөктө киргизилген маалыматтарга негизделет.</div></div>`;
}

// Monthly estimate weights
const monthlyWeight={flat:1, food:22, coffee:20, taxi:20, hair:2, market:4};

let selectedId=null;

// ─── RENDER DISTRICT LIST ────────────────────
function renderList(filter=''){
  const list=document.getElementById('distList');
  list.innerHTML='';
  let idx=0;
  Object.entries(districts).forEach(([id,d])=>{
    if(filter && !d.name.toLowerCase().includes(filter.toLowerCase())) return;
    const item=document.createElement('div');
    item.className='dist-item appear';
    item.style.animationDelay = (idx*0.04)+'s';
    item.style.opacity='0';
    item.onclick=()=>selectDistrict(id);
    const flatAvg=Math.round((d.flat[0]+d.flat[1])/2);
    const lvlColors={cheap:'var(--cheap)',mid:'var(--mid)',exp:'var(--exp)'};
    item.innerHTML=`
      <div class="dist-color" style="background:${levelColor[d.level]}"></div>
      <div style="flex:1">
        <div class="dist-name">${d.name}</div>
        <div class="dist-price">Батир: ${d.flat[0].toLocaleString()}–${d.flat[1].toLocaleString()} сом/ай</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">🕒 ${d.lastUpdate}</div>
        <div style="margin-top:6px">
          <span class="dist-enter-btn">Кирүү →</span>
        </div>
      </div>
      <div style="text-align:right">
        <div class="dist-badge badge-${d.level}">${levelLabel[d.level]}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:4px;">${d.reports} маалымат</div>
      </div>
    `;
    list.appendChild(item);
    idx++;
  });
}

function filterDistricts(v){ renderList(v); }

// ─── SELECT DISTRICT ────────────────────────
function selectDistrict(id){
  // Deselect all SVG
  document.querySelectorAll('.district').forEach(el=>{
    el.classList.remove('selected');
    el.style.strokeWidth='1.5';
  });
  // Select
  const svgEl=document.getElementById('d-'+id);
  if(svgEl){svgEl.classList.add('selected');svgEl.style.strokeWidth='3';}

  selectedId=id;
  showDetail(id);
}

function showDetail(id){
  const d=districts[id];
  document.getElementById('panelIdle').style.display='none';
  const detailEl = document.getElementById('panelDetail');
  detailEl.style.display='flex';
  detailEl.classList.add('show');
  setTimeout(()=>detailEl.classList.remove('show'), 400);

  document.getElementById('detailName').textContent=d.name;
  const badge=document.getElementById('detailBadge');
  badge.textContent=levelLabel[d.level];
  badge.className='detail-badge';
  badge.style.background=levelBg[d.level];
  badge.style.color=levelColor[d.level];
  document.getElementById('detailUpdated').textContent=`🕒 Акыркы жаңыртуу: ${d.lastUpdate} · ${d.reports} маалымат`;

  // Calculate monthly estimate
  let monthMin=0, monthMax=0;
  Object.keys(catLabels).forEach(cat=>{
    monthMin+=d[cat][0]*monthlyWeight[cat];
    monthMax+=d[cat][1]*monthlyWeight[cat];
  });
  monthMin=Math.round(monthMin/1000)*1000;
  monthMax=Math.round(monthMax/1000)*1000;

  // Max for compare bar (Ленинский is max ~230k)
  const maxPossible=230000;
  const fillPct=Math.round((monthMin/maxPossible)*100);
  const barColor=levelColor[d.level];

  let html=`
    <div class="cost-summary">
      <div class="summary-title">Айлык чыгым (болжол)</div>
      <div class="summary-total">${monthMin.toLocaleString()} – ${monthMax.toLocaleString()} сом</div>
      <div class="summary-sub">Батир + тамак + транспорт + кызматтар</div>
      <div class="compare-bar">
        <div class="cbar-label"><span>Башка райондор менен салыштыруу</span><span>${d.name}</span></div>
        <div class="cbar-track"><div class="cbar-fill" style="width:${fillPct}%;background:${barColor}"></div></div>
      </div>
    </div>

    <p style="font-size:12px;color:var(--muted);margin-bottom:20px;line-height:1.6;">${d.desc}</p>
  `;

  html+=renderPriceAnalysis(d);

  // Categories
  const catGroups={
    'Турак жай':{cats:['flat']},
    'Тамак & Ичимдик':{cats:['food','coffee']},
    'Кызматтар':{cats:['taxi','hair','market']},
  };

  Object.entries(catGroups).forEach(([gname,g])=>{
    html+=`<div class="cat-block"><div class="cat-title">${gname}</div>`;
    g.cats.forEach(cat=>{
      const c=catLabels[cat];
      const vals=d[cat];
      html+=`
        <div class="price-row">
          <div class="price-label">${c.icon} ${c.label}</div>
          <div style="text-align:right">
            <div class="price-val">${vals[0].toLocaleString()}–${vals[1].toLocaleString()}</div>
            <div class="price-range">сом</div>
          </div>
        </div>
      `;
    });
    html+=`</div>`;
  });

  document.getElementById('detailBody').innerHTML=html;
  document.getElementById('detailBody').scrollTop=0;

  // Animate bar
  setTimeout(()=>{
    const fill=document.querySelector('.cbar-fill');
    if(fill){fill.style.width='0';setTimeout(()=>{fill.style.width=fillPct+'%';},50);}
  },100);
}

function goBack(){
  document.getElementById('panelIdle').style.display='flex';
  document.getElementById('panelDetail').style.display='none';
  document.querySelectorAll('.district').forEach(el=>{
    el.classList.remove('selected');
    el.style.strokeWidth='1.5';
  });
  selectedId=null;
}

// ─── TOOLTIP ────────────────────────────────
function showTip(e,name){
  const tt=document.getElementById('mapTooltip');
  tt.textContent=name;
  const rect=document.getElementById('mapArea').getBoundingClientRect();
  tt.style.left=(e.clientX-rect.left+12)+'px';
  tt.style.top=(e.clientY-rect.top-36)+'px';
  tt.classList.add('show');
}
function hideTip(){ document.getElementById('mapTooltip').classList.remove('show'); }

// ─── MODAL ──────────────────────────────────
function openModal(){
  const sel=document.getElementById('modalDistrict');
  sel.innerHTML='<option value="">Районду тандаңыз</option>';
  Object.entries(districts).forEach(([id,d])=>{
    sel.innerHTML+=`<option value="${id}">${d.name}</option>`;
  });
  if(selectedId) sel.value=selectedId;
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal(){ document.getElementById('modalOverlay').classList.remove('open'); }
function closeModalOutside(e){ if(e.target===document.getElementById('modalOverlay'))closeModal(); }

function submitModal(){
  const dist=document.getElementById('modalDistrict').value;
  const category=document.getElementById('modalCat').value;
  const min=Number(document.getElementById('modalMin').value);
  const max=Number(document.getElementById('modalMax').value);
  if(!dist||!Number.isFinite(min)||!Number.isFinite(max)||min<=0||max<min){
    showToast('⚠ Районду жана туура баа диапазонун толтургула');
    return;
  }
  districts[dist][category]=[min,max];
  districts[dist].priceHistory ||= {};
  districts[dist].priceHistory[category] ||= [];
  districts[dist].priceHistory[category].push({min,max,at:new Date().toISOString()});
  districts[dist].priceHistory[category]=districts[dist].priceHistory[category].slice(-30);
  districts[dist].reports++;
  districts[dist].lastUpdate='Азыр';
  saveDistrictData();
  closeModal();
  document.getElementById('modalMin').value='';
  document.getElementById('modalMax').value='';
  document.getElementById('modalNote').value='';
  showToast('✓ Баа ушул түзмөктө сакталды');
  if(selectedId===dist) showDetail(dist);
}

function quickSubmit(){
  const v=document.getElementById('quickInput').value.trim();
  if(!v||!selectedId){showToast('⚠ Маалыматты жаз');return;}
  districts[selectedId].reports++;
  document.getElementById('quickInput').value='';
  document.getElementById('detailUpdated').textContent=`🕒 Акыркы жаңыртуу: Азыр · ${districts[selectedId].reports} маалымат`;
  showToast('✓ Кошулду — рахмат!');
}

// ─── TOAST ──────────────────────────────────
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}

// ─── MAP VIEW TOGGLE ────────────────────────
let currentMapView = 'real';
let leafletMap = null;
let leafletMarkers = {};

const districtCoords = {
  pervomay: [42.8870, 74.5440],
  sverd:    [42.9150, 74.6150],
  oktyabr:  [42.8210, 74.6750],
  lenin:    [42.8100, 74.53000],
  alamedin: [42.9000, 74.6450],
  asanbay:  [42.8210, 74.6200],
  tunguch:  [42.8530, 74.6890],
  jal:      [42.8400, 74.5700],
  kant:     [42.8800, 74.8400],
  archa:    [42.8300, 74.55000],
  vostok:   [42.8690, 74.6300],
  dordoy:   [42.9350, 74.6250],
};

function initLeafletMap(){
  if(leafletMap) return;
  leafletMap = L.map('leafletMap', {
    center: [42.8700, 74.5900],
    zoom: 12,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(leafletMap);

  // Add district markers
  Object.entries(districts).forEach(([id, d]) => {
    const coords = districtCoords[id];
    if(!coords) return;
    const color = {cheap:'#2eb872', mid:'#f5a623', exp:'#e84040'}[d.level];
    const flatAvg = Math.round((d.flat[0]+d.flat[1])/2);

    const icon = L.divIcon({
      className: '',
      html: `<div class="dist-marker ${d.level}" style="width:54px;height:54px;font-size:9px;background:${color};flex-direction:column;gap:1px;">
               <span style="font-size:8px;opacity:0.9">${d.name.split(' ')[0]}</span>
               <span style="font-size:7.5px;font-weight:400;">${Math.round(flatAvg/1000)}к сом</span>
             </div>`,
      iconSize: [54, 54],
      iconAnchor: [27, 27],
      popupAnchor: [0, -32],
    });

    const marker = L.marker(coords, {icon}).addTo(leafletMap);
    marker.bindPopup(`
      <div class="lp-name">${d.name}</div>
      <div class="lp-price">🏠 Батир: ${d.flat[0].toLocaleString()}–${d.flat[1].toLocaleString()} сом/ай</div>
    
    `, {maxWidth: 200});
    marker.on('click', () => selectDistrict(id));
    leafletMarkers[id] = marker;
  });
}

function switchMapView(mode){
  currentMapView = mode;
  if(mode === 'real'){
    document.getElementById('leafletMap').style.display = 'block';
    document.getElementById('svgMapWrap').style.display = 'none';
    document.getElementById('btnRealMap').classList.add('active');
    document.getElementById('btnScheme').classList.remove('active');
    initLeafletMap();
    setTimeout(()=>{ if(leafletMap) leafletMap.invalidateSize(); }, 100);
  } else {
    document.getElementById('leafletMap').style.display = 'none';
    document.getElementById('svgMapWrap').style.display = 'block';
    document.getElementById('btnScheme').classList.add('active');
    document.getElementById('btnRealMap').classList.remove('active');
  }
}

// ─── COUNTER ANIMATION ──────────────────────
function animateCount(el, target, duration=1200){
  if(!el) return;
  let start=0, step=target/60;
  const interval=setInterval(()=>{
    start=Math.min(start+step, target);
    el.textContent=Math.round(start);
    if(start>=target) clearInterval(interval);
  }, duration/60);
}

// ─── INIT ───────────────────────────────────
loadDistrictData();
renderList();
initLeafletMap();
loadAdminListings();
// Animate stats
setTimeout(()=>{
  animateCount(document.getElementById('stat-reports'), 847, 1500);
},400);
