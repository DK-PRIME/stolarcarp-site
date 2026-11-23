"use strict";

const project = "stolar-carp";
const endpoint = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const ttl = 3600;
let cached;
let refresh;

function decode(value) {
  if ("mapValue" in value) return decodeFields(value.mapValue.fields);
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
  if ("integerValue" in value) return Number(value.integerValue);
  if ("nullValue" in value) return null;
  return Object.values(value)[0];
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}

async function request(path, options) {
  const response = await fetch(endpoint + path, {
    ...options, signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    const error = new Error(`Firestore ${response.status}: ${path.split("?")[0]}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function publicFields(data, fields) {
  return Object.fromEntries(fields.filter(key => key in data).map(key => [key, data[key]]));
}

async function build() {
  const documents = Object.create(null);
  let limited = false;
  const store = (doc, project = data => data) => {
    if (!doc) return "";
    const path = doc.name.split("/documents/")[1];
    documents[path] = project(decodeFields(doc.fields));
    return path.split("/").at(-1);
  };
  async function optional(action) {
    try { return await action(); }
    catch (error) {
      if (error.status !== 404) {
        limited = true;
        console.warn(error.message);
      }
      return null;
    }
  }
  async function list(path, project) {
    let pageToken;
    const ids = [];
    do {
      const query = new URLSearchParams({ pageSize: "100" });
      if (pageToken) query.set("pageToken", pageToken);
      const page = await request(`/${path}?${query}`);
      for (const doc of page.documents || []) ids.push(store(doc, project));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return ids;
  }

  const identities = await Promise.all([
    list("seasonRating"),
    list("seasonArchives"),
    optional(() => list("historicalSectorResults", () => ({})))
  ]);
  const settings = await optional(() => request("/settings/app"));
  store(settings, data => publicFields(data, [
    "activeSeasonYear", "currentSeasonYear", "seasonYear", "year", "activeCompetitionId"
  ]));
  const competitions = new Set([documents["settings/app"]?.activeCompetitionId].filter(Boolean));
  const years = new Set(["2026", ...identities.flatMap(ids => ids || []).filter(id => /^20\d{2}$/.test(id))]);
  for (const year of years) {
    const stagesPath = `seasonResults/${year}/stages`;
    const stageIds = await list(stagesPath);
    await Promise.all(stageIds.map(async id => {
      const stage = documents[`${stagesPath}/${id}`];
      if (stage.compId) competitions.add(stage.compId);
      if (!Array.isArray(stage.standings) || stage.lakeId && stage.lakeId !== "lelehivka") return;
      if (stage.standings.every(row => row?.lakeSectorNumber && (row.lakeId || stage.lakeId))) return;
      store(await optional(() => request(`/sectorMaps/${year}/stages/${encodeURIComponent(id)}`)), data =>
        publicFields(data, ["lakeId", "status", "sourcePath", "sourceSignature", "emptyLakeSectors", "assignments"]));
    }));
    const history = await optional(() => request(`/historicalSectorResults/${year}:runQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: "tournaments" }],
        where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "ready" } } }
      } })
    }));
    for (const result of history || []) store(result.document, data =>
      publicFields(data, ["status", "title", "lakeId", "startDate", "results"]));
  }

  await Promise.all([...competitions].map(async id => {
    const doc = await optional(() => request(`/competitions/${encodeURIComponent(id)}`));
    store(doc, data => {
      const keys = ["startDate", "startAt", "type", "seasonYear", "year"];
      const projectDates = row => ({
        ...publicFields(row, keys),
        ...(row.schedule ? { schedule: publicFields(row.schedule, ["startAt", "startDate"]) } : {})
      });
      return {
        ...projectDates(data),
        events: Array.isArray(data.events) ? data.events.map(event => ({
          ...projectDates(event), ...publicFields(event, ["key", "stageId", "id"])
        })) : []
      };
    });
  }));
  return { generatedAt: new Date().toISOString(), limited, documents };
}

exports.handler = async event => {
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: { Allow: "GET" } };
  try {
    if (!cached || Date.now() - cached.at >= ttl * 1000) {
      refresh ||= build().then(data => {
        cached = { at: Date.now(), body: JSON.stringify(data) };
      }).finally(() => { refresh = null; });
      await refresh;
    }
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=900",
        "Netlify-CDN-Cache-Control": `public, max-age=${ttl}, stale-while-revalidate=86400, durable`
      },
      body: cached.body
    };
  } catch (error) {
    console.error(error.message);
    return cached
      ? { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" }, body: cached.body }
      : { statusCode: 503, headers: { "Cache-Control": "no-store" }, body: "Archive temporarily unavailable" };
  }
};
