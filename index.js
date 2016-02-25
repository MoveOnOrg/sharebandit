var express = require('express');
var app = express();
var swig  = require('swig');

app.engine('html', swig.renderFile);
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

app.get('/',
  function (req, res) {
    res.render('home', {});
	}
);

app.get('/r/:domain*',
  function (req, res) {
    //if (! (req.params.domain in config.domain_whitelist))
    //  res.404!
    res.vary('User-Agent')
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    var proto = 'http' || config.domain_whitelist[res.params.domain].proto;


    //https://developers.facebook.com/docs/sharing/webmasters/crawler
    if (/facebookexternalhit|Facebot/.test(req.get('User-Agent'))) {
      res.render('shareheaders', {});
    } else {
      res.redirect(proto + res.params.domain + decodeURIComponent(res.params[0] || ''));
    }
  }
);

// Launch server.
var server = app.listen(8080, function () {
  var port = server.address().port;
  console.log('App listening at %s:%s', 'http://sharebandit.dev', port);
});
