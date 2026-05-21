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

export interface FilterSummary {
  visiblePackages: number;
  groupedPackages: number;
  hiddenCategories: number;
  totalPackages: number;
}

export function applyFilters(tree: HierarchyNode, opts: { minSize?: number; hiddenCategories?: string[] }): HierarchyNode & { _summary: FilterSummary };

export interface Hierarchy {
  categoryOf: typeof categoryOf;
  buildHierarchy: typeof buildHierarchy;
  applyFilters: typeof applyFilters;
}

declare global {
  interface Window {
    MBV_HIERARCHY?: Hierarchy;
  }
}
