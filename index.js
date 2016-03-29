var config = require('./config.json');
var db = config.postgresql;
var _ = require('lodash');
var express = require('express');
var app = express();
var session = require('express-session');
var bodyParser = require('body-parser');
var google = require('googleapis');
var url = require('url');
var OAuth2 = google.auth.OAuth2;
var oauth2Client = new OAuth2(
  config.oauth.clientId,
  config.oauth.clientSecret,
  config.baseUrl + '/auth/google/callback'
);
var moveonAuth = require('./node_modules/moveon-auth');
var swig  = require('swig');
var Sequelize = require('sequelize');
var sequelize = new Sequelize(db.database, db.user, db.pass, {
  dialect: "postgres",
  port: 5432,
});
var schema = require('./schema.js')(sequelize);

// Configure Express app
app.use(session({
	secret: config.sessionSecret,
  resave: true,
  saveUninitialized: false
}));
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.engine('html', swig.renderFile);
app.set('view engine', 'html');
app.set('views', __dirname + '/views');


var public_views = require('./public.js')(app, schema, sequelize);

var adminauth = moveonAuth({'oauth2Client': oauth2Client, 'app': app, 'domain': 'moveon.org'}).confirm;
var admin_views = require('./admin.js')(app, schema, sequelize, adminauth);

app.get('/',
  adminauth,  function (req, res) {
    res.redirect('/admin/');
  }
);

// Launch server.
var server = app.listen(config.port, function () {
  var port = server.address().port;
  console.log('App listening at %s:%s', config.baseUrl, port);
});
