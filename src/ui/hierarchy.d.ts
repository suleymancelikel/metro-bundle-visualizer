export type Category = 'app' | 'react-native' | 'babel' | 'scoped' | 'other';

export interface HierarchyNode {
  name: string;
  size?: number;
  children: HierarchyNode[];
  files?: Array<{ path: string; size: number; package: string }>;
  _isCategory?: boolean;
  _isPackage?: boolean;
  _isOther?: boolean;
  _pkg?: string;
  _groupedPackages?: HierarchyNode[];
}

export function categoryOf(name: string): Category;

export function buildHierarchy(stats: { modules: Array<{ path: string; size: number; package: string }> }): HierarchyNode;

export interface Hierarchy {
  categoryOf: typeof categoryOf;
  buildHierarchy: typeof buildHierarchy;
}

declare global {
  interface Window {
    MBV_HIERARCHY?: Hierarchy;
  }
}
