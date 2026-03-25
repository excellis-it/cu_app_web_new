import { monthLongNames } from "./constants";

export function dateFormateDMY(date: string | Date): string {
  date = new Date(date);
  const day = date.getDate();
  const month = monthLongNames[date.getMonth()];
  const year = date.getFullYear();

  // Add an ordinal indicator to the day
  const dayWithOrdinal = addOrdinalIndicator(day);

  // Format the date string
  const formattedDate = `${dayWithOrdinal} ${month} ${year}`;

  return formattedDate;
}

export function addOrdinalIndicator(day:any) {
  if (day >= 11 && day <= 13) {
    return `${day}${'th'}`;
  }
  switch (day % 10) {
    case 1:
      return `${day}${'st'}`;
    case 2:
      return `${day}${'nd'}`;
    case 3:
      return `${day}${'rd'}`;
    default:
      return `${day}${'th'}`;
  }
}

export function timeFormatHMSA(time24:string) {
  const [hours, minutes, seconds] = time24.split(':');
  let period = 'AM';

  let hours12 = parseInt(hours, 10);
  if (hours12 >= 12) {
    period = 'PM';
    if (hours12 > 12) {
      hours12 -= 12;
    }
  }
  if (hours12 === 0) {
    hours12 = 12; // 00:00 should be 12:00 AM in 12-hour format
  }

  const time12 = `${hours12}:${minutes}:${seconds} ${period}`;

  return time12;
}


export function dateFormatISO(date: string | Date) {
  date = new Date(date);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  const formattedDate = `${year} - ${month} - ${day}`;

  return formattedDate;
}