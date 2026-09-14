const fs = require("fs");

const KMB_URL =
  "https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/CDDAA8DE60B4EA0E";

const CTB_URL =
  "https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/002453/117";

const TARGET_ROUTE = "117";
const TARGET_DESTINATION = "深水埗";

function parseEtaTime(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")");
}

function isTargetDestination(destination) {
  return cleanText(destination).includes(TARGET_DESTINATION);
}

function formatHHMM(date) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function normalizeItem(item, company) {
  if (!item) {
    return null;
  }

  if (String(item.route || "").trim() !== TARGET_ROUTE) {
    return null;
  }

  if (!isTargetDestination(item.dest_tc)) {
    return null;
  }

  const etaDate = parseEtaTime(item.eta);

  if (!etaDate) {
    return null;
  }

  return {
    company,
    route: TARGET_ROUTE,
    destination: item.dest_tc,
    time: etaDate.toISOString(),
    timeText: formatHHMM(etaDate)
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "117-eta-github-action"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }

  return response.json();
}

async function main() {
  const results = await Promise.allSettled([
    fetchJson(KMB_URL),
    fetchJson(CTB_URL)
  ]);

  const allItems = [];

  if (results[0].status === "fulfilled") {
    const kmbData = Array.isArray(results[0].value.data)
      ? results[0].value.data
      : [];

    allItems.push(
      ...kmbData
        .map(item => normalizeItem(item, "KMB"))
        .filter(Boolean)
    );
  }

  if (results[1].status === "fulfilled") {
    const ctbData = Array.isArray(results[1].value.data)
      ? results[1].value.data
      : [];

    allItems.push(
      ...ctbData
        .map(item => normalizeItem(item, "CTB"))
        .filter(Boolean)
    );
  }

  const now = Date.now();

  const nextBuses = allItems
    .filter(item => new Date(item.time).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(a.time).getTime() -
        new Date(b.time).getTime()
    )
    .slice(0, 2);

  const output = {
    route: TARGET_ROUTE,
    destination: TARGET_DESTINATION,
    updated: new Date().toISOString(),
    bus1: nextBuses[0]?.timeText || "--:--",
    bus2: nextBuses[1]?.timeText || "--:--",
    buses: nextBuses
  };

  fs.writeFileSync(
    "eta.json",
    JSON.stringify(output, null, 2) + "\n",
    "utf8"
  );

  console.log(output);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
