/** Lower-case, strip diacritics (ä->a, ü->u), ß->ss: "Kühlschrank" matches "kuhlschrank". */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss')
    .toLowerCase();
}
