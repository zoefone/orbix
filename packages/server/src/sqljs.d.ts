declare module 'sql.js' {
  interface SqlJsDatabase {
    exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
  }
  interface SqlJsStatic {
    Database: new (data?: Uint8Array | number[]) => SqlJsDatabase;
  }
  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>;
}
