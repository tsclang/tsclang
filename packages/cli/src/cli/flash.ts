// Flash delivery config and the avrdude command line built from it
// (spec 13-build, "Поля build конфига → flash").

export interface FlashConfig {
  programmer: string;
  port: string;
  baud?: number;
  extraFlags?: string[];
}

// avrdude invocation for writing a hex image: -c programmer, -p mcu, -P port,
// optional -b baud and extraFlags, then the write target flash:w:<hex>:i.
export function buildAvrdudeArgs(flashCfg: FlashConfig, mcu: string, hexPath: string): string[] {
  return [
    '-c', flashCfg.programmer,
    '-p', mcu,
    '-P', flashCfg.port,
    ...(flashCfg.baud ? ['-b', String(flashCfg.baud)] : []),
    ...(flashCfg.extraFlags || []),
    '-U', `flash:w:${hexPath}:i`,
  ];
}
