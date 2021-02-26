const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: '',
  port: '',
  user: '',
  password: '',
  database: ''
});
 
module.exports = function () {
  return {
    init: async function () {
      return await pool.getConnection(async conn => conn);
    }
  }
};