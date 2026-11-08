export function isSixDigitPassword(value) {
  return typeof value === "string" && /^[0-9]{6}$/.test(value);
}

