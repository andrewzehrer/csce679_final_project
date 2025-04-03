const express = require("express");
const path = require("path");
var app = express();

// Middleware to serve static files from the "public" directory
app.use(express.static(path.join(__dirname, "public")));

// Middleware to parse JSON bodies
app.get("/", function(request, response) {
    response.send("Hello World!");
});

// Start the server on port 8800
app.listen(8800, function() {
    console.log("Started application on port %d", 8800);
});
