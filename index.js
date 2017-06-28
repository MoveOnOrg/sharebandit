console.log("******** index 1")
if (process.env.CONFIG) {
  console.log("******** getting config from " + process.env.CONFIG);

  var configFile = JSON.parse(process.env.CONFIG);
} else {
  console.log("******** getting config from ./config/config.json");
  var configFile = require('./config/config.json');
  //console.log("******** configFile: " + configFile); 
}

//var configFile;
console.log("******** index 2");
var _ = require('lodash');
var express = require('express');
var app = express();
var session = require('express-session');
var bodyParser = require('body-parser');
var google = require('googleapis');
var url = require('url');
var OAuth2 = google.auth.OAuth2;
var googleAuth = require('./lib/google-auth');
var swig  = require('swig');
var Sequelize = require('sequelize');


console.log("******** index 3")

var dbconn = {};
var server;

var shutdown = function() {
  server.close();
}
console.log("******** index 4")

// Launch server.
var boot = function(config) {
  console.log("******** index boot start")

  if (!config) {
    console.log('loading config from config/config.json');
    config = configFile;
  }

  console.log("******** Configure Express app")

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

  var modules = [];

  console.log("******** load modules")
  //MODULES
  if (config.extensionModules) {
    modules = config.extensionModules.map(function(m) {
      return require(m);
    });
    modules.forEach(function(m) {
      if (m.static) {
        console.log(m.static);
        app.use(express.static(m.static));
      }
    });
  }
  console.log("******** connect to database")

  //MODELS
  var db = config.db;
  var sequelize = new Sequelize(db.database, db.user, db.pass, db);
  var schema = require('./schema.js')(sequelize);
  dbconn.schema = schema;

  //VIEWS
  console.log("******** wire up views")
  var public_views = require('./public.js')(app, schema, sequelize, config);

  console.log("******** wire up admin")
  var adminauth;
  if (/\/\/localhost/.test(config.baseUrl) && config.develMode) {
    adminauth = function(req,res,next) {next();};
  } else {
    var oauth2Client = new OAuth2(
      config.oauth.clientId,
      config.oauth.clientSecret,
      config.baseUrl + '/auth/google/callback'
    );
    console.log("****** config.baseUrl " + config.baseUrl );

    adminauth = (googleAuth({'oauth2Client': oauth2Client,
                             'app': app,
                             'whitelist': config.oauthAllowedUsers
                            }).confirm);
    console.log("***** after adminauth");
  }
  var view_dirs = [__dirname + '/views'];
  //MODULES
  // get the links that will be available in the admin
  //  -- all other views, the module should setup itself
  console.log("******** wire up modules")
  var moduleLinks = modules.map(function(m) {
      var moduleResult = m(app, schema, sequelize, adminauth, config);
      view_dirs.push(moduleResult.viewDirectory);
      return moduleResult.link;
  });

  app.set('views', view_dirs);
  console.log("******** wire up sequelize")

  sequelize.authenticate();
  sequelize.sync();

  var admin_views = require('./admin.js')(app, schema, sequelize, adminauth, config, moduleLinks);

  console.log("******** about to app.get")
  app.get('/',
          adminauth,  function (req, res) {
            console.log('INDEX PATH Hello world');
            res.redirect(config.baseUrl + '/admin/');
          }
         );

  // server = app.listen(config.port, function () {
  //   var port = server.address().port;
  //   console.log('App listening at %s:%s', config.baseUrl, port);
  // });
}

if (require.main === module) {
  boot(configFile);
} else {
  exports.server = server;
  exports.boot = boot;
  exports.db = dbconn;
  exports.shutdown = shutdown;
}

module.exports = app
boot(configFile);
