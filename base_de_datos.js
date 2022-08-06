const mysql = require("mysql2");

/* Creating a connection to the database. */
// const connDB = mysql.createConnection(
//     {
//         host: "localhost",
//         user: "root",
//         password: "admin1234",
//         database: "elzacatecano"
//     }
// );


const connDB = mysql.createConnection(
    
        {
            host: "bnqxl4mnbewdhuq7iyml-mysql.services.clever-cloud.com",
            user: "uu6ynju7fe7jnbgp",
            password: "kZ3dszPrIptKqyffsKuw",
            database: "bnqxl4mnbewdhuq7iyml",
            port : 3306
        }
    );


connDB.connect(function(err){
    
    if(err){
        console.log(err);
        return;
    }
    else{
        console.log("conexion exitosa");
    }

});

exports.connDB = connDB;