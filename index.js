var express = require('express');
var app = express();
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

// Launch server.
var server = app.listen(8080, function () {
  var port = server.address().port;
  console.log('App listening at %s:%s', 'http://sharebandit.dev', port);
});
