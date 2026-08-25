const menuData = [
  {cat:"Coffee",name:"Cappuccino",price:149,desc:"Rich espresso with silky steamed milk and a soft foam finish.",image:"https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=900&q=80",badge:"Bestseller"},
  {cat:"Coffee",name:"Flat White",price:159,desc:"Double espresso balanced with velvety microfoam.",image:"https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=900&q=80"},
  {cat:"Coffee",name:"Cold Brew",price:169,desc:"Slow-steeped, smooth and naturally sweet over ice.",image:"https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=80"},
  {cat:"Food",name:"Margherita Pizza",price:299,desc:"Tomato, mozzarella, basil and olive oil on a crisp base.",image:"https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=900&q=80",badge:"Popular"},
  {cat:"Food",name:"Classic Burger",price:249,desc:"Grilled patty, cheddar, lettuce, tomato and house sauce.",image:"https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80"},
  {cat:"Food",name:"Pesto Pasta",price:279,desc:"Penne tossed in basil pesto, parmesan and toasted herbs.",image:"https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=80"},
  {cat:"Dessert",name:"Tiramisu",price:199,desc:"Coffee-soaked sponge, mascarpone cream and cocoa.",image:"https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=900&q=80",badge:"Chef's pick"},
  {cat:"Dessert",name:"Chocolate Brownie",price:149,desc:"Warm, fudgy chocolate brownie with a rich cocoa finish.",image:"https://images.unsplash.com/photo-1606313564200-e75d5e30476b?auto=format&fit=crop&w=900&q=80"},
  {cat:"Drinks",name:"Fresh Lemonade",price:99,desc:"Fresh lemon, chilled water and a light touch of sweetness.",image:"https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=900&q=80"},
  {cat:"Drinks",name:"Iced Tea",price:119,desc:"Brewed black tea, citrus and ice.",image:"https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=80"},
  {cat:"Drinks",name:"Classic Milkshake",price:179,desc:"Creamy vanilla milkshake finished with whipped cream.",image:"https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=80"}
];

const state = {category:"All", selected:[]};

const categoriesEl = document.getElementById("categories");
const gridEl = document.getElementById("menuGrid");
const drawer = document.getElementById("requestDrawer");
const selectedEl = document.getElementById("selectedItems");
const totalEl = document.getElementById("selectedTotal");
const countEl = document.getElementById("cartCount");
const cartButton = document.getElementById("cartButton");
const whatsapp = document.getElementById("whatsappRequest");

const money = n => Number(n).toLocaleString("en-IN");

function renderCategories(){
  const cats = ["All", ...new Set(menuData.map(x=>x.cat))];
  categoriesEl.innerHTML = cats.map(cat =>
    `<button class="category ${cat===state.category?"active":""}" data-category="${cat}">${cat}</button>`
  ).join("");
}

function renderMenu(){
  const items = state.category==="All" ? menuData : menuData.filter(x=>x.cat===state.category);
  gridEl.innerHTML = items.map((item,index) => `
    <article class="item">
      <div class="item-image">
        <img src="${item.image}" alt="${item.name}" loading="lazy">
        ${item.badge ? `<span class="badge">${item.badge}</span>` : ""}
      </div>
      <div class="item-body">
        <div class="item-top">
          <h3>${item.name}</h3>
          <span class="price">₹${money(item.price)}</span>
        </div>
        <p>${item.desc}</p>
        <button type="button" data-add="${menuData.indexOf(item)}">Add to request</button>
      </div>
    </article>
  `).join("");
}

function renderRequest(){
  const total = state.selected.reduce((sum,item)=>sum + item.price*item.qty,0);
  const count = state.selected.reduce((sum,item)=>sum + item.qty,0);
  countEl.textContent = count;

  if(!state.selected.length){
    selectedEl.innerHTML = `<p class="fine-print" style="padding:15px 0">No items selected yet.</p>`;
  } else {
    selectedEl.innerHTML = state.selected.map((item,i)=>`
      <div class="selected-row">
        <div>
          <strong>${item.name}</strong>
          <small>₹${money(item.price)} each</small>
          <div class="qty-controls">
            <button data-minus="${i}">−</button>
            <span>${item.qty}</span>
            <button data-plus="${i}">+</button>
            <button class="remove" data-remove="${i}">Remove</button>
          </div>
        </div>
        <strong>₹${money(item.price*item.qty)}</strong>
      </div>
    `).join("");
  }

  totalEl.textContent = money(total);

  const lines = state.selected.map(x=>`${x.name} × ${x.qty} — ₹${money(x.price*x.qty)}`);
  const message = `Hi The Daily Table, I'd like to request:\n${lines.join("\n")}\nEstimated total: ₹${money(total)}`;
  whatsapp.href = `https://wa.me/919999999999?text=${encodeURIComponent(message)}`;
}

function openDrawer(){
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden","false");
  document.body.style.overflow="hidden";
}
function closeDrawer(){
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden","true");
  document.body.style.overflow="";
}

categoriesEl.addEventListener("click",e=>{
  const btn=e.target.closest("[data-category]");
  if(!btn)return;
  state.category=btn.dataset.category;
  renderCategories();
  renderMenu();
});

gridEl.addEventListener("click",e=>{
  const btn=e.target.closest("[data-add]");
  if(!btn)return;
  const item=menuData[Number(btn.dataset.add)];
  const existing=state.selected.find(x=>x.name===item.name);
  if(existing) existing.qty++;
  else state.selected.push({...item,qty:1});
  renderRequest();
  openDrawer();
});

selectedEl.addEventListener("click",e=>{
  const plus=e.target.closest("[data-plus]");
  const minus=e.target.closest("[data-minus]");
  const remove=e.target.closest("[data-remove]");
  if(plus) state.selected[Number(plus.dataset.plus)].qty++;
  if(minus){
    const i=Number(minus.dataset.minus);
    state.selected[i].qty--;
    if(state.selected[i].qty<=0) state.selected.splice(i,1);
  }
  if(remove) state.selected.splice(Number(remove.dataset.remove),1);
  renderRequest();
});

cartButton.addEventListener("click",openDrawer);
document.querySelectorAll("[data-close]").forEach(x=>x.addEventListener("click",closeDrawer));
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDrawer();});

renderCategories();
renderMenu();
renderRequest();
