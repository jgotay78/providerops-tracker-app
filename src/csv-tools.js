export const REQUIRED_IMPORT_COLUMNS = [
  "Provider Name",
  "NPI",
  "Provider Email",
  "Specialty",
  "Credential Type",
  "Credential Number",
  "State",
  "Issue Date",
  "Expiration Date",
  "Renewal Submitted",
  "Renewal Approved",
  "Owner",
  "Notes"
];

export function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function parseCsv(csvText) {
  const text = String(csvText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(value);
      value = "";
      continue;
    }

    if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cell) => String(cell).trim() !== "") || rows.length === 0) {
    rows.push(row);
  }

  return rows;
}

export function parseCsvRecords(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) {
    throw new Error("CSV file is empty.");
  }

  const headerRow = rows[0].map((header) => String(header || "").trim());
  const normalizedHeaderIndex = new Map();

  headerRow.forEach((header, index) => {
    normalizedHeaderIndex.set(normalizeHeader(header), index);
  });

  const missingColumns = REQUIRED_IMPORT_COLUMNS.filter(
    (column) => !normalizedHeaderIndex.has(normalizeHeader(column))
  );

  if (missingColumns.length) {
    throw new Error(`Missing required columns: ${missingColumns.join(", ")}`);
  }

  const dataRows = rows.slice(1).filter((cells) => cells.some((cell) => String(cell || "").trim() !== ""));

  const records = dataRows.map((cells) => {
    const getCell = (name) => {
      const index = normalizedHeaderIndex.get(normalizeHeader(name));
      return index === undefined ? "" : String(cells[index] || "").trim();
    };

    return {
      providerName: getCell("Provider Name"),
      providerId: getCell("NPI"),
      providerEmail: getCell("Provider Email"),
      specialty: getCell("Specialty"),
      credentialType: getCell("Credential Type"),
      credentialNumber: getCell("Credential Number"),
      state: getCell("State"),
      issueDate: getCell("Issue Date"),
      expirationDate: getCell("Expiration Date"),
      renewalSubmitted: getCell("Renewal Submitted"),
      renewalApproved: getCell("Renewal Approved") || "No",
      owner: getCell("Owner"),
      notes: getCell("Notes")
    };
  });

  return { records, missingColumns: [] };
}

export function createTemplateCsv() {
  const exampleRow = [
    "Avery Brooks",
    "1234567890",
    "avery.brooks@northstarhealth.org",
    "Cardiology",
    "DEA",
    "AB1234567",
    "TX",
    "02/12/2023",
    "05/17/2026",
    "04/22/2026",
    "No",
    "Maria Gomez",
    "Renewal in progress"
  ];

  const rows = [REQUIRED_IMPORT_COLUMNS, exampleRow];
  return rows
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}
