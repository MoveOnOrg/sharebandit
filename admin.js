var config = require('./config.json');
var _ = require('lodash');
var url = require('url');

var init = function(app, schema, sequelize, adminauth) {

app.get('/admin/',
  adminauth,
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
        schema.Metadata.create(metadata).then(function(finalmetadata) {
          //WARNING: this should probably be in the same db session, or we risk corruption
          schema.Sharer.create({'trial': finalmetadata.id, 'key': ''});
        });
      }
    }
    else if (_.indexOf(req.body.delete, key) > -1) {
      schema.Metadata.destroy({
        where: {
          url: url,
          id: key
        }
      });
    }
    else {
      metadata.id = key;
      schema.Metadata.update(metadata, {where: {id: key}});
    }

  });

  res.redirect('/admin/edit/' + url);

};

app.get('/admin/add/',
  adminauth,
  function (req, res) {
    res.render('admin/edit', {url: '', variants: [{id: 'new', headline: '', text: '', image_url: ''}]});
	}
);

app.post('/admin/add/',
  adminauth,
  addEditPost
);

app.get('/admin/edit/*',
  adminauth,
  function (req, res) {
    var params = {variants: []};

    schema.Metadata.findAll({
      where: {
        url: req.params[0]
      }
    }).then(function(results) {
      _.forEach(results, function(result) {
        params.url = result.dataValues.url;
        params.shareUrl = config.baseUrl + '/r/' + result.dataValues.url;
        params.variants.push(result.dataValues);
      });
      params.variants.push({id: 'new', headline: '', text: '', image_url: ''});
      res.render('admin/edit', params);
    });

	}
);

app.post('/admin/edit/*',
  adminauth,
  addEditPost
);

app.get('/admin/delete/*',
  adminauth,
  function (req, res) {

    var url = req.params[0];

    schema.Metadata.findAll({
      where: {
        url: url
      }
    }).then(function(results) {
      res.render('admin/delete', results[0].dataValues);
    });

	}
);

app.post('/admin/delete/*',
  adminauth,
  function (req, res) {

    var url = req.params[0];

    if (req.body.response == 'Yes, Delete') {
      schema.Metadata.destroy({
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

}

module.exports = init;
