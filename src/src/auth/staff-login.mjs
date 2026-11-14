export function normalizeStaffLoginId(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function isValidStaffLoginId(value) {
  const id=normalizeStaffLoginId(value);
  return /^(?:(?:OT|BC)-[A-Z0-9]{8}|[A-Z][A-Z0-9]{0,23})$/.test(id);
}

export function staffAuthEmail(value) {
  const id = normalizeStaffLoginId(value);
  if (!isValidStaffLoginId(id)) return null;
  return `staff-${id.toLowerCase().replace(/[^a-z0-9]/g, "")}@staff.digitalvision.invalid`;
}
