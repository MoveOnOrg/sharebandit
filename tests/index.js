var app = require('../index');

var request = require('request');
var Promise = require("bluebird");
var expect = require('expect.js');

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
    app.boot({
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

  var URL_AB = "http://example.com/a";
  var URL_AB_NOHTTP = URL_AB.substring(7);
  var TRIAL_JS_URL = baseUrl + '/js/' + URL_AB_NOHTTP; //encodeURIComponent(URL_AB_NOHTTP);
  var TRIAL_REDIRECT_URLS = [];
  var SHARER_ABIDS = [123, 456]
  var TRIALS = [];

  var twentyAtATime = function(threshold, finalRun, action) {
      action = action || '/a/';
      // Basically this runs too slowly to be in 2000ms timeout, so we'll do it a bunch
      //  of times to inflate the results
      return function(done) {
        var ITER_TIMES = 20;
        TRIAL_REDIRECT_URLS = TRIALS.map(function(i) {
          return (baseUrl + action + i + '/' + URL_AB_NOHTTP);
        });
        var middlePart = '?absync=true&abid=';
        var runRequest = function(after, i) {
          return function () {
            //console.log(i);
            var trialChoice = ((Math.random() > threshold) ? 1 : 0);
            request.get({
              'url': TRIAL_REDIRECT_URLS[trialChoice]  + middlePart + parseInt(10000*Math.random()),
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
        for (var i=0; i<ITER_TIMES; i++) {
          longChain = runRequest(longChain, i);
        }
        longChain();
      }
  };

  //2. admin
  describe('admin', function() {
    //2.1 post to admin for new
    it('should save a new by POST', function(done) {
      request.post(baseUrl+'/admin/add/',
                   {form:{
                     'url': URL_AB,
                     'id[new]': "new",
                     'version[new]': "",
                     'headline[new]': "fooHeadline1",
                     'text[new]': "fooText1",
                     'image_url[new]': "http://example.com/image1111.jpg"
                   }}).on('response', function(response) {
                     expect(response.statusCode).to.equal(302);
                     app.db.schema.Metadata.findAll(
                       {'where': {'url': URL_AB_NOHTTP}}
                     ).then(function(trials) {
                       //console.log('XXXX', trials);
                       expect(Boolean(trials)).to.equal(true);
                       var trial1 = trials[0].id;
                       var form = {
                           'url': URL_AB,
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
                             {'where': {'url': URL_AB_NOHTTP}}
                           ).then(function(trials) {
                             //console.log('YYYYYYY', trials);
                             expect(trials.length).to.equal(2);
                             TRIALS.push(trials[0].id);
                             TRIALS.push(trials[1].id);
                             //console.log('ZZZZZZ', TRIALS);
                             done();
                           });
                         });
                     });
                   })
    });
  });

  var testJsBanditResponse = function(iterTimes, testFunc) {
    return function(done) {
      var jsResponses = [];
      var firstLineRegex = new RegExp('^//'+baseUrl+'/r/(\\d+)/');
      var timesEach = [0,0];
      //count a bunch of requests, and make sure we get some back from each trial version
      for (var i=0; i<iterTimes; i++) {
        request.get(TRIAL_JS_URL, function(err, response, body) {
          expect(response.statusCode).to.equal(200);
          var parsedUrl = body.match(firstLineRegex);
          ++(timesEach[TRIALS.indexOf(parseInt(parsedUrl[1]))]);
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
    var ITER_TIMES = 20;

    it('should load JS', testJsBanditResponse(
      ITER_TIMES, function(timesEach) {
        //there's actually a 1/2^20 that this will fail, but hey -- statistics
        expect(timesEach[0] > 0).to.equal(true);
        expect(timesEach[1] > 0).to.equal(true);
        return true;
      }));
  });

  describe('success events: redirects,actions', function() {
    it('20 random requests should NOT bias redirect results', twentyAtATime(0.8));

    it('should 404 on bad domain/url', function(done) {
      request.get(baseUrl + '/r/200/evilsomethingelse.com/foo', function(err, response, body) {
        expect(response.statusCode).to.equal(404);
        done();
      })
    });

    it('should render metadata for best treatment on sharebandit url with no trial id', function(done) {
      request.get({
        'url': baseUrl + '/r/0/'+URL_AB_NOHTTP+'/NO_testshare_URL_HERE?abid=1',
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
      TRIAL_REDIRECT_URLS = TRIALS.map(function(i) {
        return (baseUrl + '/r/' + i + '/' + URL_AB_NOHTTP + '?absync=true');
      });
      request.get({
        'url': TRIAL_REDIRECT_URLS[0] + '&abid=' + SHARER_ABIDS[0],
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
            'url': TRIAL_REDIRECT_URLS[1],
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
      TRIAL_ACTION_URLS = TRIALS.map(function(i) {
        return (baseUrl + '/a/' + i + '/' + URL_AB_NOHTTP);
      });
      request.get(TRIAL_ACTION_URLS[0]  + '?absync=true&abid=' + SHARER_ABIDS[1],
                  function(err, response, body) {
                    expect(response.headers['content-type']).to.equal('image/gif');
                    done();
                  });
    });

    it('should redirect without facebook client', function(done) {
      TRIAL_REDIRECT_URLS = TRIALS.map(function(i) {
        return (baseUrl + '/r/' + i + '/' + URL_AB_NOHTTP);
      });
      var middlePart = '?absync=true&abid=';
      request.get({
        'url': TRIAL_REDIRECT_URLS[0]  + middlePart + SHARER_ABIDS[1],
        'followRedirect': false
      }, function(err, response, body) {
        expect(response.statusCode).to.equal(302);
        expect(response.headers.location).to.contain(URL_AB + middlePart + SHARER_ABIDS[1]);
        app.db.schema.Bandit.findAll().then(function(bandit_logs) {
          app.db.schema.Metadata.findById(TRIALS[0])
            .then(function(meta) {
              expect(meta.success_count).to.equal(1);
              done();
            });
        });
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
          request.get(baseUrl + '/admin/reportjson/stats/' + TRIALS.join('-'), function(err, response, body) {
            var data = JSON.parse(body).results;
            for (var i=1;i<data.length;i++) {
              var end = data[data.length-i];
              if (end.trial == TRIALS[0]) {
                expect(end.convertRate > .5).to.equal(true);
                break;
              }
            }
            done();
          });
        }
      );

    it('should now be weighted with bandit', testJsBanditResponse(20, function(timesEach) {
      console.log('inbalance after 0.8 preference', timesEach);
      expect(timesEach[0] > timesEach[1]).to.equal(true);
      return true;
    }))

  });

  after(app.shutdown);
});
