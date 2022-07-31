var express = require("express");
var ejs = require("ejs");
const DB = require("./base_de_datos");
const session = require("express-session");
const path = require("path");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
var cors = require("cors");
var request = require("request");
const axios = require("axios");
var nodemailer = require('nodemailer');


var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'tucorreo@gmail.com',
        pass: 'tucontraseña'
    }
});

const { ClientRequest } = require("http");

var app = express();

var dbTienda = DB.connDB;

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("view engine", "ejs");
app.use(express.static("public"));



app.use(
    session({
        secret: "secret",
        resave: true,
        saveUninitialized: true,
    })
);

function verifyToken(req, res, next) {
    const bearerHeader = req.headers["authorization"];
    if (typeof bearerHeader !== "undefined") {
        const bearerToken = bearerHeader.split(" ")[1];
        req.token = bearerToken;
        next();
    } else {
        res.sendStatus(403);
    }
}

const CLIENT =
    "AWfOaw5zLmZuceW0ZIEotxj9fopkcFufnZPvWY-UwCcRw1qvkFZVWKcL0Jn0EpW-Cid_EF9TOgOgaPr7";
const SECRET =
    "EP1Lg7U4HM1J6gbvOpaE3ZM-Gv0dR9eJ_amnnyWvQmXK8R0NNEKZlW-e24HsYD1ukReMe8wwowK784e-";
const PAYPAL_API = "https://api-m.sandbox.paypal.com";
const auth = { user: CLIENT, pass: SECRET };

const createPayment = (req, res) => {
    var total = req.body.total;
    var num = req.body.num;
    var id_prod = req.body.id_prod;
    var dbTienda = DB.connDB;
    // console.log(num);
    // console.log(id_prod);
    for(let i = 0; i< num.length; i++){
        dbTienda.query("UPDATE usuario_has_inventario SET cantidad = ? WHERE (usuario_usuario_id = ?) and (inventario_inventario_id = ?);",
            [num[i], req.session.user, id_prod[i] ],(err, rows, fields) => {
                if (err) {
                    respuesta.estado = false;
                    respuesta.mensaje = err;
                    res.json(respuesta);
                }
                
            });
                
    }
    const body = {
        intent: "CAPTURE",
        purchase_units: [
            {
                amount: {
                    currency_code: "MXN", //https://developer.paypal.com/docs/api/reference/currency-codes/
                    value: total,
                },
            },
        ],
        application_context: {
            brand_name: `El zacatecano`,
            landing_page: "NO_PREFERENCE", // Default, para mas informacion https://developer.paypal.com/docs/api/orders/v2/#definition-order_application_context
            user_action: "PAY_NOW", // Accion para que en paypal muestre el monto del pago
            return_url: `http://localhost:3000/execute-payment`, // Url despues de realizar el pago
            cancel_url: `http://localhost:3000/cancel-payment`, // Url despues de realizar el pago
        },
    };
    //https://api-m.sandbox.paypal.com/v2/checkout/orders [POST]

    request.post(
        `${PAYPAL_API}/v2/checkout/orders`,
        {
            auth,
            body,
            json: true,
        },
        (err, response) => {
            res.send(response.body);
        }
    );
};


const executePayment = (req, res) => {
    const token = req.query.token; //<-----------

    request.post(
        `${PAYPAL_API}/v2/checkout/orders/${token}/capture`,
        {
            auth,
            body: {},
            json: true,
        },
        (err, response) => {
            var venta_id = response.body.id;
            var email = response.body.payer.email_address;
            var codigo = response.body.purchase_units[0].payments.captures[0].amount.currency_code;
            var gross_amount = response.body.purchase_units[0].payments.captures[0].seller_receivable_breakdown.gross_amount.value; 
            var paypal_fee = response.body.purchase_units[0].payments.captures[0].seller_receivable_breakdown.paypal_fee.value; 
            var net_amount = response.body.purchase_units[0].payments.captures[0].seller_receivable_breakdown.net_amount.value;
            var dbTienda = DB.connDB; 
            dbTienda.query("select c.inventario_inventario_id, c.cantidad as cant_ca,  i.cantidad "+
            " from usuario_has_inventario c"+
            " join inventario i on i.inventario_id = c.inventario_inventario_id"+
            " where usuario_usuario_id = ?;",
                [req.session.user],(err, rows, fields) => {
                    if (err) {
                        respuesta.estado = false;
                        respuesta.mensaje = err;
                        res.json(respuesta);
                    }else{
                        for(let y = 0; y < rows.length; y++ ){
                            var cant = rows[y].cantidad -  rows[y].cant_ca
                            dbTienda.query("UPDATE inventario SET cantidad = ? WHERE (inventario_id = ?);",
                                [cant, rows[y].inventario_inventario_id],(error, row, fields) => {
                                    if (error) {
                                        respuesta.estado = false;
                                        respuesta.mensaje = error;
                                        res.json(respuesta);
                                    }else{
                                        dbTienda.query("delete from usuario_has_inventario where usuario_usuario_id = ?;",
                                        [req.session.user],(err, rows, fields) => {
                                            if (err) {
                                                respuesta.estado = false;
                                                respuesta.mensaje = err;
                                                res.json(respuesta);
                                            }
                                        });
                                    //FCe-sy5]
                                    dbTienda.query("INSERT INTO historial_venta (venta_id, e_mail, currency_code, net_amount, gross_amount, paypal_fee) VALUES (?, ?, ?, ?, ?, ?);",
                                        [venta_id, email, codigo, net_amount, gross_amount, paypal_fee ],(err, rows, fields) => {
                                            if (err) {
                                                respuesta.estado = false;
                                                respuesta.mensaje = err;
                                                console.log(respuesta)
                                            }
                                            else {
                                                // console.log("ok");
                                                // res.json(response.body);
                                                res.redirect("/");
                        
                                            }
                                        });
                                        
                                    }
                });
                        }
                    }
                });
            // console.log(response.body.purchase_units[0].payments.captures[0].amount.currency_code);
            
        }
    );
};

//    http://localhost:3000/create-payment [POST]
app.post(`/create-payment`, createPayment);

app.get(`/execute-payment`, executePayment);

app.get("/", function (req, res) {
    if (req.session.loggedin) {
        // Output username
        res.render('pages/index');
    } else { 
        // Not logged in
        res.render('pages/index2');
    }
    // res.render("pages/index");
});

app.get("/carrito", function (req, res) {
    res.render("pages/carrito");
});

app.post("/agregacarrito", function (req, res){
    let id =  req.session.user;
    let inv_id = req.body.id_inv;
    console.log(id, inv_id);
    var dbTienda = DB.connDB;
    dbTienda.query("INSERT INTO usuario_has_inventario (usuario_usuario_id, inventario_inventario_id) VALUES (?, ?);",
    [id, inv_id],(err, rows, fields) => {
        if (err) {
            res.estado = false;
            res.mensaje = err;
            res.json(respuesta);
        }
        else {
            // console.log("ok");
            res.json(rows);
        }
    });
});

app.post("/elimcarrito", function(req, res){
    let id =  req.session.user;
    let id_prod = req.body.id;
    respuesta = {};
    // console.log("id: " + id);
    // console.log("prod: " + id_prod);
    dbTienda.query("delete from usuario_has_inventario where usuario_usuario_id = ? and inventario_inventario_id = ?;",[id, id_prod], 
    (err, rows, fields) => {
        if (err) {
            respuesta.estado = false;
            respuesta.mensaje = err;
            res.json(respuesta);
        }
        else {
            // console.log(fields);
            res.json(fields);
        }
    });
    
});

app.get("/getcarrito", function(req, res){
    let id =  req.session.user;
    // console.log(id)
    respuesta = {};
    var dbTienda = DB.connDB;
    dbTienda.query("select u.usuario_id, i.inventario_id, i.producto, i.precio, i.cantidad"+
    " from inventario i "+
    " join usuario_has_inventario ui on i.inventario_id = ui.inventario_inventario_id"+
    " join usuario u on u.usuario_id = ui.usuario_usuario_id" +
    " where u.usuario_id = ?;",[id], 
    (err, rows, fields) => {
        if (err) {
            respuesta.estado = false;
            respuesta.mensaje = err;
            console.log(err);
            res.json(respuesta);
        }
        else {
            
            // console.log("ok");
            res.json(rows);
        }
    });
    
});

app.get("/atencioncliente", function (req, res) {
    res.render("pages/atencion_clientes");
});

app.get("/pagar", function (req, res) { 
    res.render("pages/pagar");
});

app.get("/perfil", function (req, res) {
    res.render("pages/perfil");
});

app.get("/cerrarsesion", function (req, res) {
    req.session.loggedin = false;
    req.session.username = null;
    req.session.id = null
    res.redirect("/");
});

app.get("/iniciarsesion", function (req, res) {
    res.render("pages/iniciar_sesion");
});

app.post("/auth", function (request, response) {
    let username = request.body.correo;
    let password = request.body.pass;
    // Ensure the input fields exists and are not empty
    if (username && password) {
        var dbTienda = DB.connDB;
        // Execute SQL query that'll select the account from the dbTienda based on the specified username and password
        dbTienda.query(
            "SELECT * FROM usuario WHERE email = ? AND contraseña = sha1(?)",
            [username, password],
            function (error, rows, fields) {
                // If there is an issue with the query, output the error
                if (error) throw error;
                // If the account exists
                if (rows.length > 0) {
                    // Authenticate the user
                    request.session.loggedin = true;
                    request.session.username = username;
                    request.session.user = rows[0].usuario_id;

                    // Redirect to home page
                    response.redirect("/");
                } else {
                    response.render("pages/iniciar_sesion");
                    request.body.correo = username;
                }
                response.end();
            }
        );
    } else {
        response.render("pages/iniciar_sesion");
    }
});
app.get("/registrarse", function (req, res) {
    res.render("pages/registrarse");
});
app.post("/registrar", function (req, res) {
    /* Creating a connection to the dbTienda. */
    var dbTienda = DB.connDB;
    /* Getting the values from the form. */
    let nom = req.body.nombre;
    let app = req.body.app;
    let apm = req.body.apm;
    let email = req.body.email;
    let cel = req.body.cel;
    let calle = req.body.calle;
    let num = req.body.num;
    let frac = req.body.frac;
    let mun = req.body.mun;
    let est = req.body.est;
    let pass = req.body.pass;
    dbTienda.query(
        "INSERT INTO elzacatecano.usuario " +
        "(nombre, apellido_pa, apellido_ma, numero_cel, contraseña, email, calle, num, estado, municipio, fraccionamiento)" +
        " VALUES (?, ?, ?, ?,sha1(?), ?, ?, ?, ?, ?, ?);",
        [nom, app, apm, cel, pass, email, calle, num, est, mun, frac],
        (error, rows, field) => {
            if (error) throw error;
            res.redirect("/");
            // console.log(field);
        }
    );
});
app.get("/inventario", function (req, res) {
    res.render("pages/inventario");
});

app.get("/productos", (req, res) => {
    respuesta = {};
    var dbTienda = DB.connDB;
    dbTienda.query(" select i.inventario_id , i.producto , i.cantidad , i.precio , d.departamento_id , d.nombre from inventario i, departamento d where i.departamento_id = d.departamento_id group by 1;", 
    (err, rows, fields) => {
        if (err) {
            respuesta.estado = false;
            respuesta.mensaje = err;
            res.json(respuesta);
        }
        else {
            // console.log("ok");
            res.json(rows);
        }
    });
});

app.get("/categorias", (req, res) => {
    respuesta = {};
    var dbTienda = DB.connDB;
    dbTienda.query(" select * from  departamento ;", 
    (err, rows, fields) => {
        if (err) {
            respuesta.estado = false;
            respuesta.mensaje = err;
            res.json(respuesta);
        }
        else {
            // console.log("ok");
            res.json(rows);
        }
        
    });
});




app.get("/agrinv", (req, res)=>{
    res.render("pages/agrega_producto");
});

app.post("/act_inv", (request,response) => { 
    const id = request.body.id;
    const producto = request.body.producto;
    const cantidad = request.body.cantidad;
    const precio = request.body.precio;
    const categoria = request.body.departamento;
    var respuesta = {};
    var dbTienda = DB.connDB;
    dbTienda.query('UPDATE inventario SET producto = ?, cantidad = ?, precio = ? , departamento_id = ? WHERE inventario.inventario_id = ? ; ',[producto,cantidad,precio, categoria, id], function (err,rows,fields){ 
    if(!err){ 
        respuesta.estado = true; 
        respuesta.comentario = "Producto insertado correctamente"; 
        respuesta.mensaje = rows;
        response.json(respuesta);
    } 
    else{ 
        respuesta.estado=false; 
        respuesta.comentario = "Error al insertar producto";
        respuesta.mensaje = err;
        response.json(respuesta);
    } 
    });  
});


app.post("/elimi_inv", (request,response) => { 
    const id = request.body.id;
    var dbTienda = DB.connDB;
    var respuesta = {};
    dbTienda.query('DELETE FROM inventario WHERE inventario.inventario_id = ? ; ',[id], function (err,rows,fields){ 
    if(!err){ 
        respuesta.estado = true; 
        respuesta.comentario = "Producto insertado correctamente"; 
        respuesta.mensaje = rows;
        response.json(respuesta);
    } 
    else{ 
        respuesta.estado=false; 
        respuesta.comentario = "Error al insertar producto";
        respuesta.mensaje = err;
        response.json(respuesta);
    } 
    });
});


//UPDATE `inventario` SET `producto` = 'Fresass', `cantidad` = '61', `precio` = '53' WHERE `inventario`.`inventario_id` = 9 AND `inventario`.`departamento_id` = 3; 


app.get("/agrinv", (req, res)=>{
    res.render("pages/agrega_producto");
});

app.post("/agregarinv", verifyToken, (request,response) => { 
    const id = request.body.inventario_id;
    const producto = request.body.producto;
    const cantidad = request.body.cantidad;
    const precio = request.body.precio;
    var respuesta = {};
    jwt.verify(request.token,'accessKey', (err,authData) => {
    if(err){
        response.sendStatus(403); 
    }else{  
        var dbTienda = DB.connDB;      
        dbTienda.query('insert into inventario values (?,?,?,?)',[id,producto,cantidad,precio], function (err,rows,fields){ 
        if(!err){ 
            respuesta.estado = true; 
            respuesta.comentario = "Producto insertado correctamente"; 
            respuesta.filas = rows.affectedRows; 
            response.json(respuesta);  
        } 
        else{ 
            respuesta.estado=false; 
            respuesta.comentario = "Error al insertar producto"; 
            respuesta.error = err; 
            response.json(respuesta); 
        } 
        }); 
    } 
    }); 
});

app.post("/nuevoProducto", (request,response) => { 
    
    const producto = request.body.producto; 
    const cantidad = request.body.cantidad; 
    const precio = request.body.precio; 
    const categoria = request.body.departamento;
    // console.log("----------------------------------------------");
    // console.log(request.body);
    // console.log("----------------------------------------------");
    var respuesta = {};
    var dbTienda = DB.connDB;
        dbTienda.query('INSERT INTO inventario (producto, cantidad, precio, departamento_id) VALUES (?,?,?,?);',[producto,cantidad,precio,categoria], function (err,rows,fields){ 
        if(!err){ 
        
            respuesta.estado = true; 
            respuesta.comentario = "Producto insertado correctamente"; 
            filas = rows; 
            response.json(respuesta);  
            // console.log("yata");
            
        } 
        else{ 
            respuesta.estado=false; 
            respuesta.comentario = "Error al insertar producto"; 
            respuesta.error = err; 
            console.log(err)
            response.json(respuesta); 
        } 
        }); 
});   
app.post("/nuevacat", (request,response) => { 
    const departamento_id = request.body.departamento_id; 
    const nombre = request.body.cantidad; 
    var respuesta = {}; 
    var dbTienda = DB.connDB;
        dbTienda.query('insert into departamento values (?,?)',[departamento_id,nombre], function (err,rows,fields){ 
        if(!err){ 
            respuesta.estado = true; 
            respuesta.comentario = "Producto insertado correctamente"; 
            respuesta.filas = rows.affectedRows; 
            response.json(respuesta);  
        } 
        else{ 
            respuesta.estado=false; 
            respuesta.comentario = "Error al insertar producto"; 
            respuesta.error = err; 
            response.json(respuesta); 
        } 
    }); 
});
app.get("/admininv", function (req, res) {
    /* Rendering the page admininv.ejs */
    res.render("pages/admininv");
});
app.listen(process.env.PORT || 5000);
console.log("I`m running in port 5000");
/* 
<%- include('../partial/head.ejs'); %>
<%- include('../partial/head_wa.ejs'); %>
<%- include('../partial/footer.ejs'); %> 

sandbox account: sb-g4fm4719465889@business.example.com
client id: AWfOaw5zLmZuceW0ZIEotxj9fopkcFufnZPvWY-UwCcRw1qvkFZVWKcL0Jn0EpW-Cid_EF9TOgOgaPr7
secret: EP1Lg7U4HM1J6gbvOpaE3ZM-Gv0dR9eJ_amnnyWvQmXK8R0NNEKZlW-e24HsYD1ukReMe8wwowK784e-
*/


/*

Aumentar el rango en el numero de "cantidad"
En numero de telefono hacerlo varchar

*/
