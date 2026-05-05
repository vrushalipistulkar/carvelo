import { readBlockConfig, createLumaProductImagePicture } from "../../scripts/aem.js";
import { isAuthorEnvironment, normalizeCategoryValue } from "../../scripts/scripts.js";
import { dispatchCustomEvent } from "../../scripts/custom-events.js";
import { getEnvironmentValue, getHostname } from "../../scripts/utils.js";

const AUTHOR_PRODUCTS_ENDPOINT = "/graphql/execute.json/dsn-eds-configuration/productsListByPath;";
const PUBLISH_GRAPHQL_PROXY_ENDPOINT = "https://275323-918sangriatortoise.adobeioruntime.net/api/v1/web/dx-excshell-1/fetch-product-information";
const PUBLISH_PRODUCTS_ENDPOINT_KEY = "productsListByPath";
let categoryProductsAuthorBasePromise;
let categoryProductsPublishEnvironmentPromise;

async function getCategoryProductsAuthorBase() {
  if (!categoryProductsAuthorBasePromise) {
    categoryProductsAuthorBasePromise = getHostname()
      .then((hostname) => (hostname || window.location.origin || "").replace(/\/$/, ""))
      .catch(() => (window.location.origin || "").replace(/\/$/, ""));
  }
  return categoryProductsAuthorBasePromise;
}

async function getCategoryProductsPublishEnvironment() {
  if (!categoryProductsPublishEnvironmentPromise) {
    categoryProductsPublishEnvironmentPromise = getEnvironmentValue().catch(() => undefined);
  }
  return categoryProductsPublishEnvironmentPromise;
}

function buildCard(item, isAuthor, enableAddToCart = false, addToCartEventType = '') {
  const { id, sku, name, damImageURL = {}, category = [], price, description = {} } = item || {};
  const productId = sku || id || "";

  const wrapper = document.createElement("div");
  wrapper.className = "cpl-card-wrapper";

  const card = document.createElement("article");
  card.className = "cpl-card";

  if (productId) {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      const currentPath = window.location.pathname;
      const basePath = currentPath.substring(0, currentPath.lastIndexOf("/"));
      const productPath = isAuthor
        ? `${basePath}/product.html`
        : `${basePath}/product`;
      window.location.href = `${productPath}?productId=${encodeURIComponent(productId)}`;
    });
  }

  let picture = null;
  if (damImageURL && (damImageURL._dynamicUrl || damImageURL._publishUrl || damImageURL._authorUrl)) {
    picture = createLumaProductImagePicture(damImageURL, name || "Product image", {
      isAuthor,
      eager: false,
    });
  }

  const imgWrap = document.createElement("div");
  imgWrap.className = "cpl-card-media";
  if (picture) imgWrap.append(picture);

  const meta = document.createElement("div");
  meta.className = "cpl-card-meta";
  const cat = document.createElement("p");
  cat.className = "cpl-card-category";
  cat.textContent = category
    .map((catValue) => normalizeCategoryValue(catValue).replace(/\//g, " / "))
    .filter(Boolean)
    .join(" / ");
  const title = document.createElement("h3");
  title.className = "cpl-card-title";
  title.textContent = name || "";
  meta.append(cat, title);

  card.append(imgWrap, meta);
  wrapper.append(card);

  if (enableAddToCart && productId) {
    const formattedCategory = category
      .map((catValue) => normalizeCategoryValue(catValue).replace(/\//g, " / "))
      .join(", ");
    const cartImageUrl = isAuthor ? damImageURL?._authorUrl : damImageURL?._publishUrl;

    const addToCartBtn = document.createElement("button");
    addToCartBtn.className = "cpl-card-add-to-cart";
    addToCartBtn.textContent = "Add to Cart";
    addToCartBtn.setAttribute("aria-label", `Add ${name} to cart`);
    addToCartBtn.addEventListener("click", () => {
      window.addToCart({
        id: id || sku || "",
        name: name || "",
        image: cartImageUrl || "",
        thumbnail: cartImageUrl || "",
        category: formattedCategory,
        description: description?.html || description?.markdown || "",
        price: price || 0,
        quantity: 1,
      });
      if (addToCartEventType) dispatchCustomEvent(addToCartEventType);
      addToCartBtn.textContent = "Added to Cart ✓";
      addToCartBtn.classList.add("cpl-card-add-to-cart--added");
      setTimeout(() => {
        addToCartBtn.textContent = "Add to Cart";
        addToCartBtn.classList.remove("cpl-card-add-to-cart--added");
      }, 2000);
    });
    wrapper.append(addToCartBtn);
  }

  return wrapper;
}

async function fetchProducts(path) {
  try {
    if (!path) return [];

    const isAuthor = isAuthorEnvironment();
    const authorBase = await getCategoryProductsAuthorBase();
    const environment = await getCategoryProductsPublishEnvironment();
    const url = isAuthor
      ? `${authorBase}${AUTHOR_PRODUCTS_ENDPOINT}_path=${path}`
      : `${PUBLISH_GRAPHQL_PROXY_ENDPOINT}?endpoint=${PUBLISH_PRODUCTS_ENDPOINT_KEY}${environment ? `&environment=${environment}` : ''}&_path=${path}`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    const json = await resp.json();
    return json?.data?.productModelList?.items || [];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Category Products Lister: fetch error", e);
    return [];
  }
}

function filterByCategories(items, tags) {
  if (!tags) return items;
  const filterList = (Array.isArray(tags) ? tags : `${tags}`.split(','))
    .map((t) => normalizeCategoryValue(`${t}`.trim()).toLowerCase())
    .filter(Boolean);
  if (!filterList.length) return items;
  return items.filter((item) =>
    (item.category || []).some((cat) => {
      const normalized = normalizeCategoryValue(cat).toLowerCase();
      return filterList.some((tag) => normalized.includes(tag) || tag.includes(normalized));
    })
  );
}

function coerceConfigScalar(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return coerceConfigScalar(v[0]);
  return String(v).trim();
}

function readCardsPerRow(cfg, block) {
  const raw = coerceConfigScalar(cfg?.["cards-per-row"]);
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(6, Math.max(1, n));
}

function renderHeader(container, selectedTags) {
  if (!selectedTags || selectedTags.length === 0) return;
  const wrap = document.createElement("div");
  wrap.className = "cpl-tags";
  const list = Array.isArray(selectedTags)
    ? selectedTags
    : `${selectedTags}`.split(",");
  list
    .map((t) => `${t}`.trim())
    .filter(Boolean)
    .forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "cpl-tag";
      chip.textContent = tag;
      wrap.append(chip);
    });
  container.append(wrap);
}

export default async function decorate(block) {
  // Check if we're in author environment
  const isAuthor = isAuthorEnvironment();

  // Extract folder path from Universal Editor authored markup
  let folderHref =
    block.querySelector("a[href]")?.href ||
    block.querySelector("a[href]")?.textContent?.trim() ||
    "";

  const cfg = readBlockConfig(block) || {};
  if (!folderHref) {
    folderHref = cfg?.folder || cfg?.reference || cfg?.path || "";
  }

  const styleVariant = coerceConfigScalar(cfg?.style);
  if (styleVariant) block.classList.add(styleVariant);

  const noBackground = coerceConfigScalar(cfg?.["no-background"]);
  if (noBackground === "true") block.classList.add("no-background");

  // Normalize folder path to pathname if an absolute URL is provided
  try {
    if (folderHref && folderHref.startsWith("http")) {
      const u = new URL(folderHref);
      folderHref = u.pathname;
    }
  } catch (e) {
    /* ignore */
  }

  // Remove .html extension if present (Universal Editor adds it)
  if (folderHref && folderHref.endsWith(".html")) {
    folderHref = folderHref.replace(/\.html$/, "");
  }

  // Extract tags - for Universal Editor they'll be in data attributes
  const tags = block.dataset?.["cqTags"]
    || cfg?.tags
    || cfg?.["cq-tags"]
    || cfg?.["cq:tags"]
    || "";

  const cardsPerRow = readCardsPerRow(cfg, block);

  const enableAddToCart = (() => {
    const raw = coerceConfigScalar(cfg?.["enableaddtocartattileview"]);
    return raw.toLowerCase() === "true";
  })();

  const addToCartEventType = enableAddToCart ? (coerceConfigScalar(cfg?.["addtocarteventtype"])) : '';

  // Clear author table
  block.innerHTML = "";

  renderHeader(block, tags);

  const grid = document.createElement("div");
  grid.className = "cpl-grid";
  grid.style.setProperty("--cpl-columns", cardsPerRow);
  block.append(grid);

  const allItems = await fetchProducts(folderHref);
  const items = filterByCategories(allItems, tags);
  if (!items || items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "cpl-empty";
    empty.textContent = "No products found.";
    grid.append(empty);
    return;
  }

  const cards = items.map((item) => buildCard(item, isAuthor, enableAddToCart, addToCartEventType));
  grid.append(...cards);
}
