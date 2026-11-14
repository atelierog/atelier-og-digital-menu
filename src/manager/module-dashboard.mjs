const MODULE_GROUPS = [
  { title: "Restaurant operations", description: "Set up the menu, tables, and ordering.", codes: ["catalog", "ordering", "qr"] },
  { title: "Customers and growth", description: "Manage customers, inquiries, offers, and your digital page.", codes: ["customers", "inquiries", "offers", "digital_page"] },
  { title: "Insights and automation", description: "Review business activity and automate routine work.", codes: ["analytics", "automation"] },
];

export function groupManagerModules(modules = []) {
  const knownCodes = new Set(MODULE_GROUPS.flatMap(group => group.codes));
  const groups = MODULE_GROUPS
    .map(group => ({ ...group, modules: group.codes.flatMap(code => modules.filter(module => module.code === code)) }))
    .filter(group => group.modules.length);
  const otherModules = modules.filter(module => !knownCodes.has(module.code));
  if (otherModules.length) groups.push({ title: "Other modules", description: "Additional business tools.", modules: otherModules });
  return groups;
}

export function isManagerModuleAvailable(code) {
  return code === "catalog";
}

