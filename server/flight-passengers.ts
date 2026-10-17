/** Read the passenger list in a Google Flights public search link. Never rewrite it. */
export function linkedAdults(value: string | undefined): number | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!/(^|\.)google\.com$/i.test(url.hostname)) return undefined;
    const encoded = url.searchParams.get('tfs');
    if (!encoded || encoded.length > 16_000) return undefined;
    const bytes = Buffer.from(encoded, 'base64url');
    let offset = 0;
    const passengers: number[] = [];
    const integer = () => {
      let result = 0, shift = 0;
      while (offset < bytes.length && shift < 49) {
        const next = bytes[offset++];
        result += (next & 127) * 2 ** shift;
        if (!(next & 128)) return result;
        shift += 7;
      }
      throw new Error('Invalid public link');
    };
    while (offset < bytes.length) {
      const tag = integer(), field = Math.floor(tag / 8), wire = tag % 8;
      if (wire === 0) {
        const item = integer();
        if (field === 8) passengers.push(item);
      } else if (wire === 2) {
        const length = integer(), end = offset + length;
        if (end > bytes.length) return undefined;
        if (field === 8) while (offset < end) passengers.push(integer());
        else offset = end;
        if (offset !== end) return undefined;
      } else if (wire === 1 || wire === 5) offset += wire === 1 ? 8 : 4;
      else return undefined;
      if (offset > bytes.length) return undefined;
    }
    return passengers.length ? passengers.filter(type => type === 1).length : undefined;
  } catch { return undefined; }
}
