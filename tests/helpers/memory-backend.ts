/**
 * In-memory StorageBackend test double — 实现完整 KvUnit 原语集。
 *
 * 复制自 deepseek-harness `packages/storage/storage-domain/tests/helpers/memory-backend.ts`，
 * 供本项目导入 API 测试使用（不引入真实 json/sqlite backend，测试纯内存、无磁盘 IO）。
 *
 * 契约保真：version stamping + version-mismatch on reopen、per-call atomicity、
 * closed after close、delete idempotence。共享 MemoryMediaPool 模拟进程重启。
 */

import { StorageError } from "@deepseek-ai/dsh-storage";
import type {
  KvFacet,
  KvUnit,
  KvUnitDescriptor,
  StorageBackend,
} from "@deepseek-ai/dsh-storage";

/** One unit's medium: tables of records plus the global slot (`null` = never written). */
export interface MemoryMedium {
  tables: Map<string, Map<string, unknown>>;
  global: unknown;
}

/**
 * Shared media pool. Construct one and hand it to several
 * MemoryStorageBackend instances to simulate reopening the same
 * medium after a restart.
 */
export class MemoryMediaPool {
  readonly media = new Map<string, MemoryMedium>();
  readonly versions = new Map<string, number>();
  failNextWrites = 0;

  consumeInjectedFailure(): void {
    if (this.failNextWrites > 0) {
      this.failNextWrites -= 1;
      throw new Error("injected write failure");
    }
  }
}

/** In-memory KV unit over one pooled medium. */
class MemoryKvUnit implements KvUnit {
  private closed = false;

  constructor(
    private readonly pool: MemoryMediaPool,
    private readonly medium: MemoryMedium,
    private readonly descriptor: KvUnitDescriptor,
    private readonly onClose: () => void,
  ) {}

  private assertOpen(): void {
    if (this.closed) {
      throw new StorageError(
        "closed",
        `memory unit '${this.descriptor.name}' is closed`,
      );
    }
  }

  async loadAll(): Promise<{
    tables: Record<string, Record<string, unknown>>;
    global: unknown;
  }> {
    this.assertOpen();
    const tables: Record<string, Record<string, unknown>> = {};
    for (const table of this.descriptor.tables) {
      tables[table] = Object.fromEntries(this.medium.tables.get(table) ?? []);
    }
    return { tables, global: this.medium.global };
  }

  async putRecord(table: string, key: string, value: unknown): Promise<void> {
    this.assertOpen();
    this.pool.consumeInjectedFailure();
    let records = this.medium.tables.get(table);
    if (records === undefined) {
      records = new Map();
      this.medium.tables.set(table, records);
    }
    records.set(key, value);
  }

  async deleteRecord(table: string, key: string): Promise<void> {
    this.assertOpen();
    this.pool.consumeInjectedFailure();
    this.medium.tables.get(table)?.delete(key);
  }

  async setGlobal(value: unknown): Promise<void> {
    this.assertOpen();
    this.pool.consumeInjectedFailure();
    this.medium.global = value;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.onClose();
  }
}

/**
 * In-memory storage backend with a `kv` facet. Pass a shared
 * MemoryMediaPool to let a second instance reopen the same media;
 * omit it for a throwaway isolated pool.
 */
export class MemoryStorageBackend implements StorageBackend {
  readonly kv: KvFacet;
  private readonly openUnits = new Set<string>();
  private closed = false;

  constructor(readonly pool: MemoryMediaPool = new MemoryMediaPool()) {
    this.kv = {
      open: async (descriptor: KvUnitDescriptor): Promise<KvUnit> => {
        if (this.closed) {
          throw new StorageError("closed", "memory backend is closed");
        }
        if (this.openUnits.has(descriptor.name)) {
          throw new Error(
            `memory unit '${descriptor.name}' is already open (double-open is a caller bug)`,
          );
        }
        const stamped = this.pool.versions.get(descriptor.name);
        if (stamped === undefined) {
          this.pool.versions.set(descriptor.name, descriptor.version);
        } else if (stamped !== descriptor.version) {
          throw new StorageError(
            "version-mismatch",
            `memory unit '${descriptor.name}' is stamped v${stamped}, descriptor wants v${descriptor.version}`,
          );
        }
        let medium = this.pool.media.get(descriptor.name);
        if (medium === undefined) {
          medium = { tables: new Map(), global: null };
          this.pool.media.set(descriptor.name, medium);
        }
        this.openUnits.add(descriptor.name);
        return new MemoryKvUnit(this.pool, medium, descriptor, () =>
          this.openUnits.delete(descriptor.name),
        );
      },
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.openUnits.clear();
  }
}
