// Convert a number to Indian English words (e.g. "One Lakh Twenty Three Thousand Four Hundred Fifty Six Rupees Only")

const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n) {
  if (n < 20) return ones[n];
  return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let s = "";
  if (h) s += ones[h] + " Hundred";
  if (r) s += (h ? " " : "") + twoDigits(r);
  return s;
}

export function amountToWords(num) {
  const value = Math.abs(Number(num) || 0);
  let rupees = Math.floor(value);
  let paise = Math.round((value - rupees) * 100);
  if (paise === 100) { rupees += 1; paise = 0; }   // e.g. 10.996 -> 11 rupees, not "10 and 100 paise"
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";

  let result = "";
  let n = rupees;

  // Crores
  if (n >= 10000000) {
    result += threeDigits(Math.floor(n / 10000000)) + " Crore ";
    n = n % 10000000;
  }
  // Lakhs
  if (n >= 100000) {
    result += threeDigits(Math.floor(n / 100000)) + " Lakh ";
    n = n % 100000;
  }
  // Thousands
  if (n >= 1000) {
    result += threeDigits(Math.floor(n / 1000)) + " Thousand ";
    n = n % 1000;
  }
  // Hundreds + remainder
  if (n > 0) {
    result += threeDigits(n);
  }

  result = (result.trim() || "Zero") + " Rupees";
  if (paise > 0) {
    result += " and " + twoDigits(paise) + " Paise";
  }
  result += " Only";
  return result;
}