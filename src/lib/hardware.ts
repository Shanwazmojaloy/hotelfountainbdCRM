// Server-side only — never import in browser bundles
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function getMacAddressWindows(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('getmac /fo csv /nh');
    const match = stdout.match(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/);
    return match ? match[0].toUpperCase() : null;
  } catch { return null; }
}

async function getMacAddressUnix(): Promise<string | null> {
  try {
    const cmd = process.platform === 'darwin'
      ? "ifconfig | grep ether | head -1 | awk '{print $2}'"
      : "cat /sys/class/net/$(ls /sys/class/net | grep -v lo | head -1)/address";
    const { stdout } = await execAsync(cmd);
    return stdout.trim() ? stdout.trim().toUpperCase() : null;
  } catch { return null; }
}

async function getMotherboardUUIDWindows(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('wmic csproduct get uuid');
    const lines = stdout.trim().split('\n').filter(Boolean);
    const uuid = lines[lines.length - 1]?.trim();
    return uuid && uuid !== 'UUID' ? uuid.toUpperCase() : null;
  } catch { return null; }
}

async function getMotherboardUUIDUnix(): Promise<string | null> {
  try {
    const cmd = process.platform === 'darwin'
      ? "system_profiler SPHardwareDataType | grep 'Hardware UUID' | awk '{print $NF}'"
      : 'sudo dmidecode -s system-uuid 2>/dev/null || cat /sys/class/dmi/id/product_uuid 2>/dev/null';
    const { stdout } = await execAsync(cmd);
    return stdout.trim() ? stdout.trim().toUpperCase() : null;
  } catch { return null; }
}

export interface HardwareIds {
  macAddress: string | null;
  motherboardUUID: string | null;
}

export async function getHardwareIds(): Promise<HardwareIds> {
  const isWindows = process.platform === 'win32';
  const [macAddress, motherboardUUID] = await Promise.all([
    isWindows ? getMacAddressWindows() : getMacAddressUnix(),
    isWindows ? getMotherboardUUIDWindows() : getMotherboardUUIDUnix(),
  ]);
  return { macAddress, motherboardUUID };
}

export function buildDeviceFingerprint(ids: HardwareIds): string {
  return `${ids.macAddress ?? 'UNKNOWN'}::${ids.motherboardUUID ?? 'UNKNOWN'}`;
}
