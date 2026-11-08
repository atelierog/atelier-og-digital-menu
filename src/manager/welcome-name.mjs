export function managerWelcomeName(membership, user) {
  const storedName = String(membership?.display_name ?? "").trim();
  if (storedName) return capitalizeName(storedName);

  const metadataName = String(user?.user_metadata?.display_name ?? "").trim();
  if (metadataName) return capitalizeName(metadataName);

  const emailName = String(user?.email ?? "").split("@")[0].replace(/[._-]+/g, " ").trim();
  if (emailName) return capitalizeName(emailName);
  return "Manager";
}

function capitalizeName(value) {
  return value.replace(/(^|\s)\p{L}/gu, letter => letter.toUpperCase());
}

