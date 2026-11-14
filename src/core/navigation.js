export function createNavigationController() {
  let epoch = 0;
  return {
    begin() { epoch += 1; return epoch; },
    isCurrent(requestEpoch) { return requestEpoch === epoch; },
    invalidate() { epoch += 1; return epoch; },
  };
}
