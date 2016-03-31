var app = require('../index');

var request = require('request');

var expect = require('expect.js');

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
  });
  //1. test homepage
  describe('homepage', function() {
    //test1 of hompage
    it('should respond to GET', function(done) {
      request.get(baseUrl)
        .on('response', function(response) {
          expect(response.statusCode).to.equal(200);
          done();
        })
    });

    //test2 of homepage
  });
  after(app.shutdown);
});


