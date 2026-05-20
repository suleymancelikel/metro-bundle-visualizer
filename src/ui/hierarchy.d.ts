export function categoryOf(name: string): 'app' | 'react-native' | 'babel' | 'scoped' | 'other';

export interface Hierarchy {
  categoryOf: typeof categoryOf;
}

declare global {
  interface Window {
    MBV_HIERARCHY?: Hierarchy;
  }
}
