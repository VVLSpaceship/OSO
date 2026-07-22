declare module 'better-sqlite3' {
  const Database: {
    new (filename: string, options?: any): any;
  };
  export default Database;
}