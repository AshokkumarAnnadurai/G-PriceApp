import { ItemPriceHistory } from '../types';

export interface MonthDef {
  name: string;
  monthIdx: number;
  year: number;
}

export interface QuarterDef {
  quarterStr: string;
  year: number;
  qIndex: number;
  revisionStr: string;
  months: MonthDef[];
}

export interface MonthRangeDef {
  name: string;          // e.g. "Dec-25", "Jan-26"
  fullName: string;      // e.g. "December 2025"
  monthIdx: number;      // 0-11 (0 = Jan, 11 = Dec)
  year: number;          // 2025
  yearMonthVal: number;  // e.g. 202511 for Dec 2025
  monthKey: string;      // "2025-12"
}

export const getMonthShortName = (monthIdx: number): string => {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][monthIdx];
};

export const getMonthFullName = (monthIdx: number): string => {
  return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][monthIdx];
};

export const getYearMonthVal = (dateStr: string | Date | null | undefined): number => {
  if (!dateStr) return 0;
  if (typeof dateStr === 'string') {
    const s = dateStr.trim();
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10) - 1; // 0-indexed month (0 = Jan, 11 = Dec)
      return y * 100 + m;
    }
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return d.getUTCFullYear() * 100 + d.getUTCMonth();
};

export const getMonthsRangeData = (
  fromYear: number,
  fromMonthIdx: number, // 0-11
  toYear: number,
  toMonthIdx: number   // 0-11
): MonthRangeDef[] => {
  const result: MonthRangeDef[] = [];
  let y = fromYear;
  let m = fromMonthIdx;

  let startVal = fromYear * 100 + fromMonthIdx;
  let endVal = toYear * 100 + toMonthIdx;

  if (startVal > endVal) {
    // If from is after to, fall back to single month
    y = toYear;
    m = toMonthIdx;
    startVal = endVal;
  }

  let safety = 0;
  while (safety < 60) { // Cap at 60 months (5 years)
    const val = y * 100 + m;
    if (val > endVal) break;

    const yy = y.toString().slice(-2);
    const shortName = `${getMonthShortName(m)}-${yy}`;
    const fullName = `${getMonthFullName(m)} ${y}`;
    const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;

    result.push({
      name: shortName,
      fullName,
      monthIdx: m,
      year: y,
      yearMonthVal: val,
      monthKey,
    });

    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
    safety++;
  }

  return result;
};

export const getForwardQuartersData = (
  startYear: number,
  startQIndex: number,
  endYear?: number,
  endQIndex?: number
): QuarterDef[] => {
  const now = new Date();
  const targetEndYear = endYear || now.getFullYear();
  const targetEndQIndex = endQIndex || (Math.floor(now.getMonth() / 3) + 1);

  const quarters: QuarterDef[] = [];
  let currentYear = startYear;
  let currentQ = startQIndex;

  while (
    currentYear < targetEndYear ||
    (currentYear === targetEndYear && currentQ <= targetEndQIndex)
  ) {
    const yy = currentYear.toString().slice(-2);
    const startMonth = (currentQ - 1) * 3;
    const months = [
      { name: `${getMonthShortName(startMonth)}-${yy}`, monthIdx: startMonth, year: currentYear },
      { name: `${getMonthShortName(startMonth + 1)}-${yy}`, monthIdx: startMonth + 1, year: currentYear },
      { name: `${getMonthShortName(startMonth + 2)}-${yy}`, monthIdx: startMonth + 2, year: currentYear },
    ];
    quarters.push({
      quarterStr: `Quarter ${currentQ}`,
      year: currentYear,
      qIndex: currentQ,
      revisionStr: `MMR/ Revision Quarter ${currentQ} ${currentYear}`,
      months,
    });

    currentQ++;
    if (currentQ > 4) {
      currentQ = 1;
      currentYear++;
    }
  }

  return quarters;
};

export const getQuartersData = (startYear?: number, startQuarter?: number): QuarterDef[] => {
  const quarters: QuarterDef[] = [];
  const d = new Date();
  if (startYear && startQuarter) {
    const month = (startQuarter * 3) - 1;
    d.setFullYear(startYear);
    d.setMonth(month);
  }
  for (let i = 0; i < 4; i++) {
    const qIndex = Math.floor(d.getMonth() / 3) + 1;
    const year = d.getFullYear();
    const yy = year.toString().slice(-2);
    const startMonth = (qIndex - 1) * 3;
    const months = [
      { name: `${getMonthShortName(startMonth)}-${yy}`, monthIdx: startMonth, year },
      { name: `${getMonthShortName(startMonth + 1)}-${yy}`, monthIdx: startMonth + 1, year },
      { name: `${getMonthShortName(startMonth + 2)}-${yy}`, monthIdx: startMonth + 2, year },
    ];
    quarters.push({ quarterStr: `Quarter ${qIndex}`, year, qIndex, revisionStr: `MMR/ Revision Quarter ${qIndex} ${year}`, months });
    d.setMonth(d.getMonth() - 3);
  }
  return quarters.reverse();
};
