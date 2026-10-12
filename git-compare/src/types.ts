export type Endpoint = { kind: 'revision'; ref: string } | { kind: 'working' } | { kind: 'index' };

export type ResolvedEndpoint =
  | { kind: 'commit'; ref: string; oid: string; label: string }
  | { kind: 'working'; label: string }
  | { kind: 'index'; label: string };

export interface Repository {
  path: string;
  name: string;
  scope?: string;
}

export type ChangeStatus = 'A' | 'D' | 'M' | 'R' | 'C' | 'T' | 'U';

export interface ChangedFile {
  path: string;
  status: ChangeStatus;
  basePath?: string;
  targetPath?: string;
  untracked?: boolean;
}

export interface ComparisonResult {
  base: ResolvedEndpoint;
  target: ResolvedEndpoint;
  files: ChangedFile[];
}

export interface SavedComparison {
  id: string;
  repository: Repository;
  base: Endpoint;
  target: Endpoint;
  pinned: boolean;
  filter: string;
}

export interface Comparison extends SavedComparison {
  state: 'loading' | 'ready' | 'error';
  result?: ComparisonResult;
  error?: string;
  generation: number;
}

export interface CompareArgs {
  repoPath: string;
  base: string;
  target: string;
  scope?: string;
}

export const statusNames: Record<ChangeStatus, string> = {
  A: 'Added',
  D: 'Deleted',
  M: 'Modified',
  R: 'Renamed',
  C: 'Copied',
  T: 'Type changed',
  U: 'Unmerged',
};

export function endpointLabel(endpoint: Endpoint): string {
  return endpoint.kind === 'revision'
    ? endpoint.ref
    : endpoint.kind === 'working'
      ? 'Working Tree'
      : 'Index';
}

export function endpointFromInput(value: string): Endpoint {
  if (value === ':working') return { kind: 'working' };
  if (value === ':index') return { kind: 'index' };
  if (!value.trim()) throw new Error('Enter a Git reference.');
  return { kind: 'revision', ref: value.trim() };
}

export function matchesFilter(file: ChangedFile, filter: string): boolean {
  const terms = filter.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text =
    `${file.path}\n${file.basePath ?? ''}\n${statusNames[file.status]}`.toLocaleLowerCase();
  return terms.every((term) => text.includes(term));
}
