var url = require('url');
var _ = require('lodash');
var bandit = require('./bandit.js');
var Promise = require('bluebird');

var SOCIAL_AGENTS = ['facebookexternalhit', 'Facebot', 'Twitterbot'];
var socialAgentRegexp = new RegExp(SOCIAL_AGENTS.join('|'));

var init = function(app, schema, schemaActions, config) {

  app._shareUrl = function(href, abver) {
    //based on href and abver, generate a url that can be shared
    href = href.replace(/^https?:\/\//, '');
    return (config.baseUrl
            + '/r/'
            + (abver || '0') + '/'
            + href
    );
  };

  // Empty page to confirm site is up
  app.get('/ping', function (req, res) {
    res.setHeader('Content-Type', 'text/plain');
    res.end('OK');
  });

  app.get('/robots.txt', function (req, res) {
    res.setHeader('Content-Type', 'text/plain');
    res.end(
      'User-agent: *\nDisallow: /\n\n'
        + SOCIAL_AGENTS.map(function(bot) {
          return 'User-agent: ' + bot + '*\nAllow: /\n';
        }).join('\n')
    );
  });

  app.get('/r/:abver/:domain*',
    function (req, res) {
      //NOTE: any caching layer:
      // in theory, you can whitelist domain matches, and if there is no abver,
      // just redirect skip
      // we can also, in theory cache it for facebook clients + abver
      if (! (req.params.domain in config.domain_whitelist)) {
        return res.status(404).send('Not found');
      }
      res.vary('User-Agent');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      var domainInfo = config.domain_whitelist[req.params.domain];
      var pathname = req.params[0];
      var proto = domainInfo.proto;
      var forwardedQuery = _.clone(req.query);
      forwardedQuery.abver = req.params.abver;

      var furl = url.format({
        'protocol': proto,
        'host': req.params.domain,
        'pathname': decodeURIComponent(pathname),
        'query': forwardedQuery
      });

      /// 1. Am I Facebook Crawler or TwitterBot?
      //https://developers.facebook.com/docs/sharing/webmasters/crawler
      if (socialAgentRegexp.test(req.get('User-Agent')) && parseInt(req.params.abver) >= 0 ) {

        var murl = (req.params.domain + decodeURIComponent(pathname || '/').replace(/.fb\d+/,''));
        schemaActions.trialLookup(murl, parseInt(req.params.abver)).then(function(trial) {
          if (!trial) {
            if (/testshare/.test(pathname)) {
              res.render('shareheaders', {
                'extraProperties': domainInfo.extraProperties || [],
                'extraMeta': domainInfo. extraMeta || [],
                'title': 'Fooooo',
                'description': 'basdfasdf',
              });
            } else if (req.params.abver == '0') {
              // if facebook is sent a sharebandit URL with no treatment id render best treatment metadata and refresh fb cache
              schema.Metadata.findOne({
                'where': { 'url':murl },
                'order': [[ 'success_count', 'DESC' ]]
              }).then(function(bestTrial) {
                if (bestTrial) {
                  res.render('shareheaders', {
                    'extraProperties': domainInfo.extraProperties || [],
                    'title': bestTrial.headline,
                    'description': bestTrial.text,
                    'image': bestTrial.image_url,
                    'fullUrl': config.baseUrl + req.originalUrl
                  });
                } else {
                  return res.status(404).send('Not found');
                }
              });
            } else {
              return res.status(404).send('Not found');
            }
          } else {
            // console.log('FACEBOOK', req.originalUrl, furl);
            var renderFacebook = function() {
              res.render('shareheaders', {
                'extraProperties': domainInfo.extraProperties || [],
                'extraMeta': domainInfo.extraMeta || [],
                'title': trial.headline,
                'description': trial.text,
                'image': trial.image_url,
                'fullUrl': config.baseUrl + req.originalUrl
              });
            };
            if (!req.params.abver) {
              renderFacebook();
            }
            //UPSERT the sharer if abid is present:
            if (req.query.abid) {
              var newsharer = {'key': req.query.abid,
                'trial': (parseInt(req.params.abver) || 0)
              };
              schemaActions.newShare(newsharer, parseInt(req.params.abver) || 0).then(function() {
                if (req.params.abver) {
                  renderFacebook();
                }
              });
            } else {
              if (req.params.abver) {
                renderFacebook();
              }
            }
          }
        });
        /// 2. Am I a User?
      } else {
        if (!req.query.absync) {
          res.redirect(furl);
        }
        //ASSUMING:
        //  on a share click, we INSERT a sharer with the key
        //  on creation of a trial (metadata row), we create a sharer with key=''
        //We might want to consider auto-adding the row, AND/OR verifying that the url is correct
        // e.g. with AND trial=(SELECT id FROM metadata WHERE url=$$trialurl) -- but that would slow it down
        if (req.params.abver) {
          var cautious_id = (parseInt(req.params.abver) || 0);
          schemaActions.newEvent(cautious_id, req.query.abid || '', /*isAction=*/false)
            .then(function(value) {
              if (req.query.absync) {
                res.redirect(furl);
              }
            }, function(reason) {
              console.log('Failed save of transaction ' + req.originalUrl
                                + ' -- ' + reason);
              if (req.query.absync) {
                res.redirect(furl); // redirect anyway, since the client shouldn't care
              }
            });
        }
      }
    });

  //smallest GIF
  //http://probablyprogramming.com/2009/03/15/the-tiniest-gif-ever
  //base64_decode('R0lGODlhAQABAIABAP///wAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==')
  var smallgif = [71,73,70,56,57,97,1,0,1,0,0,255,0,44,0,0,0,0,1,0,1,0,0,2,0,59].map(function(x){return String.fromCharCode(x);}).join('');
  //transparent version
  //smallgif = [71,73,70,56,57,97,1,0,1,0,0,0,0,33,249,4,1,10,0,1,0,44,0,0,0,0,1,0,1,0,0,2,2,76,1,0,59].map(function(x){return String.fromCharCode(x);}).join('');
  //TODO: abstract out the similarities with this code and the /r/ code above (even though above, there are more paths)
  app.get('/a/:abver/:domain*',
    function (req, res) {
      res.set('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      if (!req.query.absync) {
        res.end(smallgif, 'binary');
      }
      if (req.params.abver) {
        var cautious_id = (parseInt(req.params.abver) || 0);
        schemaActions.newEvent(cautious_id, req.query.abid || '', /*isAction=*/true)
          .then(function() {
            if (req.query.absync) {
              res.end(smallgif, 'binary');
            }
          });
      } else {
        if (req.query.absync) {
          res.end(smallgif, 'binary');
        }
      }
    });
  var js_result = function(successMetric) {
    return function (req, res) {
      if (! (req.params.domain in config.domain_whitelist)) {
        return res.status(404).send('Not found');
      }
      res.set('Content-Type', 'text/javascript');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      var proto = config.domain_whitelist[req.params.domain].proto;
      var murl = (req.params.domain + decodeURIComponent(req.params[0] || '/'));
      bandit.choose(murl, successMetric, schemaActions).then(function(trialChoice) {
        var burl = app._shareUrl('', trialChoice);
        return res.render('jsshare', {baseUrl: burl, abver: trialChoice});
      });
    };
  };

  app.get('/js/:domain*', js_result('success'));
  app.get('/jsaction/:domain*', js_result('action'));

  var json_result = function (successMetric) {
    return function (req, res) {
      if (! (req.params.domain in config.domain_whitelist)) {
        return res.status(404).send('Not found');
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      var xdomain = (req.get('Origin') || req.get('Referer') || '').match(/https?:\/\/([^\/]+)/);
      if (xdomain && (xdomain[1] in config.domain_whitelist)) {
        res.setHeader('Access-Control-Allow-Origin', xdomain[0])
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD')
      }

      var murl = (req.params.domain + decodeURIComponent(req.params[0] || '/'));
      bandit.choose(murl, successMetric, schemaActions).then(function(trialChoice) {
        schemaActions.trialLookup(murl, trialChoice).then(function(trialMetadata) {
          res.jsonp({
            'id': trialMetadata.id,
            'url': trialMetadata.url,
            'headline': trialMetadata.headline,
            'text': trialMetadata.text,
            'image_url': trialMetadata.image_url,
            'shareurl': app._shareUrl('', trialChoice) + murl
          });
        }, function(err) {
          console.error('trial metadata not found', err);
          res.status(404).send('Not found');
        });
      }, function(err) {
        console.error('trialchoice not found', err);
        res.status(404).send('Not found');
      });
    };
  };

  app.get('/json/:domain*', json_result('success'));
  app.get('/jsonaction/:domain*', json_result('action'));

  app.set('jsonp callback name', 'callback');
  app.get('/jsonall/:domain*', function (req, res) {
    var murl = (req.params.domain + decodeURIComponent(req.params[0] || '/'));
    var params = {'url': murl, 'variants': []};

    //res.setHeader('Content-Type', 'application/json');
    // TODO: caching: gets all the url trials, but need success/action/trial counts
    schema.Metadata.findAll({
      where: {
        url: murl
      }
    }).then(function(results) {
      _.forEach(results, function(result) {
        result.dataValues.shareUrl = app._shareUrl(result.dataValues.url, result.dataValues.id);
        params.variants.push(result.dataValues);
      });
      return res.jsonp(params);
    });
  });
};

module.exports = init;
