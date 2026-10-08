// GST state / UT codes — the first two digits of a GSTIN — keyed by lower-case name.
// Used by the printed invoice, which shows "State Code" next to the state.
const STATE_CODES = {
  "jammu and kashmir": "01",
  "himachal pradesh": "02",
  "punjab": "03",
  "chandigarh": "04",
  "uttarakhand": "05",
  "uttaranchal": "05",
  "haryana": "06",
  "delhi": "07",
  "rajasthan": "08",
  "uttar pradesh": "09",
  "bihar": "10",
  "sikkim": "11",
  "arunachal pradesh": "12",
  "nagaland": "13",
  "manipur": "14",
  "mizoram": "15",
  "tripura": "16",
  "meghalaya": "17",
  "assam": "18",
  "west bengal": "19",
  "jharkhand": "20",
  "odisha": "21",
  "orissa": "21",
  "chhattisgarh": "22",
  "madhya pradesh": "23",
  "gujarat": "24",
  "dadra and nagar haveli and daman and diu": "26",
  "daman and diu": "26",
  "dadra and nagar haveli": "26",
  "maharashtra": "27",
  "karnataka": "29",
  "goa": "30",
  "lakshadweep": "31",
  "kerala": "32",
  "tamil nadu": "33",
  "puducherry": "34",
  "pondicherry": "34",
  "andaman and nicobar islands": "35",
  "telangana": "36",
  "andhra pradesh": "37",
  "ladakh": "38",
};

// A GSTIN, when present, is the authority on the state code; otherwise fall back
// to the state name. Returns "" when neither identifies a state.
export function stateCodeFor(stateName, gstin) {
  const fromGstin = String(gstin || "").trim().slice(0, 2);
  if (/^\d{2}$/.test(fromGstin)) return fromGstin;
  const key = String(stateName || "").toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ").trim();
  return STATE_CODES[key] || "";
}
