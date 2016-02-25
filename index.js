var express = require('express');
var app = express();
var swig  = require('swig');

app.engine('html', swig.renderFile);
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

app.get('/',
  function (req, res) {
    res.render('home', {});
	}
);

// Launch server.
var server = app.listen(8080, function () {
  var port = server.address().port;
  console.log('App listening at %s:%s', 'http://sharebandit.dev', port);
});
