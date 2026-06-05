const initSqlJs = require('sql.js');

(async () => {
  try {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run('CREATE TABLE test (id INT, name TEXT)');
    db.run('INSERT INTO test VALUES (1, ?)', ['hello']);
    const stmt = db.prepare('SELECT * FROM test');
    const rows = [];
    while (stmt.step()) { rows.push(stmt.getAsObject()); }
    stmt.free();
    console.log('sql.js works! Result:', JSON.stringify(rows));
  } catch(e) {
    console.error('ERROR:', e.message);
  }
})();
