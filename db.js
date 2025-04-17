const mysql = require('mysql2');

const dbConfig = {
host: 'localhost',
  user: 'root',        // Replace with your MySQL username
  password: 'root',    // Replace with your MySQL password
  database: 'carrent', // Replace with your database name
  port: 3307,
  multipleStatements: true, // Allow multiple SQL queries
  connectTimeout: 10000, // Increase timeout to 10 seconds
};

let connection;

function handleDisconnect() {
  connection = mysql.createConnection(dbConfig);

  connection.connect((err) => {
    if (err) {
      console.error('Error connecting to MySQL:', err);
      setTimeout(handleDisconnect, 2000); // Try reconnecting after 2 seconds
    } else {
      console.log('Connected to MySQL');
    }
  });

  connection.on('error', (err) => {
    console.error('Database error:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      console.log('Reconnecting to database...');
      handleDisconnect();
    } else {
      throw err;
    }
  });
}

handleDisconnect();

module.exports = connection; // Export connection
