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
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.engine('html', swig.renderFile);
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

// Configure database models
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
      fields: ['url', 'version']
    }
  ]
});

var Sharer = sequelize.define('sharer', {
  key: Sequelize.STRING,
  trial: {type: Sequelize.INTEGER, //abver will reference this
          references: { model: Metadata, key: 'id'}},
  success_count: Sequelize.INTEGER
}, {
  indexes: [
    { unique: true,
      fields: ['key','trial']
    }
  ]
});

sequelize.authenticate();
sequelize.sync();

app.get('/',
  moveonAuth({'oauth2Client': oauth2Client, 'app': app, 'domain': 'moveon.org'}).confirm,
  function (req, res) {
    res.render('home', {});
	}
);

app.get('/admin/',
  // moveonAuth({'oauth2Client': oauth2Client, 'app': app, 'domain': 'moveon.org'}).confirm,
  function (req, res) {
    var query = url.parse(req.url, true).query;
    var params = {};
    var protocolRegex =  /^([^:]+:\/\/)/;
    if (query.q) {
      sequelize
        .query(
          "SELECT DISTINCT url FROM metadata WHERE url LIKE ?",
          {
            replacements: ['%' + query.q.replace(protocolRegex, '') + '%'],
            type: sequelize.QueryTypes.SELECT
          }
        )
        .then(function(urls) {
          params.results = urls;
          res.render('admin/index', params);
        });
    }
    else {
      res.render('admin/index', params);
    }
	}
);

addEditPost = function (req, res) {
  var params = {};
  var protocolRegex =  /^([^:]+:\/\/)/;
  var url = req.body.url.replace(protocolRegex, '');
  var maxVersion = _.reduce(req.body.version, function(result, value, key) {
    if (key != 'new' && parseInt(value) > result) {
      return parseInt(value);
    }
    return result;
  }, 0);

  _.forEach(req.body.id, function(value, key) {

    var metadata = {
      url: url,
      headline: req.body.headline[key],
      text: req.body.text[key],
      image_url: req.body.image_url[key],
      version: req.body.version[key]
    };

    if (key == 'new') {
      if (
        metadata.headline != '' ||
        metadata.text != '' ||
        metadata.image_url != ''
      ) {
        metadata.version = maxVersion + 1;
        Metadata.create(metadata);
      }
    }
    else if (_.indexOf(req.body.delete, key) > -1) {
      Metadata.destroy({
        where: {
          url: url,
          id: key
        }
      });
    }
    else {
      metadata.id = key;
      Metadata.update(metadata, {where: {id: key}});
    }

  });

  res.redirect('/admin/edit/' + url);

};

app.get('/admin/add/',
  // moveonAuth({'oauth2Client': oauth2Client, 'app': app, 'domain': 'moveon.org'}).confirm,
  function (req, res) {
    res.render('admin/edit', {url: '', variants: [{id: 'new', headline: '', text: '', image_url: ''}]});
	}
);

app.post('/admin/add/',
  // moveonAuth({'oauth2Client': oauth2Client, 'app': app, 'domain': 'moveon.org'}).confirm,
  addEditPost
);

app.get('/admin/edit/*',
  // moveonAuth({'oauth2Client': oauth2Client, 'app': app, 'domain': 'moveon.org'}).confirm,
  function (req, res) {
    var params = {variants: []};

    Metadata.findAll({
      where: {
        url: req.params[0]
      }
    }).then(function(results) {
      _.forEach(results, function(result) {
        params.url = result.dataValues.url;
        params.variants.push(result.dataValues);
      });
      params.variants.push({id: 'new', headline: '', text: '', image_url: ''});
      res.render('admin/edit', params);
    });

	}
);

app.post('/admin/edit/*',
  // moveonAuth({'oauth2Client': oauth2Client, 'app': app, 'domain': 'moveon.org'}).confirm,
  addEditPost
);

app.get('/admin/delete/*',
  // moveonAuth({'oauth2Client': oauth2Client, 'app': app, 'domain': 'moveon.org'}).confirm,
  function (req, res) {

    var url = req.params[0];

    Metadata.findAll({
      where: {
        url: url
      }
    }).then(function(results) {
      res.render('admin/delete', results[0].dataValues);
    });

	}
);

app.post('/admin/delete/*',
  // moveonAuth({'oauth2Client': oauth2Client, 'app': app, 'domain': 'moveon.org'}).confirm,
  function (req, res) {

    var url = req.params[0];

    if (req.body.response == 'Yes, Delete') {
      Metadata.destroy({
        where: {
          url: url
        }
      }).then(function(results) {
        res.redirect('/admin/');
      });
    }
    else {
      res.redirect('/admin/edit/' + url);
    }


	}
);

app.get('/r/:domain*',
  function (req, res) {
    //NOTE: any caching layer:
    // in theory, you can whitelist domain matches, and if there is no abver,
    // just redirect skip
    // we can also, in theory cache it for facebook clients + abver
    if (! (req.params.domain in config.domain_whitelist)) {
      return res.status(404).send("Not found");
    }
    res.vary('User-Agent')
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    var domainInfo = config.domain_whitelist[req.params.domain];
    var pathname = req.params[0];
    var proto = domainInfo.proto;

    console.log('USERAGENT:', req.get('User-Agent'));
    var furl = url.format({
      'protocol': proto,
      'hostname': req.params.domain,
      'pathname': decodeURIComponent(pathname),
      'query': req.query
    });

    //https://developers.facebook.com/docs/sharing/webmasters/crawler
    if (/facebookexternalhit|Facebot/.test(req.get('User-Agent')) && parseInt(req.query.abver)) {
      var murl = (req.params.domain + decodeURIComponent(pathname || '/'));
      Metadata.findOne({
        'where': { 'url':murl, 'id':parseInt(req.query.abver)}
      }).then(function(trial) {
        if (!trial) {
          if (/testshare/.test(pathname)) {
            res.render('shareheaders', {
              'extraProperties': domainInfo.extraProperties || [],
              'title': "Fooooo",
              'description': 'basdfasdf',
            });
          } else {
            return res.status(404).send("Not found");
          }
        } else {
          res.render('shareheaders', {
            'extraProperties': domainInfo.extraProperties || [],
            'title': trial.headline,
            'description': trial.text,
            'image': trial.image_url,
            'fullUrl': furl
            });
          //TODO: UPSERT sharer if abid is present
        }
      });
    } else {
      res.redirect(furl);

      //ASSUMING:
      //  on a share click, we INSERT a sharer with the key
      //  on creation of a trial (metadata row), we create a sharer with key=''
      //We might want to consider auto-adding the row, AND/OR verifying that the url is correct
      // e.g. with AND trial=(SELECT id FROM metadata WHERE url=$$trialurl) -- but that would slow it down
      if (req.query.abver) {
        Sharer.findAll({where:{'key':(req.query.abid || ''), 'ver': (req.query.abver)}}).increment(['success_count'])
      }
    }
  }
);

app.get('/js/:domain*',
  function (req, res) {
    if (! (req.params.domain in config.domain_whitelist)) {
      return res.status(404).send("Not found");
    }
    var proto = config.domain_whitelist[req.params.domain].proto;
    var murl = (req.params.domain + decodeURIComponent(req.params[0] || '/'));
    Metadata.findAll({
      where:{'url':murl},
      attributes: ['id', 'success_count']
    }).then(function(trials) {
      res.set('Content-Type', 'text/javascript');
      var burl = config.baseUrl + '/r/';
      if (trials.length == 0) {
        return res.render('jsshare', {baseUrl: burl, abver: ''});
      } else {
        //TODO: BANDIT MAGIC!!!
        var randabver = trials[parseInt(Math.random() * trials.length)].id;
        return res.render('jsshare', {baseUrl: burl, abver: randabver});
      }
    })
  }
);
// Launch server.
var server = app.listen(config.port, function () {
  var port = server.address().port;
  console.log('App listening at %s:%s', config.baseUrl, port);
});
