export function canOpenBusinessWorkspace(isPlatformAdmin, businessStatus) {
  return isPlatformAdmin || businessStatus === "active";
}

