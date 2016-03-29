var config = require('./config.json');
var url = require('url');
var bandit = require('./bandit.js');

var init = function(app, schema, sequelize) {

  app._shareUrl = function(href, abver) {
    //based on href and abver, generate a url that can be shared
    href = href.replace(/^https?:\/\//, '');
    return (config.baseUrl
            + '/r/'
            + (abver || '0') + '/'
            + href
           );
  };

  app.get('/r/:abver/:domain*',
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
            var furl = url.format({
              'protocol': proto,
              'host': req.params.domain,
              'pathname': decodeURIComponent(pathname),
              'query': req.query
            });
            
            //https://developers.facebook.com/docs/sharing/webmasters/crawler
            if (/facebookexternalhit|Facebot/.test(req.get('User-Agent')) && parseInt(req.params.abver)) {
              var murl = (req.params.domain + decodeURIComponent(pathname || '/'));
              schema.Metadata.findOne({
                'where': { 'url':murl.replace(/.fb\d+/,''), 'id':parseInt(req.params.abver)}
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
                  console.log('FACEBOOK furl', furl);
                  console.log('FACEBOOK orig', req.originalUrl);
                  
                  res.render('shareheaders', {
                    'extraProperties': domainInfo.extraProperties || [],
                    'title': trial.headline,
                    'description': trial.text,
                    'image': trial.image_url,
                    'fullUrl': config.baseUrl + req.originalUrl
                  });
                  //UPSERT the sharer if abid is present:
                  if (req.query.abid) {
                    var newsharer = {'key': req.query.abid,
                                     'trial': (parseInt(req.params.abver) || 0)
                                    };
                    schema.Sharer.findOne({'attributes': ["id"], 'where': newsharer})
                      .then(function(sharer) {
                        if (!sharer) {
                          newsharer['success_count'] = 0; //until default
                          schema.Sharer.create(newsharer);
                        }
                      });
                  }
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
                schema.Sharer.findOrCreate({where:{'key':(req.query.abid || ''), 'trial': (parseInt(req.query.abver) || 0)}})
                  .spread(function(sharer, created) {
                    sharer.increment('success_count');
                  });
                schema.Metadata.findOne({where:{'id': (parseInt(req.query.abver) || 0)}}).then(function(metadata) {
                  metadata.increment('success_count');
                });
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
            res.set('Content-Type', 'text/javascript');

            bandit(murl, sequelize).then(function(trialChoice) {
              var burl = app._shareUrl('', trialChoice);
              return res.render('jsshare', {baseUrl: burl, abver: trialChoice});
            });
          }
         );
  
}

module.exports = init;
