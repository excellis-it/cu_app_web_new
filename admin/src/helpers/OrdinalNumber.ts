export default function getOrdinalNumber(number:any) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = number % 100;
  return number + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}
