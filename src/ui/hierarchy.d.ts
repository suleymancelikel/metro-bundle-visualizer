export function categoryOf(name: string): 'app' | 'react-native' | 'babel' | 'scoped' | 'other';

export function buildHierarchy(stats: { modules: Array<{ path: string; size: number; package: string }> }): any;

export interface Hierarchy {
  categoryOf: typeof categoryOf;
  buildHierarchy: typeof buildHierarchy;
}

declare global {
  interface Window {
    MBV_HIERARCHY?: Hierarchy;
  }
}
