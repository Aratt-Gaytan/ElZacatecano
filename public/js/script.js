
    
    for(let i; i>5; i++){
        const div = document.createElement("div");  // <div></div>
        div.textContent = "Ejemplo";                // <div>Ejemplo</div>

        const app = document.querySelector("#app"); // <div id="app">App</div>

        app.insertAdjacentElement("beforebegin", div);
        // Opción 1: <div>Ejemplo</div> <div id="app">App</div>

        app.insertAdjacentElement("afterbegin", div);
        // Opción 2: <div id="app"> <div>Ejemplo</div> App</div>

        app.insertAdjacentElement("beforeend", div);
        // Opción 3: <div id="app">App <div>Ejemplo</div> </div>

        app.insertAdjacentElement("afterend", div);
        // Opción 4: <div id="app">App</div> <div>Ejemplo</div>

        // /* Writing the HTML code to the page. */
        // res.write('<div class="card" style="width: 18rem;">'+
        //     '<img src="..." class="card-img-top" alt="..."></img>'+
        //     '<div class="card-body">'+
        //         '<h5 class="card-title">Card title</h5>'+
        //         '<p class="card-text">Some quick example text to build on the card title and make up the bulk of the cards content.</p>'+
        //         '<a href="#" class="btn btn-primary">Go somewhere</a>'+
        //     '</div>'+
        // '</div>');
    }


