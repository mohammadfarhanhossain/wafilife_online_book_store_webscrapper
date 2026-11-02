import { randomBytes } from "node:crypto";

/** Generates an RFC 9562 UUIDv7 as a 16-byte MySQL BINARY value. */
export function createUuidV7(): Buffer {
  const value = randomBytes(16);
  const timestamp = BigInt(Date.now());

  for (let index = 5; index >= 0; index -= 1) {
    value[index] = Number(timestamp >> BigInt((5 - index) * 8)) & 0xff;
  }
  value[6] = 0x70 | (value[6] & 0x0f);
  value[8] = 0x80 | (value[8] & 0x3f);
  return value;
}

export function uuidBytesToHex(value: Buffer): string {
  const hex = value.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
