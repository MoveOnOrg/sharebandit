var config = require('./config.json');
var express = require('express');
var app = express();
var session = require('express-session');
var google = require('googleapis');
var OAuth2 = google.auth.OAuth2;
var oauth2Client = new OAuth2(
  config.oauth.clientId,
  config.oauth.clientSecret,
  config.baseUrl + '/auth/google/callback'
);
var swig  = require('swig');
var Sequelize = require('sequelize');
var sequelize = new Sequelize('sharebandit', 'sb', 'sb', {
  dialect: "postgres",
  port: 5432,
});

app.engine('html', swig.renderFile);
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

app.get('/',
  function (req, res) {

    var Metadata = sequelize.define('metadata', {
      id: {type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true},
      url: Sequelize.STRING,
      headline: Sequelize.STRING,
      text: Sequelize.STRING,
      image_url: Sequelize.STRING,
      version: Sequelize.INTEGER,
      success_count: Sequelize.INTEGER,
      trial_count: Sequelize.INTEGER
    });

    sequelize
      .authenticate()
      .then(function(err) {
        console.log('Connection has been established successfully.');
      }, function (err) {
        console.log('Unable to connect to the database:', err);
      });

    sequelize
      .sync({ force: true })
      .then(function(err) {
        console.log('Table created!');
        // Metadata.build({
        //   url: 'http://example.com/',
        //   version: 1
        // }).save();
      }, function (err) {
        console.log('An error occurred while creating the table:', err);
      });

    res.render('home', {});
	}
);

app.get('/r/:domain*',
  function (req, res) {
    //if (! (req.params.domain in config.domain_whitelist))
    //  res.404!
    res.vary('User-Agent')
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    var proto = 'http' || config.domain_whitelist[res.params.domain].proto;


    //https://developers.facebook.com/docs/sharing/webmasters/crawler
    if (/facebookexternalhit|Facebot/.test(req.get('User-Agent'))) {
      res.render('shareheaders', {});
    } else {
      res.redirect(proto + res.params.domain + decodeURIComponent(res.params[0] || ''));
    }
  }
);

// Launch server.
var server = app.listen(config.port, function () {
  var port = server.address().port;
  console.log('App listening at %s:%s', config.baseUrl, port);
});
