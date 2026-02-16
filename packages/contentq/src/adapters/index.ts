import { PlatformAdapter } from '../types';
import { linkedinAdapter } from './linkedin';

const adapters: Record<string, PlatformAdapter> = {
  linkedin: linkedinAdapter,
};

export function getAdapter(name: string): PlatformAdapter | undefined {
  return adapters[name];
}

export function listAdapters(): string[] {
  return Object.keys(adapters);
}
