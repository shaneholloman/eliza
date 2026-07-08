export function getBunFailCounts(output) {
  return [...output.matchAll(/(?:^|\n)\s+(\d+)\s+fail\b/g)].map((match) =>
    Number(match[1]),
  );
}

export function hasBunRunSummary(output) {
  return /(?:^|\n)Ran \d+ tests? across \d+ files?\./.test(output);
}

export function shouldNormalizeBunStatus99({ status, signal, output }) {
  if (status !== 99 || signal) return false;

  const failCounts = getBunFailCounts(output);
  if (failCounts.length === 0 || failCounts.some((count) => count !== 0)) {
    return false;
  }

  return hasBunRunSummary(output);
}
