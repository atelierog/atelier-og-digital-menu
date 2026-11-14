export function resolvePortal(role) {
  if (role === "admin") return "super_admin";
  if (role === "manager") return "manager";
  if (role === "order_taker") return "order_taker";
  if (role === "bill_counter") return "bill_counter";
  return "workspace";
}
