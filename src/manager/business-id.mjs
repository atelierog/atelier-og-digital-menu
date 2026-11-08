const MAX_BUSINESS_ID_LENGTH = 80;

export function createBusinessId(name, businesses = []) {
  const base = String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_BUSINESS_ID_LENGTH)
    .replace(/-+$/g, "") || "business";
  const used = new Set(businesses.map(item => String(item?.slug ?? "").toLowerCase()));
  if (!used.has(base)) return base;

  for (let suffixNumber = 2; ; suffixNumber += 1) {
    const suffix = `-${suffixNumber}`;
    const prefix = base.slice(0, MAX_BUSINESS_ID_LENGTH - suffix.length).replace(/-+$/g, "");
    const candidate = `${prefix}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

