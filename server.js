var express = require("express");
var ejs = require("ejs");
const session = require("express-session");
const path = require("path");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
var cors = require("cors");
var request = require("request");
const axios = require("axios");
var nodemailer = require('nodemailer');
const { google } = require('googleapis');
const multer = require('multer');
const fs = require('fs');


const upload = multer({dest : 'public/img'});

const DB = require("./base_de_datos");



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
    // console.log(num);
    // console.log(id_prod);
    for (let i = 0; i < num.length; i++) {
        dbTienda.query("UPDATE usuario_has_inventario SET cantidad = ? WHERE (usuario_usuario_id = ?) and (inventario_inventario_id = ?);",
            [num[i], req.session.user, id_prod[i]], (err, rows, fields) => {
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
            return_url: `https://elzacatecano.herokuapp.com/execute-payment`, // Url despues de realizar el pago
            cancel_url: `https://elzacatecano.herokuapp.com/cancel-payment`, // Url despues de realizar el pago
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
            dbTienda.query("select c.inventario_inventario_id, c.cantidad as cant_ca,  i.cantidad " +
                " from usuario_has_inventario c" +
                " join inventario i on i.inventario_id = c.inventario_inventario_id" +
                " where usuario_usuario_id = ?;",
                [req.session.user], (err, rows, fields) => {
                    if (err) {
                        respuesta.estado = false;
                        respuesta.mensaje = err;
                        res.json(respuesta);
                    } else {
                        for (let y = 0; y < rows.length; y++) {
                            var cant = rows[y].cantidad - rows[y].cant_ca
                            dbTienda.query("UPDATE inventario SET cantidad = ? WHERE (inventario_id = ?);",
                                [cant, rows[y].inventario_inventario_id], (error, row, fields) => {
                                    if (error) {
                                        respuesta.estado = false;
                                        respuesta.mensaje = error;
                                        res.json(respuesta);
                                    } else {
                                        dbTienda.query("delete from usuario_has_inventario where usuario_usuario_id = ?;",
                                            [req.session.user], (err, rows, fields) => {
                                                if (err) {
                                                    respuesta.estado = false;
                                                    respuesta.mensaje = err;
                                                    res.json(respuesta);
                                                }
                                            });
                                        //FCe-sy5]
                                        dbTienda.query("INSERT INTO historial_venta (venta_id, e_mail, currency_code, net_amount, gross_amount, paypal_fee) VALUES (?, ?, ?, ?, ?, ?);",
                                            [venta_id, email, codigo, net_amount, gross_amount, paypal_fee], (err, rows, fields) => {
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

app.get(`/cancel-payment`, function (req, res){
    res.redirect("/");
});

//    https://elzacatecano.herokuapp.com/create-payment [POST]
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

app.post("/agregacarrito", function (req, res) {
    let id = req.session.user;
    let inv_id = req.body.id_inv;
    console.log(id, inv_id);
    dbTienda.query("INSERT INTO usuario_has_inventario (usuario_usuario_id, inventario_inventario_id) VALUES (?, ?);",
        [id, inv_id], (err, rows, fields) => {
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

app.post("/elimcarrito", function (req, res) {
    let id = req.session.user;
    let id_prod = req.body.id;
    respuesta = {};
    // console.log("id: " + id);
    // console.log("prod: " + id_prod);
    dbTienda.query("delete from usuario_has_inventario where usuario_usuario_id = ? and inventario_inventario_id = ?;", [id, id_prod],
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

app.get("/getcarrito", function (req, res) {
    let id = req.session.user;
    // console.log(id)
    respuesta = {};
    dbTienda.query("select u.usuario_id, i.inventario_id, i.producto, i.precio, i.cantidad" +
        " from inventario i " +
        " join usuario_has_inventario ui on i.inventario_id = ui.inventario_inventario_id" +
        " join usuario u on u.usuario_id = ui.usuario_usuario_id" +
        " where u.usuario_id = ?;", [id],
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



app.get("/pagar", function (req, res) {
    res.render("pages/pagar");
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
        "INSERT INTO usuario " +
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
    dbTienda.query(" select i.inventario_id , i.producto , i.cantidad , i.precio, i.img_url , d.departamento_id , d.nombre from inventario i, departamento d where i.departamento_id = d.departamento_id group by 1;",
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
    dbTienda.query(" select * from  departamento ;",
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


app.get("/departamentos", (req, res) => {
    res.render("pages/depart")
});


app.get("/agrinv", (req, res) => {
    res.render("pages/agrega_producto");
});



app.post("/act_cat", (request, response) => {
    const id = request.body.id;
    const depa = request.body.departamento;
    var respuesta = {};
    dbTienda.query('UPDATE departamento SET nombre = ? WHERE (departamento_id = ?);', [depa, id], function (err, rows, fields) {
        if (!err) {
            respuesta.estado = true;
            respuesta.comentario = "Producto actualizado correctamente";
            respuesta.mensaje = rows;
            response.json(respuesta);
        }
        else {
            respuesta.estado = false;
            respuesta.comentario = "Error al actualizar producto";
            respuesta.mensaje = err;
            response.json(respuesta);
        }
    });
});


app.post("/elimi_cat", (request, response) => {
    const id = request.body.id;

    var respuesta = {};
    dbTienda.query('DELETE FROM departamento WHERE departamento_id = ? ; ', [id], function (err, rows, fields) {
        if (!err) {
            respuesta.estado = true;
            respuesta.comentario = "Producto insertado correctamente";
            respuesta.mensaje = rows;
            response.json(respuesta);
        }
        else {
            respuesta.estado = false;
            respuesta.comentario = "Error al insertar producto";
            respuesta.mensaje = err;
            response.json(respuesta);
        }
    });
});


app.post("/edi_ima", upload.single('imagen'), (request, response) => {
    file = request.file.path +'.'+request.file.mimetype.split("/")[1];
    fs.renameSync(request.file.path, file);    
    var url = "/img/"+request.file.filename+'.'+request.file.mimetype.split("/")[1]
    // console.log("----------------------------------------------");
    // console.log(request.body);
    // console.log("----------------------------------------------");
    var respuesta = {};
    var dbTienda = DB.connDB;
    console.log(request.body.id);
    dbTienda.query('UPDATE inventario SET img_url = ? WHERE inventario.inventario_id = ? ; ', [ url, request.body.id], function (err, rows, fields) {
        if (!err) {
            respuesta.estado = true;
            respuesta.comentario = "Producto insertado correctamente";
            respuesta.mensaje = rows;
            response.redirect("/admininv");
        }
        else {
            respuesta.estado = false;
            respuesta.comentario = "Error al insertar producto";
            respuesta.mensaje = err;
            response.redirect("/admininv");
        }
    });

    
});


app.post("/act_inv", (request, response) => {
    const id = request.body.id;
    const producto = request.body.producto;
    const cantidad = request.body.cantidad;
    const precio = request.body.precio;
    const categoria = request.body.departamento;
    
    var respuesta = {};
    
    dbTienda.query('UPDATE inventario SET producto = ?, cantidad = ?, precio = ? , departamento_id = ? WHERE inventario.inventario_id = ? ; ', [producto, cantidad, precio, categoria, id], function (err, rows, fields) {
        if (!err) {
            respuesta.estado = true;
            respuesta.comentario = "Producto insertado correctamente";
            respuesta.mensaje = rows;
            response.json(respuesta);
        }
        else {
            respuesta.estado = false;
            respuesta.comentario = "Error al insertar producto";
            respuesta.mensaje = err;
            response.json(respuesta);
        }
    });
});


app.post("/elimi_inv", (request, response) => {
    const id = request.body.id;

    var respuesta = {};
    dbTienda.query('DELETE FROM inventario WHERE inventario.inventario_id = ? ; ', [id], function (err, rows, fields) {
        if (!err) {
            respuesta.estado = true;
            respuesta.comentario = "Producto insertado correctamente";
            respuesta.mensaje = rows;
            response.json(respuesta);
        }
        else {
            respuesta.estado = false;
            respuesta.comentario = "Error al insertar producto";
            respuesta.mensaje = err;
            response.json(respuesta);
        }
    });
});


app.post("/nueva_cat", (request, response) => {
    const depa = request.body.departamento;
    console.log(depa);
    var respuesta = {};
    dbTienda.query('INSERT INTO departamento (nombre) VALUES (?);', [depa], function (err, rows, fields) {
        if (!err) {
            respuesta.estado = true;
            respuesta.comentario = "Departamento insertado correctamente";
            respuesta.filas = rows.affectedRows;
            response.json(respuesta);
        }
        else {
            respuesta.estado = false;
            respuesta.comentario = "Error al insertar departamento";
            respuesta.error = err;
            response.json(respuesta);
        }
    });
});


//UPDATE `inventario` SET `producto` = 'Fresass', `cantidad` = '61', `precio` = '53' WHERE `inventario`.`inventario_id` = 9 AND `inventario`.`departamento_id` = 3; 


app.get("/agrinv", (req, res) => {
    res.render("pages/agrega_producto");
});

app.post("/agregarinv", verifyToken, (request, response) => {
    const id = request.body.inventario_id;
    const producto = request.body.producto;
    const cantidad = request.body.cantidad;
    const precio = request.body.precio;
    var respuesta = {};
    jwt.verify(request.token, 'accessKey', (err, authData) => {
        if (err) {
            response.sendStatus(403);
        } else {
            dbTienda.query('insert into inventario values (?,?,?,?)', [id, producto, cantidad, precio], function (err, rows, fields) {
                if (!err) {
                    respuesta.estado = true;
                    respuesta.comentario = "Producto insertado correctamente";
                    respuesta.filas = rows.affectedRows;
                    response.json(respuesta);
                }
                else {
                    respuesta.estado = false;
                    respuesta.comentario = "Error al insertar producto";
                    respuesta.error = err;
                    response.json(respuesta);
                }
            });
        }
    });
});

app.post("/nuevoProducto", upload.single('imagen'), (request, response) => {
    file = request.file.path +'.'+request.file.mimetype.split("/")[1];
    
    fs.renameSync(request.file.path, file);
    const producto = request.body.producto;
    const cantidad = request.body.cantidad;
    const precio = request.body.precio;
    const categoria = request.body.dep;


    
    var url = "/img/"+request.file.filename+'.'+request.file.mimetype.split("/")[1]
    // console.log("----------------------------------------------");
    // console.log(request.body);
    // console.log("----------------------------------------------");
    var respuesta = {};
    var dbTienda = DB.connDB;
    dbTienda.query('INSERT INTO inventario (producto, cantidad, precio, departamento_id, img_url) VALUES (?,?,?,?,?);', [producto, cantidad, precio, categoria, url], function (err, rows, fields) {
        if (!err) {

            respuesta.estado = true;
            respuesta.comentario = "Producto insertado correctamente";
            filas = rows;
            response.redirect("/agrinv");
            // response.json(respuesta);
            // console.log("yata");

        }
        else {
            respuesta.estado = false;
            respuesta.comentario = "Error al insertar producto";
            respuesta.error = err;
            console.log(err)
            // response.json(respuesta);
            response.redirect("/agrinv");
        }
    });

    
});



app.post("/nuevacat", (request, response) => {
    const departamento_id = request.body.departamento_id;
    const nombre = request.body.cantidad;
    var respuesta = {};
    dbTienda.query('insert into departamento values (?,?)', [departamento_id, nombre], function (err, rows, fields) {
        if (!err) {
            respuesta.estado = true;
            respuesta.comentario = "Producto insertado correctamente";
            respuesta.filas = rows.affectedRows;
            response.json(respuesta);
        }
        else {
            respuesta.estado = false;
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


app.get("/perfil", function (req, res) {
    res.render("pages/perfil");
});

app.post("/obtperfil", function (req, res) {
    var id = req.session.user; // este parametro se crea al momento de iniciar sesion con el express-sesion (una extension de express que te crea una sesion)
    respuesta = {};
    var dbTienda = DB.connDB; // se conecta a la base de datos
    // query para obtener los datos
    dbTienda.query(" select * from usuario where  usuario_id = ? ;",
        [id],
        (err, rows, fields) => {
            // si tiene un error
            if (err) {
                respuesta.estado = false;
                respuesta.mensaje = err;
                console.log(err);
                res.json(respuesta);

            }
            else {
                // envia los datos si todo esta bien
                // console.log("ok");
                res.json(rows);
            }

        });
});


app.post("/actuperfil", function (req, res) {
    /* Creating a connection to the dbTienda. */

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
    let pass = req.body.pass1;
    /* Updating the user's information in the database. */
    if (pass == "") { // si no agrego una contraseña se actualiza sin la contraseña
        dbTienda.query("UPDATE usuario SET nombre = ?, apellido_pa = ?, apellido_ma = ?, numero_cel = ?, email = ?, calle = ?, num = ?, estado = ?, municipio = ?, fraccionamiento =  ? WHERE (usuario_id = ?);",
            [nom, app, apm, cel, email, calle, num, est, mun, frac, req.session.user],
            (error, rows, field) => {
                if (error) throw error;
                res.redirect("/");
                // console.log(field);
            }
        );
    } else { // si tiene algo en la contraseña se actualiza con la contraseña
        dbTienda.query("UPDATE usuario SET nombre = ?, apellido_pa = ?, apellido_ma = ?, numero_cel = ?, email = ?, calle = ?, num = ?, estado = ?, municipio = ?, fraccionamiento =  ? contraseña = ? WHERE (usuario_id = ?);",
            [nom, app, apm, cel, email, calle, num, est, mun, frac, pass, req.session.user],
            (error, rows, field) => {
                if (error) throw error;
                res.redirect("/");
                // console.log(field);
            }
        );
    }

});


app.get("/atencioncliente", function (req, res) {
    res.render("pages/atencion_clientes");
});



app.post("/send-mail", (req, res) => {
    var dbTienda = DB.connDB;

    dbTienda.query("select concat(nombre,' ', apellido_pa , ' ' , apellido_ma) as nombre_com, email from usuario where usuario_id = ?;",
        [req.session.user],
        (error, rows, field) => {
            if (error) throw error;
            // console.log(field);

            else {
                let asunto = req.body.asunto;
                let texto = req.body.texto;

                // console.log(rows);
                cadena = `
                    Nombre ${rows[0].nombre_com}
                    Correo = ${rows[0].email}
                    Contenido = 
                    ${texto}`


                const client_id = "486050364591-8qv34288p3akmsqh55i4it69pbh8f4gi.apps.googleusercontent.com";
                const client_secret = "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";
                const redirect_uri = "https://developers.google.com/oauthplayground";
                const refresh_token = "1//04lzB37vlT_zXCgYIARAAGAQSNwF-L9Iru0c1RjQvgTAw4GNLip1GrKCKXDmjpG1yxtOgIX8VWkGni101Su-43lNtiSe6D0G2dXQ";

                const oAuth2Client = new google.auth.OAuth2(
                    client_id,
                    client_secret,
                    redirect_uri,
                );
                oAuth2Client.setCredentials({
                    refresh_token: refresh_token,

                });

                async function sendMail() {
                    try {
                        const accesstoken = await oAuth2Client.getAccessToken();
                        const transporter = nodemailer.createTransport({
                            service: "gmail",
                            auth: {
                                type: "OAuth2",
                                user: "atencionaclienteselzacatecano@gmail.com",
                                clientId: client_id,
                                clientSecret: client_secret,
                                refreshToken: refresh_token,
                                accessToken: accesstoken,
                            },
                            tls: {
                                rejectUnauthorized: false
                            }
                        });
                        const mailOptions = {
                            from: "Pagina web El Zacatecano <atencionaclienteselzacatecano@gmail.com>",
                            to: "elzacatecano2022@gmail.com",
                            subject: asunto,
                            text: cadena,
                        };
                        const result = await transporter.sendMail(mailOptions);
                        return result;

                    } catch (err) {
                        console.log(err);
                    }
                }
                sendMail()
                    .then(result => res.send("ok"))
                    .catch(err => res.send(err));

            }
        }
    );


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
