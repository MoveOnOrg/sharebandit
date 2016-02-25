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

// Configure Express app
app.use(session({
	secret: config.sessionSecret,
  resave: true,
  saveUninitialized: false
}));
app.use(bodyParser.urlencoded({ extended: false }));
app.engine('html', swig.renderFile);
app.set('view engine', 'html');
app.set('views', __dirname + '/views');


var Metadata = sequelize.define('metadata', {
  id: {type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true},
  url: Sequelize.STRING,
  headline: Sequelize.STRING,
  text: Sequelize.STRING,
  image_url: Sequelize.STRING,
  version: Sequelize.INTEGER,
  success_count: Sequelize.INTEGER,
  trial_count: Sequelize.INTEGER
}, {
  indexes: [ 
    { unique: true,
      fields: ['url']
    },
    { unique: true,
      fields: ['url', 'version']
    },
  ]
});

var Sharer = sequelize.define('sharer', {
  key: Sequelize.STRING,
  trial: {type: Sequelize.INTEGER,
          references: { model: Metadata, key: 'id'}},
  success_count: Sequelize.INTEGER
}, {
  indexes: [
    { unique: true,
      fields: ['key','trial']
    }
  ]
});

sequelize
  .authenticate()
  .then(function(err) {
    console.log('Connection has been established successfully.');
  }, function (err) {
    console.log('Unable to connect to the database:', err);
  });

sequelize
  .sync()
  .then(function(err) {
    console.log('Table created!');
    // Metadata.build({
    //   url: 'http://example.com/',
    //   version: 1
    // }).save();
  }, function (err) {
    console.log('An error occurred while creating the table:', err);
  });

app.get('/',
  moveonAuth({'oauth2Client': oauth2Client, 'app': app, 'domain': 'moveon.org'}).confirm,
  function (req, res) {

    res.render('home', {});
	}
);

app.get('/r/:domain*',
  function (req, res) {
    //NOTE: any caching layer: 
    // in theory, you can whitelist domain matches, and if there is no abver,
    // just redirect skip 
    console.log(req.params);
    if (! (req.params.domain in config.domain_whitelist)) {
      return res.status(404).send("Not found");
    }
    res.vary('User-Agent')
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    var proto = config.domain_whitelist[req.params.domain].proto;

    //https://developers.facebook.com/docs/sharing/webmasters/crawler
    if (/facebookexternalhit|Facebot/.test(req.get('User-Agent'))) {
      res.render('shareheaders', {});
    } else {
      var resquery = _.clone(req.query);
      delete resquery['abid'];
      delete resquery['abver'];
      console.log(resquery);
      res.redirect(url.format({
        protocol: proto,
        hostname: req.params.domain,
        path: decodeURIComponent(req.params[0] || ''),
        query: resquery
      }));
      //TODO: add a count for abver for abid after sending the redirect
    }
  }
);

app.get('/js/:domain*',
  function (req, res) {
    if (! (req.params.domain in config.domain_whitelist)) {
      return res.status(404).send("Not found");
    }
    //TODO: lookup domain+path
    // get test items
    // DO MAGIC to choose
    // return JS with magic choice
    res.render('jsshare', {abver: '1'});
  }
);
// Launch server.
var server = app.listen(config.port, function () {
  var port = server.address().port;
  console.log('App listening at %s:%s', config.baseUrl, port);
});
