export const NUMBER_TYPES = [
  'i8', 'i16', 'i32', 'i64',
  'u8', 'u16', 'u32', 'u64',
  'f32', 'f64',
  'd8', 'd16', 'd32', 'd64',
] as const;

export type NumberType = typeof NUMBER_TYPES[number];
