/**
 * Google Sheets, live. A service account with read access to the Master
 * Sheet (and the Maintenance Sheet when one is configured). Column names
 * are matched by header, case-insensitively, with defaults below; override
 * with MASTER_SHEET_HEADERS / MAINTENANCE_SHEET_HEADERS as JSON maps.
 */
import { google } from "googleapis";
import type { MaintenanceSheetRow, MasterSheetRow } from "../types";

export const MASTER_HEADER_DEFAULTS: Record<keyof MasterSheetRow, string[]> = {
  propertyName: ["property name", "property", "name"],
  address: ["address", "property address"],
  ownerName: ["owner name", "owner"],
  ownerEmail: ["owner email", "email"],
  ownerPhone: ["owner phone", "phone", "mobile"],
  keyNumber: ["key number", "key no", "key #", "key"],
  buildingManager: ["building manager", "bm"],
  cleaner: ["cleaner", "cleaning company"],
  region: ["region", "area"],
  onboardDate: ["onboard date", "onboarded", "start date"],
  assignedPmEmail: ["assigned pm email", "pm email", "property manager", "pm"],
};

export const MAINTENANCE_HEADER_DEFAULTS: Record<keyof MaintenanceSheetRow, string[]> = {
  issueId: ["issue id", "id", "ref"],
  property: ["property", "property name", "address"],
  description: ["description", "issue", "details"],
  status: ["status"],
  created: ["created", "created at", "date"],
  updated: ["updated", "updated at", "last updated"],
};

type HeaderMap<T> = Record<keyof T, string[]>;

function envHeaders<T>(name: string, defaults: HeaderMap<T>): HeaderMap<T> {
  const raw = process.env[name];
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof T, string | string[]>>;
    const out = { ...defaults };
    for (const k of Object.keys(parsed) as (keyof T)[]) {
      const v = parsed[k];
      if (typeof v === "string") out[k] = [v.toLowerCase(), ...defaults[k]];
      else if (Array.isArray(v)) out[k] = [...v.map((x) => x.toLowerCase()), ...defaults[k]];
    }
    return out;
  } catch {
    return defaults;
  }
}

/** Turns a header row plus data rows into objects using the header map. Pure. */
export function rowsToObjects<T extends Record<string, string | null>>(
  values: string[][],
  map: HeaderMap<T>,
): T[] {
  if (!values.length) return [];
  const header = values[0].map((h) => (h ?? "").trim().toLowerCase());
  const index: Partial<Record<keyof T, number>> = {};
  for (const key of Object.keys(map) as (keyof T)[]) {
    for (const candidate of map[key]) {
      const i = header.indexOf(candidate.toLowerCase());
      if (i >= 0 && !Object.values(index).includes(i)) {
        index[key] = i;
        break;
      }
    }
  }
  const out: T[] = [];
  for (const row of values.slice(1)) {
    if (!row.some((c) => (c ?? "").trim())) continue;
    const obj: Record<string, string | null> = {};
    for (const key of Object.keys(map) as (keyof T)[]) {
      const i = index[key];
      const v = i === undefined ? null : (row[i] ?? "").trim();
      obj[key as string] = v ? v : null;
    }
    out.push(obj as T);
  }
  return out;
}

function sheetsClient() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!b64) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not set");
  const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as { client_email: string; private_key: string };
  const auth = new google.auth.JWT({
    email: json.client_email,
    key: json.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

async function readRange(spreadsheetId: string, range: string): Promise<string[][]> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values ?? []).map((row) => row.map((c) => (c === null || c === undefined ? "" : String(c))));
}

export async function readMasterRows(): Promise<MasterSheetRow[]> {
  const id = process.env.MASTER_SHEET_ID;
  if (!id) throw new Error("MASTER_SHEET_ID is not set");
  const values = await readRange(id, process.env.MASTER_SHEET_RANGE ?? "A:Z");
  const rows = rowsToObjects<Record<keyof MasterSheetRow, string | null>>(values, envHeaders("MASTER_SHEET_HEADERS", MASTER_HEADER_DEFAULTS));
  return rows
    .filter((r) => r.ownerName && (r.propertyName || r.address))
    .map((r) => ({
      propertyName: r.propertyName ?? r.address ?? "",
      address: r.address ?? r.propertyName ?? "",
      ownerName: r.ownerName ?? "",
      ownerEmail: r.ownerEmail,
      ownerPhone: r.ownerPhone,
      keyNumber: r.keyNumber,
      buildingManager: r.buildingManager,
      cleaner: r.cleaner,
      region: r.region,
      onboardDate: r.onboardDate,
      assignedPmEmail: r.assignedPmEmail,
    }));
}

export function hasMaintenanceSheet(): boolean {
  return Boolean(process.env.MAINTENANCE_SHEET_ID);
}

export async function readMaintenanceRows(): Promise<MaintenanceSheetRow[]> {
  const id = process.env.MAINTENANCE_SHEET_ID;
  if (!id) return [];
  const values = await readRange(id, process.env.MAINTENANCE_SHEET_RANGE ?? "A:Z");
  const rows = rowsToObjects<Record<keyof MaintenanceSheetRow, string | null>>(
    values,
    envHeaders("MAINTENANCE_SHEET_HEADERS", MAINTENANCE_HEADER_DEFAULTS),
  );
  return rows
    .filter((r) => r.issueId && r.description)
    .map((r) => ({
      issueId: r.issueId ?? "",
      property: r.property ?? "",
      description: r.description ?? "",
      status: (r.status ?? "open").toLowerCase(),
      created: r.created,
      updated: r.updated,
    }));
}
