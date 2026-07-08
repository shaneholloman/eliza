const GITHUB_LOG_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s+/;

function stripAnsi(input) {
  let result = "";
  for (let index = 0; index < input.length; index += 1) {
    if (input.charCodeAt(index) !== 27 || input[index + 1] !== "[") {
      result += input[index];
      continue;
    }

    index += 2;
    while (index < input.length) {
      const code = input.charCodeAt(index);
      if (code >= 64 && code <= 126) break;
      index += 1;
    }
  }
  return result;
}

function getSummaryLines(output) {
  return output
    .split(/\r?\n/)
    .map((line) => stripAnsi(line).replace(GITHUB_LOG_TIMESTAMP_PATTERN, ""));
}

export function getBunFailCounts(output) {
  return getSummaryLines(output)
    .map((line) => line.match(/^\s*(\d+)\s+fail\b/))
    .filter((match) => match !== null)
    .map((match) => Number(match[1]));
}

export function hasBunRunSummary(output) {
  return getSummaryLines(output).some((line) =>
    /^Ran \d+ tests? across \d+ files?\./.test(line),
  );
}

export function shouldNormalizeBunStatus99({ status, signal, output }) {
  if (status !== 99 || signal) return false;

  const failCounts = getBunFailCounts(output);
  if (failCounts.length === 0 || failCounts.some((count) => count !== 0)) {
    return false;
  }

  return hasBunRunSummary(output);
}
