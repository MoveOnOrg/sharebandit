var _ = require('lodash');
var url = require('url');
var bandit = require('./bandit.js');
var scrape = require('./lib/ogscraper.js');

var init = function(app, schema, sequelize, adminauth, config, moduleLinks) {

var templateEnv = {
  "googleClientId": (config.oauth && config.oauth.clientId) || '',
  "staticBaseUrl": config.staticBaseUrl || '//s3.amazonaws.com/s3.moveon.org'
}

app.get('/admin/',
  adminauth,
  function (req, res) {
    var query = url.parse(req.url, true).query;
    var params = {'modules': moduleLinks, 'env': templateEnv};
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
    res.render('admin/edit', {'env': templateEnv,
                              'url': '',
                              'variants': [{id: 'new', headline: '', text: '', image_url: ''}]});
  }
);

app.post('/admin/add/',
  adminauth,
  addEditPost
);

app.get('/admin/edit/*',
  adminauth,
  function (req, res) {
    var params = {'env': templateEnv, 'variants': []};

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
      resultFunction(results, allVariants, res, req)
    });
  };
}

var variantReports = function(results, allVariants, res, req) {
  var collectors = {};
  var data = [];
  var crossVariantCounts = {
    'clicks': 0,
    'converts': 0,
  };
  allVariants.forEach(function(v) {
    collectors[v] = {
      'trial': v,
      'clicks': 0,
      'converts': 0,
      'trials':0, //i.e. total
      //for simulation: .trials and .success are keys that bandit recognizes
      'success': 0
    };
  });
  //basically just collectors as an array (for simulation)
  var simVariants = allVariants.map(function(v){
    return collectors[v]
  });

  //now actually process results
  _.forEach (results, function(result) {
    var row = result.dataValues;
    var tdata = collectors[row.trial];
    if (row['action_count'] > 0) {
      tdata.converts++
      tdata.success++ //for simulation
      crossVariantCounts.converts++
    }
    if (row['success_count'] > 0) {
      tdata.clicks++
      crossVariantCounts.clicks++
    }
    tdata.trials++
    var dataPoint = {
      'time': row.createdAt,
      'trial': row.trial,
      // different y-axis options:
      'totalClicks': tdata.clicks,
      'totalConverts': tdata.converts,
      'trackingConverts': allVariants.map(function(v) {
        return collectors[v].converts
      }),
      'clickRate': tdata.clicks / tdata.trials,
      'convertRate': tdata.converts / tdata.trials,
      'clickSelectionRate': ((row['success_count'] > 0)
        ? tdata.clicks / crossVariantCounts.clicks
        : null
      ),
      'convertSelectionRate': ((row['action_count'] > 0)
        ? tdata.converts / crossVariantCounts.converts
        : null
      ),
    };
    if (req.query.simulate) {
      simTally = runSimulation(simVariants, allVariants);
      dataPoint['simulated'] = simTally[row.trial];
    }
    data.push(dataPoint);
  });
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({'results': data}));
};


var runSimulation = function(variants, allVariants) {
    // choose 100 times and tally the results
    simulationTally = {}
    // run simulation to check algo
    allVariants.map(function(v) {
      simulationTally[v] = 0
    });
    for (var i = 0; i <100; i++) {
      bandit.chooseFromVariants(variants, function(choice){
        simulationTally[choice]++;
      }, null, 1);
    }
  return simulationTally;
}


app.get('/admin/reportjson/stats/*', adminauth, jsonQuery(variantReports));
app.get('/admin/report/*',
  adminauth,
  function (req, res) {
    var params = {'env': templateEnv, 'variants': []};
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
app.get('/admin/scrape/*',
  adminauth, 
  function (req,res) {
    scrape(req.params[0])
      .then (function (og) {
        res.json(og);
      })
      .catch (function (err) {
        console.log (err);
        res.json ({is_error:1,err:err});
      });
  });

}

module.exports = init;
