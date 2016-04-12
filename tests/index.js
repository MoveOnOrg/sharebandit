var app = require('../index');

var request = require('request');

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
             "storage": "testdb.sqlite"
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
    });
    app.db.schema.Sharer.destroy({truncate:true});
    app.db.schema.Bandit.destroy({truncate:true});
    app.db.schema.Metadata.destroy({truncate:true});
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

  console.log('URL_AB_NOHTTP', URL_AB_NOHTTP);
  var TRIALS = [];

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
  describe('js-load', function() {
    //3.1 get JS and see diversity of content
    var ITER_TIMES = 20;

    it('should load JS', function(done) {
      var jsResponses = [];
      var firstLineRegex = new RegExp('^//'+baseUrl+'/r/(\\d+)/');
      var timesEach = [0,0];
      for (var i=0; i<ITER_TIMES; i++) {
        request.get(TRIAL_JS_URL, function(err, response, body) {
          expect(response.statusCode).to.equal(200);
          ++(timesEach[TRIALS.indexOf(parseInt(body.match(firstLineRegex)[1]))])
          if ((timesEach[0]+timesEach[1]) >= ITER_TIMES) {
            //there's actually a 1/2^20 that this will fail, but hey -- statistics
            expect(timesEach[0] > 0).to.equal(true);
            expect(timesEach[1] > 0).to.equal(true);
            done();
          }
        });
      }
    });
  });
  after(app.shutdown);
});
