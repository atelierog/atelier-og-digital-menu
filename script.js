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
  gridEl.innerHTML = items.map(item => {
    const index = menuData.indexOf(item);
    const selected = state.selected.find(x=>x.name===item.name);
    const qty = selected ? selected.qty : 0;

    return `
      <article class="item ${selected ? "selected" : ""}" data-item="${index}">
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
          <div class="item-order-controls">
            <button type="button" class="item-add" data-add="${index}">ADD TO ORDER</button>
            <div class="item-qty" aria-label="Quantity">
              <button type="button" data-item-minus="${index}" aria-label="Decrease ${item.name}">−</button>
              <span>${qty}</span>
              <button type="button" data-item-plus="${index}" aria-label="Increase ${item.name}">+</button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join("");
}
function renderRequest(){
  const subtotal = state.selected.reduce((sum,item)=>sum + item.price*item.qty,0);
  const gstRateValue = Number((window.ATELIER_MENU_CONFIG || {}).gstRate ?? 5);
  const gst = Math.round(subtotal * gstRateValue / 100);
  const grandTotal = subtotal + gst;
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
            <button data-minus="${i}" aria-label="Decrease">−</button>
            <span>${item.qty}</span>
            <button data-plus="${i}" aria-label="Increase">+</button>
            <button class="remove" data-remove="${i}">Remove</button>
          </div>
        </div>
        <strong>₹${money(item.price*item.qty)}</strong>
      </div>
    `).join("");
  }

  const subtotalEl = document.getElementById("orderSubtotal");
  const gstEl = document.getElementById("orderGst");
  if(subtotalEl) subtotalEl.textContent = money(subtotal);
  if(gstEl) gstEl.textContent = money(gst);
  const gstRateLabel = document.getElementById("gstRate");
  if(gstRateLabel) gstRateLabel.textContent = `${gstRateValue}%`;
  totalEl.textContent = money(grandTotal);

  const lines = state.selected.map(x=>`${x.name} × ${x.qty} — ₹${money(x.price*x.qty)}`);
  const message = `Hi The Daily Table, I'd like to place an order:\n${lines.join("\n")}\nSubtotal: ₹${money(subtotal)}\nGST (${gstRateValue}%): ₹${money(gst)}\nFinal total: ₹${money(grandTotal)}`;
  whatsapp.href = `https://wa.me/919999999999?text=${encodeURIComponent(message)}`;

  /* Keep product cards in sync without opening the order drawer. */
  document.querySelectorAll(".item[data-item]").forEach(card=>{
    const index = Number(card.dataset.item);
    const selected = state.selected.find(x=>x.name===menuData[index].name);
    const qty = selected ? selected.qty : 0;
    card.classList.toggle("selected", !!selected);
    const qtySpan = card.querySelector(".item-qty span");
    if(qtySpan) qtySpan.textContent = qty;
  });
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
  const add=e.target.closest("[data-add]");
  const plus=e.target.closest("[data-item-plus]");
  const minus=e.target.closest("[data-item-minus]");

  if(add){
    const index=Number(add.dataset.add);
    const item=menuData[index];
    const existing=state.selected.find(x=>x.name===item.name);
    if(existing) existing.qty++;
    else state.selected.push({...item,qty:1});
    renderRequest();
    return;
  }

  if(plus){
    const index=Number(plus.dataset.itemPlus);
    const item=menuData[index];
    const existing=state.selected.find(x=>x.name===item.name);
    if(existing) existing.qty++;
    else state.selected.push({...item,qty:1});
    renderRequest();
    return;
  }

  if(minus){
    const index=Number(minus.dataset.itemMinus);
    const item=menuData[index];
    const existingIndex=state.selected.findIndex(x=>x.name===item.name);
    if(existingIndex === -1) return;
    state.selected[existingIndex].qty--;
    if(state.selected[existingIndex].qty<=0) state.selected.splice(existingIndex,1);
    renderRequest();
  }
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


/* =========================================
   QR MENU SHARING
   ========================================= */

(function(){
  const qrElement = document.getElementById("qrcode");
  const downloadButton = document.getElementById("downloadQr");
  const printButton = document.getElementById("printQr");
  const qrUrlElement = document.getElementById("qrUrl");

  if (!qrElement) return;

  const menuUrl = window.ATELIER_MENU_URL || window.location.href.split("#")[0];

  if (qrUrlElement) {
    qrUrlElement.textContent = menuUrl;
  }

  function buildQr(){
    if (typeof QRCode === "undefined") {
      qrElement.innerHTML =
        '<p style="font-size:11px;color:#777;text-align:center">QR generator could not load. Refresh the page.</p>';
      return;
    }

    qrElement.innerHTML = "";

    new QRCode(qrElement, {
      text: menuUrl,
      width: 230,
      height: 230,
      colorDark: "#090909",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  buildQr();

  if (downloadButton) {
    downloadButton.addEventListener("click", function(){
      const canvas = qrElement.querySelector("canvas");
      const image = qrElement.querySelector("img");

      let dataUrl = "";

      if (canvas) {
        dataUrl = canvas.toDataURL("image/png");
      } else if (image) {
        dataUrl = image.src;
      }

      if (!dataUrl) return;

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "atelier-og-digital-menu-qr.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }

  if (printButton) {
    printButton.addEventListener("click", function(){
      window.print();
    });
  }
})();


/* =========================================
   CLIENT MENU URL ROUTING
   ========================================= */

(function(){
  const config = window.ATELIER_MENU_CONFIG || {
    client: "daily-table",
    name: "The Daily Table",
    slug: "daily-table",
    basePath: "/atelier-og-digital-menu/",
    whatsapp: "919999999999",
    location: "The Daily Table"
  };

  function getClientSlug(){
    const path = window.location.pathname;
    const base = config.basePath || "/atelier-og-digital-menu/";
    const cleanBase = base.endsWith("/") ? base : base + "/";
    const after = path.startsWith(cleanBase) ? path.slice(cleanBase.length) : "";
    const slug = after.split("/").filter(Boolean)[0];
    return slug || config.slug || "daily-table";
  }

  const slug = getClientSlug();
  const clientUrl = new URL(
    (config.basePath || "/atelier-og-digital-menu/") + encodeURIComponent(slug) + "/",
    window.location.origin
  ).href;

  const clientName = config.name || "The Daily Table";

  const clientSlugEl = document.getElementById("clientSlug");
  const qrClientEl = document.getElementById("qrClient");

  if (clientSlugEl) {
    clientSlugEl.textContent = clientUrl.replace(/^https?:\/\//, "");
  }

  if (qrClientEl) {
    qrClientEl.textContent = clientName.toUpperCase();
  }

  /* Make the QR point to the permanent client URL. */
  window.ATELIER_MENU_URL = clientUrl;

  /* Update WhatsApp links to use the current client. */
  document.querySelectorAll('a[href*="wa.me/"]').forEach(function(link){
    const message = `Hi ${clientName}, I'd like to place an order from your digital menu.`;
    link.href = `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(message)}`;
  });
})();
