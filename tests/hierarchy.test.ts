import { categoryOf } from '../src/ui/hierarchy';

describe('categoryOf', () => {
  it('classifies <app> as "app"', () => {
    expect(categoryOf('<app>')).toBe('app');
  });

  it('classifies react-native and @react-native/* as "react-native"', () => {
    expect(categoryOf('react-native')).toBe('react-native');
    expect(categoryOf('@react-native/virtualized-lists')).toBe('react-native');
  });

  it('classifies @babel/* as "babel"', () => {
    expect(categoryOf('@babel/runtime')).toBe('babel');
  });

  it('classifies other scoped packages as "scoped"', () => {
    expect(categoryOf('@sentry/react-native')).toBe('scoped');
  });

  it('classifies bare packages as "other"', () => {
    expect(categoryOf('lodash')).toBe('other');
    expect(categoryOf('react')).toBe('other');
  });

  it('falls back to "other" for empty/null', () => {
    expect(categoryOf('')).toBe('other');
    expect(categoryOf(null as unknown as string)).toBe('other');
  });
});
