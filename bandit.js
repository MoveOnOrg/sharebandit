var PD = require("probability-distributions");
var Promise = require("bluebird");

var bayesBandit = function(url, sequelize, successMetric) {
  // returns a Promise which will resolve to a 'trial' choice for the url

  // algorithm summary
  //   bandit<-function(x,n) {
  //     p<-numeric(length)
  //     for (i in 1:length) {
  //      p[i]=rbeta(1, x[i]+1, n[i]-x[i]+1)
  //     }
  //     choice<-which(p==max(p))[1]
  //     return(choice)
  //   }
  //   x = successes to date
  //   n = trials to date for that variant
  //   length = number of variants
  //   rbeta = The Beta function
  //      rbeta is basically doing some logarithmic/exponent stuff
  //      but really only about ~5 per rbeta call, so it'll be pretty fast
  
  var query = ('SELECT trial, sum(case when Sharers.{{success_field}}_count > 0 then 1 else 0 end) AS success, count(key) AS trials'
    +' FROM Sharers'
    +' JOIN Metadata on (Metadata.id = Sharers.trial)'
    +' WHERE Metadata.url = ? GROUP BY trial')
    .replace('{{success_field}}',
      ((successMetric == 'action') ? 'action' : 'success')
    );

  return new Promise(function(resolve, reject) {
    //TODO
    // what is cacheable:
    // * variant list:
    //   * successes/trials
    //   * in theory could generate a bunch at once and cache those
    /*
     cache_key_list = [ URLS ] (sorted by #hits, and then dropping dicts
     cache_dict = {
        <URL>: {
          hits: 1, //this should decay each ...day?
          variants: [
             { // from db result
               trial: <var_id>,
               trials: <trial_count>,
               success: <trial_success>,

               // added
               // we should cache related to trials count
               rbeta_cache: []
             }
          ]
          
        }
     }
    */
    sequelize
      .query(
        query,
        {
          replacements: [url],
          type: sequelize.QueryTypes.SELECT
        }
      )
      .then(function(variants) {
        return chooseFromVariants(variants, resolve, reject, 1);
      });
  });
};

function chooseFromVariants(variants, resolve, reject, numResults) {
  if (!variants || variants.length == 0) {
    resolve(null);
  }
  var totalSuccess = variants.reduce(function(total, variant) {
    return total + variant.success;
  }, 0);
  var uncompletedVariants = variants.filter(function(v) {
    return v.success < 20;
  });
  if (uncompletedVariants.length
      && totalSuccess < 100 * variants.length) {
    var randomized = uncompletedVariants.sort(function() {
      return 0.5 - Math.random();
    });
    resolve(randomized[0].trial);
  } else {
    var rbetas = variants.map(function(variant) {
      var results = PD.rbeta(
        numResults || 1, //number of results wanted
        (1*variant.success) + 1,
        (1*variant.trials) - (1*variant.success) + 1
      );
      return [
        results[0],
        variant.trial,
        results
      ];
    }).sort().reverse();
    resolve(rbetas[0][1]);
  }
}

module.exports = {
  choose: bayesBandit,
  chooseFromVariants: chooseFromVariants
};
