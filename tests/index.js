var app = require('../index');
var bandit = require('../bandit');

var request = require('request');
var Promise = require("bluebird");
var expect = require('expect.js');
var realApp;

//Things to test
//  create two versions of a url, with img, title
//    request JS for url 20 times, and confirm that it returns more than one
//    request /r/ as facebook client and confirm og tags
//    request /r/ for each variation as regular client and confirm redirect
//    request /r/ for a bad domain and confirm 404
//    request JS 100 times and count which variation each time
//      request /r/ 100 times for the first variation (and none for the other)
//         request JS another 100 times, and confirm that first variation is higher percentage
//    look at sql directly and confirm that db reflects request history

// other things to test some day:
//   proto:https and other domain_whitelist properties
//   more accurate bayesian report
//   actions, once we wire that up?
//   redirect of admin when not in develMode for security

describe('server', function() {
  var port = 30000 + parseInt(Math.random());
  var baseUrl = "http://localhost:" + port;

  before(function() {
    realApp = app.boot({
      "db": {"dialect": "sqlite",
             "storage": "testdb.sqlite",
             //THIS IS VERY USEFUL TO CHANGE if you are debugging some tests
             "logging": false
            },
      "develMode": true,
      "baseUrl": baseUrl,
      "port": port,
      "sessionSecret": "testing stuff",
      "domain_whitelist": {
        "example.com": { "proto": "http",
                         "extraProperties": [
                           {"name": "og:type", "value": "cause"},
                           {"name": "og:site_name", "value": "Test Site Name"}
                         ]
                       }
      }
    }, true);
    try {
      app.db.schema.Sharer.destroy({truncate:true}).catch(function(){
        //ignore failure which can happen if the db wasn't created yet
      });

      app.db.schema.Bandit.destroy({truncate:true}).catch(function(){});
      app.db.schema.Metadata.destroy({truncate:true}).catch(function(){});
    } catch(e) {
      //empty db, so proceed and will get created
    }
  });
  //1. test homepage
  describe('homepage', function() {
    //test1 of hompage
    it('should respond to GET', function(done) {
      request.get(baseUrl).on('response', function(response) {
          expect(response.statusCode).to.equal(200);
          done();
        })
    });
  });

  var tempURL_AB = "http://example.com/a";
  var tempURL_AB_NOHTTP = tempURL_AB.substring(7);
  var VARS = {
    URL_AB: tempURL_AB,
    URL_AB_NOHTTP: tempURL_AB_NOHTTP,
    TRIAL_JS_URL: baseUrl + '/js/' + tempURL_AB_NOHTTP, //encodeURIComponent(URL_AB_NOHTTP);
    TRIAL_REDIRECT_URLS: [],
    SHARER_ABIDS: [123, 456],
    TRIALS: [],
    ITER_TIMES: 20,
  };

  var twentyAtATime = function(threshold, finalRun, action) {
      action = action || '/a/';
      // Basically this runs too slowly to be in 2000ms timeout, so we'll do it a bunch
      //  of times to inflate the results
      return function(done) {
        VARS.TRIAL_REDIRECT_URLS = VARS.TRIALS.map(function(i) {
          return (baseUrl + action + i + '/' + VARS.URL_AB_NOHTTP);
        });
        var middlePart = '?absync=true&abid=';
        var runRequest = function(after, i) {
          return function () {
            //console.log(i);
            var trialChoice = ((Math.random() > threshold) ? 1 : 0);
            request.get({
              'url': VARS.TRIAL_REDIRECT_URLS[trialChoice]  + middlePart + parseInt(10000*Math.random()),
              'followRedirect': false
            }, after);
          };
        };
        var longChain = runRequest(function() {
          if (finalRun) {
            return finalRun(done);
          } else {
            done();
          }
        });
        // hacky way to sequence runs -- SQLITE will suffer from locking issues
        //   otherwise
        for (var i=0; i<VARS.ITER_TIMES; i++) {
          longChain = runRequest(longChain, i);
        }
        longChain();
      }
  };

  //2. admin
  var adminsave = function() {
    //2.1 post to admin for new
    it('should save a new by POST', function(done) {
      request.post(baseUrl+'/admin/add/',
                   {form:{
                     'url': VARS.URL_AB,
                     'id[new]': "new",
                     'version[new]': "",
                     'headline[new]': "fooHeadline1",
                     'text[new]': "fooText1",
                     'image_url[new]': "http://example.com/image1111.jpg"
                   }}).on('response', function(response) {
                     expect(response.statusCode).to.equal(302);
                     app.db.schema.Metadata.findAll(
                       {'where': {'url': VARS.URL_AB_NOHTTP}}
                     ).then(function(trials) {
                       //console.log('XXXX', trials);
                       expect(Boolean(trials)).to.equal(true);
                       var trial1 = trials[0].id;
                       var form = {
                           'url': VARS.URL_AB,
                           'id[new]': "new",
                           'version[new]': "",
                           'headline[new]': "barHeadline2222",
                           'text[new]': "barText2222",
                           'image_url[new]': "" //no image for second option
                       };
                       form['id['+trial1+']'] = trial1;
                       form['version['+trial1+']'] = trials[0].version;
                       form['headline['+trial1+']'] = "fooHeadline1 SecondSave"; //DIFFERENT
                       form['text['+trial1+']'] = "fooText1";
                       form['image_url['+trial1+']'] = "http://example.com/image1111.jpg";

                       request.post(
                         baseUrl+'/admin/add/',
                         {form: form}).on('response', function(response) {
                           expect(response.statusCode).to.equal(302);
                           app.db.schema.Metadata.findAll(
                             {'where': {'url': VARS.URL_AB_NOHTTP}}
                           ).then(function(trials) {
                             // console.log('YYYYYYY', trials);
                             expect(trials.length).to.equal(2);
                             VARS.TRIALS.push(trials[0].id);
                             VARS.TRIALS.push(trials[1].id);
                             // console.log('ZZZZZZ', VARS.TRIALS);
                             done();
                           });
                         });
                     });
                   })
    });
  };
  describe('admin', adminsave);

  var testJsBanditResponse = function(iterTimes, testFunc) {
    return function(done) {
      var jsResponses = [];
      var firstLineRegex = new RegExp('^//'+baseUrl+'/r/(\\d+)/');
      var timesEach = [0,0];
      //count a bunch of requests, and make sure we get some back from each trial version
      VARS.TRIAL_JS_URL = baseUrl + '/js/' + VARS.URL_AB_NOHTTP;
      for (var i=0; i<iterTimes; i++) {
        request.get(VARS.TRIAL_JS_URL, function(err, response, body) {
          expect(response.statusCode).to.equal(200);
          var parsedUrl = body.match(firstLineRegex);
          ++(timesEach[VARS.TRIALS.indexOf(parseInt(parsedUrl[1]))]);
          if ((timesEach[0]+timesEach[1]) >= iterTimes) {
            expect(testFunc(timesEach)).to.equal(true);
            done();
          }
        });
      }
    };
  };

  describe('js-load', function() {
    //3.1 get JS and see diversity of content
    VARS.ITER_TIMES = 20;

    it('should load JS', testJsBanditResponse(
      VARS.ITER_TIMES, function(timesEach) {
        //there's actually a 1/2^20 that this will fail, but hey -- statistics
        expect(timesEach[0] > 0).to.equal(true);
        expect(timesEach[1] > 0).to.equal(true);
        return true;
      }));
  });

  var testEventSuccess = function() {
    it('20 random requests should NOT bias redirect results', twentyAtATime(0.8));

    it('should 404 on bad domain/url', function(done) {
      request.get(baseUrl + '/r/200/evilsomethingelse.com/foo', function(err, response, body) {
        expect(response.statusCode).to.equal(404);
        done();
      })
    });

    it('should render metadata for best treatment on sharebandit url with no trial id', function(done) {
      request.get({
        'url': baseUrl + '/r/0/'+VARS.URL_AB_NOHTTP+'/NO_testshare_URL_HERE?abid=1',
        'followRedirect': false,
        'headers': {
          'User-Agent': "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
        }
      }, function(err, response, body) {
        if (body) {
          expect(response.statusCode).to.equal(200);
          expect(/property="og:title"/.test(body)).to.equal(true);
          expect(/property="og:description"/.test(body)).to.equal(true);
        } else {
          expect(response.statusCode).to.equal(404);
        }
        done();
      })
    });

    it('should load facebook with facebook client', function(done) {
      VARS.TRIAL_REDIRECT_URLS = VARS.TRIALS.map(function(i) {
        return (baseUrl + '/r/' + i + '/' + VARS.URL_AB_NOHTTP + '?absync=true');
      });
      request.get({
        'url': VARS.TRIAL_REDIRECT_URLS[0] + '&abid=' + VARS.SHARER_ABIDS[0],
        'headers': {
          'User-Agent': "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
        }}, function(err, response, body) {
          expect(response.statusCode).to.equal(200);
          expect(/property="og:title"\s*content="fooHeadline1 SecondSave"/.test(body)).to.equal(true);
          expect(/property="og:description"\s*content="fooText1"/.test(body)).to.equal(true);
          expect(/property="og:image"\s*content="http:\/\/example.com\/image1111.jpg"/.test(body)).to.equal(true);
          //test config param
          expect(/property="og:type"\s*content="cause"/.test(body)).to.equal(true);
          request.get({
            'url': VARS.TRIAL_REDIRECT_URLS[1],
            'headers': {
              'User-Agent': "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
            }}, function(err, response, body) {
              expect(response.statusCode).to.equal(200);
              expect(/property="og:title"\s*content="barHeadline2222"/.test(body)).to.equal(true);
              expect(/property="og:description"\s*content="barText2222"/.test(body)).to.equal(true);
              expect(/property="og:image"/.test(body)).to.equal(false);
              done();
            });
        })
    });

    it('action request should return image', function(done) {
      VARS.TRIAL_ACTION_URLS = VARS.TRIALS.map(function(i) {
        return (baseUrl + '/a/' + i + '/' + VARS.URL_AB_NOHTTP);
      });
      request.get(VARS.TRIAL_ACTION_URLS[0]  + '?absync=true&abid=' + VARS.SHARER_ABIDS[1],
                  function(err, response, body) {
                    expect(response.headers['content-type']).to.equal('image/gif');
                    done();
                  });
    });

    it('should redirect without facebook client', function(done) {
      VARS.TRIAL_REDIRECT_URLS = VARS.TRIALS.map(function(i) {
        return (baseUrl + '/r/' + i + '/' + VARS.URL_AB_NOHTTP);
      });
      var middlePart = '?absync=true&abid=';
      request.get({
        'url': VARS.TRIAL_REDIRECT_URLS[0]  + middlePart + VARS.SHARER_ABIDS[1],
        'followRedirect': false
      }, function(err, response, body) {
        expect(response.statusCode).to.equal(302);
        expect(response.headers.location).to.contain(VARS.URL_AB + middlePart + VARS.SHARER_ABIDS[1]);
        bandit.getUrlTrials(VARS.URL_AB_NOHTTP, 'success', function(trials) {
          // Will return something like:
          // [ { trial: 171, success: 1, trials: 19 },
          //   { trial: 172, success: 0, trials: 6 } ]
          // TRIALS[0] is the first trial
          trials.filter(function(t) {
            if (t.trial == VARS.TRIALS[0]) {
              expect(t.success).to.equal(1);
            } else {
              expect(t.success).to.equal(0);
            }
          })
          done();
        }, realApp.schemaActions)
      })
    });

    it('20 requests should bias redirect results', twentyAtATime(0.5));
    it('20 click requests will not bias results', twentyAtATime(0.1, false, '/r/'));
    it('20 click requests will not bias results', twentyAtATime(0.1, false, '/r/'));
    it('20 requests should bias redirect results', twentyAtATime(0.8));
    it('20 requests should bias redirect results', twentyAtATime(0.8));
    it('20 requests should bias redirect results', twentyAtATime(0.8));
    it('20 requests should bias redirect results', twentyAtATime(0.8));
    it('20 requests should bias redirect results', twentyAtATime(0.8));
    it('20 requests should bias redirect results', twentyAtATime(0.8));
    it('should be biased toward the first trial', function(done) {
      realApp.schemaActions.processDataIncrementally(function(){return true}, {onlyOnce:true}).then(function() {
          request.get(baseUrl + '/admin/reportjson/stats/' + VARS.TRIALS.join('-'), function(err, response, body) {
            var data = JSON.parse(body).results;
            for (var i=1;i<data.length;i++) {
              var end = data[data.length-i];
              if (end.trial == VARS.TRIALS[0]) {
                expect(end.convertRate > .5).to.equal(true);
                break;
              }
            }
            done();
          });
      })
    });

    it('jsonall should have accurate counts', function(done) {
      request.get(baseUrl + '/jsonall/' + VARS.URL_AB_NOHTTP, function(err, response, body) {
        var data = JSON.parse(body);
        data.variants.forEach(function(variant) {
          expect(variant.action_count).to.be.a('number');
          expect(variant.success_count).to.be.a('number');
        });
        done();
      });
    });

    it('should now be weighted with bandit', testJsBanditResponse(20, function(timesEach) {
      console.log('inbalance after 0.8 preference', timesEach);
      expect(timesEach[0] > timesEach[1]).to.equal(true);
      return true;
    }))

  }

  describe('success events: redirects,actions: NO caching', function() {
    testEventSuccess()
  })

  describe('success events: redirects,actions: caching ON', function() {
    before(function() {
      VARS.URL_AB = "http://example.com/cached";
      VARS.URL_AB_NOHTTP = VARS.URL_AB.substring(7);
      VARS.TRIAL_JS_URL = baseUrl + '/js/' + VARS.URL_AB_NOHTTP; //encodeURIComponent(URL_AB_NOHTTP);
      VARS.TRIAL_REDIRECT_URLS = [];
      VARS.SHARER_ABIDS = [1337, 344]
      VARS.TRIALS = [];
      VARS.ITER_TIMES = 10; // fakeredis takes longer than sqlite (real redis IS fast)
      port = port + 1
      baseUrl = "http://localhost:" + port;

      realApp = app.boot({
        "db": {"dialect": "sqlite",
               "storage": "testdb.sqlite",
               //THIS IS VERY USEFUL TO CHANGE if you are debugging some tests
               "logging": false
              },
        "develMode": true,
        "baseUrl": baseUrl,
        "port": port,
        "sessionSecret": "testing stuff",
        "fakeRedis": true,
        "domain_whitelist": {
          "example.com": { "proto": "http",
                           "extraProperties": [
                             {"name": "og:type", "value": "cause"},
                             {"name": "og:site_name", "value": "Test Site Name"}
                           ]
                         }
        }
      }, true);

      // return app.db.schema.Sharer.destroy({truncate:true})
    })
    adminsave()
    testEventSuccess()
  })

  after(app.shutdown);
});
