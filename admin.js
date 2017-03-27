var _ = require('lodash');
var url = require('url');
var bandit = require('./bandit.js');

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

var jsonQuery = function(resultFunction) {
  return function (req, res) {
    var data = [];
    var allVariants = req.params[0].split('-').filter(function(v) {
      return v;
    });
    schema.Sharer.findAll({
      where: {
        trial: {
          $in: allVariants //req.params[0]
        }
      },
      order: ['createdAt']
    }).then(function(results) {
      resultFunction(results, allVariants, res)
    });
  };
}

var successRate = function(isAction) {
  var actionkey = (isAction ? 'action_count' : 'success_count');
  return function(results, allVariants, res) {
    var successes = 0;
    var collectors = {};
    var data = [];
    allVariants.forEach(function(v) {
      collectors[v] = {'successes':0, 'total':0}
    });
    _.forEach (results, function(result) {
      var d = result.dataValues;
      var c = collectors[d.trial];
      if (d[actionkey] > 0) {
        c.successes++
      }
      c.total++
      data.push({
        time: d.createdAt,
        trial: d.trial,
        y: c.successes/c.total
      });
    });
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({'results': data}));
  };
};

var selectionRate = function(results, allVariants, res) {
  var totalTrials = 0;
  var trialCount = 0;
  var collectors = {};
  var data = [];
  allVariants.forEach(function(v) {
    collectors[v] = {'total':0}
  });
      _.forEach (results, function(result, index) {
        var totalTrials = index+1;
        var d = result.dataValues;
        collectors[d.trial].total++
        data.push({
          time: d.createdAt,
          trial: d.trial,
          y: collectors[d.trial].total/totalTrials
        });
      });
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({'results': data}));
}

var selectionSimulation = function(results, allVariants, res) {
  var totalTrials = 0;
  var trialCount = 0;
  var collectors = {};
  var data = [];
  var actionkey = 'action';
  allVariants.forEach(function(v) {
    collectors[v] = {'trials':0, 'success': 0, 'trial': v}
  });
  _.forEach (results, function(result, index) {
    var d = result.dataValues;
    var c = collectors[d.trial];
    c.trials++
    if (d[actionkey] > 0) {
      c.success++
    }
    // run simulation to check algo
    var variants = Object.keys(collectors).map(function(v){
      return collectors[v]
    });
    // choose 100 times and tally the results
    simulationTally = {}
    allVariants.map(function(v) {
      simulationTally[v] = 0
    });
    rbetasLibrary = []
    for (var i = 0; i <100; i++) {
      bandit.chooseFromVariants(variants, function(choice, rbetas){
        rbetasLibrary.push(rbetas);
        simulationTally[choice]++;
      }, null, 1);
    }
    for (var variant in simulationTally) {
      data.push({
          time: d.createdAt,
          trial: variant,
          y: simulationTally[variant]
        });
    }

  });
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({'results': data, 'rbetas': rbetasLibrary}));
}


app.get('/admin/reportjson/clicks/*', adminauth, jsonQuery(successRate(false)));
app.get('/admin/reportjson/actions/*', adminauth, jsonQuery(successRate(true)));
app.get('/admin/reportjson/selection/*', adminauth, jsonQuery(selectionRate));
app.get('/admin/reportjson/simulation/*', adminauth, jsonQuery(selectionSimulation));
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
