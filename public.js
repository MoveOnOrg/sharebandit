var url = require('url');
var _ = require('lodash');
var bandit = require('./bandit.js');
var Promise = require("bluebird");
var Sequelize = require('sequelize');

var init = function(app, schema, sequelize, config) {

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
    res.end('OK');
  });

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
            var forwardedQuery = _.clone(req.query);
            forwardedQuery.abver = req.params.abver;

            var furl = url.format({
              'protocol': proto,
              'host': req.params.domain,
              'pathname': decodeURIComponent(pathname),
              'query': forwardedQuery
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
                //maybe this part should go down by 'function failure'?
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
                  // console.log('FACEBOOK', req.originalUrl, furl);
                  var renderFacebook = function() {
                    res.render('shareheaders', {
                      'extraProperties': domainInfo.extraProperties || [],
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
                    sequelize.transaction(function(t) {
                      //ideally, we'd pass a Promise.all and serialize this, for easier readability, if nothing else
                      // but that really f---s with the transaction, so better to do callback hell here
                      return new Promise(function (resolve, reject) {
                        schema.Sharer.findOrCreate({'where': newsharer}).spread(function(sharer, created) {
                          if (created) {
                            schema.Metadata.findById(parseInt(req.params.abver) || 0).then(function(metadata) {
                              metadata.increment('trial_count').then(resolve, reject);
                            });
                          } else {
                            resolve();
                          }
                        })
                      });
                    }).then(function() {
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
                schema.Metadata.findById(cautious_id).then(function(metadata) {
                  if (metadata) {
                    sequelize.transaction(/*{
                                            deferrable: Sequelize.Deferrable.SET_IMMEDIATE,
                                            isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE
                                            },*/
                                          function(t) {
                      //ideally, we'd pass a Promise.all and serialize this, for easier readability, if nothing else
                      // but that really f---s with the transaction, so better to do callback hell here
                      return new Promise(function (resolve, reject) {
                        var rejlog = function() {
                          //console.log('rejected!');
                          reject();
                        };
                        //1.
                        metadata.increment('success_count', {transaction: t}).then(function() {
                          //2.
                          schema.Sharer.findOrCreate({where:{'key':(req.query.abid || ''),
                                                             'trial': cautious_id},
                                                      transaction: t
                                                     })
                            .spread(function(sharer, created) {
                              //3.
                              sharer.increment('success_count', {transaction: t}).then(
                                function() {
                                  //4.
                                  schema.Bandit.create({'trial': cautious_id,
                                                        'action': false}, {transaction: t}).then(resolve, rejlog);
                                }, rejlog);
                            })
                        }, rejlog)
                      });
                    }).then(function(value) {
                      if (req.query.absync) {
                        res.redirect(furl);
                      }
                    }, function(reason) {
                      console.log('Failed save of transaction ' + req.originalUrl
                                  + ' -- ' + reason);
                    });
                  }
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
  //TODO: abstract out the similarities with this code and the /r/ code above (even though above, there are more paths)
  app.get('/a/:abver/:domain*',
          function (req, res) {
            res.set('Content-Type', 'image/gif');
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            if (!req.query.absync) {
              res.end(smallgif, 'binary');
            }
            if (req.params.abver) {
              sequelize.transaction(/*{
                                      deferrable: Sequelize.Deferrable.SET_IMMEDIATE,
                                      isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE
                                      },*/ function(t) {
                //ideally, we'd pass a Promise.all and serialize this, for easier readability, if nothing else
                // but that really f---s with the transaction, so better to do callback hell here
                return new Promise(function(resolve, reject) {
                  var rejlog = function() {
                    //console.log('rejected!');
                    reject();
                  };
                  var cautious_id = (parseInt(req.params.abver) || 0);
                  //action 1.
                  schema.Sharer.findOrCreate({where:{'key':(req.query.abid || ''),
                                                     'trial': cautious_id},
                                              transaction: t
                                             })
                    .spread(function(sharer, created) {
                      //action 2.
                      sharer.increment('action_count', {transaction: t}).then(function() {
                        schema.Metadata.findById(cautious_id, {transaction: t}).then(function(metadata) {
                          //action 3.
                          metadata.increment('action_count', {transaction: t}).then(
                                function() {
                                  //action 4.
                                  schema.Bandit.create({'trial':cautious_id, 'action':true}, {transaction: t}).then(resolve, rejlog);
                                }, rejlog);
                        });
                      }, rejlog);
                    });
                })
              }).then(function() {
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
        return res.status(404).send("Not found");
      }
      res.set('Content-Type', 'text/javascript');
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

      var proto = config.domain_whitelist[req.params.domain].proto;
      var murl = (req.params.domain + decodeURIComponent(req.params[0] || '/'));
      bandit.choose(murl, sequelize, successMetric).then(function(trialChoice) {
        var burl = app._shareUrl('', trialChoice);
        return res.render('jsshare', {baseUrl: burl, abver: trialChoice});
      });
    };
  };

  app.get('/js/:domain*', js_result('success'));
  app.get('/jsaction/:domain*', js_result('action'));

  app.get('/json/:domain*', function (req, res) {
    var params = {variants: []};

    //res.setHeader('Content-Type', 'application/json');
    schema.Metadata.findAll({
      where: {
        url: req.params.domain + req.params[0]
      }
    }).then(function(results) {
      _.forEach(results, function(result) {
        params.url = result.dataValues.url;
        result.dataValues.shareUrl = app._shareUrl(result.dataValues.url, result.dataValues.id);
        params.variants.push(result.dataValues);
      });
      app.set('jsonp callback name', 'callback');
      return res.jsonp (params);
    });
  });
}

module.exports = init;
