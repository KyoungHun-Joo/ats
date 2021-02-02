const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: 'database-1.cjtqptpaj7pg.ap-northeast-2.rds.amazonaws.com',
  port: '3306',
  user: 'admin',
  password: 'wnrudgns123456',
  database: 'cmc'
});

module.exports = function () {
  return {
    init: async function () {
      return await pool.getConnection(async conn => conn);
    }
  }
};


//db Ŀ�ؼ� ����
//mysql_dbc.test_open(connection);
