var _ = require('lodash');
var url = require('url');

var init = function(app, schema, sequelize, adminauth, config, moduleLinks) {

app.get('/admin/',
  adminauth,
  function (req, res) {
    var query = url.parse(req.url, true).query;
    var params = {'modules':moduleLinks};
    var protocolRegex =  /^([^:]+:\/\/)/;
    var sqlQ = {
      offset: query.offset || 0,
      limit: 50,
      order: 'max(id) DESC',
      attributes: ['url'],
      group: ['url']
    };
    if (query.q) {
      sqlQ['where'] = {
        "url": {
          $like: '%' + query.q.replace(protocolRegex, '') + '%'
        }
      };
    }
    schema.Metadata.findAll(sqlQ)
      .then(function(urls) {
        params.results = urls;
        res.render('admin/index', params);
      });
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
        result.dataValues.shareUrl = app._shareUrl(result.dataValues.url, result.dataValues.id);
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

var jsonQuery = function(isAction) {
  var actionkey = (isAction ? 'action_count' : 'success_count');
  return function (req, res) {
    var data = {bandits: []}
    schema.Sharer.findAll({
      where: {
        trial: req.params[0]
      },
      order: ['createdAt']
    }).then(function(results) {
      var successes = 0;
      _.forEach (results, function(result, index) {
        var d = result.dataValues;
        if (d[actionkey] > 0) {
          ++successes;
        }
        data.bandits.push({
          time: result.dataValues.createdAt,
          trial: result.dataValues.trial,
          y: successes/(index+1)
        });
      });
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(data.bandits));
    });
  };
}

var jsonQuerySelection = function() {
  return function (req, res) {
    var data = {bandits: []};
    var allVariants = req.params.allvariants.split('-').filter(function(v) {
      return v;
    });
    var currentVariant = req.params.variant;
    schema.Sharer.findAll({
      where: {
        trial: {
          $in: allVariants
        }
      },
      order: ['createdAt']
    }).then(function(results) {

      var totalTrials = 0;
      var trialCount = 0;

      _.forEach (results, function(result, index) {
        totalTrials++;
        var d = result.dataValues;
        if (parseInt(d['trial']) === parseInt(currentVariant)) {
          trialCount++
        }
        data.bandits.push({
          time: result.dataValues.createdAt,
          trial: currentVariant,
          y: trialCount/totalTrials
        });
      });
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(data.bandits));
    });
  };
}

app.get('/admin/datajson/*', adminauth, jsonQuery(false));
app.get('/admin/actionjson/*', adminauth, jsonQuery(true));
app.get('/admin/selectionjson/:allvariants/:variant/', adminauth, jsonQuerySelection());
app.get('/admin/report/*',
  adminauth,
  function (req, res) {
    var params = {variants: []};
    schema.Metadata.findAll({
      where: {
        url: req.params[0]
      }
    }).then(function(results) {
      _.forEach (results, function(result) {
        params.variants.push(result.dataValues);
        });
      res.render('admin/report', params);
      });
    });
}

module.exports = init;
