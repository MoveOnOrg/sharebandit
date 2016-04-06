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
            
            /// 1. Am I Facebook Crawler?
            //https://developers.facebook.com/docs/sharing/webmasters/crawler
            if (/facebookexternalhit|Facebot/.test(req.get('User-Agent')) && parseInt(req.params.abver)) {

              //What does FB do if you send it a 302 (temporary redirect)?
              // will it try to visit it again and get a different 302 if visiting again, or will it just
              // cache it?
              // If it DOES redirect each time, then /0/ could choose by bandit, itself

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
                    schema.Sharer.findOrCreate({'where': newsharer}).spread(function(sharer, created) {
                      if (created) {
                        schema.Metadata.findOne({where:{'id': (parseInt(req.params.abver) || 0)}}).then(function(metadata) {
                          metadata.increment('trial_count');
                        });
                      }
                    })
                  }
                }
              });
            /// 2. Am I a User?
            } else {
              res.redirect(furl);
              //ASSUMING:
              //  on a share click, we INSERT a sharer with the key
              //  on creation of a trial (metadata row), we create a sharer with key=''
              //We might want to consider auto-adding the row, AND/OR verifying that the url is correct
              // e.g. with AND trial=(SELECT id FROM metadata WHERE url=$$trialurl) -- but that would slow it down
              if (req.params.abver) {
                schema.Sharer.findOrCreate({where:{'key':(req.query.abid || ''), 'trial': (parseInt(req.params.abver) || 0)}})
                  .spread(function(sharer, created) {
                    sharer.increment('success_count');
                  });
                schema.Metadata.findOne({where:{'id': (parseInt(req.params.abver) || 0)}}).then(function(metadata) {
                  metadata.increment('success_count');
                });
                schema.Bandit.create({
                  'trial': (parseInt(req.params.abver) || 0),
                });
              }
            }
          }
         );

  //smallest GIF
  //http://probablyprogramming.com/2009/03/15/the-tiniest-gif-ever
  //base64_decode('R0lGODlhAQABAIABAP///wAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==')
  var smallgif = [71,73,70,56,57,97,1,0,1,0,0,255,0,44,0,0,0,0,1,0,1,0,0,2,0,59].map(function(x){return String.fromCharCode(x);}).join('');
  //transparent version
  //smallgif = [71,73,70,56,57,97,1,0,1,0,0,0,0,33,249,4,1,10,0,1,0,44,0,0,0,0,1,0,1,0,0,2,2,76,1,0,59].map(function(x){return String.fromCharCode(x);}).join('');
  app.get('/a/:abver/:domain*',
          function (req, res) {
            res.set('Content-Type', 'image/gif');
            res.end(smallgif, 'binary');
            if (req.params.abver) {
              schema.Sharer.findOrCreate({where:{'key':(req.query.abid || ''), 'trial': (parseInt(req.params.abver) || 0)}})
                .spread(function(sharer, created) {
                  sharer.increment('action_count');
                });
              schema.Metadata.findOne({where:{'id': (parseInt(req.params.abver) || 0)}}).then(function(metadata) {
                metadata.increment('action_count');
              });
              var Metadata_info = schema.Metadata.findOne({where:{'id': (parseInt(req.params.abver) || 0)}});
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
