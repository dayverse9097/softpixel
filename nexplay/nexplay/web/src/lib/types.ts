// Shapes returned by the NEXPLAY API (see server/src/serialize.ts).

export interface Control {
  input: string;
  action: string;
}

export interface GameSummary {
  slug: string;
  title: string;
  description: string;
  category: string;
  featured: boolean;
  publishedAt: string | null;
  coverUrl: string | null;
}

export interface GameDetail extends GameSummary {
  instructions: string;
  controls: Control[];
  version: string | null;
  playUrl: string | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Category {
  name: string;
  count: number;
}

export type GameStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface AdminGame {
  id: string;
  slug: string;
  title: string;
  description: string;
  instructions: string;
  category: string;
  controls: Control[];
  featured: boolean;
  status: GameStatus;
  hasCover: boolean;
  currentVersionId: string | null;
  currentVersion: string | null;
  versionCount?: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface VersionSummary {
  id: string;
  version: string;
  fileCount: number;
  totalBytes: number;
  scanned: boolean;
  createdAt: string;
}

export interface AdminGameDetail extends AdminGame {
  versions: VersionSummary[];
}

export interface GameInput {
  title: string;
  slug?: string;
  description: string;
  instructions: string;
  category: string;
  controls: Control[];
  featured: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  role: 'ADMIN';
  totpEnabled: boolean;
}

export interface StatsItem {
  slug: string | null;
  title: string | null;
  launches: number;
}

export interface AuditEvent {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  actor: string | null;
}

export interface GameQuery {
  q?: string;
  category?: string;
  sort?: 'new' | 'title';
  page?: number;
  pageSize?: number;
  featured?: boolean;
}
