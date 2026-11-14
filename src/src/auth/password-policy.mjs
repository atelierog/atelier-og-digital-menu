export function isSixDigitPassword(value) {
  return typeof value === "string" && /^[0-9]{6}$/.test(value);
}

export function isStaffPassword(value) {
  return typeof value === "string" && value.length >= 6 && value.length <= 72;
}
